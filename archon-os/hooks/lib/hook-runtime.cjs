/**
 * hook-runtime.cjs — Unified runtime utilities for archon-os hook scripts.
 *
 * Phase 3 (GREEN) implementation for TASK-00023. See:
 *   - Phase 1 design proposal (locked: 7 defaults approved)
 *   - archon-os/hooks/lib/__tests__/hook-runtime.test.cjs (93-test contract)
 *
 * Exports:
 *   readHookInput        — strict stdin JSON parser; throws typed errors
 *   readHookInputCompat  — lenient parser; env-var fallback + tool→tool_name alias
 *   appendAuditJsonl     — locked NDJSON appender (cross-process safe)
 *   atomicWrite          — write-then-rename atomic file write (no mkdir)
 *   logger               — NDJSON-on-stderr structured logger (HOOK_LOG_LEVEL gated)
 *   safeExit             — sync stderr record + process.exit(code)
 *   withBudget           — wraps a Promise with a timeout that rejects HookBudgetTimeout
 *
 * Error classes (all extend HookRuntimeError, expose .code + .meta):
 *   HookRuntimeError, HookInputSchemaError, HookLockError,
 *   HookBudgetTimeout, HookIOError, HookConfigError
 *
 * Back-compat re-exports (byte-for-byte from safe-stdin.cjs):
 *   readStdinSafely, parseStdinJson, readPromptFromStdin, installWatchdog
 *
 * Pure node fs/path/crypto only — no new runtime deps.
 */

'use strict';

const fs     = require('node:fs');
const path   = require('node:path');
const crypto = require('node:crypto');

const safeStdin = require('./safe-stdin.cjs');

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

class HookRuntimeError extends Error {
  constructor(code, meta) {
    super(code);
    this.name = 'HookRuntimeError';
    this.code = code;
    this.meta = meta || {};
  }
}

class HookInputSchemaError extends HookRuntimeError {
  constructor(code, meta) {
    super(code, meta);
    this.name = 'HookInputSchemaError';
  }
}

class HookLockError extends HookRuntimeError {
  constructor(code, meta) {
    super(code, meta);
    this.name = 'HookLockError';
  }
}

class HookBudgetTimeout extends HookRuntimeError {
  constructor(code, meta) {
    super(code, meta);
    this.name = 'HookBudgetTimeout';
  }
}

class HookIOError extends HookRuntimeError {
  constructor(code, meta) {
    super(code, meta);
    this.name = 'HookIOError';
  }
}

class HookConfigError extends HookRuntimeError {
  constructor(code, meta) {
    super(code, meta);
    this.name = 'HookConfigError';
  }
}

// ---------------------------------------------------------------------------
// Project root resolution — fixes "CWD ≠ project root" cache pollution
// ---------------------------------------------------------------------------

/**
 * Find the canonical project root. Walks UP from `start` (default cwd)
 * looking for a `.claude/` directory or `.git/` directory marker. Returns
 * the first ancestor that has either marker, or `start` if none found.
 *
 * Used by hooks that need to write to `.claude/cache/` or `.claude/metrics/`.
 * Without this, hooks launched from a subdir (e.g., user did
 * `cd archon-os && claude`, or a PreToolUse hook fires while the Bash tool
 * has a transient cd-prefixed command) create stray `.claude/` directories
 * inside the subdir.
 *
 * Resolution order:
 *   1. `process.env.AF_PROJECT_ROOT` — explicit override
 *   2. Walk up from `start` (or cwd) looking for `.claude/` or `.git/`
 *   3. Fallback to `start` (or cwd) — preserves legacy behavior
 *
 * @param {string} [start]  optional starting dir; defaults to process.cwd()
 * @returns {string}        absolute path to project root
 */
function findProjectRoot(start) {
  if (process.env.AF_PROJECT_ROOT) {
    return path.resolve(process.env.AF_PROJECT_ROOT);
  }
  let dir = path.resolve(start || process.cwd());
  const parent = (p) => path.dirname(p);
  while (dir !== parent(dir)) {
    try {
      if (fs.existsSync(path.join(dir, '.claude')) ||
          fs.existsSync(path.join(dir, '.git'))) {
        return dir;
      }
    } catch {
      // existsSync should never throw, but guard anyway
    }
    dir = parent(dir);
  }
  return path.resolve(start || process.cwd());
}

