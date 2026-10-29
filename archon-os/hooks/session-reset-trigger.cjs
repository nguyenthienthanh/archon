#!/usr/bin/env node
/**
 * Archon OS — Session Reset Trigger
 *
 * Fires: PostToolUse (Write)
 * Purpose: After epic-summarizer writes a new section to permanent_memory.md,
 *          surface a one-line prompt suggesting the user run /archon-os:reset-session.
 *
 * Detection:
 *   - Tail history.jsonl for the most recent epic_summarized event
 *   - If timestamp is within the last 60 seconds AND no later session_reset event
 *     for the same feature, emit the prompt
 *
 * Anti-spam:
 *   - Cap: emit at most once per feature_id (tracked via SESSION_FLAG file)
 *
 * Exit codes:
 *   0 — always (informational)
 *
 * @version 1.0.0 (v3.7.0-alpha.4)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const resolvePlansDir = require('./lib/plans-dir.cjs');
const { readJsonlTail } = require('./lib/jsonl-tail.cjs');

const PLANS_DIR = resolvePlansDir();
const HISTORY_FILE = path.join(PLANS_DIR, 'history.jsonl');

const { findProjectRoot } = require('./lib/hook-runtime.cjs');
const SESSION_FLAG_DIR = path.join(findProjectRoot(), '.claude', 'logs');
const SESSION_FLAG_PREFIX = '.session-reset-prompt-shown-';

const PROMPT_WINDOW_MS = 60 * 1000;

function safeExit(code = 0) { process.exit(code); }

// Pure: walking history newest-first, was there a fresh epic_summarized (within
// `windowMs`) that has NOT since been followed by a session_reset? Returns the
// summarize event to prompt on, or null. Encodes the "prompt once, right after
// distillation" rule so a session_reset seen first suppresses the prompt.
function findPromptableSummarize(historyLines, now, windowMs) {
  let recentSummarize = null;
  for (let i = historyLines.length - 1; i >= 0; i--) {
    let evt;
    try { evt = JSON.parse(historyLines[i]); } catch { continue; }

    if (evt.event === 'session_reset' && !recentSummarize) return null; // already reset

    if (evt.event === 'epic_summarized') {
      const ts = Date.parse(evt.ts || '');
      if (Number.isFinite(ts) && (now - ts) <= windowMs) recentSummarize = evt;
      break;
    }
  }
  return recentSummarize;
}

function main() {
  if (!fs.existsSync(HISTORY_FILE)) return;

  // Bounded tail: the scan below walks newest-first and stops at the first
  // epic_summarized / session_reset, and only accepts events inside a 60s
  // window — so anything beyond the trailing window is unreachable anyway.
  const lines = readJsonlTail(HISTORY_FILE);

  const recentSummarize = findPromptableSummarize(lines, Date.now(), PROMPT_WINDOW_MS);
  if (!recentSummarize) return;

  const featureId = recentSummarize.feature || recentSummarize.node || 'unknown';
  const flagPath = path.join(SESSION_FLAG_DIR, SESSION_FLAG_PREFIX + featureId);
  if (fs.existsSync(flagPath)) return; // prompted already this feature

  try {
    if (!fs.existsSync(SESSION_FLAG_DIR)) fs.mkdirSync(SESSION_FLAG_DIR, { recursive: true });
    fs.writeFileSync(flagPath, new Date().toISOString());
  } catch {/* best-effort */}

  process.stderr.write(
    `[session-reset] Epic ${featureId} distilled to permanent_memory.md\n` +
    '  Run /archon-os:reset-session to clear conversation context (history + memory + plan tree preserved).\n',
  );
}

// Run as a hook; stay importable for tests. FEAT-007 / issue #5.
if (require.main === module) {
  main();
} else {
  module.exports = { findPromptableSummarize };
}
