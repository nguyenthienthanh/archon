#!/usr/bin/env node
/**
 * Archon OS — Feature Done → Archive Trigger
 *
 * Fires: PostToolUse (Edit | Write)
 * Purpose: When a T2 (Feature) plan node transitions to status: done, emit a
 *          hint that epic-summarizer + plan-archivist should run (master-planner
 *          decides actual invocation; this hook only signals the boundary).
 *
 * Behavior:
 *   - Silent if .claude/plans/active.json missing or active.feature null
 *   - Reads the active feature node file; checks its frontmatter status
 *   - When status is `done` and no feature_done_detected / epic_summarized
 *     event exists yet for this feature in history.jsonl:
 *     - Append history.jsonl event: feature_done_detected (fired-once guard)
 *     - Emit stderr suggestion: "T2 done — invoke /archon-os:reset-session to distill Epic"
 *
 * Detection method:
 *   - Frontmatter status of the feature's node file (nothing in the engine
 *     writes status-transition history events, so history is only consulted
 *     for the fired-once / already-summarized guard)
 *
 * Exit codes:
 *   0 — always (informational)
 *
 * @version 1.1.0 (frontmatter-status detection + fired-once guard)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const resolvePlansDir = require('./lib/plans-dir.cjs');
const { readJsonlTail } = require('./lib/jsonl-tail.cjs');

const PLANS_DIR = resolvePlansDir();
const ACTIVE_FILE = path.join(PLANS_DIR, 'active.json');
const HISTORY_FILE = path.join(PLANS_DIR, 'history.jsonl');

function safeExit(code = 0) { process.exit(code); }

// Pure: fire only when the feature's node file says status: done AND history
// carries neither a feature_done_detected (we already nagged — fired-once
// guard against re-firing on every Edit/Write) nor an epic_summarized event
// for this feature. Status comes from frontmatter because nothing in the
// engine writes status-transition events to history.jsonl.
function shouldTriggerArchive(historyLines, featureId, featureStatus) {
  if (featureStatus !== 'done') return false;

  for (let i = historyLines.length - 1; i >= 0; i--) {
    let evt;
    try { evt = JSON.parse(historyLines[i]); } catch { continue; }
    if (evt.node !== featureId) continue;
    if (evt.event === 'feature_done_detected' || evt.event === 'epic_summarized') return false;
  }

  return true;
}

// I/O: locate the feature's node file (v3.7.3+ layout: features/{ID}_{slug}/
// feature.md, possibly nested under subfeatures/) by walking features/ and
// matching the `id:` frontmatter. Returns its frontmatter status, or null.
function readFeatureStatus(plansDir, featureId) {
  const featuresRoot = path.join(plansDir, 'features');
  if (!fs.existsSync(featuresRoot)) return null;
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (!ent.isDirectory()) continue;
      const candidate = path.join(full, 'feature.md');
      if (fs.existsSync(candidate)) {
        try {
          const body = fs.readFileSync(candidate, 'utf8');
          const idMatch = body.match(/^id:\s*(.+?)\s*$/m);
          if (idMatch && idMatch[1].trim().replace(/^["']|["']$/g, '') === featureId) {
            const statusMatch = body.match(/^status:\s*(.+?)\s*$/m);
            return statusMatch ? statusMatch[1].trim().replace(/^["']|["']$/g, '') : null;
          }
        } catch { /* skip */ }
      }
      const sub = walk(full);
      if (sub !== null) return sub;
    }
    return null;
  };
  return walk(featuresRoot);
}

function main() {
  if (!fs.existsSync(ACTIVE_FILE) || !fs.existsSync(HISTORY_FILE)) return;

  let active;
  try { active = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8')); }
  catch { return; }

  const featureId = active.active && active.active.feature;
  if (!featureId) return;

  // Bounded tail: shouldTriggerArchive walks newest-first and breaks on the
  // first event mentioning this feature, so only the trailing window is ever
  // consulted. A feature whose last transition scrolled out of the window is
  // by definition not a *fresh* done — the case this hook exists to catch.
  const lines = readJsonlTail(HISTORY_FILE);

  if (!shouldTriggerArchive(lines, featureId, readFeatureStatus(PLANS_DIR, featureId))) return;

  try {
    fs.appendFileSync(HISTORY_FILE, JSON.stringify({
      ts: new Date().toISOString(),
      node: featureId,
      event: 'feature_done_detected',
      actor: 'feature-done-trigger-archive',
    }) + '\n');
  } catch {/* best-effort */}

  process.stderr.write(
    `[feature-done] ${featureId} reached status: done\n` +
    '  Run /archon-os:reset-session to distill into permanent_memory and start fresh.\n',
  );
}

// Run as a hook; stay importable for tests. FEAT-007 / issue #5.
if (require.main === module) {
  main();
} else {
  module.exports = { shouldTriggerArchive, readFeatureStatus };
}