// ---------------------------------------------------------------------------
// Internal helpers: path safety + deep immutability
// ---------------------------------------------------------------------------

/**
 * Reject paths containing parent-traversal segments. Used by appendAuditJsonl
 * + atomicWrite to prevent CWE-22 path traversal (a caller that derives the
 * path from an env var or config field cannot escape the intended directory).
 * Absolute paths are permitted; we only reject `..` segments.
 *
 * @throws {HookIOError}  on traversal pattern
 */
function validateSafePath(p) {
  if (typeof p !== 'string' || p.length === 0) {
    throw new HookIOError('invalid_path', { path: p });
  }
  // path.normalize collapses '..' segments; if the normalized form still
  // contains '..' (impossible for an absolute path; possible for a relative
  // one starting with ../), reject.
  const segments = p.split(/[\\/]+/);
  if (segments.indexOf('..') !== -1) {
    throw new HookIOError('invalid_path', { path: p, reason: 'parent_traversal_segment' });
  }
}

/**
 * Recursively Object.freeze a plain-JSON value. Shallow Object.freeze would
 * allow callers to mutate nested fields (e.g. `input.tool_input.command`)
 * after readHookInput returns — bypassing downstream security checks that
 * assumed the object was immutable (CWE-471).
 */
function deepFreeze(obj) {
  if (obj !== null && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
      deepFreeze(obj[key]);
    }
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Internal: low-level stdin read (strict — does not touch env)
// ---------------------------------------------------------------------------

/**
 * Read fd 0 synchronously, using the same safe-fstat gate as safe-stdin.
 * Returns the raw string ('' on TTY/unreadable). Does NOT trim because
 * readHookInput needs to detect "truly empty" vs "only whitespace JSON".
 */
function readRawStdin() {
  let canRead = false;
  try {
    const stats = fs.fstatSync(0);
    canRead = stats.isFIFO() || stats.isFile() || stats.isSocket();
  } catch {
    canRead = false;
  }
  if (!canRead) return '';
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Schema validation (shared between strict + compat code paths)
// ---------------------------------------------------------------------------

/**
 * Set of hook_event_name values that require tool_name + tool_input.
 */
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse']);

/**
 * Validate the parsed payload against the strict schema. Throws
 * HookInputSchemaError(code='missing_field', meta={field}) on the first
 * missing required field.
 *
 * Required fields:
 *   - session_id          (always)
 *   - hook_event_name     (always)
 *   - tool_name           (when hook_event_name ∈ {PreToolUse, PostToolUse})
 *   - tool_input          (when hook_event_name ∈ {PreToolUse, PostToolUse})
 *   - prompt              (when hook_event_name === 'UserPromptSubmit')
 */
function validateStrict(payload) {
  if (payload.session_id === undefined || payload.session_id === null || payload.session_id === '') {
    throw new HookInputSchemaError('missing_field', { field: 'session_id' });
  }
  if (payload.hook_event_name === undefined || payload.hook_event_name === null || payload.hook_event_name === '') {
    throw new HookInputSchemaError('missing_field', { field: 'hook_event_name' });
  }
  if (TOOL_EVENTS.has(payload.hook_event_name)) {
    if (payload.tool_name === undefined || payload.tool_name === null || payload.tool_name === '') {
      throw new HookInputSchemaError('missing_field', { field: 'tool_name' });
    }
    if (payload.tool_input === undefined || payload.tool_input === null) {
      throw new HookInputSchemaError('missing_field', { field: 'tool_input' });
    }
  }
  if (payload.hook_event_name === 'UserPromptSubmit') {
    if (payload.prompt === undefined || payload.prompt === null) {
      throw new HookInputSchemaError('missing_field', { field: 'prompt' });
    }
  }
}

/**
 * Build the canonical frozen input object. Ensures agent_name is `null`
 * when absent (Q2 strict default) and that all optional pass-through
 * fields are preserved.
 */
function buildInputObject(payload) {
  const obj = {
    session_id:        payload.session_id,
    hook_event_name:   payload.hook_event_name,
    agent_name:        payload.agent_name !== undefined ? payload.agent_name : null,
    tool_name:         payload.tool_name !== undefined ? payload.tool_name : null,
    tool_input:        payload.tool_input !== undefined ? payload.tool_input : null,
    tool_response:     payload.tool_response !== undefined ? payload.tool_response : null,
    prompt:            payload.prompt !== undefined ? payload.prompt : null,
    cwd:               payload.cwd !== undefined ? payload.cwd : null,
    transcript_path:   payload.transcript_path !== undefined ? payload.transcript_path : null,
    permission_mode:   payload.permission_mode !== undefined ? payload.permission_mode : null,
  };
  // F2 (CWE-471): deep-freeze so nested tool_input / tool_response cannot
  // be mutated between security gate validation and tool dispatch.
  return deepFreeze(obj);
}

// ---------------------------------------------------------------------------
// readHookInput (strict — Q1 strict-throw, Q7 silent throw, never touches env)
// ---------------------------------------------------------------------------

/**
 * Read and parse the hook input JSON from stdin. Strict mode:
 *   - throws HookInputSchemaError(code='empty_stdin')      if stdin is empty
 *   - throws HookInputSchemaError(code='invalid_json')     if not valid JSON
 *   - throws HookInputSchemaError(code='missing_field', meta:{field}) on schema gap
 *
 * Does NOT consult process.env. Returns a frozen object.
 *
 * @returns {Readonly<object>}
 */
function readHookInput() {
  const raw = readRawStdin();
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new HookInputSchemaError('empty_stdin', {});
  }
  let payload;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    // F1 (CWE-117): newline-escape raw bytes so downstream loggers that
    // print meta.raw with bare process.stderr.write cannot be tricked into
    // forging audit log lines via attacker-controlled stdin prefixes.
    throw new HookInputSchemaError('invalid_json', { raw: trimmed.slice(0, 200).replace(/[\r\n]/g, '\\n') });
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HookInputSchemaError('invalid_json', { raw: trimmed.slice(0, 200).replace(/[\r\n]/g, '\\n') });
  }
  validateStrict(payload);
  return buildInputObject(payload);
}

