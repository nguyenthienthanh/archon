#!/usr/bin/env node
/**
 * Aura Frog — Pending-Confirm Timeout Warning
 *
 * Fires: SessionStart (and as a periodic check via session-start cascade)
 * Purpose: Warn the user about T4 tasks that have been in pending-confirm
 *          status for more than the configured timeout (default 24h).
 *          Stale pending tasks block dispatch of new sibling tasks via
 *          conflict detection — easy to forget about.
 *
 * Configuration env:
 *   AF_PENDING_TIMEOUT_HOURS=24  — threshold (default 24h)
 *
 * Behavior:
 *   - Silent if no .claude/plans/
 *   - Walk all T4 task files, check status + ages
 *   - For tasks in status: planned (interpreted as pending-confirm in this
 *     codebase) older than threshold, emit a warning
 *   - For tasks in status: frozen older than threshold, also warn
 *   - Cap at 5 surfaced items (the rest get a "+N more" tail)
 *
 * Exit codes:
 *   0 — always
 *
 * @version 1.0.0 (v3.7.0-beta.2)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const resolvePlansDir = require('./lib/plans-dir.cjs');

const PLANS_DIR = resolvePlansDir();
const FEATURES_DIR = path.join(PLANS_DIR, 'features');
const TIMEOUT_HOURS = parseInt(process.env.AF_PENDING_TIMEOUT_HOURS || '24', 10);
const TIMEOUT_MS = TIMEOUT_HOURS * 3600 * 1000;
const MAX_SHOWN = 5;

function parseFrontmatterField(content, field) {
  const re = new RegExp(`^${field}:\\s*(.+)$`, 'm');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

// Pure: decide whether one task file is a stale T4 task worth surfacing.
// Returns the record, or null when it should be skipped. `displayPath` is the
// (already project-relative) path echoed back in the record.
function evaluateTaskFile(content, displayPath, { now, timeoutMs }) {
  if (!content || !content.startsWith('---')) return null;

  const status = parseFrontmatterField(content, 'status');
  const tier = parseFrontmatterField(content, 'tier');
  const updatedAt = parseFrontmatterField(content, 'updated_at');
  const id = parseFrontmatterField(content, 'id');

  if (!id) return null;
  if (tier !== '4') return null;                                   // only T4 tasks
  if (status !== 'planned' && status !== 'frozen' && status !== 'blocked') return null;
  if (!updatedAt) return null;

  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return null;

  const ageMs = now - ts;
  if (ageMs < timeoutMs) return null;

  return { id, status, age_hours: Math.round(ageMs / 3600000), file: displayPath };
}

// Pure: sort + cap the stale records and render the warning block. Returns null
// when there is nothing to warn about.
function formatWarning(stale, { timeoutHours, maxShown }) {
  if (!stale || stale.length === 0) return null;

  const sorted = [...stale].sort((a, b) => b.age_hours - a.age_hours);
  const lines = sorted.slice(0, maxShown).map(
    (s) => `  ${s.id} [${s.status}] ${s.age_hours}h old (${s.file})`,
  );
  if (sorted.length > maxShown) {
    lines.push(`  ... +${sorted.length - maxShown} more stale T4 task(s)`);
  }

  return (
    `[pending-confirm-timeout] ${sorted.length} T4 task(s) idle > ${timeoutHours}h:\n` +
    lines.join('\n') + '\n' +
    '  Resolve via /archon-os:plan-status, /archon-os:plan-thaw, or /archon-os:plan-replan.\n'
  );
}

function collectStale(dir, opts) {
  const out = [];
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.isFile() || !e.name.endsWith('.md')) continue;
      let content;
      try { content = fs.readFileSync(p, 'utf8'); } catch { continue; }
      const rec = evaluateTaskFile(content, path.relative(process.cwd(), p), opts);
      if (rec) out.push(rec);
    }
  };
  walk(dir);
  return out;
}

function main() {
  if (!fs.existsSync(FEATURES_DIR)) return;
  const opts = { now: Date.now(), timeoutMs: TIMEOUT_MS };
  const stale = collectStale(FEATURES_DIR, opts);
  const msg = formatWarning(stale, { timeoutHours: TIMEOUT_HOURS, maxShown: MAX_SHOWN });
  if (msg) process.stderr.write(msg);
}

// Run as a hook; stay importable for tests. Previously the walk + warning ran at
// module scope with a process.exit() on require, so none of it was testable.
// FEAT-007 / issue #5.
if (require.main === module) {
  main();
} else {
  module.exports = { parseFrontmatterField, evaluateTaskFile, formatWarning };
}
