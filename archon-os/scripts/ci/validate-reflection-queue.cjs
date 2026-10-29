#!/usr/bin/env node
'use strict';

/**
 * CI self-test for hooks/lib/reflection-queue.cjs (KG-2.3).
 *
 * Exercises the full contract against a throwaway temp dir:
 *   - gate OFF => no file, all no-ops
 *   - enqueue => durable JSONL line with the documented shape
 *   - dedupe  => re-enqueueing an equal payload does not add a line
 *   - drain   => pending entries handled, marked done, rewritten atomically
 *   - retention => done+old entries pruned, cap enforced at MAX_ENTRIES
 *   - crash-recovery => a pending entry left behind is re-seen on next drain
 *   - fail-closed => bad input never throws
 *
 * Exits 0 on success, non-zero on the first failed assertion.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const q = require('../../hooks/lib/reflection-queue.cjs');

let failures = 0;
function check(name, cond) {
  if (cond) {
    process.stdout.write(`  ok   ${name}\n`);
  } else {
    failures++;
    process.stdout.write(`  FAIL ${name}\n`);
  }
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'af-reflq-'));
}

function readLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

// --- 1. Gate OFF => everything a no-op, nothing written --------------------
(function gateOff() {
  const dir = mkTmp();
  const env = { AF_REFLECTION_QUEUE_DIR: dir }; // no AF_REFLECTION_QUEUE
  const file = q.resolveQueueFile(undefined, env);
  const r = q.enqueue({ a: 1 }, { env });
  const d = q.drain(() => true, { env });
  const s = q.stats({ env });
  check('gate off: enqueue returns null', r === null);
  check('gate off: drain returns zero', d.processed === 0 && d.remaining === 0);
  check('gate off: stats.enabled false', s.enabled === false);
  check('gate off: no file written', !fs.existsSync(file));
})();

// --- 2. Enqueue writes the documented shape --------------------------------
(function enqueueShape() {
  const dir = mkTmp();
  const env = { AF_REFLECTION_QUEUE: '1', AF_REFLECTION_QUEUE_DIR: dir };
  const file = q.resolveQueueFile(undefined, env);
  const r = q.enqueue({ tool: 'Write', note: 'hello' }, { env });
  const lines = readLines(file);
  check('enqueue: returns id + not duplicate', r && typeof r.id === 'string' && r.duplicate === false);
  check('enqueue: exactly one line', lines.length === 1);
  const e = lines[0] || {};
  check('enqueue: id is sha256 hex', /^[0-9a-f]{64}$/.test(e.id || ''));
  check('enqueue: kind=reflection', e.kind === 'reflection');
  check('enqueue: status=pending', e.status === 'pending');
  check('enqueue: ts is epoch number', typeof e.ts === 'number' && e.ts > 0);
  check('enqueue: payload preserved', e.payload && e.payload.tool === 'Write' && e.payload.note === 'hello');
})();

// --- 3. Dedupe on content hash ---------------------------------------------
(function dedupe() {
  const dir = mkTmp();
  const env = { AF_REFLECTION_QUEUE: 'true', AF_REFLECTION_QUEUE_DIR: dir };
  const file = q.resolveQueueFile(undefined, env);
  const r1 = q.enqueue({ b: 2, a: 1 }, { env });
  const r2 = q.enqueue({ a: 1, b: 2 }, { env }); // same content, different key order
  const lines = readLines(file);
  check('dedupe: same id for reordered keys', r1.id === r2.id);
  check('dedupe: second enqueue flagged duplicate', r2.duplicate === true);
  check('dedupe: still one line on disk', lines.length === 1);
})();

// --- 4. Drain handles pending, marks done ----------------------------------
(function drainProcess() {
  const dir = mkTmp();
  const env = { AF_REFLECTION_QUEUE: 'on', AF_REFLECTION_QUEUE_DIR: dir };
  const file = q.resolveQueueFile(undefined, env);
  q.enqueue({ n: 1 }, { env });
  q.enqueue({ n: 2 }, { env });
  const seen = [];
  const d = q.drain((payload) => { seen.push(payload.n); }, { env });
  check('drain: processed 2', d.processed === 2);
  check('drain: handler saw both payloads', seen.includes(1) && seen.includes(2));
  check('drain: 0 remaining pending', d.remaining === 0);
  const lines = readLines(file);
  check('drain: entries marked done', lines.length === 2 && lines.every(e => e.status === 'done'));

  // Second drain: nothing pending, no re-processing.
  const seen2 = [];
  const d2 = q.drain((payload) => { seen2.push(payload.n); }, { env });
  check('drain: idempotent second pass processes 0', d2.processed === 0 && seen2.length === 0);
})();

// --- 5. Crash recovery: pending entry re-seen; failed handler stays pending -
(function crashRecovery() {
  const dir = mkTmp();
  const env = { AF_REFLECTION_QUEUE: '1', AF_REFLECTION_QUEUE_DIR: dir };
  q.enqueue({ n: 42 }, { env });
  // First drain: handler throws => entry must remain pending.
  const d1 = q.drain(() => { throw new Error('boom'); }, { env });
  check('crash: throwing handler leaves entry pending', d1.remaining === 1 && d1.processed === 0);
  // Next drain: same entry re-seen and now processed.
  let saw = 0;
  const d2 = q.drain((p) => { saw = p.n; }, { env });
  check('crash: pending entry re-processed next drain', d2.processed === 1 && saw === 42);
})();

// --- 6. Retention: old done entries pruned; cap enforced -------------------
(function retention() {
  const dir = mkTmp();
  const env = { AF_REFLECTION_QUEUE: '1', AF_REFLECTION_QUEUE_DIR: dir };
  const file = q.resolveQueueFile(undefined, env);
  fs.mkdirSync(dir, { recursive: true });

  const nowS = Math.floor(Date.now() / 1000);
  const oldTs = nowS - (q.RETENTION_DAYS + 5) * 24 * 60 * 60;

  // Pure retention rule: old pending is kept, old done is dropped, fresh done kept.
  const pure = q.applyRetention([
    { id: 'a'.repeat(64), ts: oldTs, kind: 'reflection', payload: { x: 1 }, status: 'done' },
    { id: 'b'.repeat(64), ts: oldTs, kind: 'reflection', payload: { x: 2 }, status: 'pending' },
    { id: 'c'.repeat(64), ts: nowS, kind: 'reflection', payload: { x: 3 }, status: 'done' },
  ]);
  const pureIds = pure.map(e => e.id[0]);
  check('retention: old done entry pruned', !pureIds.includes('a'));
  check('retention: old pending entry kept', pureIds.includes('b'));
  check('retention: fresh done entry kept', pureIds.includes('c'));

  // Through drain: seed one old done entry => pruned on rewrite.
  fs.writeFileSync(file,
    JSON.stringify({ id: 'a'.repeat(64), ts: oldTs, kind: 'reflection', payload: { x: 1 }, status: 'done' }) + '\n' +
    JSON.stringify({ id: 'c'.repeat(64), ts: nowS, kind: 'reflection', payload: { x: 3 }, status: 'done' }) + '\n',
    'utf8');
  const d = q.drain((p) => p, { env });
  check('retention: reported at least 1 pruned', d.pruned >= 1);

  // Cap: seed > MAX_ENTRIES fresh done entries, drain, expect MAX_ENTRIES cap.
  const cap = q.MAX_ENTRIES;
  const many = [];
  for (let i = 0; i < cap + 50; i++) {
    many.push({ id: String(i).padStart(64, '0'), ts: nowS, kind: 'reflection', payload: { i }, status: 'done' });
  }
  fs.writeFileSync(file, many.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf8');
  q.drain((p) => p, { env });
  const capped = readLines(file);
  check('retention: cap enforced at MAX_ENTRIES', capped.length === cap);
})();

// --- 7. Fail-closed: bad inputs never throw --------------------------------
(function failClosed() {
  const dir = mkTmp();
  const env = { AF_REFLECTION_QUEUE: '1', AF_REFLECTION_QUEUE_DIR: dir };
  let threw = false;
  try {
    check('fail-closed: null payload => null', q.enqueue(null, { env }) === null);
    check('fail-closed: string payload => null', q.enqueue('nope', { env }) === null);
    check('fail-closed: non-function handler => zero', q.drain('x', { env }).processed === 0);
  } catch {
    threw = true;
  }
  check('fail-closed: nothing threw', threw === false);
})();

if (failures > 0) {
  process.stderr.write(`\nvalidate-reflection-queue: ${failures} assertion(s) FAILED\n`);
  process.exit(1);
}
process.stdout.write('\nvalidate-reflection-queue: all assertions passed\n');
process.exit(0);
