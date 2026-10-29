/**
 * safe-stdin.cjs — Non-hanging stdin reader for hook scripts.
 *
 * THE BUG THIS FIXES (production-grade):
 * ----------------------------------------
 * `fs.readFileSync(0, 'utf-8')` blocks INDEFINITELY when stdin (fd 0) is a TTY
 * — readFileSync has no timeout and won't throw on a TTY; it just waits for
 * EOF forever. A try/catch around it does NOT save you because no error is
 * thrown — the syscall is blocked.
 *
 * Most archon-os hooks fire on every UserPromptSubmit or PreToolUse. If
 * Claude Code (or a wrapper / IDE / interactive debug shell) ever invokes
 * the hook with stdin attached to a TTY instead of a piped JSON payload,
 * the user's prompt is wedged indefinitely. The hook never exits, so the
 * pre-prompt phase never completes.
 *
 * Symptoms seen in this repo before the fix:
 *   - Ubuntu CI Node 20/22 jobs hang ~10+ min in `Run tests with coverage
 *     gate` while test (18) finishes in 22s. Workaround: drop 20/22 from
 *     the matrix (commit 027c2e0). Symptom, not cause.
 *   - jest `readPrompt()` direct tests hang the worker because jest's fd 0
 *     isn't necessarily an EOF-able pipe.
 *   - spawnSync timeouts (commit 8a3fa1c) bounded one symptom but didn't
 *     fix the underlying hook.
 *
 * THE FIX:
 * --------
 * Check `fs.fstatSync(0)` first. Only read fd 0 if it's a FIFO (pipe), a
 * regular file (input redirect), or a socket outside a jest worker. Sockets
 * are on the list because Node's own child_process 'pipe' stdio is a unix
 * socketpair on Unix (libuv), i.e. the normal path when a Node parent —
 * Claude Code included — spawns a hook with piped stdin; EOF arrives when
 * the parent closes its end. The exception: inside a jest child-process
 * worker (JEST_WORKER_ID set AND the in-process `expect` global present)
 * fd 0 is a socket the coordinator NEVER closes, so an in-process read
 * blocks the worker forever — that was the root cause of the
 * full-suite/CI hang. Skip read entirely for character
 * devices (TTYs) and unknown types. Returns '' in the unsafe case; callers
 * fall through to their own fallback (typically
 * `process.env.CLAUDE_USER_PROMPT`).
 *
 * Usage:
 *   const { readStdinSafely, parseStdinJson } = require('./lib/safe-stdin');
 *   const raw = readStdinSafely();           // never hangs; '' on TTY/unknown
 *   const data = parseStdinJson(raw);        // returns parsed JSON or null
 */

'use strict';

const fs = require('node:fs');

// Mirrors legacy AF_* / AURA_FROG_* variables onto their ARCHON_* names before any
// module reads process.env. Required here because nearly every hook reaches
// safe-stdin, directly or through hook-runtime, making it the one chokepoint.
require('./env-compat.cjs');

/**
 * Read stdin (fd 0) only when it's safe to do so without blocking.
 * Returns the raw stdin contents as a trimmed string, or '' if reading
 * would block / fail / produce nothing.
 *
 * @returns {string}
 */
function readStdinSafely() {
  // fstatSync is non-blocking — it just queries fd metadata. If fd 0 isn't
  // open or is unknown, treat as unsafe and skip.
  let canRead = false;
  try {
    const stats = fs.fstatSync(0);
    // FIFO = piped from parent (shell pipes, input redirection via shell).
    // File = stdin is redirected from a file (test fixtures, debugging).
    // Socket = Node-parent spawn pipes (libuv 'pipe' stdio is a unix
    //   socketpair on Unix — the production path when Claude Code spawns a
    //   hook). Safe ONLY outside a jest worker: a jest child-process
    //   worker's fd 0 is a socket the coordinator never closes, so reading
    //   it blocks forever (the historical Node 20/22 CI hang).
    // Anything else (TTY/character device, block device, unknown) → skip.
    //
    // The jest guard needs BOTH signals: JEST_WORKER_ID alone is inherited
    // by subprocesses the tests spawn (whose socket stdin IS closed and must
    // stay readable), while the injected `expect` global only exists for
    // code loaded in-process by the jest runtime — exactly the calls that
    // would block the worker. (`expect`, not `jest`: the jest object is
    // module-scoped, it is NOT on the environment's globalThis — verified
    // empirically in a jest 29 child-process worker.)
    const inJestRuntime = !!process.env.JEST_WORKER_ID &&
                          typeof globalThis.expect === 'function';
    canRead = stats.isFIFO() || stats.isFile() ||
              (stats.isSocket() && !inJestRuntime);
  } catch {
    // fstatSync failed (fd not open?) — be conservative.
    canRead = false;
  }

  if (!canRead) return '';

  try {
    return fs.readFileSync(0, 'utf-8').trim();
  } catch {
    // Even with canRead===true, the read can fail (EOF on empty pipe, etc).
    return '';
  }
}

/**
 * Parse a string as JSON; return null on any failure.
 *
 * @param {string} raw
 * @returns {object|null}
 */
function parseStdinJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Convenience: read stdin safely and try to extract a `prompt` field from a
 * JSON payload. Matches the legacy contract of the per-hook `readPrompt()`
 * implementations being consolidated here.
 *
 * Fallback order:
 *   1. JSON.prompt
 *   2. JSON.user_prompt
 *   3. raw stdin (if not JSON)
 *   4. process.env.CLAUDE_USER_PROMPT
 *   5. ''
 *
 * @returns {string}
 */
function readPromptFromStdin() {
  const raw = readStdinSafely();
  if (raw) {
    const data = parseStdinJson(raw);
    if (data && typeof data === 'object') {
      return data.prompt || data.user_prompt || '';
    }
    return raw;
  }
  return process.env.CLAUDE_USER_PROMPT || '';
}

/**
 * Install a watchdog that force-exits the process after `ms` milliseconds
 * with the given exit code (default 0). Belt-and-suspenders for hooks that
 * should never block the user — if any blocking syscall happens despite
 * the safe-stdin guard, the watchdog still lets the user prompt through.
 *
 * `unref()` so the timer doesn't keep the process alive after normal work
 * completes.
 *
 * @param {number} ms
 * @param {number} [code=0]
 */
// NDJSON record for the watchdog trip (keeps the v3.8 "stderr is always NDJSON"
// invariant; the old plain-text line broke it).
function watchdogRecord(ms) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    scope: 'safe-stdin.watchdog',
    level: 'warn',
    msg: 'watchdog_tripped',
    meta: { ms },
  }) + '\n';
}

function installWatchdog(ms, code = 0) {
  const t = setTimeout(() => {
    // fs.writeSync(2, …) is unbuffered: a buffered process.stderr.write could
    // interleave bytes with another emitter mid-record and corrupt an NDJSON
    // line before the force-exit.
    try { fs.writeSync(2, watchdogRecord(ms)); } catch { /* swallow */ }
    process.exit(code);
  }, ms);
  if (typeof t.unref === 'function') t.unref();
  return t;
}

module.exports = {
  readStdinSafely,
  parseStdinJson,
  readPromptFromStdin,
  installWatchdog,
  watchdogRecord,
};
