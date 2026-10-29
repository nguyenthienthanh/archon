/**
 * Aura Frog - Subprocess Limits
 *
 * Shared timeout / maxBuffer defaults for every child_process call made from a
 * hook, plus the one thing that was missing everywhere: making a limit breach
 * OBSERVABLE.
 *
 * Why this exists: hooks wrap their exec calls in a bare `catch { return null }`.
 * That is correct for "command not installed", but it also swallowed the two
 * failures that matter — a child that hangs forever (no `timeout`, so the hook
 * and, under the dispatcher, the whole hook chain wedges) and output larger than
 * Node's 1MB default `maxBuffer` (ENOBUFS → the caller silently sees "no data"
 * and acts on an empty result). Callers still fail open; they now print one
 * stderr line first so the degradation is visible.
 *
 * @version 1.0.0
 */

const MB = 1024 * 1024;

// Sized to the command, not one-size-fits-all:
//  QUICK   — local, no I/O beyond a stat (`which`, `git rev-parse`)
//  DEFAULT — local repo work (`git diff`, `git show`, version probes)
//  SLOW    — may touch the network or the full process table
const TIMEOUT_QUICK_MS = 2000;
const TIMEOUT_DEFAULT_MS = 5000;
const TIMEOUT_SLOW_MS = 10000;

// Node's default is 1MB. `ps -Ao ... command` on a machine with a few Chrome
// instances, or a `git diff` against a stale checkpoint sha, blows past that.
const MAX_BUFFER_DEFAULT = 2 * MB;
const MAX_BUFFER_LARGE = 16 * MB;

/**
 * Classify an exec error as a limit breach.
 * Returns 'timeout' | 'buffer' | null (null = ordinary failure, e.g. ENOENT).
 */
function classifyExecError(err) {
  if (!err) return null;
  // execSync/execFileSync surface a timeout kill as signal SIGTERM/SIGKILL
  // (plus code ETIMEDOUT on spawnSync); maxBuffer overflow is ENOBUFS.
  if (err.code === 'ENOBUFS') return 'buffer';
  if (err.code === 'ETIMEDOUT') return 'timeout';
  if (err.killed === true) return 'timeout';
  return null;
}

/**
 * Print one stderr line when a child hit a timeout or maxBuffer limit.
 * Returns the classification (or null when nothing was warned about).
 */
function warnExecLimit(label, err) {
  const kind = classifyExecError(err);
  if (!kind) return null;
  const detail = kind === 'timeout'
    ? 'timed out — result treated as empty'
    : 'output exceeded maxBuffer — result treated as empty';
  try {
    console.error(`⚠️ ${label}: ${detail}`);
  } catch { /* stderr closed - nothing else to do */ }
  return kind;
}

module.exports = {
  MB,
  TIMEOUT_QUICK_MS,
  TIMEOUT_DEFAULT_MS,
  TIMEOUT_SLOW_MS,
  MAX_BUFFER_DEFAULT,
  MAX_BUFFER_LARGE,
  classifyExecError,
  warnExecLimit
};