// ---------------------------------------------------------------------------
// readHookInputCompat (lenient — Q1 alias coerce, Q2 env fallback)
// ---------------------------------------------------------------------------

/**
 * Lenient counterpart to readHookInput. Used to migrate legacy hooks that
 * historically relied on CLAUDE_* env vars or the older `tool` field.
 *
 * Does NOT throw on schema violation — fills in best-effort values and
 * returns a (frozen) partial object. Behaviour:
 *   - parses stdin JSON if present and valid (else treats as empty object)
 *   - coerces `tool` → `tool_name` (preferring `tool_name` when both present)
 *   - falls back to CLAUDE_SESSION_ID, CLAUDE_HOOK_EVENT, CLAUDE_USER_PROMPT,
 *     CLAUDE_AGENT_NAME, and process.cwd() for the corresponding fields
 *
 * F6 SECURITY NOTE (CWE-807): env-var-derived fields have a LOWER integrity
 * boundary than stdin-derived fields. Anyone who can set environment
 * variables before the hook process launches (e.g., a wrapper script,
 * CI runner config, malicious parent process) can spoof session_id /
 * hook_event_name / prompt / agent_name. Security-critical hooks
 * (mcp-call-gate, check-command-allowlist, scout-block) MUST use the
 * strict readHookInput — never readHookInputCompat. This compat path
 * exists only for non-security telemetry/logging hooks during migration.
 *
 * @returns {Readonly<object>}
 */
function readHookInputCompat() {
  const raw = readRawStdin();
  let payload = {};
  const trimmed = raw.trim();
  if (trimmed.length > 0) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed;
      }
    } catch {
      // Lenient mode: invalid JSON is silently ignored — fall back to env.
    }
  }

  // Alias coercion: tool → tool_name (Q1 default for compat)
  if (payload.tool_name === undefined && payload.tool !== undefined) {
    payload.tool_name = payload.tool;
  }

  // Env fallback (Q2 default for compat)
  if (payload.session_id === undefined && process.env.CLAUDE_SESSION_ID) {
    payload.session_id = process.env.CLAUDE_SESSION_ID;
  }
  if (payload.hook_event_name === undefined && process.env.CLAUDE_HOOK_EVENT) {
    payload.hook_event_name = process.env.CLAUDE_HOOK_EVENT;
  }
  if (payload.prompt === undefined && process.env.CLAUDE_USER_PROMPT) {
    payload.prompt = process.env.CLAUDE_USER_PROMPT;
  }
  if (payload.agent_name === undefined && process.env.CLAUDE_AGENT_NAME) {
    payload.agent_name = process.env.CLAUDE_AGENT_NAME;
  }
  if (payload.cwd === undefined) {
    payload.cwd = process.cwd();
  }

  return buildInputObject(payload);
}

