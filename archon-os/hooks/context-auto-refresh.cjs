#!/usr/bin/env node
'use strict';
/**
 * context-auto-refresh.cjs — Self-healing project-context snapshot refresher.
 * FEAT-008 / STORY-0015.
 *
 * Fires on a lifecycle event (Stop). When the durable snapshot has gone stale
 * because watched dirs (agents/skills/rules/commands/hooks/...) changed, this
 * hook regenerates it — so the next session reuses a fresh snapshot instead of
 * re-scanning the codebase. Debounced so it never thrashes on rapid events.
 *
 * Best-effort + non-blocking: any failure is swallowed; the hook always exits 0.
 * Disable with AF_CONTEXT_AUTO_REFRESH_DISABLED=true.
 *
 * Decision logic (shouldRefresh) is a pure function for testability; the
 * side-effecting regeneration is delegated to context-snapshot.cjs.
 */

const fs = require('fs');
const path = require('path');

// Don't refresh more than once per minute, regardless of event frequency.
const DEBOUNCE_MS = 60 * 1000;

/**
 * Pure decision: should we regenerate the snapshot now?
 * @param {{fresh:boolean,lastRefreshMs:number,nowMs:number,debounceMs:number,disabled:boolean}} o
 */
function shouldRefresh({ fresh, lastRefreshMs, nowMs, debounceMs, disabled }) {
  if (disabled) return false;
  if (fresh) return false;                                   // snapshot still valid
  if (nowMs - (lastRefreshMs || 0) < debounceMs) return false; // anti-thrash
  return true;
}

/** Read the last-refresh timestamp (ms) from a marker file; 0 if absent/unreadable. */
function readLastRefresh(markerPath) {
  try {
    const data = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    return Number(data.lastRefreshMs) || 0;
  } catch (_) {
    return 0;
  }
}

/** Persist the last-refresh timestamp (ms) to a marker file (best-effort). */
function writeLastRefresh(markerPath, ms) {
  try {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, JSON.stringify({ lastRefreshMs: ms }, null, 2));
    return true;
  } catch (_) {
    return false;
  }
}

function markerPathFor(projectRoot) {
  return path.join(path.resolve(projectRoot), '.claude', 'cache', 'context-refresh.json');
}

/** Hook entry — best-effort, always exits 0. */
function main() {
  try {
    const disabled = process.env.AF_CONTEXT_AUTO_REFRESH_DISABLED === 'true';
    const projectRoot = '.';
    const snap = require('../scripts/context-snapshot.cjs');

    // Only act if a snapshot already exists (don't auto-create one uninvited).
    const meta = snap.readSnapshotMeta(projectRoot);
    if (!meta) return;

    const marker = markerPathFor(projectRoot);
    const decision = shouldRefresh({
      fresh: snap.isSnapshotFresh(projectRoot),
      lastRefreshMs: readLastRefresh(marker),
      nowMs: Date.now(),
      debounceMs: DEBOUNCE_MS,
      disabled,
    });

    if (!decision) return;

    const res = snap.generateSnapshot(projectRoot, { runGenerators: true });
    writeLastRefresh(marker, Date.now());
    const at = (res.gitHead || 'no-git').substring(0, 12);
    console.log(`📸 Auto-refreshed stale project snapshot (git ${at}) — next session reuses it, no re-scan.`);
  } catch (_) {
    /* non-blocking */
  }
}

module.exports = {
  shouldRefresh,
  readLastRefresh,
  writeLastRefresh,
  markerPathFor,
  DEBOUNCE_MS,
};

if (require.main === module) {
  // Best-effort: consume any stdin the runtime pipes, then decide.
  try {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => { main(); process.exit(0); });
    // If no stdin is attached, don't hang.
    process.stdin.on('error', () => { main(); process.exit(0); });
    setTimeout(() => { main(); process.exit(0); }, 50);
  } catch (_) {
    main();
    process.exit(0);
  }
}
