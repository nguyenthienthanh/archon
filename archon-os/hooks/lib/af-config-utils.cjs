/**
 * Aura Frog - Shared Configuration Utilities
 *
 * Contains config loading, path resolution, project detection,
 * and common utilities used by session hooks.
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { TIMEOUT_DEFAULT_MS, MAX_BUFFER_DEFAULT, warnExecLimit } = require('./af-exec.cjs');

// Config paths
const LOCAL_CONFIG_PATH = '.claude/.af.json';
const GLOBAL_CONFIG_PATH = path.join(os.homedir(), '.claude', '.af.json');

// Default configuration
const DEFAULT_CONFIG = {
  plan: {
    namingFormat: '{date}-{slug}',
    dateFormat: 'YYMMDD',
    issuePrefix: null,
    reportsDir: 'reports',
    resolution: {
      order: ['session', 'branch'],
      branchPattern: '(?:feat|fix|chore|refactor|docs)/(?:[^/]+/)?(.+)'
    }
  },
  paths: {
    docs: 'docs',
    plans: 'plans',
    workflows: '.claude/logs/runs'
  },
  project: {
    type: 'auto',
    packageManager: 'auto',
    framework: 'auto'
  },
  locale: {
    responseLanguage: null
  },
  assertions: []
};

/**
 * Deep merge objects (source values override target)
 * Arrays are replaced entirely (not concatenated)
 */
function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  if (!target || typeof target !== 'object') return source;

  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (Array.isArray(sourceVal)) {
      result[key] = [...sourceVal];
    } else if (sourceVal !== null && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
      result[key] = deepMerge(targetVal || {}, sourceVal);
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

/**
 * Load config from a specific file path
 */
function loadConfigFromPath(configPath) {
  try {
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * Load config with cascading resolution: DEFAULT → global → local
 */
function loadConfig() {
  const globalConfig = loadConfigFromPath(GLOBAL_CONFIG_PATH);
  const localConfig = loadConfigFromPath(LOCAL_CONFIG_PATH);

  if (!globalConfig && !localConfig) {
    return { ...DEFAULT_CONFIG };
  }

  let merged = deepMerge({}, DEFAULT_CONFIG);
  if (globalConfig) merged = deepMerge(merged, globalConfig);
  if (localConfig) merged = deepMerge(merged, localConfig);

  return merged;
}

/**
 * Safely execute shell command.
 *
 * This is the generic escape hatch — callers pass arbitrary commands (version
 * probes, git queries), so the bounds live HERE rather than at each call site.
 * Every caller inherits a timeout and a maxBuffer; `opts` can raise them for a
 * command known to be slower or chattier. A hit limit is warned about on stderr
 * before falling open to null, so "no data" is never silently indistinguishable
 * from "command hung".
 */
function execSafe(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: TIMEOUT_DEFAULT_MS,
      killSignal: 'SIGKILL',
      maxBuffer: MAX_BUFFER_DEFAULT,
      ...opts
    }).trim();
  } catch (e) {
    warnExecLimit(`execSafe(${String(cmd).split(' ')[0]})`, e);
    return null;
  }
}

// ============================================
// PROJECT DETECTION
// ============================================

/**
 * Detect project type based on workspace indicators
 */
function detectProjectType(configOverride) {
  if (configOverride && configOverride !== 'auto') return configOverride;

  // Monorepo detection
  if (fs.existsSync('pnpm-workspace.yaml')) return 'monorepo';
  if (fs.existsSync('lerna.json')) return 'monorepo';
  if (fs.existsSync('nx.json')) return 'monorepo';
  if (fs.existsSync('turbo.json')) return 'monorepo';

  if (fs.existsSync('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      if (pkg.workspaces) return 'monorepo';
      if (pkg.main || pkg.exports || pkg.bin) return 'library';
    } catch (e) { /* ignore */ }
  }

  // PHP/Laravel detection
  if (fs.existsSync('composer.json')) {
    try {
      const composer = JSON.parse(fs.readFileSync('composer.json', 'utf8'));
      if (composer.type === 'library') return 'library';
    } catch (e) { /* ignore */ }
  }

  // Python detection
  if (fs.existsSync('pyproject.toml') || fs.existsSync('setup.py')) {
    return 'library';
  }

  // Go detection
  if (fs.existsSync('go.work')) return 'monorepo';

  return 'single-repo';
}

