#!/usr/bin/env node
/**
 * Aura Frog - Lint Auto-Fix Hook
 *
 * Fires: PostToolUse (after Write|Edit)
 * Purpose: Automatically run linters/formatters after file changes
 *
 * Supported:
 * - ESLint (.js, .jsx, .ts, .tsx, .vue)
 * - Prettier (all supported files)
 * - PHP CS Fixer (.php)
 * - Black/Ruff (.py)
 * - Go fmt (.go)
 * - Rubocop (.rb)
 * - rustfmt (.rs)
 *
 * Exit Codes:
 *   0 - Success (non-blocking)
 *
 * @version 1.0.0
 */

const { execSync, spawnSync } = require('child_process');
const { readStdinSafely } = require('./lib/safe-stdin.cjs');
const { findProjectRoot } = require('./lib/hook-runtime.cjs');
const { acquireRunLock } = require('./lib/af-run-lock.cjs');
const { TIMEOUT_QUICK_MS, warnExecLimit } = require('./lib/af-exec.cjs');
const { filterChildEnv } = require('./lib/af-child-env.cjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// This hook fires on EVERY Write|Edit. A .ts file maps to two linters, each of
// which used to get 30s — up to a minute of work per keystroke-sized edit, with
// nothing stopping N concurrent Writes from stacking N eslint processes.
// Three bounds now apply, in order of how much work they save:
//   1. debounce  — content unchanged since the last lint → do nothing at all
//   2. run lock  — another hook is already linting → back off
//   3. availability cache — don't re-probe `which`/package.json per linter
const LINTER_TIMEOUT_MS = 10000;

const CACHE_DIR = () => path.join(findProjectRoot(), '.claude', 'cache');
const AVAILABILITY_CACHE = () => path.join(CACHE_DIR(), 'lint-availability.json');
const DEBOUNCE_CACHE = () => path.join(CACHE_DIR(), 'lint-debounce.json');
const RUN_LOCK = () => path.join(CACHE_DIR(), 'lint-autofix.lock');

// Bound the debounce map so it cannot grow one entry per file touched, forever.
const DEBOUNCE_MAX_ENTRIES = 200;

// File extension to linter mapping
const LINTER_MAP = {
  // JavaScript/TypeScript
  '.js': ['eslint', 'prettier'],
  '.jsx': ['eslint', 'prettier'],
  '.ts': ['eslint', 'prettier'],
  '.tsx': ['eslint', 'prettier'],
  '.mjs': ['eslint', 'prettier'],
  '.cjs': ['eslint', 'prettier'],
  '.vue': ['eslint', 'prettier'],
  '.svelte': ['eslint', 'prettier'],

  // CSS/Styling
  '.css': ['prettier', 'stylelint'],
  '.scss': ['prettier', 'stylelint'],
  '.less': ['prettier', 'stylelint'],

  // Web
  '.html': ['prettier'],
  '.json': ['prettier'],
  '.md': ['prettier'],
  '.yaml': ['prettier'],
  '.yml': ['prettier'],

  // PHP
  '.php': ['php-cs-fixer', 'pint'],

  // Python
  '.py': ['ruff', 'black'],

  // Go
  '.go': ['gofmt', 'goimports'],

  // Ruby
  '.rb': ['rubocop'],

  // Rust
  '.rs': ['rustfmt'],

  // Dart/Flutter
  '.dart': ['dart-format'],
};

// Linter commands with auto-fix flags
const LINTER_COMMANDS = {
  // JS/TS
  'eslint': {
    check: 'npx eslint --max-warnings 0',
    fix: 'npx eslint --fix',
    configFiles: ['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs'],
  },
  'prettier': {
    check: 'npx prettier --check',
    fix: 'npx prettier --write',
    configFiles: ['.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js'],
  },
  'stylelint': {
    check: 'npx stylelint',
    fix: 'npx stylelint --fix',
    configFiles: ['.stylelintrc', '.stylelintrc.js', '.stylelintrc.json', 'stylelint.config.js'],
  },

  // PHP
  'php-cs-fixer': {
    check: 'vendor/bin/php-cs-fixer fix --dry-run --diff',
    fix: 'vendor/bin/php-cs-fixer fix',
    configFiles: ['.php-cs-fixer.php', '.php-cs-fixer.dist.php', '.php_cs'],
  },
  'pint': {
    check: 'vendor/bin/pint --test',
    fix: 'vendor/bin/pint',
    configFiles: ['pint.json'],
  },

  // Python
  'ruff': {
    check: 'ruff check',
    fix: 'ruff check --fix',
    configFiles: ['ruff.toml', 'pyproject.toml'],
  },
  'black': {
    check: 'black --check',
    fix: 'black',
    configFiles: ['pyproject.toml'],
  },

  // Go
  'gofmt': {
    check: 'gofmt -l',
    fix: 'gofmt -w',
    configFiles: [],
  },
  'goimports': {
    check: 'goimports -l',
    fix: 'goimports -w',
    configFiles: [],
  },

  // Ruby
  'rubocop': {
    check: 'rubocop',
    fix: 'rubocop -A',
    configFiles: ['.rubocop.yml'],
  },

  // Rust
  'rustfmt': {
    check: 'rustfmt --check',
    fix: 'rustfmt',
    configFiles: ['rustfmt.toml', '.rustfmt.toml'],
  },

  // Dart
  'dart-format': {
    check: 'dart format --set-exit-if-changed',
    fix: 'dart format',
    configFiles: [],
  },
};

// ============================================
// AVAILABILITY CACHE
// ============================================

// Per-process memo — a single Write probes 2+ linters and previously re-read and
// re-parsed package.json for each one.
const availabilityMemo = new Map();

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch { return null; }
}

