#!/usr/bin/env node
/**
 * Aura Frog — TDD RED Failure Tracker
 *
 * Fires: PostToolUse on Bash when the command looks like a test runner
 * Purpose: In Phase 2 (RED), tests are EXPECTED to fail. This hook distinguishes
 *          "RED as designed (✓)" from "GREEN when should fail (F2)".
 *
 * Behavior:
 *   - Silent if no active task or current_phase !== 'P2_RED'
 *   - Heuristic test detection: command matches /test|jest|vitest|pytest|cargo test|go test/i
 *   - exit_code !== 0 in RED → expected; emit decision event with grounded:true
 *   - exit_code === 0 in RED → unexpected; emit decision event flagging F2 candidate
 *
 * Exit codes:
 *   0 — success (records observations, never blocks)
 *
 * @version 1.0.0 (v3.7.0-alpha.2)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const resolvePlansDir = require('./lib/plans-dir.cjs');
const { readStdinSafely, parseStdinJson } = require('./lib/hook-runtime.cjs');
const { readCommand, readExitCode } = require('./lib/tool-context.cjs');
// One resolver, one counter, one on-disk layout. This hook used to hardcode the
// pre-v3.7.3 traces/{ID}.jsonl path and count its own lines, so its decision
// events landed in a different file from the tool_call/tool_result events the
// tracer writes to {taskFolder}/trace.jsonl — and /archon-os:trace only ever
// saw one of the two. Borrow the tracer's resolver and counter instead.
const { resolveTracePaths, taskSlugOf, nextEventId } = require('./tool-call-tracer.cjs');

const PLANS_DIR = resolvePlansDir();
const ACTIVE_FILE = path.join(PLANS_DIR, 'active.json');

function safeExit(code = 0) { process.exit(code); }

const TEST_RUNNER = /\b(test|jest|vitest|pytest|cargo\s+test|go\s+test|rspec|phpunit|mocha)\b/i;

// Pure: does this command look like a test-runner invocation?
function isTestRunner(cmd) {
  return TEST_RUNNER.test(cmd || '');
}

// Pure: build the RED-phase decision event. In Phase 2 a failing test (exit != 0)
// is RED as designed; a passing one is a F2 (local-logic) candidate because the
// test likely doesn't exercise the new behaviour yet.
function buildDecisionEvent({ taskId, eventId, exitCode, cmd, ts }) {
  const expected = exitCode !== 0;
  return {
    ts,
    event_id: eventId,
    task_id: taskId,
    type: 'decision',
    payload: {
      decision: expected ? 'red_as_designed' : 'red_unexpectedly_green',
      phase: 'P2_RED',
      exit_code: exitCode,
      cmd_match: (cmd || '').slice(0, 80),
      classifier_hint: expected ? null : 'F2_local_logic',
    },
  };
}

function main() {
  if (!fs.existsSync(ACTIVE_FILE)) return;

  let active;
  try { active = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8')); }
  catch { return; }

  const phase = active.context_anchors && active.context_anchors.current_phase;
  if (phase !== 'P2_RED') return;

  const taskId = active.active && active.active.task;
  if (!taskId) return;

  // STORY-0010: read the command + exit code from the hook's stdin payload (the
  // CLAUDE_TOOL_* env vars this used to read were never set by the hook API). Env
  // kept as a fallback so a host that doesn't populate the payload is unaffected.
  const input = parseStdinJson(readStdinSafely()) || {};
  const cmd = readCommand(input) || process.env.CLAUDE_TOOL_COMMAND || '';
  if (!isTestRunner(cmd)) return;

  const exitCode = readExitCode(input) ?? (parseInt(process.env.CLAUDE_TOOL_EXIT_CODE || '0', 10) || 0);
  const ts = new Date().toISOString();

  // Co-located {taskFolder}/trace.jsonl when the task folder exists, legacy
  // traces/{ID}.jsonl otherwise — resolveTracePaths makes that call (and the
  // legacy mkdir) so both writers always agree on the destination.
  const { traceFile, counterFile } = resolveTracePaths(PLANS_DIR, taskId);

  const event = buildDecisionEvent({
    taskId, eventId: nextEventId(counterFile, taskSlugOf(taskId)), exitCode, cmd, ts,
  });

  try {
    fs.appendFileSync(traceFile, JSON.stringify(event) + '\n');
  } catch (err) {
    process.stderr.write(`[tdd-red-tracker] WARN: trace append failed: ${err.message}\n`);
  }

  if (event.payload.decision === 'red_unexpectedly_green') {
    process.stderr.write(
      `[tdd-red-tracker] RED test passed unexpectedly — task=${taskId}\n` +
      '  this is a F2 candidate; the test may not exercise the new behavior\n',
    );
  }
}

// Run as a hook; stay importable for tests. FEAT-007 / issue #5.
if (require.main === module) {
  main();
} else {
  // nextEventId/resolveTracePaths are re-exported from tool-call-tracer so a
  // caller (or a test) reaching for them here gets the one shared implementation.
  module.exports = { isTestRunner, buildDecisionEvent, nextEventId, resolveTracePaths, taskSlugOf };
}