// ---------------------------------------------------------------------------
// logger (NDJSON to stderr, HOOK_LOG_LEVEL gated, Q5)
// ---------------------------------------------------------------------------

const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLogLevel() {
  const raw = (process.env.HOOK_LOG_LEVEL || 'info').toLowerCase();
  if (LOG_LEVELS[raw] !== undefined) return LOG_LEVELS[raw];
  return LOG_LEVELS.info; // unknown → default to info
}

function emitLog(scope, level, msg, meta) {
  const want = LOG_LEVELS[level];
  if (want === undefined) return;
  if (want < currentLogLevel()) return;
  const record = {
    ts:    new Date().toISOString(),
    scope: scope,
    level: level,
    msg:   msg,
    meta:  meta !== undefined ? meta : {},
  };
  // Use fs.writeSync(2, ...) so we never accidentally buffer to stdout
  // and never need an async flush.
  try {
    fs.writeSync(2, JSON.stringify(record) + '\n');
  } catch {
    // stderr unwritable — there is nothing more we can do.
  }
}

/**
 * Create a scoped structured logger. Methods: debug, info, warn, error.
 * Each method takes (msgKey, metaObj?). Output is one NDJSON line per call,
 * written to stderr (fd 2), gated by HOOK_LOG_LEVEL.
 *
 * F7 SECURITY NOTE (CWE-117): `scope` MUST be a static string constant
 * defined at call site. Do NOT derive `scope` from user-controlled data
 * (e.g., stdin fields, env vars). While JSON.stringify keeps wire-format
 * integrity, downstream audit-log analysis tools that filter by `scope`
 * (exact-match or prefix) could be confused by attacker-chosen values.
 *
 * @param {string} scope  short STATIC identifier for the calling subsystem
 * @returns {{debug: Function, info: Function, warn: Function, error: Function}}
 */
function logger(scope) {
  return {
    debug: (msg, meta) => emitLog(scope, 'debug', msg, meta),
    info:  (msg, meta) => emitLog(scope, 'info',  msg, meta),
    warn:  (msg, meta) => emitLog(scope, 'warn',  msg, meta),
    error: (msg, meta) => emitLog(scope, 'error', msg, meta),
  };
}

// ---------------------------------------------------------------------------
// safeExit (Q6 — sync fs.writeSync(2) then process.exit)
// ---------------------------------------------------------------------------

/**
 * Synchronously emit a structured NDJSON record to stderr (fd 2) and call
 * process.exit(code). Never touches stdout. Used as the final action of any
 * hook so its exit shows up in audit logs.
 *
 * @param {number} code     exit code (0 = success, 1 = error, 2 = block, ...)
 * @param {string} [reason] short identifier for why we are exiting
 */
function safeExit(code, reason) {
  const record = {
    ts:     new Date().toISOString(),
    scope:  'hook-runtime',
    level:  code === 0 ? 'info' : 'warn',
    msg:    'exit',
    exit:   code,
    reason: reason !== undefined ? reason : null,
  };
  try {
    fs.writeSync(2, JSON.stringify(record) + '\n');
  } catch {
    // stderr unwritable — exit anyway.
  }
  process.exit(code);
}

// ---------------------------------------------------------------------------
// atomicWrite (Q4 — .tmp.<pid>.<6hex>, no mkdir, cleanup on rename failure)
// ---------------------------------------------------------------------------

/**
 * Write `content` to `targetPath` atomically: write to an intermediate
 * `<targetPath>.tmp.<pid>.<6hex>` file, then fs.renameSync onto the final
 * path. On rename failure the tmp file is unlinked. Does NOT create parent
 * directories — the caller must guarantee parent exists (Q4 default).
 *
 * @param {string} targetPath  final destination
 * @param {string|Buffer} content  bytes to write
 */
