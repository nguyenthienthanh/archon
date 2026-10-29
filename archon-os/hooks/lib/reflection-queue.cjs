'use strict';

/**
 * Aura Frog — durable async reflection queue (KG-2.3)
 *
 * OPT-IN, crash-safe, on-disk queue for post-session reflections. A reflection
 * payload is appended as one JSONL line; a processor drains the queue by running
 * a handler over each pending entry and rewriting the file atomically. Nothing
 * here changes behaviour unless the operator turns the gate ON.
 *
 * Env gate: AF_REFLECTION_QUEUE. Default OFF. When unset / "" / "0" / "false" /
 * "off" / "no" (case-insensitive), every export is a silent no-op — enqueue()
 * returns null, drain() returns { processed: 0, ... }, stats() returns zeros —
 * and NOT ONE byte is written to disk. This is the zero-behaviour-change path.
 *
 * Queue file: <root>/.claude/reflection/queue.jsonl (append-only JSONL). Each
 * line is one entry:
 *   { "id": "<sha256 of canonical payload>", "ts": <epoch seconds>,
 *     "kind": "reflection", "payload": {...}, "status": "pending" }
 * `id` is a content hash of the payload, so re-enqueueing the same payload is
 * idempotent — the duplicate is dropped (dedupe on id).
 *
 * Durability model:
 *   - enqueue: a single fs.appendFileSync of one '\n'-terminated line. Small
 *     lines are written atomically by the OS, so a crash mid-append leaves
 *     either the whole line or nothing.
 *   - drain: reads all entries, runs the handler over each pending one, then
 *     rewrites the surviving set via temp-file + atomic rename (never a
 *     truncate-in-place). A crash before the rename leaves the ORIGINAL file
 *     intact.
 *   - crash recovery: a `pending` entry left behind by a crash is simply
 *     re-seen on the next drain and re-handled. Because ids are content hashes
 *     and the handler is expected to be idempotent, re-processing is safe.
 *
 * Retention: on every rewrite the processor prunes the queue to entries that are
 * still `pending` OR newer than RETENTION_DAYS, and then caps the total to the
 * most recent MAX_ENTRIES. Done + old entries are dropped.
 *
 * Fail-closed: no export ever throws into the caller. On any I/O or parse error
 * the module warns ONCE per process (like af-net-guard) and degrades to a
 * no-op / best-effort result.
 *
 * @version 1.0.0 (KG-2.3)
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { findProjectRoot } = require('./hook-runtime.cjs');

// Retention policy — keep at most MAX_ENTRIES lines, and drop done entries
// older than RETENTION_DAYS. Pending entries are never pruned by age (they
// still need processing).
const MAX_ENTRIES = 500;
const RETENTION_DAYS = 30;
const RETENTION_SECONDS = RETENTION_DAYS * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Env gate
// ---------------------------------------------------------------------------

// Truthy only for explicit opt-in. Anything falsy / unset => OFF.
function isEnabled(env = process.env) {
  const raw = env.AF_REFLECTION_QUEUE;
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  if (v === '' || v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return true;
}

// ---------------------------------------------------------------------------
// Warn-once (per process), mirrors af-net-guard style
// ---------------------------------------------------------------------------

const warned = new Set();
function warnOnce(key, msg) {
  if (warned.has(key)) return;
  warned.add(key);
  try {
    process.stderr.write(`[reflection-queue] WARN: ${msg}\n`);
  } catch { /* stderr closed — never block */ }
}

function _resetWarnings() {
  warned.clear();
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

// Explicit override for tests / custom layouts; else <root>/.claude/reflection.
function resolveQueueDir(root, env = process.env) {
  if (env.AF_REFLECTION_QUEUE_DIR) {
    return path.resolve(env.AF_REFLECTION_QUEUE_DIR);
  }
  const base = root || findProjectRoot();
  return path.join(base, '.claude', 'reflection');
}

function resolveQueueFile(root, env = process.env) {
  return path.join(resolveQueueDir(root, env), 'queue.jsonl');
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

// Canonical JSON with sorted keys so structurally-equal payloads hash equal
// regardless of key insertion order.
function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

function hashPayload(payload) {
  return crypto.createHash('sha256').update(canonicalize(payload)).digest('hex');
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

// Parse the queue file into entries, skipping blank / malformed lines. Missing
// file => []. Never throws.
function readEntries(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    warnOnce('read:' + (err && err.code), `could not read queue: ${err && err.message}`);
    return [];
  }
  const out = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object' && typeof obj.id === 'string') {
        out.push(obj);
      }
    } catch { /* skip a torn / malformed line */ }
  }
  return out;
}

// Retention: keep pending entries, plus done entries newer than the window,
// then cap to the most recent MAX_ENTRIES (last-wins, file is append-order).
function applyRetention(entries) {
  const cutoff = nowSeconds() - RETENTION_SECONDS;
  const kept = entries.filter((e) => {
    if (e.status === 'pending') return true;
    const ts = typeof e.ts === 'number' ? e.ts : 0;
    return ts >= cutoff;
  });
  if (kept.length > MAX_ENTRIES) {
    return kept.slice(kept.length - MAX_ENTRIES);
  }
  return kept;
}

