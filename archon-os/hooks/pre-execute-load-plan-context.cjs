#!/usr/bin/env node
/**
 * Aura Frog — Pre-Execute: Load Plan Context
 *
 * Fires: PreToolUse (Bash | Edit | Write | Read)
 * Purpose: Load minimum hierarchical plan context (.claude/plans/) so the
 *          executing agent has current focus + ancestors.
 *
 * Behavior:
 *   - If .claude/plans/active.json doesn't exist → exit silently (no plan = no overhead)
 *   - Otherwise, read active.json and emit a brief context block to stderr
 *     (Claude sees stderr; user usually doesn't unless verbose)
 *   - Stamp loaded plan content with `trust: plan` semantically (rule reference)
 *
 * Token budget target: ≤800 tokens always-loaded (per spec §9.1).
 *
 * Exit codes:
 *   0 — success (silent or with context output)
 *   never blocks (this is a context-loader, not a guard)
 *
 * @version 1.0.0 (v3.7.0-alpha.1)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const resolvePlansDir = require('./lib/plans-dir.cjs');

const PLANS_DIR = resolvePlansDir();
const ACTIVE_FILE = path.join(PLANS_DIR, 'active.json');

function safeExit(code = 0) {
  process.exit(code);
}

// Pure: compose the minimal plan-context lines from a parsed active.json. The
// order (mission → initiative → feature → story → task → phase → frozen)
// is the display order Claude reads.
function composeContextLines(active) {
  const lines = [];
  const a = (active && active.active) || {};

  if (a.mission) lines.push(`Mission: ${a.mission}`);
  if (a.initiative) lines.push(`Initiative: ${a.initiative}`);
  if (a.feature) lines.push(`Feature: ${a.feature}`);
  if (a.story) lines.push(`Story: ${a.story}`);
  if (a.task) lines.push(`Task: ${a.task}`);

  if (active && active.context_anchors && active.context_anchors.current_phase) {
    lines.push(`Phase: ${active.context_anchors.current_phase}`);
  }
  if (active && Array.isArray(active.frozen) && active.frozen.length > 0) {
    lines.push(`Frozen: ${active.frozen.length} node(s) — see /archon-os:plan-conflicts`);
  }
  // No "Ready: N queued" line: active.json's ready_queue was a vestigial field
  // nothing maintains (next-task.sh rescans task files each call).
  return lines;
}

function main() {
  if (!fs.existsSync(ACTIVE_FILE)) return;

  let active;
  try { active = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8')); }
  catch (err) {
    process.stderr.write(`[plan-context] WARN: active.json malformed: ${err.message}\n`);
    return;
  }

  const lines = composeContextLines(active);
  // Claude reads stderr; the user doesn't see it by default.
  if (lines.length > 0) {
    process.stderr.write(`[plan-context | trust:plan]\n  ${lines.join('\n  ')}\n`);
  }
}

// Run as a hook; stay importable for tests. FEAT-007 / issue #5.
if (require.main === module) {
  main();
} else {
  module.exports = { composeContextLines };
}
