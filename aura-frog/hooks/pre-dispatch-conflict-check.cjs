#!/usr/bin/env node
/**
 * Aura Frog — Pre-Dispatch Conflict Check
 *
 * Fires: PreToolUse (Edit | Write | Bash) — when proposed tool calls would
 *        mutate files that a pending-confirm sibling task also targets.
 * Purpose: Run conflict-detector L1+L2 before T4 dispatch. If conflict
 *          detected and confidence is high, write a CONFLICT-NNNNN record
 *          to .claude/plans/conflicts.jsonl and emit a hint to invoke
 *          conflict-arbiter.
 *
 * Behavior:
 *   - Silent if no .claude/plans/active.json or active.task null
 *   - Resolve siblings under same parent T3 with status: planned (pending-confirm)
 *   - Run scripts/conflicts/check-l1-files.sh
 *   - On L1 overlap with confidence < 0.95 → also run check-l2-syntactic.sh
 *   - On any conflict → mint CONFLICT-NNNNN, append conflicts.jsonl, emit
 *     stderr hint + history.jsonl event
 *
 * Anti-block: this hook is informational + state-recording. Actual blocking
 * happens through master-planner reading the conflicts.jsonl record. This
 * keeps the hook fast and the policy in one place (conflict-arbiter).
 *
 * Exit codes:
 *   0 — always (records state; doesn't block tool calls directly)
 *
 * @version 1.0.0 (v3.7.0-beta.2)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const resolvePlansDir = require('./lib/plans-dir.cjs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');
const PLANS_DIR = resolvePlansDir();
const ACTIVE_FILE = path.join(PLANS_DIR, 'active.json');
const HISTORY_FILE = path.join(PLANS_DIR, 'history.jsonl');
const CONFLICTS_FILE = path.join(PLANS_DIR, 'conflicts.jsonl');
const COUNTERS_FILE = path.join(PLANS_DIR, '.counters.json');
const L1_SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'conflicts', 'check-l1-files.sh');
const L2_SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'conflicts', 'check-l2-syntactic.sh');

function safeExit(code = 0) { process.exit(code); }

// A sibling task counts as pending-confirm (and therefore a conflict candidate)
// when it is planned, blocked, or blocked-on-confirm. Pure.
function isPendingStatus(status) {
  return status === 'planned' || status === 'blocked' || status === 'blocked-on-confirm';
}

// Pure: assemble the conflicts.jsonl record from the detector output. Kept
// separate from the file append so its exact shape can be pinned by a test.
function buildConflictRecord({ taskId, detectedLayer, conflictPayload, conflictId, ts }) {
  return {
    conflict_id: conflictId,
    detected_at: ts,
    detected_by: 'pre-dispatch-conflict-check.cjs',
    layer: detectedLayer,
    type: detectedLayer === 'L1' ? 'file_overlap' : 'function_overlap',
    participants: [
      { task: taskId, role: 'proposed' },
      ...(conflictPayload.with || []).map((s) => ({ task: s, role: 'pending-confirm' })),
    ],
    overlap: {
      files: conflictPayload.files || null,
      functions: conflictPayload.functions || null,
      schema_elements: null,
    },
    confidence: conflictPayload.confidence || 1.0,
    arbitration: null,
    actions_taken: [],
    resolution: null,
    resolved_at: null,
  };
}

// Find sibling tasks under the same Story, in a pending-confirm status.
function findSiblings(taskId, storyId) {
  const siblings = [];
  try {
    const featuresDir = path.join(PLANS_DIR, 'features');
    if (!fs.existsSync(featuresDir)) return [];
    for (const featDir of fs.readdirSync(featuresDir)) {
      const tasksDir = path.join(featuresDir, featDir, 'stories', storyId, 'tasks');
      if (!fs.existsSync(tasksDir)) continue;
      for (const f of fs.readdirSync(tasksDir)) {
        if (!f.endsWith('.md')) continue;
        const sid = f.replace(/\.md$/, '');
        if (sid === taskId) continue;
        const content = fs.readFileSync(path.join(tasksDir, f), 'utf8');
        const m = content.match(/^status:[\s]*(\w+)/m);
        if (isPendingStatus(m ? m[1] : 'unknown')) siblings.push(sid);
      }
    }
  } catch {/* best-effort */}
  return siblings;
}