/**
 * Fingerprint of everything `isLinterAvailable` looks at: the manifests it
 * parses plus every config file it probes for. Same idiom as
 * af-project-cache.calculateKeyFilesHash — mtime+size, not content.
 */
function computeProbeHash(cwd = process.cwd()) {
  const watched = new Set(['package.json', 'composer.json']);
  for (const cfg of Object.values(LINTER_COMMANDS)) {
    for (const f of cfg.configFiles) watched.add(f);
  }
  const parts = [];
  for (const file of [...watched].sort()) {
    try {
      const st = fs.statSync(path.join(cwd, file));
      parts.push(`${file}:${st.mtimeMs}:${st.size}`);
    } catch { /* absent — absence itself is part of the fingerprint */ }
  }
  return crypto.createHash('md5').update(parts.join('|')).digest('hex').substring(0, 16);
}

function loadAvailabilityCache(cwd = process.cwd()) {
  const cache = readJsonFile(AVAILABILITY_CACHE());
  if (!cache || cache.cwd !== cwd) return null;
  if (cache.probeHash !== computeProbeHash(cwd)) return null;
  return cache.linters && typeof cache.linters === 'object' ? cache.linters : null;
}

function saveAvailabilityCache(linters, cwd = process.cwd()) {
  try {
    fs.mkdirSync(CACHE_DIR(), { recursive: true });
    fs.writeFileSync(AVAILABILITY_CACHE(), JSON.stringify({
      cwd,
      probeHash: computeProbeHash(cwd),
      linters
    }, null, 2));
  } catch { /* fs/cache write - non-blocking, probe just re-runs next time */ }
}

/** Drop both memo layers. Test seam. */
function resetAvailabilityCache() {
  availabilityMemo.clear();
  try { fs.unlinkSync(AVAILABILITY_CACHE()); } catch { /* not there */ }
}

/**
 * Check if a linter is available in the project.
 *
 * Cached at two levels (process memo → on-disk, keyed by cwd + a mtime/size
 * fingerprint of every manifest and config file the probe consults). The
 * uncached path below is the expensive one: JSON parse per call, and for system
 * tools a `which` subprocess run up to 7x per Write.
 */
function isLinterAvailable(linter) {
  const cwd = process.cwd();
  const memoKey = `${cwd}::${linter}`;
  if (availabilityMemo.has(memoKey)) return availabilityMemo.get(memoKey);

  const disk = loadAvailabilityCache(cwd);
  if (disk && Object.prototype.hasOwnProperty.call(disk, linter)) {
    availabilityMemo.set(memoKey, disk[linter]);
    return disk[linter];
  }

  const result = probeLinterAvailable(linter);
  availabilityMemo.set(memoKey, result);
  saveAvailabilityCache({ ...(disk || {}), [linter]: result }, cwd);
  return result;
}

/**
 * Uncached availability probe (the original implementation).
 */
