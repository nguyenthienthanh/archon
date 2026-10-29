#!/usr/bin/env node
/**
 * Archon OS — Post-Execute Conflict Rescan
 *
 * Fires: PostToolUse (Edit | Write) async
 * Purpose: When a blocker task transitions to `done`, scan frozen siblings
 *          that conflict with it. Auto-thaw if compatible, mark replan_required
 *          if incompatible (per spec §21.6).
 *
 * Behavior:
 *   - Silent if no .claude/plans/conflicts.jsonl / history.jsonl or no recent
 *     execution_completed event in history.jsonl
 *   - For each conflict in conflicts.jsonl with resolution: null AND a
 *     participant whose status just transitioned to done → run compatibility
 *     check via git diff
 *   - Emit recommendation to stderr (auto_thaw or auto_discard); actual
 *     mutation is conflict-arbiter's job
 *
 * Exit codes:
 *   0 — always (advisory; doesn't block)
 *
 * @version 1.1.0 (FEAT-007 / issue #5 — importable + pure logic extracted)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TIMEOUT_SLOW_MS, MAX_BUFFER_LARGE, warnExecLimit } = require('./lib/exec.cjs');
const resolvePlansDir = require('./lib/plans-dir.cjs');
const { readJsonlTail } = require('./lib/jsonl-tail.cjs');

const PLANS_DIR = resolvePlansDir();
const HISTORY_FILE = path.join(PLANS_DIR, 'history.jsonl');
const CONFLICTS_FILE = path.join(PLANS_DIR, 'conflicts.jsonl');
const RESCAN_WINDOW_MS = 60 * 1000;

// Pure: newest-first scan of history lines for execution_completed(exit 0) events
// within the window. Returns a Set of node ids. History is chronological (newest
// last), so the scan stops at the first out-of-window event. The exit_code gate
// only became meaningful once post-execute-update-node read the real exit code
// from stdin (STORY-0010) — before that every event carried a bogus 0.
// NOTE: execution_completed means "a tool call finished while this task was
// active", NOT "the task is done" — callers must confirm the node's frontmatter
// status is actually `done` (see filterActuallyDone) before treating it as a
// finished blocker.
function collectRecentDoneTasks(historyLines, { now, windowMs }) {
  const done = new Set();
  for (let i = historyLines.length - 1; i >= 0; i--) {
    let evt;
    try { evt = JSON.parse(historyLines[i]); } catch { continue; }
    const ts = Date.parse(evt.ts || '');
    if (!Number.isFinite(ts) || (now - ts) > windowMs) break;
    if (evt.event === 'execution_completed' && evt.exit_code === 0 && evt.node) {
      done.add(evt.node);
    }
  }
  return done;
}

// Pure: keep only the task ids whose actual node status is `done`, per the
// injected statusOf(taskId) resolver. Guards the §21.6 "blocker transitions to
// done" precondition — a successful tool call alone is not a done transition.
function filterActuallyDone(taskIds, statusOf) {
  const done = new Set();
  for (const id of taskIds) {
    if (statusOf(id) === 'done') done.add(id);
  }
  return done;
}

// Pure: fold conflicts.jsonl (append-only, may have many lines per conflict) to
// the latest record per conflict_id. Malformed / id-less lines are skipped.
function foldLatestConflicts(conflictLines) {
  const latest = new Map();
  for (const line of conflictLines) {
    try {
      const c = JSON.parse(line);
      if (c.conflict_id) latest.set(c.conflict_id, c);
    } catch {/* skip */}
  }
  return latest;
}

// Pure: given a conflict and the set of just-done tasks, identify the blocker
// (a participant that just finished) and its frozen pending-confirm sibling.
// Returns {blocker, frozen} or null when this conflict isn't actionable (already
// resolved, no just-done participant, or no frozen sibling).
function findRescanPair(conflict, recentDoneTasks) {
  if (!conflict || conflict.resolution) return null;
  const participants = conflict.participants || [];
  const blocker = participants.find(p => p && recentDoneTasks.has(p.task));
  if (!blocker) return null;
  const frozen = participants.find(p =>
    p && p.task !== blocker.task && p.role === 'pending-confirm'
  );
  if (!frozen) return null;
  return { blocker, frozen };
}

