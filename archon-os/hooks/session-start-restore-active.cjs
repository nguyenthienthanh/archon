#!/usr/bin/env node
/**
 * Archon OS — SessionStart: Restore Active Plan
 *
 * Fires: SessionStart (startup, resume, clear, compact)
 * Purpose: On every new session, re-announce the active plan focus so the
 *          model picks up where it left off — survives /compact and session
 *          reset gracefully.
 *
 * Behavior:
 *   - If .claude/plans/ doesn't exist → silent
 *   - Otherwise, read active.json and emit a single banner line to stderr
 *   - Append a session_start event to history.jsonl (audit trail)
 *
 * Exit codes:
 *   0 — always (never blocks session start)
 *
 * @version 1.0.0 (v3.7.0-alpha.1)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const resolvePlansDir = require('./lib/plans-dir.cjs');

const PLANS_DIR = resolvePlansDir();
const ACTIVE_FILE = path.join(PLANS_DIR, 'active.json');
const HISTORY_FILE = path.join(PLANS_DIR, 'history.jsonl');

// Pure: the "active plan" banner parts for a parsed active.json. Feature wins
// over initiative wins over mission; story/task hang off a feature. Empty array
// when there is no active anchor to show.
function composeBanner(active) {
  const a = (active && active.active) || {};
  const banner = [];
  if (a.feature) {
    banner.push(`🦉 Active plan: ${a.feature}`);
    if (a.story) banner.push(`Story: ${a.story}`);
    if (a.task) banner.push(`Task: ${a.task}`);
  } else if (a.initiative) {
    banner.push(`🦉 Active plan: ${a.initiative}`);
  } else if (a.mission) {
    banner.push(`🦉 Active mission: ${a.mission}`);
  }
  return banner;
}

function main() {
  if (!fs.existsSync(ACTIVE_FILE)) return;

  let active;
  try { active = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8')); }
  catch (err) {
    process.stderr.write(`[plan-restore] WARN: active.json malformed: ${err.message}\n`);
    return;
  }

  const banner = composeBanner(active);
  if (banner.length > 0) {
    process.stderr.write(`${banner.join(' · ')}\n`);
    process.stderr.write('Run /archon-os:plan-status for tree, /archon-os:plan-next for next ready task.\n');
  }

  // Append session_start event to history.jsonl (audit trail).
  try {
    fs.appendFileSync(HISTORY_FILE, JSON.stringify({
      ts: new Date().toISOString(),
      event: 'session_start',
      active: (active && active.active) || {},
    }) + '\n');
  } catch (_err) {
    // Don't block session start on log write failure.
  }
}

// Run as a hook; stay importable for tests. FEAT-007 / issue #5.
if (require.main === module) {
  main();
} else {
  module.exports = { composeBanner };
}