function probeLinterAvailable(linter) {
  const config = LINTER_COMMANDS[linter];
  if (!config) return false;

  // Check for config files
  if (config.configFiles.length > 0) {
    const hasConfig = config.configFiles.some(file => {
      return fs.existsSync(path.join(process.cwd(), file));
    });
    if (hasConfig) return true;
  }

  // Check package.json for JS tools
  if (['eslint', 'prettier', 'stylelint'].includes(linter)) {
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        return linter in deps;
      }
    } catch { /* malformed data - skip silently, linter detection is best-effort */ }
  }

  // Check composer.json for PHP tools
  if (['php-cs-fixer', 'pint'].includes(linter)) {
    try {
      const composerPath = path.join(process.cwd(), 'composer.json');
      if (fs.existsSync(composerPath)) {
        const composer = JSON.parse(fs.readFileSync(composerPath, 'utf-8'));
        const deps = { ...composer.require, ...composer['require-dev'] };
        const pkgName = linter === 'pint' ? 'laravel/pint' : 'friendsofphp/php-cs-fixer';
        return pkgName in deps;
      }
    } catch { /* malformed data - skip silently, linter detection is best-effort */ }
  }

  // For system tools, check if command exists
  if (['gofmt', 'goimports', 'rubocop', 'rustfmt', 'dart-format', 'ruff', 'black'].includes(linter)) {
    try {
      execSync(`which ${linter.replace('-format', ' format').split(' ')[0]}`, {
        stdio: 'ignore',
        timeout: TIMEOUT_QUICK_MS,
        killSignal: 'SIGKILL'
      });
      return true;
    } catch (e) {
      warnExecLimit(`which ${linter}`, e);
      return false;
    }
  }

  return false;
}

/**
 * Resolve command to local binary if available (e.g., npx eslint → ./node_modules/.bin/eslint)
 */
function resolveCommand(fixCmd) {
  const parts = fixCmd.split(' ');
  // If command starts with 'npx ', try local binary first
  if (parts[0] === 'npx') {
    const binName = parts[1];
    const localBin = path.join(process.cwd(), 'node_modules', '.bin', binName);
    if (fs.existsSync(localBin)) {
      return [localBin, ...parts.slice(2)];
    }
  }
  // If command starts with 'vendor/bin/', check it exists
  if (parts[0].startsWith('vendor/bin/')) {
    const vendorBin = path.join(process.cwd(), parts[0]);
    if (fs.existsSync(vendorBin)) {
      return [vendorBin, ...parts.slice(1)];
    }
  }
  return parts;
}

/**
 * Run linter with auto-fix
 */