// Pure: map a compatibility verdict (true / false / null-unknown) to the
// recommendation string.
function recommendationFor(compatible) {
  if (compatible === true) return 'auto_thaw';
  if (compatible === false) return 'auto_discard';
  return 'inconclusive — manual /archon-os:plan-thaw recommended';
}

// Pure: build the advisory history event for a recommendation.
function buildRescanEvent({ conflictId, blocker, frozen, recommendation, ts }) {
  return {
    ts,
    conflict_id: conflictId,
    event: 'conflict_rescan_recommendation',
    blocker,
    frozen,
    recommendation,
    actor: 'post-execute-conflict-rescan',
  };
}

// I/O: locate a task's node folder (v3.7.3+ layout:
// features/.../stories/.../tasks/{ID}_{slug}/task.md) by walking features/ and
// matching the `id:` frontmatter. Same walk as tool-call-tracer.cjs.
function resolveTaskFolder(plansDir, id) {
  const featuresRoot = path.join(plansDir, 'features');
  if (!fs.existsSync(featuresRoot)) return null;
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const candidate = path.join(full, 'task.md');
        if (fs.existsSync(candidate)) {
          try {
            const body = fs.readFileSync(candidate, 'utf8');
            const m = body.match(/^id:\s*(.+?)\s*$/m);
            if (m && m[1].trim().replace(/^["']|["']$/g, '') === id) return full;
          } catch { /* skip */ }
        }
        const sub = walk(full);
        if (sub) return sub;
      }
    }
    return null;
  };
  return walk(featuresRoot);
}

