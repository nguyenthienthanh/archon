#!/usr/bin/env node
/**
 * Aura Frog — Run Deliverables Scaffold (backstop)
 *
 * Fires: PostToolUse (Write | Edit)
 * Purpose: Guarantee the per-phase deliverable .md files exist for a run.
 *          run-orchestrator Step 0.5 *instructs* the model to call
 *          scripts/workflow/scaffold-phase-deliverables.sh, but nothing
 *          enforced it — observed runs ended with only run-state.json on
 *          disk. This hook makes scaffolding deterministic: every time
 *          run-state.json is written (creation or phase advance), the
 *          current phase's deliverables are scaffolded if missing.
 *
 * Behavior:
 *   - Silent unless the written file is .claude/logs/runs/<id>/run-state.json
 *   - Skips Quick/direct runs (no phase deliverables by design)
 *   - Delegates to scaffold-phase-deliverables.sh (idempotent — never
 *     overwrites existing files)
 *   - Emits a stderr note ONLY when new files were actually created, so the
 *     model knows the skeletons exist and fills them in
 *
 * Exit codes:
 *   0 — always (informational; scaffold failure must never block a Write)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readStdinSafely, parseStdinJson } = require('./lib/safe-stdin.cjs');

const RUN_STATE_RE = /^(.*?)[/\\]?\.claude[/\\]logs[/\\]runs[/\\]([^/\\]+)[/\\]run-state\.json$/;

// Pure: decide whether a run-state warrants scaffolding, and which phase.
// Returns a phase number 1-5, or null to skip.
function phaseToScaffold(runState) {
  if (!runState || runState.status !== 'in_progress') return null;
  const flow = String(runState.flow || '').toLowerCase();
  const complexity = String(runState.complexity || '').toLowerCase();
  if (flow === 'direct' || complexity === 'quick') return null;
  const phase = Number(runState.current_phase);
  return Number.isInteger(phase) && phase >= 1 && phase <= 5 ? phase : null;
}

function main() {
  const data = parseStdinJson(readStdinSafely());
  const filePath = data && data.tool_input && data.tool_input.file_path;
  if (!filePath) return;

  const m = String(filePath).match(RUN_STATE_RE);
  if (!m) return;
  const projectRoot = m[1] || process.cwd();
  const runId = m[2];

  let runState;
  try { runState = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return; }

  const phase = phaseToScaffold(runState);
  if (phase === null) return;

  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');
  const script = path.join(pluginRoot, 'scripts', 'workflow', 'scaffold-phase-deliverables.sh');
  if (!fs.existsSync(script)) return;

  const res = spawnSync('bash', [script, runId, String(phase)], {
    cwd: projectRoot,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
    encoding: 'utf8',
    timeout: 10000,
  });
  if (res.error || res.status !== 0) return; // best-effort backstop

  const created = (res.stdout || '')
    .split('\n')
    .filter((l) => l.trimStart().startsWith('+ '))
    .map((l) => l.trim().slice(2));
  if (created.length === 0) return; // idempotent re-run — stay silent

  process.stderr.write(
    `[deliverables] Scaffolded Phase ${phase} docs for run ${runId}: ${created.join(', ')}\n` +
    `  Fill them in as the phase work happens — templates are not deliverables ` +
    `(rules/workflow/workflow-deliverables.md gates approval on non-template content).\n`,
  );
}

// Run as a hook; stay importable for tests.
if (require.main === module) {
  main();
} else {
  module.exports = { phaseToScaffold, RUN_STATE_RE };
}