/**
 * Detect package manager from lock files
 */
function detectPackageManager(configOverride) {
  if (configOverride && configOverride !== 'auto') return configOverride;

  // JavaScript/Node.js
  if (fs.existsSync('bun.lockb')) return 'bun';
  if (fs.existsSync('pnpm-lock.yaml')) return 'pnpm';
  if (fs.existsSync('yarn.lock')) return 'yarn';
  if (fs.existsSync('package-lock.json')) return 'npm';

  // PHP
  if (fs.existsSync('composer.lock')) return 'composer';

  // Python
  if (fs.existsSync('poetry.lock')) return 'poetry';
  if (fs.existsSync('Pipfile.lock')) return 'pipenv';
  if (fs.existsSync('requirements.txt')) return 'pip';
  if (fs.existsSync('uv.lock')) return 'uv';

  // Go
  if (fs.existsSync('go.sum')) return 'go';

  // Rust
  if (fs.existsSync('Cargo.lock')) return 'cargo';

  // Ruby
  if (fs.existsSync('Gemfile.lock')) return 'bundler';

  return null;
}

/**
 * Detect framework from package.json/composer.json dependencies
 */
function detectFramework(configOverride) {
  if (configOverride && configOverride !== 'auto') return configOverride;

  // JavaScript frameworks
  if (fs.existsSync('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Meta-frameworks first
      if (deps['next']) return 'nextjs';
      if (deps['nuxt']) return 'nuxt';
      if (deps['@remix-run/node'] || deps['@remix-run/react']) return 'remix';
      if (deps['astro']) return 'astro';
      if (deps['@sveltejs/kit']) return 'sveltekit';

      // Mobile
      if (deps['react-native']) return 'react-native';
      if (deps['expo']) return 'expo';

      // Frontend
      if (deps['vue']) return 'vue';
      if (deps['react']) return 'react';
      if (deps['svelte']) return 'svelte';
      if (deps['@angular/core']) return 'angular';

      // Backend
      if (deps['@nestjs/core']) return 'nestjs';
      if (deps['express']) return 'express';
      if (deps['fastify']) return 'fastify';
      if (deps['hono']) return 'hono';
      if (deps['elysia']) return 'elysia';

      return null;
    } catch (e) { /* ignore */ }
  }

  // PHP frameworks
  if (fs.existsSync('composer.json')) {
    try {
      const composer = JSON.parse(fs.readFileSync('composer.json', 'utf8'));
      const deps = { ...composer.require, ...composer['require-dev'] };

      if (deps['laravel/framework']) return 'laravel';
      if (deps['symfony/framework-bundle']) return 'symfony';
      if (deps['slim/slim']) return 'slim';

      return null;
    } catch (e) { /* ignore */ }
  }

  // Python frameworks
  if (fs.existsSync('requirements.txt')) {
    try {
      const reqs = fs.readFileSync('requirements.txt', 'utf8');
      if (reqs.includes('django')) return 'django';
      if (reqs.includes('fastapi')) return 'fastapi';
      if (reqs.includes('flask')) return 'flask';
    } catch (e) { /* ignore */ }
  }

  if (fs.existsSync('pyproject.toml')) {
    try {
      const pyproject = fs.readFileSync('pyproject.toml', 'utf8');
      if (pyproject.includes('django')) return 'django';
      if (pyproject.includes('fastapi')) return 'fastapi';
      if (pyproject.includes('flask')) return 'flask';
    } catch (e) { /* ignore */ }
  }

  // Go frameworks
  if (fs.existsSync('go.mod')) {
    try {
      const gomod = fs.readFileSync('go.mod', 'utf8');
      if (gomod.includes('gin-gonic/gin')) return 'gin';
      if (gomod.includes('labstack/echo')) return 'echo';
      if (gomod.includes('gofiber/fiber')) return 'fiber';
    } catch (e) { /* ignore */ }
  }

  // Flutter
  if (fs.existsSync('pubspec.yaml')) {
    try {
      const pubspec = fs.readFileSync('pubspec.yaml', 'utf8');
      if (pubspec.includes('flutter:')) return 'flutter';
    } catch (e) { /* ignore */ }
  }

  // Godot
  if (fs.existsSync('project.godot')) {
    return 'godot';
  }

  return null;
}

/**
 * Get runtime versions
 */
function getNodeVersion() {
  return process.version;
}