function runLinter(linter, filePath) {
  const config = LINTER_COMMANDS[linter];
  if (!config) return { success: true, skipped: true };

  try {
    const resolved = resolveCommand(config.fix);
    const cmd = resolved[0];
    const args = [...resolved.slice(1), filePath];

    // `cmd` here is the working repo's own node_modules/.bin or vendor/bin
    // binary, run automatically on every Write and Edit — third-party code from
    // whatever repository happens to be checked out. It has no use for the
    // credentials .envrc exported into this process, so don't hand them over.
    const extra = {};
    if (linter === 'eslint') {
      const legacyConfigs = ['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml'];
      const hasLegacy = legacyConfigs.some(f => fs.existsSync(path.join(process.cwd(), f)));
      if (hasLegacy) {
        // Detect legacy .eslintrc.* config and set env var for eslint 9+
        extra.ESLINT_USE_FLAT_CONFIG = 'false';
      }
    }
    const env = filterChildEnv(process.env, extra);

    // Snapshot file mtime before running fixer
    const mtimeBefore = fs.statSync(filePath).mtimeMs;

    const result = spawnSync(cmd, args, {
      cwd: process.cwd(),
      // 30s was the old value: two linters on one .ts file meant a Write could
      // block for a minute. A single-file fix that needs >10s is pathological.
      timeout: LINTER_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      encoding: 'utf-8',
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const mtimeAfter = fs.statSync(filePath).mtimeMs;
    const fileChanged = mtimeAfter !== mtimeBefore;

    if (result.status === 0) {
      return { success: true, fixed: fileChanged, linter };
    } else {
      return {
        success: false,
        linter,
        error: result.stderr || result.stdout,
      };
    }
  } catch (error) {
    return { success: false, linter, error: error.message };
  }
}

/**
 * Get available linters for a file
 */
function getAvailableLinters(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const potentialLinters = LINTER_MAP[ext] || [];

  return potentialLinters.filter(linter => isLinterAvailable(linter));
}

// ============================================
// DEBOUNCE
// ============================================

function hashFileContent(filePath) {
  try {
    return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
  } catch { return null; }
}

function loadDebounceCache() {
  const data = readJsonFile(DEBOUNCE_CACHE());
  return data && typeof data.files === 'object' && data.files ? data.files : {};
}

/**
 * Cap the debounce map. Most-RECENT entries win: an old file's hash is worth
 * nothing (it will be re-linted once, harmlessly) while the files being edited
 * right now are exactly the ones a burst of Writes hammers.
 */
function trimDebounceEntries(files, max = DEBOUNCE_MAX_ENTRIES) {
  const keys = Object.keys(files);
  if (keys.length <= max) return files;
  const kept = keys
    .sort((a, b) => (files[b]?.ts || 0) - (files[a]?.ts || 0))
    .slice(0, max);
  const out = {};
  for (const k of kept) out[k] = files[k];
  return out;
}

function saveDebounceCache(files) {
  try {
    fs.mkdirSync(CACHE_DIR(), { recursive: true });
    fs.writeFileSync(DEBOUNCE_CACHE(), JSON.stringify({ files: trimDebounceEntries(files) }, null, 2));
  } catch { /* fs/cache write - non-blocking, worst case is one redundant lint */ }
}

/**
 * True when the file's content is byte-identical to what was linted last time.
 * Re-running a formatter over its own output is pure waste — and a Write that
 * rewrites a file with unchanged content is common (agents re-emit whole files).
 */
function isDebounced(filePath, files = loadDebounceCache()) {
  const hash = hashFileContent(filePath);
  if (!hash) return false;
  return files[filePath]?.hash === hash;
}

/** Record the POST-lint content, since the fixer may have rewritten the file. */
function recordLinted(filePath, files = loadDebounceCache()) {
  const hash = hashFileContent(filePath);
  if (!hash) return files;
  files[filePath] = { hash, ts: Date.now() };
  saveDebounceCache(files);
  return files;
}

/**
 * Read stdin as a string (Claude Code sends JSON via stdin for PostToolUse hooks)
 */
function readStdin() {
  try {
    return readStdinSafely();
  } catch {
    return '';
  }
}

/**
 * Extract file path from Claude Code PostToolUse stdin JSON
 * Shape: { tool_input: { file_path }, tool_response: { filePath } }
 */
function extractFilePath(stdinData) {
  try {
    const data = JSON.parse(stdinData);
    return (data.tool_input && data.tool_input.file_path)
      || (data.tool_response && data.tool_response.filePath)
      || null;
  } catch {
    return null;
  }
}

/**
 * Main hook execution
 */
async function main() {
  // Check if auto-fix is enabled (default: true)
  if (process.env.AF_LINT_AUTOFIX === 'false') {
    process.exit(0);
  }

  try {
    const stdin = readStdin();
    const filePath = extractFilePath(stdin);

    if (!filePath) {
      process.exit(0);
    }

    // Skip non-existent files
    if (!fs.existsSync(filePath)) {
      process.exit(0);
    }

    // Skip certain directories
    const skipDirs = ['node_modules', 'vendor', 'dist', 'build', '.git', '__pycache__'];
    if (skipDirs.some(dir => filePath.includes(`/${dir}/`) || filePath.includes(`\\${dir}\\`))) {
      process.exit(0);
    }

    // Debounce: unchanged content since the last lint → nothing to do.
    if (isDebounced(filePath)) {
      process.exit(0);
    }

    // Get available linters
    const linters = getAvailableLinters(filePath);

    if (linters.length === 0) {
      process.exit(0);
    }

    // Single-flight: a burst of concurrent Writes must not stack linter
    // processes. Losers back off — the winner is doing the same work.
    const release = acquireRunLock(RUN_LOCK());
    if (!release) {
      process.exit(0);
    }

    // Run linters
    const results = [];
    try {
      for (const linter of linters) {
        const result = runLinter(linter, filePath);
        if (!result.skipped) {
          results.push(result);
        }
      }
      recordLinted(filePath);
    } finally {
      release();
    }

    // Report results
    const fixed = results.filter(r => r.fixed);
    const failed = results.filter(r => !r.success && !r.fixed);

    if (fixed.length > 0) {
      const linterNames = fixed.map(r => r.linter).join(', ');
      console.log(`🔧 Auto-fixed: ${linterNames}`);
    }

    if (failed.length > 0) {
      for (const f of failed) {
        console.error(`⚠️ ${f.linter} issues: ${(f.error || '').substring(0, 100)}`);
      }
    }

    process.exit(0);
  } catch (error) {
    // Non-blocking
    process.exit(0);
  }
}

module.exports = {
  getAvailableLinters,
  isLinterAvailable,
  probeLinterAvailable,
  resetAvailabilityCache,
  computeProbeHash,
  runLinter,
  extractFilePath,
  isDebounced,
  recordLinted,
  trimDebounceEntries,
  LINTER_TIMEOUT_MS,
  DEBOUNCE_MAX_ENTRIES,
};

if (require.main === module) {
  main();
}