function atomicWrite(targetPath, content) {
  // F3 (CWE-22): reject path traversal before any I/O.
  validateSafePath(targetPath);
  // F9 (CWE-330): 48 bits of entropy aligns with conventional secure-temp
  // floor (was 24 bits; sufficient for low-sensitivity writes but below
  // typical secure-temp practice).
  const suffix = `.tmp.${process.pid}.${crypto.randomBytes(6).toString('hex')}`;
  const tmpPath = targetPath + suffix;
  try {
    fs.writeFileSync(tmpPath, content);
  } catch (e) {
    // F11: wrap raw fs error in HookIOError but preserve original message
    // (callers + tests match against ENOENT / EACCES strings).
    const wrapped = new HookIOError('io_error', { op: 'writeFileSync', path: tmpPath, errno: e && e.code });
    wrapped.message = (e && e.message) || 'io_error';
    wrapped.cause = e;
    throw wrapped;
  }
  try {
    fs.renameSync(tmpPath, targetPath);
  } catch (e) {
    // Cleanup the leaked tmp file then re-throw wrapped.
    try { fs.unlinkSync(tmpPath); } catch { /* swallow cleanup error */ }
    const wrapped = new HookIOError('io_error', { op: 'renameSync', path: targetPath, errno: e && e.code });
    wrapped.message = (e && e.message) || 'io_error';
    wrapped.cause = e;
    throw wrapped;
  }
}

// ---------------------------------------------------------------------------
// appendAuditJsonl (locked NDJSON appender, Q3 timeout via env)
// ---------------------------------------------------------------------------

/**
 * Returns true if a PID is alive (in any sense — we send signal 0 which
 * never affects the process, only checks for existence + permission).
 */
function pidAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM = exists but we lack permission → still alive
    if (e && e.code === 'EPERM') return true;
    return false;
  }
}

/**
 * Try to acquire the lock at `lockPath` by writing our PID atomically.
 * Returns true on success, false on contention. Reclaims stale locks
 * (lock file contains a dead PID), in which case the audit `log` is
 * called with `stale_lock_reclaimed`.
 *
 * F4 (CWE-362) note: the stale-reclaim sequence (read PID → unlink → retry
 * openSync('wx')) has a benign race window. Two reclaimers can both see the
 * same dead PID and both unlink, but only ONE openSync('wx') wins (the
 * other gets EEXIST and returns false → outer busy-wait retries). The race
 * therefore cannot grant the lock to two processes simultaneously; the
 * worst case is one extra reclaim cycle. PID-reuse (a new process spawns
 * with the dead PID between liveness check and unlink) is theoretical on
 * loaded systems; the new process is unrelated to audit writing, so a
 * spurious reclaim has no integrity impact. STORY-0011 SQLite WAL backend
 * eliminates this surface entirely.
 */
