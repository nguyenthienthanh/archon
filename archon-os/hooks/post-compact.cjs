#!/usr/bin/env node
/**
 * Aura Frog - Post Compact Hook
 *
 * Fires: PostCompact (after context compaction completes)
 * Purpose: Verify workflow state survived compaction
 *
 * Checks:
 * 1. Workflow state file exists and is valid JSON
 * 2. Phase information preserved
 * 3. Agent assignment preserved
 * 4. Emits warning to Claude if state appears corrupted
 *
 * Exit codes:
 *   0 - State OK or no active workflow
 *   2 - State corrupted — stderr shown to Claude
 */

const fs = require('fs');
const path = require('path');

// These must match where the writers actually put them — the old paths omitted
// /cache/, so verification never found the files and corrupted handoffs passed
// silently. Handoffs are per session since 3.8.0-alpha.17
// (.claude/handoffs/<session-name>.json, see compact-handoff.cjs); only the
// compacting session's own handoff is checked.
const STATE_PATHS = [
  '.claude/cache/workflow-state.json',
];
const HANDOFFS_DIR = '.claude/handoffs';

// Pure: which required fields is a parsed state file missing? The check depends
// on WHICH state file it is (matched by the `rel` path), so both are passed in.
//
// The field names here must track the actual writers, not a guessed schema:
// compact-handoff.cjs saveHandoff() writes {version, saved_at, reason, workflow,
// context, resume_hint}, and the workflow state it reads/synthesises carries
// current_phase + agents.primary. The old checks looked for summary/decisions
// and phase/agent — fields nothing writes — so every valid handoff tripped
// exit(2) and told Claude its state was corrupt right after a compaction.
function validateStateFile(rel, data) {
  const warnings = [];
  if (rel.includes('workflow-state')) {
    if (!data.current_phase) warnings.push(`${rel}: missing current_phase`);
    if (!data.agents?.primary) warnings.push(`${rel}: missing agents.primary`);
  }
  if (rel.includes('compact-handoff') || rel.includes('handoffs/')) {
    if (!data.run && !data.workflow && !data.plan && !data.context && !data.project) {
      warnings.push(`${rel}: missing run, workflow, plan and context — handoff may be empty`);
    }
  }
  return warnings;
}

// Collect warnings across every configured state path. I/O wrapper.
function collectWarnings(statePaths) {
  const warnings = [];
  for (const rel of statePaths) {
    const abs = path.resolve(process.cwd(), rel);
    if (!fs.existsSync(abs)) continue;
    try {
      warnings.push(...validateStateFile(rel, JSON.parse(fs.readFileSync(abs, 'utf8'))));
    } catch (e) {
      warnings.push(`${rel}: corrupted JSON — ${e.message}`);
    }
  }
  return warnings;
}

// Handoff files owned by this session (matched on session_id). I/O wrapper.
function sessionHandoffPaths(sessionId, dir = HANDOFFS_DIR) {
  if (!sessionId) return [];
  let files;
  try { files = fs.readdirSync(path.resolve(process.cwd(), dir)); } catch { return []; }
  return files
    .filter((f) => f.endsWith('.json'))
    .map((f) => `${dir}/${f}`)
    .filter((rel) => {
      try { return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')).session_id === sessionId; } catch { return true; }
    });
}

function main() {
  let input = '';
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => {
    let sessionId = null;
    try { sessionId = JSON.parse(input).session_id || null; } catch { /* no stdin */ }
    const warnings = collectWarnings([...STATE_PATHS, ...sessionHandoffPaths(sessionId)]);
    if (warnings.length > 0) {
      process.stderr.write(
        `⚠️ Post-compact state check:\n${warnings.map((w) => `  - ${w}`).join('\n')}\n` +
        'Action: Re-read workflow state files and verify before continuing.',
      );
      process.exit(2);
    }
    process.exit(0);
  });
}

// Run as a hook; stay importable for tests. FEAT-007 / issue #5.
if (require.main === module) {
  main();
} else {
  module.exports = { STATE_PATHS, HANDOFFS_DIR, validateStateFile, collectWarnings, sessionHandoffPaths };
}
