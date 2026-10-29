/**
 * Aura Frog - Single-Flight Run Lock
 *
 * A tiny advisory lock for hooks that launch expensive child processes
 * (linters, test runners). Without it, N concurrent Write/Edit tool calls each
 * fire their own PostToolUse hook and every one of them spawns the full linter
 * set — the machine ends up running eslint N times over the same tree.
 *
 * Semantics: whoever wins the exclusive create owns the lock; everyone else
 * backs off immediately (returns null) rather than queueing. Skipping is safe
 * here — the winner is already doing the same work.
 *
 * Staleness: a crashed owner would otherwise wedge the feature forever, so a
 * lock is reclaimed when its recorded PID is gone OR the lock is older than
 * `staleMs`.
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_STALE_MS = 2 * 60 * 1000; // 2 min — longer than any hook should live

/**
 * Is a pid still running? Signal 0 probes without delivering.
 * EPERM means the process exists but is owned by someone else → still alive.
 */
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

function readLock(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Should an existing lock file be reclaimed?
 * Unreadable/corrupt → yes (an owner that never wrote valid JSON is not coming
 * back). Dead PID → yes. Older than staleMs → yes.
 */
function isStaleLock(lock, { staleMs = DEFAULT_STALE_MS, now = Date.now() } = {}) {
  if (!lock || typeof lock !== 'object') return true;
  if (typeof lock.ts !== 'number' || now - lock.ts > staleMs) return true;
  return !isPidAlive(lock.pid);
}

/**
 * Try to take the lock. Returns a release function on success, null when
 * another live hook already holds it.
 */
function acquireRunLock(lockPath, { staleMs = DEFAULT_STALE_MS } = {}) {
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  } catch { /* fs mkdir - fail open below */ }

  const payload = JSON.stringify({ pid: process.pid, ts: Date.now() });

  const tryCreate = () => {
    try {
      // wx: exclusive create — the atomic primitive the whole lock rests on.
      fs.writeFileSync(lockPath, payload, { flag: 'wx' });
      return true;
    } catch {
      return false;
    }
  };

  if (!tryCreate()) {
    if (!isStaleLock(readLock(lockPath), { staleMs })) return null;
    // Reclaim: unlink then re-race. If another process reclaims first we lose
    // the second create and back off, which is the correct outcome.
    try { fs.unlinkSync(lockPath); } catch { /* someone else got there */ }
    if (!tryCreate()) return null;
  }

  let released = false;
  return function release() {
    if (released) return;
    released = true;
    // Only remove the file if we still own it — a lock we were slow enough to
    // have reclaimed out from under us belongs to someone else now.
    const current = readLock(lockPath);
    if (current && current.pid !== process.pid) return;
    try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
  };
}

module.exports = {
  DEFAULT_STALE_MS,
  isPidAlive,
  isStaleLock,
  acquireRunLock
};
