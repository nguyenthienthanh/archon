#!/usr/bin/env node
/**
 * PreToolUse Hook - Auto git checkpoint before phase transitions
 *
 * Creates a checkpoint commit before entering Phase 2/3/4 so that
 * each phase can be rolled back independently.
 *
 * Trigger: Detects phase transition in workflow state
 * Exit: 0 (non-blocking — checkpoint is best-effort)
 *
 * @version 1.0.0
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { readSessionState } = require('./lib/af-config-utils.cjs');

function getWorkflowState() {
  try {
    const sessionId = process.ppid?.toString();
    return readSessionState(sessionId) || {};
  } catch { /* session state unavailable - non-blocking */ }
  return {};
}

function hasUncommittedChanges() {
  try {
    // --no-optional-locks: a read-only status must not grab index.lock, or it
    // collides with a commit running in another session on the same repo.
    const status = execSync('git --no-optional-locks status --porcelain', { encoding: 'utf8', timeout: 5000 });
    return status.trim().length > 0;
  } catch { /* git not available - non-blocking */ }
  return false;
}

/**
 * True when another git process holds the index lock. `--git-path` resolves the
 * right file for worktrees too.
 */
function isIndexLocked(cwd = process.cwd()) {
  try {
    const lockPath = execSync('git rev-parse --git-path index.lock', {
      cwd, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return fs.existsSync(path.resolve(cwd, lockPath));
  } catch { /* not a git repo - nothing to lock */ }
  return false;
}

/**
 * Atomically claim a checkpoint key so concurrent async hook instances (one per
 * Write/Edit) don't both run `git add` + `git commit`. Returns false if another
 * instance already claimed it.
 */
function claimCheckpoint(cacheKey) {
  try {
    const dir = path.dirname(getCacheFile());
    fs.mkdirSync(dir, { recursive: true });
    const claim = path.join(dir, `af-checkpoint-${cacheKey.replace(/[^\w.-]/g, '_')}.claim`);
    fs.closeSync(fs.openSync(claim, 'wx'));
    return true;
  } catch { return false; }
}

function createCheckpoint(phase) {
  try {
    if (!hasUncommittedChanges()) return;

    // Stage all changes
    execSync('git add -A', { timeout: 10000 });

    // Create checkpoint commit
    const message = `[archon-os] checkpoint: pre-phase-${phase}`;
    execSync(`git commit -m "${message}" --no-verify`, { timeout: 10000 });

    const result = {
      systemMessage: `📌 Checkpoint created: pre-phase-${phase}`
    };
    console.log(JSON.stringify(result));
  } catch (e) {
    // Checkpoint failed — non-blocking, don't stop the workflow
    if (process.env.AF_DEBUG === 'true') {
      console.error(`[af-debug] Checkpoint failed: ${e.message}`);
    }
  }
}

function getCacheFile() {
  // Project-scoped: phase checkpoints belong to a workflow which belongs to a project.

const { findProjectRoot } = require('./lib/hook-runtime.cjs');
  const cacheDir = path.join(findProjectRoot(), '.claude', 'cache');
  return path.join(cacheDir, 'af-phase-checkpoint-cache.json');
}

function readCache() {
  try {
    if (fs.existsSync(getCacheFile())) {
      return JSON.parse(fs.readFileSync(getCacheFile(), 'utf8'));
    }
  } catch { /* cache read failed - non-blocking */ }
  return {};
}

function writeCache(data) {
  try {
    const dir = path.dirname(getCacheFile());
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getCacheFile(), JSON.stringify(data));
  } catch { /* cache write failed - non-blocking */ }
}

function main() {
  // Only checkpoint if enabled
  if (process.env.AF_CHECKPOINT === 'false') {
    process.exit(0);
    return;
  }

  const state = getWorkflowState();
  const currentPhase = state.phase;

  // Only checkpoint before phases 2, 3, 4
  if (!currentPhase || !['2', '3', '4'].includes(String(currentPhase))) {
    process.exit(0);
    return;
  }

  // Prevent duplicate checkpoints for same phase
  const cache = readCache();
  const workflowId = state.workflowId || 'unknown';
  const cacheKey = `${workflowId}-phase-${currentPhase}`;

  // Another session is mid-commit: skip without claiming, so the next
  // Write/Edit retries instead of racing it for index.lock.
  if (cache[cacheKey] || isIndexLocked() || !claimCheckpoint(cacheKey)) {
    process.exit(0);
    return;
  }

  createCheckpoint(currentPhase);

  // Mark as checkpointed
  cache[cacheKey] = Date.now();
  writeCache(cache);

  process.exit(0);
}

// Run as a hook; stay importable for tests. FEAT-007 / issue #5.
//
// createCheckpoint and writeCache are deliberately NOT exported: createCheckpoint
// runs `git add -A` + `git commit` against the real working tree, and writeCache
// writes the real .claude/cache. Nothing that mutates the repo should be one
// require() away from a test runner.
if (require.main === module) {
  main();
} else {
  module.exports = { getWorkflowState, hasUncommittedChanges, getCacheFile, readCache, isIndexLocked };
}