// Mint CONFLICT-NNNNN under the shared counter lock so concurrent dispatches
// (and bash mutators) never mint a duplicate id.
function nextConflictId() {
  const { nextCounter } = require('./lib/js-counter.cjs');
  const n = nextCounter(COUNTERS_FILE, 'CONFLICT');
  // Lock-timeout fallback (extremely rare): a time-derived value keeps the id
  // unique-enough for a best-effort, fail-open hook rather than colliding.
  const val = n === null ? (Date.now() % 100000) : n;
  return `CONFLICT-${String(val).padStart(5, '0')}`;
}

function main() {
  if (!fs.existsSync(ACTIVE_FILE)) return;

  let active;
  try { active = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8')); }
  catch { return; }

  const taskId = active.active && active.active.task;
  const storyId = active.active && active.active.story;
  if (!taskId || !storyId) return;
  if (!fs.existsSync(L1_SCRIPT)) return;

  const siblings = findSiblings(taskId, storyId);
  if (siblings.length === 0) return;

  const l1Result = spawnSync('bash', [
    L1_SCRIPT, '--task', taskId, '--siblings', siblings.join(','),
  ], { encoding: 'utf-8', timeout: 1000, cwd: process.cwd() });

  let l1Output;
  try { l1Output = JSON.parse(l1Result.stdout || '{}'); }
  catch { return; }

  if (!l1Output.overlap) return;

  let detectedLayer = 'L1';
  let conflictPayload = l1Output;

  // If L1 confidence not high enough, drill into L2.
  if (l1Output.confidence < 0.95 && fs.existsSync(L2_SCRIPT) && l1Output.files) {
    const l2Result = spawnSync('bash', [
      L2_SCRIPT, '--files', l1Output.files.join(','),
    ], { encoding: 'utf-8', timeout: 2000, cwd: process.cwd() });

    let l2Output;
    try { l2Output = JSON.parse(l2Result.stdout || '{}'); }
    catch { l2Output = {}; }

    if (l2Output.overlap) {
      detectedLayer = 'L2';
      conflictPayload = { ...l1Output, ...l2Output };
    }
  }

  const conflictId = nextConflictId();
  const ts = new Date().toISOString();
  const record = buildConflictRecord({ taskId, detectedLayer, conflictPayload, conflictId, ts });

  try {
    fs.appendFileSync(CONFLICTS_FILE, JSON.stringify(record) + '\n');
  } catch (err) {
    process.stderr.write(`[pre-dispatch-conflict] WARN: conflicts.jsonl append failed: ${err.message}\n`);
    return;
  }

  try {
    fs.appendFileSync(HISTORY_FILE, JSON.stringify({
      ts, node: taskId, event: 'conflict_detected',
      conflict_id: conflictId, layer: detectedLayer, actor: 'pre-dispatch-conflict-check',
    }) + '\n');
  } catch {/* best-effort */}

  process.stderr.write(
    `[conflict-detected] ${conflictId} (${detectedLayer}) — ${taskId} overlaps ${(conflictPayload.with || []).join(', ')}\n` +
    `  files: ${(conflictPayload.files || []).join(', ')}\n` +
    `  Run /archon-os:plan-conflicts show ${conflictId} for details, or wait for conflict-arbiter to decide.\n`,
  );
}

// Run as a hook; stay importable for tests. Previously the entire detection
// pipeline ran at module scope with a process.exit() on require. FEAT-007 / #5.
if (require.main === module) {
  main();
} else {
  module.exports = { isPendingStatus, buildConflictRecord, findSiblings };
}