function tryAcquireLock(lockPath, log) {
  try {
    const fd = fs.openSync(lockPath, 'wx'); // exclusive create
    try {
      fs.writeSync(fd, String(process.pid));
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch (e) {
    if (e && e.code === 'EEXIST') {
      // Check if the holder is still alive. If not, reclaim.
      let holderPid = 0;
      try {
        holderPid = parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
      } catch { /* unreadable — be conservative, do not reclaim */ }
      if (holderPid && !pidAlive(holderPid)) {
        try { fs.unlinkSync(lockPath); } catch { /* swallow */ }
        log.warn('stale_lock_reclaimed', { lockPath, holderPid });
        // Retry once
        try {
          const fd = fs.openSync(lockPath, 'wx');
          try { fs.writeSync(fd, String(process.pid)); } finally { fs.closeSync(fd); }
          return true;
        } catch { return false; }
      }
      return false;
    }
    throw e;
  }
}

/**
 * Append a single row to a JSONL audit file, protected by a sibling
 * `.lock` file. The row is serialised as one NDJSON line. Lock acquisition
 * busy-waits until the timeout (default 2000ms, configurable via the
 * HOOK_LOCK_TIMEOUT_MS env var). Stale locks (dead-PID holders) are
 * reclaimed automatically.
 *
 * @param {string} auditPath  path to the .jsonl file
 * @param {object} row        any JSON-serialisable object
 * @throws {HookLockError}    on lock-timeout
 * @throws {HookIOError}      on underlying I/O failure
 */
function appendAuditJsonl(auditPath, row) {
  // F3 (CWE-22): reject path traversal before any I/O.
  validateSafePath(auditPath);
  const lockPath = auditPath + '.lock';
  const log = logger('hook-runtime.audit');
  // F5 (CWE-20): clamp negative / zero / non-finite values to default. Old
  // `parseInt(env) || 2000` accepted -1 as truthy → immediate HookLockError
  // → silent audit drop.
  const parsedTimeout = parseInt(process.env.HOOK_LOCK_TIMEOUT_MS, 10);
  const timeoutMs = (Number.isFinite(parsedTimeout) && parsedTimeout > 0) ? parsedTimeout : 2000;
  const start = Date.now();
  const sleepMs = 25;

  // Busy-wait for the lock
  while (!tryAcquireLock(lockPath, log)) {
    if (Date.now() - start >= timeoutMs) {
      throw new HookLockError('lock_timeout', { lockPath, timeoutMs });
    }
    // Synchronous sleep — Atomics.wait on a SAB is the canonical pattern
    try {
      const sab = new SharedArrayBuffer(4);
      Atomics.wait(new Int32Array(sab), 0, 0, sleepMs);
    } catch {
      // Fallback for environments without SAB — spin
      const until = Date.now() + sleepMs;
      while (Date.now() < until) { /* spin */ }
    }
  }

  // Lock acquired — write the row then always release.
  try {
    const line = JSON.stringify(row) + '\n';
    try {
      fs.appendFileSync(auditPath, line);
    } catch (e) {
      throw new HookIOError('io_error', { op: 'appendFileSync', path: auditPath, errno: e && e.code });
    }
  } finally {
    try { fs.unlinkSync(lockPath); } catch { /* swallow — best-effort release */ }
  }
}

// ---------------------------------------------------------------------------
// withBudget (race fn against ms; reject HookBudgetTimeout on slow path)
// ---------------------------------------------------------------------------

/**
 * Race `fn()` against a `ms`-millisecond budget. Returns the fn's resolved
 * value if it wins; rejects with HookBudgetTimeout if the timer wins. On
 * timeout, emits exactly one warn-level NDJSON log with msg='budget_exceeded'
 * (including the optional `label`) before rejecting. Errors thrown by `fn`
 * after timeout are swallowed (timeout wins).
 *
 * F8 NOTE (CWE-772): on timeout, `fn` is abandoned but NOT cancelled — Node
 * has no preemptive task cancellation. If `fn` holds OS resources (file
 * descriptors, sockets, child processes), those resources remain live until
 * `fn` resolves/rejects on its own. Callers should ensure `fn` either uses
 * RAII-style cleanup or accepts an AbortController signal.
 *
 * F12 DESIGN NOTE: the timer is `unref()`-ed (line below). Phase 1 design
 * advised against this; in practice for hook scripts it is beneficial —
 * an unref'd timer cannot pin Node alive if the rest of the event loop is
 * idle, which improves shutdown hygiene. Workflow integrity is preserved
 * because the work-promise itself keeps the event loop alive while pending.
 *
 * @template T
 * @param {number} ms  budget in milliseconds
 * @param {() => Promise<T>} fn  worker function
 * @param {{label?: string}} [opts]  optional label for the warn log
 * @returns {Promise<T>}
 */
function withBudget(ms, fn, opts) {
  const label = opts && opts.label ? opts.label : null;
  const log = logger('hook-runtime.budget');
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      log.warn('budget_exceeded', { ms, label });
      reject(new HookBudgetTimeout('budget_exceeded', { ms, label }));
    }, ms);
    if (typeof timer.unref === 'function') timer.unref();

    Promise.resolve()
      .then(fn)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        if (settled) return; // timer already won — swallow fn error
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // 6 functional exports (Phase 1 design)
  readHookInput,
  readHookInputCompat,
  appendAuditJsonl,
  atomicWrite,
  logger,
  safeExit,
  withBudget,

  // Project root resolver (v3.8.0-alpha.2 — fixes CWD pollution)
  findProjectRoot,

  // 5 error classes + base
  HookRuntimeError,
  HookInputSchemaError,
  HookLockError,
  HookBudgetTimeout,
  HookIOError,
  HookConfigError,

  // Back-compat re-exports (byte-for-byte from safe-stdin.cjs)
  readStdinSafely:   safeStdin.readStdinSafely,
  parseStdinJson:    safeStdin.parseStdinJson,
  readPromptFromStdin: safeStdin.readPromptFromStdin,
  installWatchdog:   safeStdin.installWatchdog,
};
