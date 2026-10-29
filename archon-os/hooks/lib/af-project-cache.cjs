/**
 * Archon OS - Project Detection Cache
 *
 * Caches project detection results (tech stack, file patterns, test infra)
 * to avoid re-scanning the codebase on every task.
 *
 * Supports:
 * - Single project repos
 * - Workspace folders with multiple project repos
 * - Individual project caches stored in each repo's .claude/cache/
 * - Workspace-level index in parent .claude/cache/
 *
 * Cache invalidation (STORY-0013 — FEAT-008):
 * - Manual refresh via /project:refresh
 * - git HEAD sha changes (committed-state drift)
 * - content-hash of watch targets changes (working-tree drift)
 * - cache schema-version bump (forces rebuild of old-format caches)
 *
 * The legacy 24h TTL + JS-only KEY_FILES invalidation was REMOVED: it never
 * fired for markdown/bash/yaml projects (none of the KEY_FILES exist), so the
 * detection cache froze for months. Invalidation is now project-type-aware and
 * codebase-change-driven, not clock-driven.
 *
 * @version 3.0.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { TIMEOUT_QUICK_MS, MAX_BUFFER_DEFAULT, warnExecLimit } = require('./af-exec.cjs');

// Project contexts directory (persistent project data)
const PROJECT_CONTEXTS_DIR = '.claude/project-contexts';
const DETECTION_FILE = 'project-detection.json';
const WORKSPACE_DETECTION_FILE = 'workspace-detection.json';
const MONOREPO_DETECTION_FILE = 'monorepo-detection.json';


const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — retained for back-compat export only; no longer gates validity

// Cache format version. Bump to force a rebuild of all existing caches whose
// shape predates the current invalidation logic. A loaded cache whose
// `cacheSchema` !== this value is treated as invalid (and re-scanned).
const CACHE_SCHEMA_VERSION = 3;

// Structural source directories used for project-type-aware content hashing.
// For projects with no JS/TS-style KEY_FILES (markdown/bash/yaml plugins, doc
// repos, etc.) these directories ARE the codebase — their file count + mtimes
// drive invalidation. Discovered at depth <= 2 so `archon-os/agents`,
// `packages/*/src`, etc. are found, not just top-level dirs.
const STRUCTURAL_DIRS = [
  'agents', 'skills', 'rules', 'commands', 'hooks',
  'src', 'lib', 'app', 'packages', 'docs'
];

// Bound the recursive walk used when stat-ing a structural directory.
const STRUCTURAL_WALK_MAX_DEPTH = 4;

// Monorepo config files
const MONOREPO_CONFIGS = {
  'pnpm-workspace.yaml': 'pnpm',
  'lerna.json': 'lerna',
  'nx.json': 'nx',
  'turbo.json': 'turbo',
  'rush.json': 'rush'
};

// Directories to skip when scanning for projects
const SKIP_DIRS = [
  'node_modules', 'vendor', '.git', '.svn', '.hg',
  '__pycache__', '.cache', 'dist', 'build', 'out',
  '.next', '.nuxt', '.output', 'coverage', '.claude'
];

// Key files that trigger cache invalidation when changed
const KEY_FILES = [
  'package.json',
  'composer.json',
  'pubspec.yaml',
  'go.mod',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'project.godot',
  'angular.json',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'nuxt.config.ts',
  'vite.config.ts',
  'vitest.config.ts',
  'jest.config.js',
  'tsconfig.json'
];

/**
 * Get project name from current directory or package.json
 */
function getProjectName(dir = '.') {
  const absDir = path.resolve(dir);

  // Canonical identity wins (STORY-0014): if a context dir already exists under
  // the directory basename, use it. This matches where real context lives and
  // prevents the ghost-dir cache-miss bug where package.json `name`
  // ("aura-frog-dev") diverged from the context dir basename ("aura-frog").
  const basename = path.basename(absDir);
  try {
    if (fs.existsSync(path.join(absDir, PROJECT_CONTEXTS_DIR, basename))) {
      return basename;
    }
  } catch (e) {}

  // Try package.json first
  const pkgPath = path.join(absDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) return pkg.name.replace(/^@[^/]+\//, ''); // Remove scope
    } catch (e) {}
  }

  // Try composer.json
  const composerPath = path.join(absDir, 'composer.json');
  if (fs.existsSync(composerPath)) {
    try {
      const composer = JSON.parse(fs.readFileSync(composerPath, 'utf8'));
      if (composer.name) return composer.name.split('/').pop();
    } catch (e) {}
  }

  // Fall back to directory name
  return path.basename(absDir);
}

/**
 * Get detection file path (in project-contexts)
 */
function getDetectionPath(projectName = null) {
  const name = projectName || getProjectName();
  return path.join(PROJECT_CONTEXTS_DIR, name, DETECTION_FILE);
}

/**
 * Ensure project contexts directory exists
 */
function ensureProjectContextsDir(projectName = null) {
  const name = projectName || getProjectName();
  const dir = path.join(PROJECT_CONTEXTS_DIR, name);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Calculate hash of key files for change detection
 */
function calculateKeyFilesHash() {
  const hashes = [];

  for (const file of KEY_FILES) {
    if (fs.existsSync(file)) {
      try {
        const stat = fs.statSync(file);
        // Use mtime + size as quick hash (faster than reading content)
        hashes.push(`${file}:${stat.mtimeMs}:${stat.size}`);
      } catch (e) {
        // File might be inaccessible
      }
    }
  }

  if (hashes.length === 0) return 'empty';

  return crypto
    .createHash('md5')
    .update(hashes.join('|'))
    .digest('hex')
    .substring(0, 12);
}

/**
 * Get the current git HEAD sha for a directory. Fail-safe: returns null when
 * git is unavailable or the dir is not a work tree (never throws).
 */
function getGitHead(dir = '.') {
  try {
    // Output is 41 bytes, so maxBuffer is not the concern — a git that hangs
    // (network-backed filesystem, lock contention) is, and this runs on every
    // cache-validity check.
    const out = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: TIMEOUT_QUICK_MS,
      killSignal: 'SIGKILL',
      maxBuffer: MAX_BUFFER_DEFAULT
    });
    const sha = out.trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch (e) {
    warnExecLimit('git rev-parse HEAD', e);
    return null;
  }
}

/**
 * Discover structural source directories under `dir` (depth <= 2), skipping
 * SKIP_DIRS. Returns absolute paths. Catches both top-level (`agents/`) and
 * single-nested (`archon-os/agents/`) layouts.
 */
function findStructuralDirs(dir = '.') {
  const found = [];
  const seen = new Set();
  const consider = (p) => {
    try {
      if (fs.statSync(p).isDirectory() && !seen.has(p)) { seen.add(p); found.push(p); }
    } catch (_) {}
  };
  // depth 1
  for (const name of STRUCTURAL_DIRS) consider(path.join(dir, name));
  // depth 2 (one level of source-root nesting, e.g. archon-os/)
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) {}
  for (const ent of entries) {
    if (!ent.isDirectory() || SKIP_DIRS.includes(ent.name)) continue;
    for (const name of STRUCTURAL_DIRS) consider(path.join(dir, ent.name, name));
  }
  return found;
}

/**
 * Stat a structural directory cheaply: recursive file count + max mtime,
 * bounded depth, skipping SKIP_DIRS. File count catches add/remove; max mtime
 * catches edits.
 */
function statStructuralDir(root, depth = 0) {
  let count = 0;
  let maxMtimeMs = 0;
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { return { count, maxMtimeMs }; }
  for (const ent of entries) {
    if (SKIP_DIRS.includes(ent.name)) continue;
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      if (depth < STRUCTURAL_WALK_MAX_DEPTH) {
        const sub = statStructuralDir(full, depth + 1);
        count += sub.count;
        if (sub.maxMtimeMs > maxMtimeMs) maxMtimeMs = sub.maxMtimeMs;
      }
    } else {
      count++;
      try {
        const m = fs.statSync(full).mtimeMs;
        if (m > maxMtimeMs) maxMtimeMs = m;
      } catch (_) {}
    }
  }
  return { count, maxMtimeMs };
}

/**
 * Which watch strategy applies to `dir`:
 *   'key-files'  — JS/TS-style config files present, no structural dirs
 *   'structural' — structural source dirs present, no KEY_FILES
 *   'hybrid'     — both present (e.g. this plugin: root package.json + archon-os/agents)
 *   'none'       — neither (fall back to bare git/dir signal)
 */
function resolveWatchMode(dir = '.') {
  const hasKeyFiles = KEY_FILES.some((f) => fs.existsSync(path.join(dir, f)));
  const hasStructural = findStructuralDirs(dir).length > 0;
  if (hasKeyFiles && hasStructural) return 'hybrid';
  if (hasKeyFiles) return 'key-files';
  if (hasStructural) return 'structural';
  return 'none';
}

/**
 * Project-type-aware content hash. Superset of calculateKeyFilesHash: hashes
 * every KEY_FILE that exists (mtime+size) AND every discovered structural dir
 * (recursive count + max mtime). Changing agents/, skills/, etc. now changes
 * the hash even when no JS config file exists.
 */
function calculateContentHash(dir = '.') {
  const parts = [];

  for (const file of KEY_FILES) {
    const full = path.join(dir, file);
    try {
      if (fs.existsSync(full)) {
        const stat = fs.statSync(full);
        parts.push(`${file}:${stat.mtimeMs}:${stat.size}`);
      }
    } catch (_) {}
  }

  for (const sdir of findStructuralDirs(dir)) {
    const rel = path.relative(dir, sdir) || sdir;
    const { count, maxMtimeMs } = statStructuralDir(sdir);
    parts.push(`${rel}:${count}:${maxMtimeMs}`);
  }

  if (parts.length === 0) return 'empty';

  return crypto.createHash('md5').update(parts.join('|')).digest('hex').substring(0, 16);
}

/**
 * Check if cache is valid (STORY-0013): codebase-change-driven, NOT clock-driven.
 *
 * Invalid when: missing/old schema, content-hash drift, or a committed git-HEAD
 * change. There is intentionally NO age/TTL check — a cache stays valid for as
 * long as the codebase is unchanged, so repeat sessions never re-scan needlessly.
 */
function isCacheValid(cache, dir = '.') {
  if (!cache || typeof cache !== 'object') return false;

  // Old-format caches (pre-STORY-0013) lack cacheSchema → force a rebuild.
  if (cache.cacheSchema !== CACHE_SCHEMA_VERSION) return false;

  // Working-tree drift.
  if (cache.contentHash !== calculateContentHash(dir)) return false;

  // Committed-state drift (only when git is available on both sides).
  const currentGit = getGitHead(dir);
  if (currentGit && cache.gitHead && cache.gitHead !== currentGit) return false;

  return true;
}

/**
 * Inspect cache staleness for surfacing (e.g. the session-start banner).
 * Returns the validity verdict plus a human-readable reason and the sha pair.
 */
function getCacheStaleness(cache, dir = '.') {
  const currentSha = getGitHead(dir);
  const currentContentHash = calculateContentHash(dir);
  const valid = isCacheValid(cache, dir);

  let reason = null;
  if (!cache || typeof cache !== 'object') {
    reason = 'no cache on disk';
  } else if (cache.cacheSchema !== CACHE_SCHEMA_VERSION) {
    reason = 'cache schema changed — rebuilt';
  } else if (currentSha && cache.gitHead && cache.gitHead !== currentSha) {
    const short = (s) => (s ? String(s).substring(0, 7) : '—');
    reason = `git HEAD sha changed (${short(cache.gitHead)} → ${short(currentSha)})`;
  } else if (cache.contentHash !== currentContentHash) {
    reason = 'watched files/dirs changed since last scan';
  }

  return {
    valid,
    stale: !valid,
    reason,
    cachedSha: cache && typeof cache === 'object' ? cache.gitHead ?? null : null,
    currentSha,
    cachedContentHash: cache && typeof cache === 'object' ? cache.contentHash ?? null : null,
    currentContentHash
  };
}

/**
 * Load detection from project-contexts
 */
function loadCache(projectName = null) {
  const name = projectName || getProjectName();
  const detectionPath = getDetectionPath(name);
  if (!fs.existsSync(detectionPath)) return null;

  try {
    const content = fs.readFileSync(detectionPath, 'utf8');
    const cache = JSON.parse(content);
    return isCacheValid(cache) ? cache : null;
  } catch (e) {
    return null;
  }
}

/**
 * Save detection to project-contexts
 */
function saveCache(detection) {
  const projectName = detection.projectName || getProjectName();
  ensureProjectContextsDir(projectName);
  const detectionPath = getDetectionPath(projectName);

  const cache = {
    ...detection,
    projectName: projectName,
    timestamp: Date.now(),            // informational only — no longer gates validity
    cacheSchema: CACHE_SCHEMA_VERSION,
    gitHead: getGitHead(),
    contentHash: calculateContentHash(),
    keyFilesHash: calculateKeyFilesHash(), // back-compat for external readers
    version: '3.0.0'
  };

  try {
    fs.writeFileSync(detectionPath, JSON.stringify(cache, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Clear detection cache (force refresh on next detection)
 */
function clearCache(projectName = null) {
  const name = projectName || getProjectName();
  const detectionPath = getDetectionPath(name);
  if (fs.existsSync(detectionPath)) {
    try {
      fs.unlinkSync(detectionPath);
      return true;
    } catch (e) {
      return false;
    }
  }
  return true;
}

/**
 * Detect test infrastructure
 */
function detectTestInfra() {
  const infra = {
    hasTests: false,
    framework: null,
    configFile: null,
    testDirs: []
  };

  // Check for test directories
  const testDirs = ['tests', 'test', '__tests__', 'spec', 'specs'];
  for (const dir of testDirs) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      infra.testDirs.push(dir);
      infra.hasTests = true;
    }
  }

  // Check for test config files
  const testConfigs = [
    { file: 'vitest.config.ts', framework: 'vitest' },
    { file: 'vitest.config.js', framework: 'vitest' },
    { file: 'jest.config.js', framework: 'jest' },
    { file: 'jest.config.ts', framework: 'jest' },
    { file: 'jest.config.json', framework: 'jest' },
    { file: 'cypress.config.js', framework: 'cypress' },
    { file: 'cypress.config.ts', framework: 'cypress' },
    { file: 'playwright.config.ts', framework: 'playwright' },
    { file: 'phpunit.xml', framework: 'phpunit' },
    { file: 'phpunit.xml.dist', framework: 'phpunit' },
    { file: 'pytest.ini', framework: 'pytest' },
    { file: 'setup.cfg', framework: 'pytest' },
    { file: 'pyproject.toml', framework: 'pytest' }
  ];

  for (const { file, framework } of testConfigs) {
    if (fs.existsSync(file)) {
      infra.hasTests = true;
      infra.framework = framework;
      infra.configFile = file;
      break;
    }
  }

  // Check package.json for test scripts
  if (fs.existsSync('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      if (pkg.scripts && pkg.scripts.test) {
        infra.hasTests = true;
        if (!infra.framework) {
          // Try to detect from script
          const testScript = pkg.scripts.test;
          if (testScript.includes('vitest')) infra.framework = 'vitest';
          else if (testScript.includes('jest')) infra.framework = 'jest';
          else if (testScript.includes('mocha')) infra.framework = 'mocha';
          else if (testScript.includes('ava')) infra.framework = 'ava';
        }
      }
    } catch (e) { /* ignore */ }
  }

  return infra;
}

/**
 * Detect file patterns in codebase
 */
function detectFilePatterns() {
  const patterns = {
    frontend: [],
    backend: [],
    templates: [],
    styles: [],
    configs: []
  };

  // Quick scan of common directories (limit depth for performance)
  const scanDir = (dir, depth = 0, maxDepth = 3) => {
    if (depth > maxDepth) return [];
    if (!fs.existsSync(dir)) return [];

    const files = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (entry.name === 'node_modules') continue;
        if (entry.name === 'vendor') continue;
        if (entry.name === '__pycache__') continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isFile()) {
          files.push(fullPath);
        } else if (entry.isDirectory() && depth < maxDepth) {
          files.push(...scanDir(fullPath, depth + 1, maxDepth));
        }
      }
    } catch (e) { /* ignore permission errors */ }
    return files;
  };

  const files = scanDir('.', 0, 2);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const basename = path.basename(file);

    // Frontend patterns
    if (['.jsx', '.tsx'].includes(ext)) patterns.frontend.push(ext);
    if (ext === '.vue') patterns.frontend.push('.vue');

    // Backend patterns
    if (ext === '.go') patterns.backend.push('.go');
    if (ext === '.py') patterns.backend.push('.py');
    if (ext === '.php') patterns.backend.push('.php');
    if (ext === '.rb') patterns.backend.push('.rb');

    // Template patterns
    if (basename.endsWith('.blade.php')) patterns.templates.push('blade');
    if (ext === '.twig') patterns.templates.push('twig');
    if (ext === '.jinja' || ext === '.jinja2') patterns.templates.push('jinja');
    if (ext === '.ejs') patterns.templates.push('ejs');
    if (ext === '.hbs' || ext === '.handlebars') patterns.templates.push('handlebars');
    if (ext === '.pug' || ext === '.jade') patterns.templates.push('pug');

    // Style patterns
    if (ext === '.css') patterns.styles.push('css');
    if (ext === '.scss' || ext === '.sass') patterns.styles.push('scss');
    if (ext === '.less') patterns.styles.push('less');
    if (basename === 'tailwind.config.js' || basename === 'tailwind.config.ts') {
      patterns.styles.push('tailwind');
    }

    // Config patterns
    if (basename === 'tsconfig.json') patterns.configs.push('typescript');
    if (basename === 'eslint.config.js' || basename === '.eslintrc.js') {
      patterns.configs.push('eslint');
    }
  }

  // Dedupe arrays
  for (const key of Object.keys(patterns)) {
    patterns[key] = [...new Set(patterns[key])];
  }

  return patterns;
}

/**
 * Detect agent mapping based on patterns
 */
function detectAgentMapping(framework, patterns) {
  const agents = {
    primary: null,
    secondary: [],
    available: []
  };

  // Framework → canonical agent (must stay within the roster in agents/*.md —
  // these labels surface in handoff/status output and must match dispatchable ids)
  const frameworkAgents = {
    'nextjs': 'frontend',
    'react': 'frontend',
    'vue': 'frontend',
    'nuxt': 'frontend',
    'angular': 'frontend',
    'react-native': 'mobile',
    'expo': 'mobile',
    'flutter': 'mobile',
    'laravel': 'architect',
    'symfony': 'architect',
    'express': 'architect',
    'nestjs': 'architect',
    'fastify': 'architect',
    'hono': 'architect',
    'django': 'architect',
    'fastapi': 'architect',
    'flask': 'architect',
    'gin': 'architect',
    'echo': 'architect',
    'fiber': 'architect',
    'godot': 'frontend'
  };

  if (framework && frameworkAgents[framework]) {
    agents.primary = frameworkAgents[framework];
  }

  // Add secondary agents based on patterns
  if (patterns.templates.length > 0 && agents.primary !== 'frontend') {
    agents.secondary.push('frontend');
  }
  if (patterns.frontend.length > 0 && agents.primary !== 'frontend') {
    agents.secondary.push('frontend');
  }
  if (patterns.backend.length > 0 && agents.primary !== 'architect') {
    agents.secondary.push('architect');
  }

  // Full canonical roster (agents/*.md)
  agents.available = [
    'lead',
    'architect',
    'frontend',
    'mobile',
    'strategist',
    'security',
    'tester',
    'devops',
    'scanner',
    'master-planner',
    'feature-architect',
    'story-planner',
    'replanner',
    'epic-summarizer',
    'conflict-arbiter'
  ];

  // Dedupe secondary
  agents.secondary = [...new Set(agents.secondary)].filter(a => a !== agents.primary);

  return agents;
}

/**
 * Full project detection with caching
 */
function detectProject(forceRefresh = false) {
  // Try cache first
  if (!forceRefresh) {
    const cached = loadCache();
    if (cached) {
      return {
        ...cached,
        fromCache: true
      };
    }
  }

  // Import detection functions from config-utils
  const configUtils = require('./af-config-utils.cjs');

  const detection = {
    projectType: configUtils.detectProjectType('auto'),
    packageManager: configUtils.detectPackageManager('auto'),
    framework: configUtils.detectFramework('auto'),
    testInfra: detectTestInfra(),
    filePatterns: detectFilePatterns(),
    agents: null,
    cwd: process.cwd(),
    detectedAt: new Date().toISOString()
  };

  // Derive agent mapping
  detection.agents = detectAgentMapping(detection.framework, detection.filePatterns);

  // Save to cache
  saveCache(detection);

  return {
    ...detection,
    fromCache: false
  };
}

/**
 * Get cached detection or null
 */
function getCachedDetection() {
  return loadCache();
}

/**
 * Format detection for display
 */
function formatDetection(detection) {
  const lines = [];

  lines.push(`**Project Type:** ${detection.projectType || 'unknown'}`);
  lines.push(`**Framework:** ${detection.framework || 'unknown'}`);
  lines.push(`**Package Manager:** ${detection.packageManager || 'unknown'}`);

  if (detection.agents?.primary) {
    lines.push(`**Primary Agent:** ${detection.agents.primary}`);
  }
  if (detection.agents?.secondary?.length > 0) {
    lines.push(`**Secondary Agents:** ${detection.agents.secondary.join(', ')}`);
  }

  if (detection.testInfra?.hasTests) {
    lines.push(`**Test Framework:** ${detection.testInfra.framework || 'detected'}`);
  }

  if (detection.filePatterns?.templates?.length > 0) {
    lines.push(`**Templates:** ${detection.filePatterns.templates.join(', ')}`);
  }

  lines.push(`**From Cache:** ${detection.fromCache ? 'Yes' : 'No (fresh scan)'}`);

  return lines.join('\n');
}

// ============================================
// WORKSPACE / MULTI-PROJECT SUPPORT
// ============================================

/**
 * Check if a directory is a project root (has config files)
 */
function isProjectRoot(dir) {
  for (const keyFile of KEY_FILES) {
    const filePath = path.join(dir, keyFile);
    if (fs.existsSync(filePath)) {
      return true;
    }
  }
  // Also check for .git as indicator
  if (fs.existsSync(path.join(dir, '.git'))) {
    return true;
  }
  return false;
}

/**
 * Check if current directory is a workspace (contains multiple project repos)
 */
function isWorkspace(dir = '.') {
  const absDir = path.resolve(dir);

  // If current dir is itself a project, it's not a workspace container
  if (isProjectRoot(absDir)) {
    return false;
  }

  // Check if any immediate subdirectories are project roots
  let projectCount = 0;
  try {
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.includes(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const subdir = path.join(absDir, entry.name);
      if (isProjectRoot(subdir)) {
        projectCount++;
        if (projectCount >= 2) return true; // At least 2 projects = workspace
      }
    }
  } catch (e) {
    return false;
  }

  return false;
}

/**
 * Scan workspace directory for all project repos
 * Returns array of project directories (relative paths)
 */
function scanWorkspaceProjects(workspaceDir = '.', maxDepth = 2) {
  const projects = [];
  const absWorkspace = path.resolve(workspaceDir);

  const scan = (dir, depth) => {
    if (depth > maxDepth) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (SKIP_DIRS.includes(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;

        const subdir = path.join(dir, entry.name);
        const relPath = path.relative(absWorkspace, subdir);

        if (isProjectRoot(subdir)) {
          projects.push({
            name: entry.name,
            path: relPath,
            absolutePath: subdir
          });
        } else if (depth < maxDepth) {
          // Continue scanning deeper if not a project
          scan(subdir, depth + 1);
        }
      }
    } catch (e) {
      // Permission error, skip
    }
  };

  scan(absWorkspace, 0);
  return projects;
}

/**
 * Get detection path for a specific project directory
 * Stored in: [project]/.claude/project-contexts/[project-name]/project-detection.json
 */
function getProjectCachePath(projectDir) {
  const projectName = getProjectName(projectDir);
  return path.join(projectDir, PROJECT_CONTEXTS_DIR, projectName, DETECTION_FILE);
}

/**
 * Get workspace detection path (index of all projects)
 * Stored in: [workspace]/.claude/project-contexts/workspace-detection.json
 */
function getWorkspaceCachePath(workspaceDir = '.') {
  return path.join(workspaceDir, PROJECT_CONTEXTS_DIR, WORKSPACE_DETECTION_FILE);
}

/**
 * Calculate key files hash for a specific directory
 */
function calculateKeyFilesHashForDir(dir) {
  const hashes = [];

  for (const file of KEY_FILES) {
    const filePath = path.join(dir, file);
    if (fs.existsSync(filePath)) {
      try {
        const stat = fs.statSync(filePath);
        hashes.push(`${file}:${stat.mtimeMs}:${stat.size}`);
      } catch (e) {
        // File might be inaccessible
      }
    }
  }

  if (hashes.length === 0) return 'empty';

  return crypto
    .createHash('md5')
    .update(hashes.join('|'))
    .digest('hex')
    .substring(0, 12);
}

/**
 * Load detection for a specific project directory
 */
function loadProjectCache(projectDir) {
  const detectionPath = getProjectCachePath(projectDir);
  if (!fs.existsSync(detectionPath)) return null;

  try {
    const content = fs.readFileSync(detectionPath, 'utf8');
    const cache = JSON.parse(content);

    // Validate cache for this specific directory
    if (!cache || !cache.timestamp) return null;

    const age = Date.now() - cache.timestamp;
    if (age > CACHE_MAX_AGE_MS) return null;

    const currentHash = calculateKeyFilesHashForDir(projectDir);
    if (cache.keyFilesHash !== currentHash) return null;

    return cache;
  } catch (e) {
    return null;
  }
}

/**
 * Save detection to a specific project directory
 * Stored in: [project]/.claude/project-contexts/[project-name]/project-detection.json
 */
function saveProjectCache(projectDir, detection) {
  const projectName = getProjectName(projectDir);
  const contextDir = path.join(projectDir, PROJECT_CONTEXTS_DIR, projectName);
  const detectionPath = path.join(contextDir, DETECTION_FILE);

  // Ensure project-contexts directory exists
  if (!fs.existsSync(contextDir)) {
    fs.mkdirSync(contextDir, { recursive: true });
  }

  const cache = {
    ...detection,
    projectName: projectName,
    timestamp: Date.now(),
    keyFilesHash: calculateKeyFilesHashForDir(projectDir),
    version: '2.0.0'
  };

  try {
    fs.writeFileSync(detectionPath, JSON.stringify(cache, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Detect project in a specific directory (with caching)
 */
function detectProjectInDir(projectDir, forceRefresh = false) {
  const absDir = path.resolve(projectDir);

  // Try cache first
  if (!forceRefresh) {
    const cached = loadProjectCache(absDir);
    if (cached) {
      return {
        ...cached,
        fromCache: true
      };
    }
  }

  // Save current directory and change to project dir
  const originalCwd = process.cwd();
  try {
    process.chdir(absDir);

    // Import detection functions from config-utils
    const configUtils = require('./af-config-utils.cjs');

    const detection = {
      projectName: path.basename(absDir),
      projectPath: absDir,
      projectType: configUtils.detectProjectType('auto'),
      packageManager: configUtils.detectPackageManager('auto'),
      framework: configUtils.detectFramework('auto'),
      testInfra: detectTestInfra(),
      filePatterns: detectFilePatterns(),
      agents: null,
      cwd: absDir,
      detectedAt: new Date().toISOString()
    };

    // Derive agent mapping
    detection.agents = detectAgentMapping(detection.framework, detection.filePatterns);

    // Save to project-specific cache
    saveProjectCache(absDir, detection);

    return {
      ...detection,
      fromCache: false
    };
  } finally {
    // Restore original directory
    process.chdir(originalCwd);
  }
}

/**
 * Load workspace cache (index of all projects)
 */
function loadWorkspaceCache(workspaceDir = '.') {
  const cachePath = getWorkspaceCachePath(workspaceDir);
  if (!fs.existsSync(cachePath)) return null;

  try {
    const content = fs.readFileSync(cachePath, 'utf8');
    const cache = JSON.parse(content);

    if (!cache || !cache.timestamp) return null;

    const age = Date.now() - cache.timestamp;
    if (age > CACHE_MAX_AGE_MS) return null;

    return cache;
  } catch (e) {
    return null;
  }
}

/**
 * Save workspace detection (index of all projects)
 * Stored in: [workspace]/.claude/project-contexts/workspace-detection.json
 */
function saveWorkspaceCache(workspaceDir, workspaceData) {
  const contextDir = path.join(workspaceDir, PROJECT_CONTEXTS_DIR);
  const detectionPath = path.join(contextDir, WORKSPACE_DETECTION_FILE);

  if (!fs.existsSync(contextDir)) {
    fs.mkdirSync(contextDir, { recursive: true });
  }

  const cache = {
    ...workspaceData,
    timestamp: Date.now(),
    version: '2.0.0'
  };

  try {
    fs.writeFileSync(detectionPath, JSON.stringify(cache, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Full workspace detection - scans all projects and caches each
 */
function detectWorkspace(workspaceDir = '.', forceRefresh = false) {
  const absWorkspace = path.resolve(workspaceDir);

  // Check if actually a workspace
  if (!isWorkspace(absWorkspace)) {
    // Not a workspace, fall back to single project detection
    return {
      isWorkspace: false,
      projects: [],
      currentProject: detectProject(forceRefresh)
    };
  }

  // Try workspace cache first
  if (!forceRefresh) {
    const cached = loadWorkspaceCache(absWorkspace);
    if (cached && cached.projects) {
      // Validate individual project caches are still valid
      let allValid = true;
      for (const proj of cached.projects) {
        const projCache = loadProjectCache(proj.absolutePath);
        if (!projCache) {
          allValid = false;
          break;
        }
      }

      if (allValid) {
        return {
          ...cached,
          fromCache: true
        };
      }
    }
  }

  // Scan for all projects
  const projectDirs = scanWorkspaceProjects(absWorkspace);
  const projects = [];

  for (const projInfo of projectDirs) {
    const detection = detectProjectInDir(projInfo.absolutePath, forceRefresh);
    projects.push({
      name: projInfo.name,
      path: projInfo.path,
      absolutePath: projInfo.absolutePath,
      framework: detection.framework,
      packageManager: detection.packageManager,
      agents: detection.agents,
      testInfra: detection.testInfra?.hasTests ? detection.testInfra.framework : null
    });
  }

  const workspaceData = {
    isWorkspace: true,
    workspacePath: absWorkspace,
    projectCount: projects.length,
    projects: projects,
    detectedAt: new Date().toISOString()
  };

  // Save workspace-level cache
  saveWorkspaceCache(absWorkspace, workspaceData);

  return {
    ...workspaceData,
    fromCache: false
  };
}

/**
 * Get project detection for task context
 * Automatically handles workspace vs single project
 */
function getProjectForTask(taskContext = null) {
  const cwd = process.cwd();

  // Check if we're in a workspace
  if (isWorkspace(cwd)) {
    const workspace = detectWorkspace(cwd);

    // If task mentions a specific project, find it
    if (taskContext) {
      const taskLower = taskContext.toLowerCase();
      for (const proj of workspace.projects) {
        if (taskLower.includes(proj.name.toLowerCase())) {
          return {
            workspace: workspace,
            targetProject: detectProjectInDir(proj.absolutePath),
            matchedBy: 'task_mention'
          };
        }
      }
    }

    // Return workspace info without specific target
    return {
      workspace: workspace,
      targetProject: null,
      matchedBy: 'none'
    };
  }

  // Single project
  return {
    workspace: null,
    targetProject: detectProject(),
    matchedBy: 'cwd'
  };
}

/**
 * Clear all caches (workspace + all projects)
 */
function clearAllCaches(workspaceDir = '.') {
  const absWorkspace = path.resolve(workspaceDir);

  // Clear workspace cache
  const workspaceCachePath = getWorkspaceCachePath(absWorkspace);
  if (fs.existsSync(workspaceCachePath)) {
    try { fs.unlinkSync(workspaceCachePath); } catch (e) {}
  }

  // Clear individual project caches
  const projectDirs = scanWorkspaceProjects(absWorkspace);
  for (const proj of projectDirs) {
    const projCachePath = getProjectCachePath(proj.absolutePath);
    if (fs.existsSync(projCachePath)) {
      try { fs.unlinkSync(projCachePath); } catch (e) {}
    }
  }

  // Clear current directory cache too
  clearCache();

  return true;
}

// ============================================
// MONOREPO SUPPORT
// ============================================

/**
 * Detect if current directory is a monorepo
 * Returns: { isMonorepo: boolean, type: string|null, configFile: string|null }
 */
function detectMonorepoType(dir = '.') {
  const absDir = path.resolve(dir);

  // Check for monorepo config files
  for (const [configFile, type] of Object.entries(MONOREPO_CONFIGS)) {
    if (fs.existsSync(path.join(absDir, configFile))) {
      return { isMonorepo: true, type, configFile };
    }
  }

  // Check for npm/yarn workspaces in package.json
  const pkgPath = path.join(absDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.workspaces) {
        // Determine if yarn or npm based on lock file
        if (fs.existsSync(path.join(absDir, 'yarn.lock'))) {
          return { isMonorepo: true, type: 'yarn', configFile: 'package.json' };
        }
        if (fs.existsSync(path.join(absDir, 'package-lock.json'))) {
          return { isMonorepo: true, type: 'npm', configFile: 'package.json' };
        }
        return { isMonorepo: true, type: 'npm-workspaces', configFile: 'package.json' };
      }
    } catch (e) {}
  }

  return { isMonorepo: false, type: null, configFile: null };
}

/**
 * Get workspace patterns from monorepo config
 */
function getMonorepoWorkspacePatterns(dir = '.') {
  const absDir = path.resolve(dir);
  const patterns = [];

  // Check pnpm-workspace.yaml
  const pnpmPath = path.join(absDir, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmPath)) {
    try {
      const content = fs.readFileSync(pnpmPath, 'utf8');
      // Simple YAML parsing for packages array
      const match = content.match(/packages:\s*\n((?:\s*-\s*.+\n?)+)/);
      if (match) {
        const lines = match[1].split('\n');
        for (const line of lines) {
          const patternMatch = line.match(/^\s*-\s*['"]?([^'"]+)['"]?\s*$/);
          if (patternMatch) {
            patterns.push(patternMatch[1]);
          }
        }
      }
    } catch (e) {}
  }

  // Check package.json workspaces
  const pkgPath = path.join(absDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.workspaces) {
        if (Array.isArray(pkg.workspaces)) {
          patterns.push(...pkg.workspaces);
        } else if (pkg.workspaces.packages) {
          patterns.push(...pkg.workspaces.packages);
        }
      }
    } catch (e) {}
  }

  // Check lerna.json
  const lernaPath = path.join(absDir, 'lerna.json');
  if (fs.existsSync(lernaPath)) {
    try {
      const lerna = JSON.parse(fs.readFileSync(lernaPath, 'utf8'));
      if (lerna.packages) {
        patterns.push(...lerna.packages);
      }
    } catch (e) {}
  }

  // Default patterns if none found
  if (patterns.length === 0) {
    patterns.push('packages/*', 'apps/*');
  }

  return patterns;
}

/**
 * Expand glob patterns to actual directories
 */
function expandGlobPatterns(baseDir, patterns) {
  const directories = [];
  const absBase = path.resolve(baseDir);

  for (const pattern of patterns) {
    // Remove trailing /* or /**
    const cleanPattern = pattern.replace(/\/\*+$/, '');

    // Handle simple patterns like "packages/*"
    if (cleanPattern.includes('*')) {
      // Get the prefix before the wildcard
      const parts = cleanPattern.split('*');
      const prefix = parts[0];
      const prefixDir = path.join(absBase, prefix);

      if (fs.existsSync(prefixDir) && fs.statSync(prefixDir).isDirectory()) {
        try {
          const entries = fs.readdirSync(prefixDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !SKIP_DIRS.includes(entry.name) && !entry.name.startsWith('.')) {
              const fullPath = path.join(prefixDir, entry.name);
              // Check if it's a package (has package.json or other config)
              if (isProjectRoot(fullPath)) {
                directories.push({
                  name: entry.name,
                  path: path.relative(absBase, fullPath),
                  absolutePath: fullPath
                });
              }
            }
          }
        } catch (e) {}
      }
    } else {
      // Direct path like "packages/shared"
      const fullPath = path.join(absBase, cleanPattern);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory() && isProjectRoot(fullPath)) {
        directories.push({
          name: path.basename(fullPath),
          path: cleanPattern,
          absolutePath: fullPath
        });
      }
    }
  }

  return directories;
}

/**
 * Scan monorepo for all packages
 */
function scanMonorepoPackages(monorepoDir = '.') {
  const absDir = path.resolve(monorepoDir);
  const patterns = getMonorepoWorkspacePatterns(absDir);
  return expandGlobPatterns(absDir, patterns);
}

/**
 * Get monorepo detection path
 */
function getMonorepoCachePath(monorepoDir = '.') {
  const projectName = getProjectName(monorepoDir);
  return path.join(monorepoDir, PROJECT_CONTEXTS_DIR, projectName, MONOREPO_DETECTION_FILE);
}

/**
 * Load monorepo detection
 */
function loadMonorepoCache(monorepoDir = '.') {
  const detectionPath = getMonorepoCachePath(monorepoDir);
  if (!fs.existsSync(detectionPath)) return null;

  try {
    const content = fs.readFileSync(detectionPath, 'utf8');
    const cache = JSON.parse(content);

    if (!cache || !cache.timestamp) return null;

    const age = Date.now() - cache.timestamp;
    if (age > CACHE_MAX_AGE_MS) return null;

    // Validate key files hash
    const currentHash = calculateKeyFilesHash();
    if (cache.keyFilesHash !== currentHash) return null;

    return cache;
  } catch (e) {
    return null;
  }
}

/**
 * Save monorepo detection
 */
function saveMonorepoCache(monorepoDir, monorepoData) {
  const projectName = getProjectName(monorepoDir);
  const contextDir = path.join(monorepoDir, PROJECT_CONTEXTS_DIR, projectName);
  const detectionPath = path.join(contextDir, MONOREPO_DETECTION_FILE);

  if (!fs.existsSync(contextDir)) {
    fs.mkdirSync(contextDir, { recursive: true });
  }

  const cache = {
    ...monorepoData,
    timestamp: Date.now(),
    keyFilesHash: calculateKeyFilesHash(),
    version: '2.0.0'
  };

  try {
    fs.writeFileSync(detectionPath, JSON.stringify(cache, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Full monorepo detection - scans all packages and caches each
 */
function detectMonorepo(monorepoDir = '.', forceRefresh = false) {
  const absDir = path.resolve(monorepoDir);
  const monoInfo = detectMonorepoType(absDir);

  if (!monoInfo.isMonorepo) {
    return {
      isMonorepo: false,
      packages: [],
      rootProject: detectProject(forceRefresh)
    };
  }

  // Try cache first
  if (!forceRefresh) {
    const cached = loadMonorepoCache(absDir);
    if (cached && cached.packages) {
      // Validate individual package caches are still valid
      let allValid = true;
      for (const pkg of cached.packages) {
        const pkgCache = loadProjectCache(pkg.absolutePath);
        if (!pkgCache) {
          allValid = false;
          break;
        }
      }

      if (allValid) {
        return {
          ...cached,
          fromCache: true
        };
      }
    }
  }

  // Scan for all packages
  const packageDirs = scanMonorepoPackages(absDir);
  const packages = [];

  for (const pkgInfo of packageDirs) {
    const detection = detectProjectInDir(pkgInfo.absolutePath, forceRefresh);
    packages.push({
      name: pkgInfo.name,
      path: pkgInfo.path,
      absolutePath: pkgInfo.absolutePath,
      framework: detection.framework,
      packageManager: detection.packageManager,
      agents: detection.agents,
      testInfra: detection.testInfra?.hasTests ? detection.testInfra.framework : null
    });
  }

  // Also detect root project
  const rootDetection = detectProject(forceRefresh);

  const monorepoData = {
    isMonorepo: true,
    monorepoType: monoInfo.type,
    configFile: monoInfo.configFile,
    monorepoPath: absDir,
    monorepoName: getProjectName(absDir),
    packageCount: packages.length,
    packages: packages,
    rootProject: {
      framework: rootDetection.framework,
      packageManager: rootDetection.packageManager,
      agents: rootDetection.agents
    },
    detectedAt: new Date().toISOString()
  };

  // Save monorepo-level cache
  saveMonorepoCache(absDir, monorepoData);

  return {
    ...monorepoData,
    fromCache: false
  };
}

/**
 * Get package detection for task context in monorepo
 */
function getPackageForTask(taskContext = null, monorepoDir = '.') {
  const monoInfo = detectMonorepoType(monorepoDir);

  if (!monoInfo.isMonorepo) {
    return {
      monorepo: null,
      targetPackage: detectProject(),
      matchedBy: 'not_monorepo'
    };
  }

  const monorepo = detectMonorepo(monorepoDir);

  // If task mentions a specific package, find it
  if (taskContext && monorepo.packages) {
    const taskLower = taskContext.toLowerCase();
    for (const pkg of monorepo.packages) {
      if (taskLower.includes(pkg.name.toLowerCase())) {
        return {
          monorepo: monorepo,
          targetPackage: detectProjectInDir(pkg.absolutePath),
          matchedBy: 'task_mention'
        };
      }
      // Also match by path segments (e.g., "packages/web" matches "web")
      const pathParts = pkg.path.split('/');
      for (const part of pathParts) {
        if (part && taskLower.includes(part.toLowerCase())) {
          return {
            monorepo: monorepo,
            targetPackage: detectProjectInDir(pkg.absolutePath),
            matchedBy: 'path_mention'
          };
        }
      }
    }
  }

  // Return monorepo info without specific target
  return {
    monorepo: monorepo,
    targetPackage: null,
    matchedBy: 'none'
  };
}

/**
 * Format monorepo detection for display
 */
function formatMonorepoDetection(monorepo) {
  const lines = [];

  if (!monorepo.isMonorepo) {
    return formatDetection(monorepo.rootProject);
  }

  lines.push(`**Monorepo:** ${monorepo.monorepoName} (${monorepo.monorepoType})`);
  lines.push(`**Packages:** ${monorepo.packageCount}`);
  lines.push('');

  for (const pkg of monorepo.packages) {
    const agent = pkg.agents?.primary || 'unknown';
    const framework = pkg.framework || 'unknown';
    lines.push(`- **${pkg.path}** (${framework}) → ${agent}`);
  }

  lines.push('');
  lines.push(`**From Cache:** ${monorepo.fromCache ? 'Yes' : 'No (fresh scan)'}`);

  return lines.join('\n');
}

/**
 * Clear all monorepo caches
 */
function clearMonorepoCaches(monorepoDir = '.') {
  const absDir = path.resolve(monorepoDir);

  // Clear monorepo cache
  const monoCachePath = getMonorepoCachePath(absDir);
  if (fs.existsSync(monoCachePath)) {
    try { fs.unlinkSync(monoCachePath); } catch (e) {}
  }

  // Clear package caches
  const packages = scanMonorepoPackages(absDir);
  for (const pkg of packages) {
    const pkgCachePath = getProjectCachePath(pkg.absolutePath);
    if (fs.existsSync(pkgCachePath)) {
      try { fs.unlinkSync(pkgCachePath); } catch (e) {}
    }
  }

  // Clear root cache
  clearCache();

  return true;
}

/**
 * Format workspace detection for display
 */
function formatWorkspaceDetection(workspace) {
  const lines = [];

  if (!workspace.isWorkspace) {
    return formatDetection(workspace.currentProject);
  }

  lines.push(`**Workspace:** ${path.basename(workspace.workspacePath)}`);
  lines.push(`**Projects:** ${workspace.projectCount}`);
  lines.push('');

  for (const proj of workspace.projects) {
    const agent = proj.agents?.primary || 'unknown';
    const framework = proj.framework || 'unknown';
    lines.push(`- **${proj.name}** (${framework}) → ${agent}`);
  }

  lines.push('');
  lines.push(`**From Cache:** ${workspace.fromCache ? 'Yes' : 'No (fresh scan)'}`);

  return lines.join('\n');
}

module.exports = {
  // Single project functions
  detectProject,
  getCachedDetection,
  loadCache,
  saveCache,
  clearCache,
  isCacheValid,
  getGitHead,
  calculateContentHash,
  calculateKeyFilesHash,
  resolveWatchMode,
  findStructuralDirs,
  getCacheStaleness,
  detectTestInfra,
  detectFilePatterns,
  detectAgentMapping,
  formatDetection,
  getProjectName,
  getDetectionPath,
  ensureProjectContextsDir,

  // Workspace functions (multiple independent repos)
  isWorkspace,
  isProjectRoot,
  scanWorkspaceProjects,
  detectProjectInDir,
  loadProjectCache,
  saveProjectCache,
  detectWorkspace,
  loadWorkspaceCache,
  saveWorkspaceCache,
  getProjectForTask,
  clearAllCaches,
  formatWorkspaceDetection,
  getProjectCachePath,
  getWorkspaceCachePath,

  // Monorepo functions (single repo with multiple packages)
  detectMonorepoType,
  getMonorepoWorkspacePatterns,
  scanMonorepoPackages,
  detectMonorepo,
  loadMonorepoCache,
  saveMonorepoCache,
  getPackageForTask,
  formatMonorepoDetection,
  clearMonorepoCaches,
  getMonorepoCachePath,

  // Constants
  CACHE_MAX_AGE_MS,
  CACHE_SCHEMA_VERSION,
  STRUCTURAL_DIRS,
  KEY_FILES,
  SKIP_DIRS,
  PROJECT_CONTEXTS_DIR,
  DETECTION_FILE,
  WORKSPACE_DETECTION_FILE,
  MONOREPO_DETECTION_FILE,
  MONOREPO_CONFIGS
};
