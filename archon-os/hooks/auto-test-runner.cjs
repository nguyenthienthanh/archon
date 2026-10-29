#!/usr/bin/env node
/**
 * auto-test-runner.cjs - Auto-run tests after implementation changes
 *
 * PostToolUse hook on Write|Edit. Runs async.
 * Only activates during TDD phases (2-Test RED, 3-Build GREEN, 4-Refactor).
 * Detects test runner from project config and runs ONLY the tests related to
 * the edited file.
 *
 * RESOURCE DISCIPLINE (this hook fires on every Write/Edit — it must never be
 * the reason a machine runs out of RAM):
 *
 *   1. Local binaries only. `npx <runner>` resolves an UNPINNED latest release
 *      from the npx cache when the dep is not installed — a different major
 *      than the project pins, downloaded per machine. If the binary is not in
 *      node_modules/.bin, this hook does nothing.
 *   2. No shell, and the runner is the direct child. execSync spawns
 *      `sh -c "npx jest"`, so its timeout SIGTERMs the *shell*: jest and its
 *      workers are grandchildren, get orphaned, and survive as zombies (387 of
 *      them were reaped by hand once). spawnSync with an argv array makes the
 *      runner the direct child, so the timeout kill lands on it.
 *   3. Zero worker processes. Jest defaults to cpu-1 workers, each a full node
 *      process (~200MB) — 9 on a 10-core box, 15 on a 16-core one, which is
 *      exactly why RAM blew up on some machines and not others. --runInBand /
 *      --no-file-parallelism run in the single existing process instead.
 *   4. Related tests only, not the whole suite.
 *   5. One run at a time. A burst of edits used to stack full suites; a lock
 *      file with a stale-PID check keeps it to one.
 *
 * Exit codes:
 * - 0: Always (non-blocking, async)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readSessionState } = require('./lib/af-config-utils.cjs');
const { readHookInputCompat, findProjectRoot } = require('./lib/hook-runtime.cjs');
const { acquireRunLock: acquireSharedLock } = require('./lib/af-run-lock.cjs');

// Resolve the edited file from the PostToolUse stdin payload (tool_input),
// falling back to the legacy CLAUDE_FILE_PATHS env var. The old code read only
// the env var — which the hook API never sets — so auto-test-running never
// fired on any edit.
function resolveFilePath(input) {
  const ti = (input && input.tool_input) || {};
  return ti.file_path || ti.path || process.env.CLAUDE_FILE_PATHS || '';
}

// TDD phases where auto-testing is relevant
const TDD_PHASES = ['2', '3', '4'];

// Max test execution time. Related-tests-only runs finish in seconds; this is
// the backstop, and the kill lands on the runner itself (see docblock).
const TEST_TIMEOUT = 30000;

/**
 * Resolve a JS test runner from node_modules/.bin. Returns null when the dep
 * is not installed locally — deliberately NOT falling back to npx, which would
 * download an unpinned major and leave a resident `npm exec` wrapper.
 */
function localBin(name) {
  const bin = path.join(process.cwd(), 'node_modules', '.bin', name);
  try {
    fs.accessSync(bin, fs.constants.X_OK);
    return bin;
  } catch {
    return null;
  }
}

/**
 * Detect test runner from project files.
 *
 * Returns { cmd, args, name } where args is an argv array — never a shell
 * string, so the runner is the direct child and `filePath` cannot be
 * interpreted as shell syntax.
 */
