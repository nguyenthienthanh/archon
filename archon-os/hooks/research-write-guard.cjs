#!/usr/bin/env node

/**
 * research-write-guard.cjs — keep /archon-os:research plan-only.
 *
 * While THIS session owns an unexpired marker at <cwd>/.claude/research/.active,
 * file-writing tools (Write, Edit, MultiEdit, NotebookEdit) may only touch paths
 * under <cwd>/.claude/research/. Everything else is blocked with exit 2.
 *
 * The marker is written by commands/research.md through Bash:
 *   {"session_id": "$CLAUDE_CODE_SESSION_ID", "slug": "<slug>", "expires_at": "<ISO>"}
 *
 * The marker is found by walking up from the payload cwd. The marker file
 * itself is blocked for file tools (rewriting it would disarm the guard).
 *
 * Fails OPEN on purpose — a guard that wedges every later session is worse
 * than one that misses a write, and the command's closing `git status` check
 * catches what this cannot (Bash redirects are not seen here at all):
 *   - no marker / unparseable marker / empty session_id → allow
 *   - marker owned by another session → allow (a crashed session can't block others)
 *   - marker past expires_at → allow
 *
 * Disable: AF_RESEARCH_GUARD_DISABLED=1
 * Exit codes: 0 allow · 2 block (stderr shown to the model)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { readStdinSafely, parseStdinJson } = require('./lib/safe-stdin.cjs');

const RESEARCH_REL = path.join('.claude', 'research');
const MARKER_REL = path.join(RESEARCH_REL, '.active');
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

const ALLOW = { block: false };

/**
 * Find the marker by walking up from cwd, so a `cd` into a sub-package does not
 * lose it. Returns {marker, root} where root is the dir holding .claude/, or null.
 */
function findMarker(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    const file = path.join(dir, MARKER_REL);
    if (fs.existsSync(file)) {
      try {
        return { marker: JSON.parse(fs.readFileSync(file, 'utf8')), root: dir };
      } catch {
        return null;
      }
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * realpath of the deepest existing ancestor + the not-yet-existing tail.
 * Follows symlinks (a link inside research/ pointing out must not pass) and
 * normalises /tmp vs /private/tmp so legitimate writes are not false-blocked.
 */
function realish(p) {
  let head = p;
  const tail = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(head), ...tail.reverse());
    } catch {
      const up = path.dirname(head);
      if (up === head) return p;
      tail.push(path.basename(head));
      head = up;
    }
  }
}

/**
 * Pure decision. `opts.now` (ms) and `opts.env` are injectable for tests.
 * @returns {{block: boolean, reason?: string}}
 */
function decide(payload, opts = {}) {
  const env = opts.env || process.env;
  const now = opts.now ?? Date.now();
  if (env.AF_RESEARCH_GUARD_DISABLED === '1') return ALLOW;
  if (!payload || !WRITE_TOOLS.has(payload.tool_name)) return ALLOW;

  const cwd = payload.cwd || process.cwd();
  const found = findMarker(cwd);
  if (!found || !found.marker || typeof found.marker !== 'object') return ALLOW;
  const { marker, root: projectRoot } = found;
  if (!marker.session_id || marker.session_id !== payload.session_id) return ALLOW;
  const expires = Date.parse(marker.expires_at);
  if (!Number.isFinite(expires) || expires <= now) return ALLOW;

  const input = payload.tool_input || {};
  const target = input.file_path || input.notebook_path;
  if (!target) return ALLOW;

  const root = realish(path.join(projectRoot, RESEARCH_REL));
  const markerPath = path.join(root, '.active');
  const resolved = realish(path.resolve(cwd, target));
  const inside = resolved.startsWith(root + path.sep);
  // The marker itself is off-limits to file tools: rewriting expires_at would disarm the guard.
  if (inside && resolved !== markerPath) return ALLOW;

  return {
    block: true,
    reason:
      `research session "${marker.slug || '?'}" is plan-only: writes are allowed only under ${RESEARCH_REL}/ ` +
      `(blocked: ${path.relative(projectRoot, resolved) || resolved}). ` +
      'Finish the plan, or end the session with `/archon-os:research done`.',
  };
}

function main() {
  try {
    const payload = parseStdinJson(readStdinSafely());
    const r = decide(payload);
    if (r.block) {
      process.stderr.write(`⛔ ${r.reason}\n`);
      process.exit(2);
    }
  } catch {
    // fail open
  }
  process.exit(0);
}

if (require.main === module) main();

module.exports = { decide, MARKER_REL, WRITE_TOOLS };