// Atomic rewrite via temp-file + rename. Never truncates in place.
function rewriteQueue(file, entries) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const body = entries.map(e => JSON.stringify(e)).join('\n');
  const tmp = path.join(dir, `.queue.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, entries.length ? body + '\n' : '', 'utf8');
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------------------
// Public API — all gated + fail-closed
// ---------------------------------------------------------------------------

/**
 * Append a reflection payload to the queue (idempotent by content hash).
 *
 * @param {object} payload - arbitrary reflection data
 * @param {object} [opts]  - { root, env } test seams
 * @returns {{id:string, ts:number, duplicate:boolean}|null}
 *          null when the gate is OFF or on any failure.
 */
function enqueue(payload, opts = {}) {
  const env = opts.env || process.env;
  if (!isEnabled(env)) return null;
  if (payload == null || typeof payload !== 'object') {
    warnOnce('enqueue:badpayload', 'enqueue ignored — payload must be an object');
    return null;
  }
  try {
    const file = resolveQueueFile(opts.root, env);
    const id = hashPayload(payload);

    // Dedupe: if an entry with this id already exists, skip the append.
    const existing = readEntries(file);
    if (existing.some(e => e.id === id)) {
      return { id, ts: 0, duplicate: true };
    }

    const entry = {
      id,
      ts: nowSeconds(),
      kind: 'reflection',
      payload,
      status: 'pending',
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
    return { id: entry.id, ts: entry.ts, duplicate: false };
  } catch (err) {
    warnOnce('enqueue:' + (err && err.code), `enqueue failed: ${err && err.message}`);
    return null;
  }
}

/**
 * Process every pending entry with `handlerFn`, mark processed ones done, apply
 * retention, and rewrite the queue atomically.
 *
 * handlerFn(payload, entry) may return anything; a thrown error (or a returned
 * `false`) leaves that entry `pending` so it is retried on the next drain.
 *
 * @param {(payload:object, entry:object)=>any} handlerFn
 * @param {object} [opts] - { root, env }
 * @returns {{processed:number, failed:number, remaining:number, pruned:number}}
 */
function drain(handlerFn, opts = {}) {
  const env = opts.env || process.env;
  const zero = { processed: 0, failed: 0, remaining: 0, pruned: 0 };
  if (!isEnabled(env)) return zero;
  if (typeof handlerFn !== 'function') {
    warnOnce('drain:nohandler', 'drain ignored — handlerFn must be a function');
    return zero;
  }
  try {
    const file = resolveQueueFile(opts.root, env);
    const entries = readEntries(file);
    if (entries.length === 0) return zero;

    let processed = 0;
    let failed = 0;
    for (const entry of entries) {
      if (entry.status !== 'pending') continue;
      try {
        const result = handlerFn(entry.payload, entry);
        if (result === false) {
          failed++;
          continue; // stays pending
        }
        entry.status = 'done';
        entry.done_ts = nowSeconds();
        processed++;
      } catch (err) {
        failed++;
        warnOnce('drain:handler', `handler threw for ${entry.id}: ${err && err.message}`);
        // entry stays pending → retried next drain (idempotent by id)
      }
    }

    const before = entries.length;
    const kept = applyRetention(entries);
    rewriteQueue(file, kept);

    const remaining = kept.filter(e => e.status === 'pending').length;
    return { processed, failed, remaining, pruned: before - kept.length };
  } catch (err) {
    warnOnce('drain:' + (err && err.code), `drain failed: ${err && err.message}`);
    return zero;
  }
}

/**
 * Queue counts. Enabled-gated; OFF => all zeros.
 * @returns {{enabled:boolean, total:number, pending:number, done:number, file:string|null}}
 */
function stats(opts = {}) {
  const env = opts.env || process.env;
  if (!isEnabled(env)) {
    return { enabled: false, total: 0, pending: 0, done: 0, file: null };
  }
  try {
    const file = resolveQueueFile(opts.root, env);
    const entries = readEntries(file);
    const pending = entries.filter(e => e.status === 'pending').length;
    return {
      enabled: true,
      total: entries.length,
      pending,
      done: entries.length - pending,
      file,
    };
  } catch (err) {
    warnOnce('stats:' + (err && err.code), `stats failed: ${err && err.message}`);
    return { enabled: true, total: 0, pending: 0, done: 0, file: null };
  }
}

module.exports = {
  enqueue,
  drain,
  stats,
  isEnabled,
  // internals exposed for the CI self-test / observability
  hashPayload,
  canonicalize,
  applyRetention,
  resolveQueueFile,
  resolveQueueDir,
  _resetWarnings,
  MAX_ENTRIES,
  RETENTION_DAYS,
};