function getPythonVersion() {
  const commands = ['python3 --version', 'python --version'];
  for (const cmd of commands) {
    const result = execSafe(cmd);
    if (result) return result.replace('Python ', '');
  }
  return null;
}

function getPhpVersion() {
  const result = execSafe('php --version');
  if (result) {
    const match = result.match(/PHP\s+(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  }
  return null;
}

function getGoVersion() {
  const result = execSafe('go version');
  if (result) {
    const match = result.match(/go(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  }
  return null;
}

function getGodotVersion() {
  // Try reading from project.godot file
  if (fs.existsSync('project.godot')) {
    try {
      const content = fs.readFileSync('project.godot', 'utf8');
      // Godot 4.x uses config_version=5
      // Godot 3.x uses config_version=4
      const configMatch = content.match(/config_version=(\d+)/);
      if (configMatch) {
        const configVersion = parseInt(configMatch[1]);
        if (configVersion >= 5) return '4.x';
        if (configVersion === 4) return '3.x';
      }
      // Try to find version from features
      const featuresMatch = content.match(/config\/features=PackedStringArray\("([0-9.]+)"/);
      if (featuresMatch) return featuresMatch[1];
    } catch (e) { /* ignore */ }
  }
  // Try godot command
  const result = execSafe('godot --version 2>/dev/null || godot4 --version 2>/dev/null');
  if (result) {
    const match = result.match(/^(\d+\.\d+(?:\.\d+)?)/);
    return match ? match[1] : null;
  }
  return null;
}

// ============================================
// GIT UTILITIES
// ============================================

function getGitBranch() {
  return execSafe('git branch --show-current');
}

function getGitRemoteUrl() {
  return execSafe('git config --get remote.origin.url');
}

// ============================================
// PLAN RESOLUTION
// ============================================

/**
 * Sanitize slug to prevent path traversal
 */
function sanitizeSlug(slug) {
  if (!slug) return '';
  return slug.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').slice(0, 100);
}

/**
 * Extract feature slug from git branch name
 */
function extractSlugFromBranch(branch, pattern) {
  if (!branch) return null;
  const defaultPattern = /(?:feat|fix|chore|refactor|docs)\/(?:[^\/]+\/)?(.+)/;
  const regex = pattern ? new RegExp(pattern) : defaultPattern;
  const match = branch.match(regex);
  return match ? sanitizeSlug(match[1]) : null;
}

/**
 * Get session temp file path
 */
function getSessionTempPath(sessionId) {
  return path.join(os.tmpdir(), `af-session-${sessionId}.json`);
}

/**
 * Canonical per-session key shared by ALL hooks — writers AND readers. Every
 * hook process reliably shares process.ppid within a session (same parent
 * Claude Code process), which is what every reader keys by; AF_SESSION_ID lets
 * a wrapper/test pin it. A stdin session_id (UUID) must NOT be preferred here —
 * most reader hooks never receive it, so keying the writer by it desyncs it
 * from every reader and the state file is effectively never found.
 */
function resolveSessionId() {
  return process.env.AF_SESSION_ID || process.ppid?.toString() || null;
}

/**
 * How long a session state file stays trustworthy. The key is process.ppid,
 * which the OS recycles: a stale af-session-<ppid>.json left in the temp dir by
 * a session that ended days ago will be read as live state by whatever new
 * Claude Code process lands on that pid. Anything this old is a collision, not
 * a session — no real session runs for a day without a single state write, and
 * writeSessionState refreshes the mtime on every one.
 *
 * session-start.cjs sweeps files past this age; readSessionState refuses them
 * in the meantime, so a project that never starts a session cannot be poisoned
 * by one that did.
 */
const SESSION_STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Read session state from temp file
 */
function readSessionState(sessionId) {
  if (!sessionId) return null;
  const tempPath = getSessionTempPath(sessionId);
  try {
    const stat = fs.statSync(tempPath);
    if (Date.now() - stat.mtimeMs > SESSION_STATE_MAX_AGE_MS) return null;
    return JSON.parse(fs.readFileSync(tempPath, 'utf8'));
  } catch (e) {
    // ENOENT included: no file is the same answer as no usable state.
    return null;
  }
}

/**
 * Write session state atomically to temp file
 */
function writeSessionState(sessionId, state) {
  if (!sessionId) return false;
  const tempPath = getSessionTempPath(sessionId);
  const tmpFile = tempPath + '.' + Math.random().toString(36).slice(2);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
    fs.renameSync(tmpFile, tempPath);
    return true;
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
    return false;
  }
}

/**
 * Resolve active plan path using cascading resolution
 *
 * Resolution semantics:
 * - 'session': Explicitly set → ACTIVE (directive)
 * - 'branch': Matched from git branch → SUGGESTED (hint only)
 */
function resolvePlanPath(sessionId, config) {
  const plansDir = config?.paths?.plans || 'plans';
  const resolution = config?.plan?.resolution || {};
  const order = resolution.order || ['session', 'branch'];
  const branchPattern = resolution.branchPattern;

  for (const method of order) {
    switch (method) {
      case 'session': {
        const state = readSessionState(sessionId);
        if (state?.activePlan) {
          // Only use if CWD matches session origin (monorepo support)
          if (state.sessionOrigin && state.sessionOrigin !== process.cwd()) {
            break;
          }
          return { path: state.activePlan, resolvedBy: 'session' };
        }
        break;
      }
      case 'branch': {
        try {
          const branch = getGitBranch();
          const slug = extractSlugFromBranch(branch, branchPattern);
          if (slug && fs.existsSync(plansDir)) {
            const entries = fs.readdirSync(plansDir, { withFileTypes: true })
              .filter(e => e.isDirectory() && e.name.includes(slug));
            if (entries.length > 0) {
              return {
                path: path.join(plansDir, entries[entries.length - 1].name),
                resolvedBy: 'branch'
              };
            }
          }
        } catch (e) { /* ignore */ }
        break;
      }
    }
  }
  return { path: null, resolvedBy: null };
}

/**
 * Get reports path based on plan resolution
 */
function getReportsPath(planPath, resolvedBy, config) {
  const planConfig = config?.plan || {};
  const pathsConfig = config?.paths || {};

  if (planPath && resolvedBy === 'session') {
    return `${planPath}/${planConfig.reportsDir || 'reports'}/`;
  }
  return `${pathsConfig.plans || 'plans'}/${planConfig.reportsDir || 'reports'}/`;
}

// ============================================
// AGENT TEAMS UTILITIES
// ============================================

/**
 * Check if Claude Agent Teams feature is enabled
 * Checks both process.env and settings.json env config
 */
function isAgentTeamsEnabled() {
  // Direct env var check
  if (process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === '1') return true;

  // Check settings.json
  const { findProjectRoot } = require('./hook-runtime.cjs');
  const settingsPaths = [
    path.join(os.homedir(), '.claude', 'settings.json'),
    path.join(findProjectRoot(), '.claude', 'settings.json')
  ];

  for (const sp of settingsPaths) {
    try {
      if (!fs.existsSync(sp)) continue;
      const settings = JSON.parse(fs.readFileSync(sp, 'utf8'));
      if (settings?.env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === '1') return true;
    } catch (e) { /* ignore */ }
  }

  return false;
}

// ============================================
// ENV FILE UTILITIES
// ============================================

/**
 * Escape shell special characters for env file values
 */
function escapeShellValue(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
}

/**
 * Write environment variable to CLAUDE_ENV_FILE
 */
function writeEnv(envFile, key, value) {
  if (envFile && value !== null && value !== undefined) {
    const escaped = escapeShellValue(String(value));
    fs.appendFileSync(envFile, `export ${key}="${escaped}"\n`);
  }
}

module.exports = {
  // Config
  LOCAL_CONFIG_PATH,
  GLOBAL_CONFIG_PATH,
  DEFAULT_CONFIG,
  deepMerge,
  loadConfig,
  loadConfigFromPath,

  // Project detection
  detectProjectType,
  detectPackageManager,
  detectFramework,
  getNodeVersion,
  getPythonVersion,
  getPhpVersion,
  getGoVersion,
  getGodotVersion,

  // Git utilities
  getGitBranch,
  getGitRemoteUrl,
  execSafe,

  // Plan resolution
  sanitizeSlug,
  extractSlugFromBranch,
  resolvePlanPath,
  getReportsPath,

  // Session state
  SESSION_STATE_MAX_AGE_MS,
  getSessionTempPath,
  resolveSessionId,
  readSessionState,
  writeSessionState,

  // Env utilities
  escapeShellValue,
  writeEnv,

  // Agent Teams
  isAgentTeamsEnabled
};
