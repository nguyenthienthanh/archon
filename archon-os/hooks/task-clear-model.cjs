#!/usr/bin/env node
/**
 * Aura Frog — Task Model Clearer (PostToolUse)
 *
 * Fires: PostToolUse with matcher "Task"
 * Purpose: Pop the most-recent entry from the model stack written by
 *          task-track-model.cjs. When the stack is empty, remove the file
 *          entirely so the runtime dir stays clean.
 *
 * State file: .aura-frog/runtime/model-stack.jsonl (override with
 *             $AF_MODEL_STACK_FILE, used by tests).
 *
 * Fail-open contract: always exit 0. A broken hook must never block a
 * Task completion. Errors go to stderr only.
 *
 * @version 1.0.0 (v3.7.4 follow-up)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { readStdinSafely, parseStdinJson, installWatchdog } = require('./lib/safe-stdin.cjs');

/**
 * Pop the last JSONL line from `stackFile`. If popping leaves the file
 * empty, remove the file. Returns true if a line was popped, false if the
 * file was already missing or empty.
 *
 * Atomicity: read → trim last line → write to tmp → rename. Single-driver
 * assumption (per repo spec); the JSONL append in the pre-hook would race
 * anyway, so flock is not added.
 */
function popStackEntry(stackFile) {
  let body;
  try {
    if (!fs.existsSync(stackFile)) return false;
    body = fs.readFileSync(stackFile, 'utf8');
  } catch (err) {
    try { process.stderr.write(`[task-clear-model] WARN: read failed: ${err.message}\n`); } catch { /* swallow */ }
    return false;
  }

  const trimmed = body.replace(/\n+$/, '');
  if (!trimmed) {
    // Empty file — remove it.
    try { fs.unlinkSync(stackFile); } catch { /* swallow */ }
    return false;
  }

  const lines = trimmed.split('\n');
  lines.pop();

  if (lines.length === 0) {
    try { fs.unlinkSync(stackFile); } catch (err) {
      try { process.stderr.write(`[task-clear-model] WARN: unlink failed: ${err.message}\n`); } catch { /* swallow */ }
    }
    return true;
  }

  try {
    const tmp = `${stackFile}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, lines.join('\n') + '\n');
    fs.renameSync(tmp, stackFile);
    return true;
  } catch (err) {
    try { process.stderr.write(`[task-clear-model] WARN: write failed: ${err.message}\n`); } catch { /* swallow */ }
    return false;
  }
}

/**
 * End-to-end post-hook logic, factored out for testing.
 *
 * @param {object} input - parsed stdin JSON
 * @param {object} opts - { stackFile }
 * @returns {{action: 'skip'|'pop'}}
 */
function processPostToolUse(input, opts) {
  const stackFile = opts.stackFile || path.join(process.cwd(), '.aura-frog', 'runtime', 'model-stack.jsonl');
  if (!input || typeof input !== 'object') return { action: 'skip' };
  if (input.tool_name !== 'Task') return { action: 'skip' };
  if (!fs.existsSync(stackFile)) return { action: 'skip' };
  popStackEntry(stackFile);
  return { action: 'pop' };
}

// ----- CLI entry point ------------------------------------------------------
if (require.main === module) {
  installWatchdog(1500, 0);
  try {
    const raw = readStdinSafely();
    const input = parseStdinJson(raw) || {};
    processPostToolUse(input, {});
  } catch (err) {
    try { process.stderr.write(`[task-clear-model] WARN: ${err.message}\n`); } catch { /* swallow */ }
  }
  process.exit(0);
}

module.exports = {
  popStackEntry,
  processPostToolUse,
};
