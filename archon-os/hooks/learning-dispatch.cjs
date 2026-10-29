#!/usr/bin/env node
/**
 * Aura Frog — Learning Dispatch (PostToolUse)
 *
 * Fires: PostToolUse with matcher "Write|Edit|Bash"
 * Purpose: Consolidate the per-Write/per-Bash learning hooks into ONE node
 *          process. Before this, PostToolUse(Write|Edit) spawned BOTH
 *          feedback-capture.cjs AND smart-learn.cjs (two node processes on
 *          every file write); PostToolUse(Bash) spawned smart-learn again.
 *          This dispatcher reads stdin ONCE and fans the parsed payload out
 *          to each learning module's exported run() in-process — one spawn
 *          instead of two on the hot path.
 *
 * Why raw stdin (not readHookInputCompat): feedback-capture reads
 * data.source / data.is_assistant to distinguish an AI write from a user
 * correction. hook-runtime's buildInputObject whitelists+freezes fields and
 * DROPS those two, so the dispatcher must hand each module the raw parsed
 * object. Each module self-filters by tool_name, so calling both on a
 * Bash|Write|Edit matcher is safe.
 *
 * Isolation contract: each module runs inside its own try/catch — one module
 * throwing must never stop the next, and a broken module must never block the
 * tool. Fail-open: always exits 0.
 *
 * Disable: rename or chmod -x this file, or unset the learning/feedback env
 * gates (each module honours its own AF_*_DISABLED gate internally).
 *
 * @version 1.0.0 (FEAT-010 / STORY-0025 — learning-hook consolidation)
 */

'use strict';

const { readStdinSafely, parseStdinJson, installWatchdog } = require('./lib/safe-stdin.cjs');

/**
 * Default learning modules, resolved lazily so a require() failure in one
 * module doesn't take down the dispatcher at load time. Each entry is a
 * `(input) => Promise|void` that self-filters by tool.
 */
function reflectionQueueEnabled() {
  const v = String(process.env.AF_REFLECTION_QUEUE || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

function defaultRunners() {
  const runners = [
    { name: 'feedback-capture', run: (input) => require('./feedback-capture.cjs').run(input) },
    { name: 'smart-learn', run: (input) => require('./smart-learn.cjs').run(input) },
  ];
  // KG-2.3: opt-in only. Off by default, so the default runner set is unchanged;
  // appended (never inserted) when AF_REFLECTION_QUEUE is enabled.
  if (reflectionQueueEnabled()) {
    runners.push({ name: 'reflection-queue', run: (input) => enqueueReflection(input) });
  }
  return runners;
}

/**
 * Additive KG-2.3 hook: when AF_REFLECTION_QUEUE is ON, append a reflection
 * payload to the durable on-disk queue. When the gate is OFF (default), the
 * enqueue() call is a silent no-op and NOTHING changes — existing dispatch
 * behaviour is untouched either way. Fail-closed: reflection-queue never throws,
 * and the dispatcher already isolates each runner in its own try/catch.
 */
function enqueueReflection(input) {
  const { enqueue } = require('./lib/reflection-queue.cjs');
  const src = input && typeof input === 'object' ? input : {};
  enqueue({
    tool: src.tool_name || null,
    session_id: src.session_id || null,
    cwd: src.cwd || null,
    ts_iso: new Date().toISOString(),
  });
}

/**
 * Fan the parsed stdin payload out to every runner, each isolated. Returns the
 * list of runner names that threw (for tests / observability). Never throws.
 *
 * @param {object} input - raw parsed PostToolUse stdin
 * @param {Array<{name:string, run:Function}>} [runners] - override for tests
 * @returns {Promise<string[]>} names of runners that threw
 */
async function dispatch(input, runners) {
  const list = Array.isArray(runners) ? runners : defaultRunners();
  const failed = [];
  for (const r of list) {
    try {
      await r.run(input);
    } catch (err) {
      failed.push(r && r.name ? r.name : 'unknown');
      try { process.stderr.write(`[learning-dispatch] WARN: ${r && r.name} failed: ${err.message}\n`); } catch { /* swallow */ }
    }
  }
  return failed;
}

// ----- CLI entry point ------------------------------------------------------
// Guarded so require() from tests doesn't read stdin or exit.
if (require.main === module) {
  // 2s watchdog: two modules, each does a JSON parse + a small cache read/append.
  installWatchdog(2000, 0);
  (async () => {
    let input = {};
    try {
      const raw = readStdinSafely();
      input = parseStdinJson(raw) || {};
    } catch { /* fail-open — empty input, each module self-skips */ }
    try { await dispatch(input); } catch { /* isolated inside dispatch already */ }
    process.exit(0);
  })();
}

module.exports = { dispatch, defaultRunners };