// I/O: a task's frontmatter `status:` value, or null when unresolvable.
function readTaskStatus(plansDir, id) {
  const folder = resolveTaskFolder(plansDir, id);
  if (!folder) return null;
  try {
    const body = fs.readFileSync(path.join(folder, 'task.md'), 'utf8');
    const m = body.match(/^status:\s*(.+?)\s*$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

// I/O: latest checkpoint file for a task. v3.7.3+ _lib.sh save_checkpoint
// co-locates checkpoints inside the node folder as
// <node_folder>/checkpoints/<ISO-with-dashes>.json (timestamp-only filename).
// Fallbacks: the global plans/checkpoints/{ID}_legacy/ dir (orphan nodes), then
// the pre-v3.7.3 flat plans/checkpoints/{ID}.{ISO}.json files.
function latestCheckpointFile(plansDir, blockerTask) {
  const newestJson = (dir, filter) => {
    let files;
    try { files = fs.readdirSync(dir); } catch { return null; }
    const matches = files.filter(filter).sort().reverse();
    return matches.length > 0 ? path.join(dir, matches[0]) : null;
  };

  const folder = resolveTaskFolder(plansDir, blockerTask);
  if (folder) {
    const hit = newestJson(path.join(folder, 'checkpoints'), f => f.endsWith('.json'));
    if (hit) return hit;
  }
  const globalDir = path.join(plansDir, 'checkpoints');
  const legacyHit = newestJson(path.join(globalDir, `${blockerTask}_legacy`), f => f.endsWith('.json'));
  if (legacyHit) return legacyHit;
  return newestJson(globalDir, f => f.startsWith(`${blockerTask}.`) && f.endsWith('.json'));
}

// I/O: compatibility check — did the blocker's actual output (git diff since its
// latest checkpoint) still touch the frozen sibling's planned files? Returns
// true (compatible), false (still overlaps), or null (couldn't determine).
function checkCompatibility(plansDir, blockerTask, plannedFiles) {
  try {
    const checkpoint = latestCheckpointFile(plansDir, blockerTask);
    if (!checkpoint) return null;
    const cp = JSON.parse(fs.readFileSync(checkpoint, 'utf8'));
    if (!cp.git_sha) return null;
    // The checkpoint JSON is written by other hooks and lives on disk, so its
    // git_sha is not trusted input: anything that reaches a shell here would run
    // as the user. Shape-check it first (same guard as project-cache's
    // getGitHead), then hand it to git as an argv element so no shell parses it.
    if (!/^[0-9a-f]{7,40}$/i.test(cp.git_sha)) return null;
    // A stale checkpoint sha can span thousands of commits, so this diff is the
    // largest git output any hook asks for — slow tier + large buffer.
    const diff = execFileSync('git', ['diff', '--name-only', `${cp.git_sha}..HEAD`], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: TIMEOUT_SLOW_MS,
      killSignal: 'SIGKILL',
      maxBuffer: MAX_BUFFER_LARGE
    }).trim();
    const changed = diff.split('\n').filter(Boolean);
    return !changed.some(f => plannedFiles.includes(f));
  } catch (e) {
    warnExecLimit('conflict-rescan git diff', e);
    return null;
  }
}

function main() {
  if (!fs.existsSync(CONFLICTS_FILE) || !fs.existsSync(HISTORY_FILE)) return;

  // Bounded tails. History: collectRecentDoneTasks breaks at the first event
  // older than RESCAN_WINDOW_MS, so it never looks past the tail. Conflicts:
  // foldLatestConflicts wants the LATEST record per conflict_id, and in an
  // append-only log the latest record is the last one — reading the tail keeps
  // exactly the records a rescan can act on.
  const historyLines = readJsonlTail(HISTORY_FILE);

  // Candidates are tasks with recent tool activity; a task only counts as a
  // finished blocker once its node file's status actually reads `done`.
  const recentCandidates = collectRecentDoneTasks(historyLines, { now: Date.now(), windowMs: RESCAN_WINDOW_MS });
  if (recentCandidates.size === 0) return;
  const recentDoneTasks = filterActuallyDone(recentCandidates, id => readTaskStatus(PLANS_DIR, id));
  if (recentDoneTasks.size === 0) return;

  const conflictLines = readJsonlTail(CONFLICTS_FILE);

  const recommendations = [];
  for (const [cid, conflict] of foldLatestConflicts(conflictLines)) {
    const pair = findRescanPair(conflict, recentDoneTasks);
    if (!pair) continue;
    const plannedFiles = (conflict.overlap && conflict.overlap.files) || [];
    const compatible = checkCompatibility(PLANS_DIR, pair.blocker.task, plannedFiles);
    recommendations.push({
      conflict_id: cid,
      blocker: pair.blocker.task,
      frozen: pair.frozen.task,
      recommendation: recommendationFor(compatible),
    });
  }

  if (recommendations.length === 0) return;

  const lines = recommendations.map(r =>
    `  ${r.conflict_id}: blocker=${r.blocker} done; frozen=${r.frozen} → ${r.recommendation}`
  );
  process.stderr.write(`[conflict-rescan] ${recommendations.length} pending decision(s):\n${lines.join('\n')}\n`);

  // Append advisory history events (arbiter agent applies the actual mutation).
  const ts = new Date().toISOString();
  for (const r of recommendations) {
    try {
      fs.appendFileSync(HISTORY_FILE, JSON.stringify(buildRescanEvent({
        conflictId: r.conflict_id, blocker: r.blocker, frozen: r.frozen, recommendation: r.recommendation, ts,
      })) + '\n');
    } catch {/* best-effort */}
  }
}

// Run as a hook; stay importable for tests. Previously the entire rescan ran at
// module scope with process.exit() on require. FEAT-007 / issue #5.
if (require.main === module) {
  main();
} else {
  module.exports = {
    collectRecentDoneTasks, filterActuallyDone, foldLatestConflicts, findRescanPair,
    recommendationFor, buildRescanEvent, latestCheckpointFile, readTaskStatus,
    checkCompatibility,
  };
}
