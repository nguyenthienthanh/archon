#!/usr/bin/env node
/**
 * Aura Frog — Post-Execute: Update Node Status
 *
 * Fires: PostToolUse (Bash | Edit | Write | Read)
 * Purpose: When a tool execution completes, update the active T4 task's status
 *          and trigger failure-classifier on non-zero exit.
 *
 * Behavior:
 *   - Silent exit if .claude/plans/active.json missing or active.task null
 *   - On exit_code === 0 → optionally promote status if acceptance hook says so
 *     (acceptance check is a downstream concern — this hook only records execution)
 *   - On exit_code !== 0 → increment failed_attempts, append history.jsonl event,
 *     and emit a hint to stderr suggesting failure-classifier invocation
 *
 * Exit codes:
 *   0 — success (always; this is a recorder, not a guard)
 *
 * @version 1.0.0 (v3.7.0-alpha.2)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const resolvePlansDir = require('./lib/plans-dir.cjs');
const { readStdinSafely, parseStdinJson } = require('./lib/hook-runtime.cjs');
const { readToolName, readExitCode } = require('./lib/tool-context.cjs');

const PLANS_DIR = resolvePlansDir();
const ACTIVE_FILE = path.join(PLANS_DIR, 'active.json');
const HISTORY_FILE = path.join(PLANS_DIR, 'history.jsonl');

function safeExit(code = 0) {
  process.exit(code);
}

// Pure: a non-zero exit is an execution_failed event (which downstream triggers
// the failure-classifier); a zero exit is execution_completed.
function buildHistoryEvent({ taskId, toolName, exitCode, ts }) {
  return {
    ts,
    node: taskId,
    event: exitCode !== 0 ? 'execution_failed' : 'execution_completed',
    tool: toolName,
    exit_code: exitCode,
    actor: 'post-execute-update-node',
  };
}

function appendHistory(event) {
  try {
    fs.appendFileSync(HISTORY_FILE, JSON.stringify(event) + '\n');
  } catch (err) {
    process.stderr.write(`[post-execute] WARN: history append failed: ${err.message}\n`);
  }
}

function main() {
  if (!fs.existsSync(ACTIVE_FILE)) return;

  let active;
  try { active = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8')); }
  catch (err) {
    process.stderr.write(`[post-execute] WARN: active.json malformed: ${err.message}\n`);
    return;
  }

  const taskId = active.active && active.active.task;
  if (!taskId) return;

  // STORY-0010: read the tool context from the hook's stdin payload (the hook API
  // never set the CLAUDE_TOOL_* env vars this used to read). Env kept as a fallback
  // so a host that doesn't populate the payload keeps the pre-migration behaviour.
  const input = parseStdinJson(readStdinSafely()) || {};
  const exitCode = readExitCode(input) ?? (parseInt(process.env.CLAUDE_TOOL_EXIT_CODE || '0', 10) || 0);
  const toolName = readToolName(input) || process.env.CLAUDE_TOOL_NAME || 'unknown';
  const ts = new Date().toISOString();

  const event = buildHistoryEvent({ taskId, toolName, exitCode, ts });
  appendHistory(event);

  if (event.event === 'execution_failed') {
    process.stderr.write(
      `[post-execute] task=${taskId} tool=${toolName} exit=${exitCode}\n` +
      '  invoke failure-classifier skill to classify (F1-F5) before retry/replan\n',
    );
  }
}

// Run as a hook; stay importable for tests. FEAT-007 / issue #5.
if (require.main === module) {
  main();
} else {
  module.exports = { buildHistoryEvent };
}