function detectTestRunner(filePath) {
  // Node.js projects
  if (fs.existsSync('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      const scripts = pkg.scripts || {};
      const devDeps = { ...(pkg.devDependencies || {}), ...(pkg.dependencies || {}) };

      if (devDeps.vitest || scripts.test?.includes('vitest')) {
        const bin = localBin('vitest');
        // --no-file-parallelism keeps it in one process (no worker pool).
        return bin && {
          cmd: bin,
          args: ['related', filePath, '--run', '--no-file-parallelism', '--passWithNoTests', '--silent'],
          name: 'vitest',
        };
      }
      if (devDeps.jest || scripts.test?.includes('jest')) {
        const bin = localBin('jest');
        // --runInBand: no worker processes at all. --findRelatedTests scopes
        // the run to the tests covering the edited file.
        return bin && {
          cmd: bin,
          args: ['--runInBand', '--silent', '--passWithNoTests', '--findRelatedTests', filePath],
          name: 'jest',
        };
      }
    } catch { /* malformed data - skip silently, fall through to other detectors */ }
    // No `npm test` fallback: it runs the whole suite with the project's own
    // worker settings, which is the fan-out this hook exists to avoid.
  }

  // Python projects — pytest is single-process unless xdist is asked for.
  if (fs.existsSync('pyproject.toml') || fs.existsSync('setup.py')) {
    return { cmd: 'python3', args: ['-m', 'pytest', '-x', '-q', '-p', 'no:xdist', filePath], name: 'pytest' };
  }

  // Go — package-scoped, not ./...
  if (fs.existsSync('go.mod')) {
    return { cmd: 'go', args: ['test', '-count=1', './' + path.dirname(filePath)], name: 'go test' };
  }

  // Rust — cargo manages its own jobs; bound them.
  if (fs.existsSync('Cargo.toml')) return { cmd: 'cargo', args: ['test', '--jobs', '2'], name: 'cargo test' };

  // PHP
  if (fs.existsSync('phpunit.xml') || fs.existsSync('phpunit.xml.dist')) {
    return { cmd: 'php', args: ['vendor/bin/phpunit', filePath], name: 'phpunit' };
  }
  if (fs.existsSync('artisan')) return { cmd: 'php', args: ['artisan', 'test'], name: 'artisan test' };

  return null;
}

/**
 * Single-flight guard. A burst of Write/Edit calls used to stack one full test
 * run per edit, each with its own worker fan-out. Returns a release function,
 * or null when a live run already holds the lock.
 *
 * Shares lib/af-run-lock.cjs with lint-autofix — same hazard (a PostToolUse
 * hook launching an expensive child once per tool call), so same primitive.
 * Stale window is twice the test budget: a run still inside its own timeout
 * must not have its lock stolen.
 */
function acquireRunLock() {
  const lockFile = path.join(findProjectRoot(), '.claude', 'cache', '.auto-test-runner.lock');
  return acquireSharedLock(lockFile, { staleMs: TEST_TIMEOUT * 2 });
}

/**
 * Check if the changed file is test-relevant
 */
function isTestRelevant(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const codeExts = new Set(['.js', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.php', '.rb', '.vue', '.svelte']);
  return codeExts.has(ext);
}

function main() {
 try {
  let input = {};
  try { input = readHookInputCompat(); } catch { /* fall back to env below */ }
  const filePath = resolveFilePath(input);
  if (!filePath || !isTestRelevant(filePath)) process.exit(0);

  // Check if we're in a TDD phase
  const sessionId = process.ppid?.toString();
  const state = readSessionState(sessionId);
  const currentPhase = state?.phase || process.env.AF_CURRENT_PHASE;

  // In TDD phase: always run. Outside workflow: only if editing a test file
  const inTddPhase = currentPhase && TDD_PHASES.includes(currentPhase);
  const isTestFile = /\.(test|spec|_test)\.[^.]+$/.test(filePath) || /\/__tests__\//.test(filePath);
  if (!inTddPhase && !isTestFile) {
    process.exit(0);
  }

  const runner = detectTestRunner(filePath);
  if (!runner) process.exit(0);

  const release = acquireRunLock();
  if (!release) process.exit(0); // a run is already in flight

  try {
    // No shell: the runner is the direct child, so the timeout kill reaches it
    // instead of a shell whose children outlive it. SIGKILL because the failure
    // mode being guarded against is a deadlocked runner ignoring SIGTERM.
    const result = spawnSync(runner.cmd, runner.args, {
      timeout: TEST_TIMEOUT,
      killSignal: 'SIGKILL',
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const output = ((result.stdout || '') + (result.stderr || '')).trim();
    const summary = output.split('\n').slice(-3).join(' | ');

    if (result.error && result.error.code === 'ETIMEDOUT') {
      console.error(`⏱ Auto-test (${runner.name}): killed after ${TEST_TIMEOUT / 1000}s`);
    } else if (result.status === 0) {
      console.error(`✅ Auto-test (${runner.name}): ${summary.substring(0, 120)}`);
    } else {
      console.error(`❌ Auto-test (${runner.name}): Tests failing`);
      console.error(`   ${summary.substring(0, 150)}`);
    }
  } finally {
    release();
  }

  process.exit(0);

 } catch (error) {
  process.exit(0); // Fail open
 }
}

if (require.main === module) {
  main();
} else {
  module.exports = { isTestRelevant, detectTestRunner, resolveFilePath, localBin, acquireRunLock };
}
