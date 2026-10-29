#!/usr/bin/env node
/**
 * Compare current eval results against a baseline.
 * Fail CI if trigger accuracy drops below threshold OR drops more than 10% from baseline.
 *
 * Usage:
 *   node check-eval-regression.cjs \
 *     --current eval-results.json \
 *     --baseline archon-os/eval-baseline.json \
 *     --threshold 0.85
 *
 * Exit codes:
 *   0 — all components within thresholds
 *   1 — regression detected
 *   2 — usage error
 */

const fs = require('fs');

const args = process.argv.slice(2);

function argValue(name, fallback) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const currentFile = argValue('--current');
const baselineFile = argValue('--baseline');
const threshold = parseFloat(argValue('--threshold', '0.85'));
const maxDrop = parseFloat(argValue('--max-drop', '0.10'));

if (!currentFile) {
  console.error('Usage: check-eval-regression.cjs --current <file> [--baseline <file>] [--threshold 0.85]');
  process.exit(2);
}

if (!fs.existsSync(currentFile)) {
  console.error(`❌ Current results file not found: ${currentFile}`);
  process.exit(2);
}

const current = JSON.parse(fs.readFileSync(currentFile, 'utf8'));
const baseline =
  baselineFile && fs.existsSync(baselineFile)
    ? JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
    : null;

if (!current.components || !current.components.skills) {
  console.error('❌ Malformed current results: missing components.skills');
  process.exit(2);
}

if (!baseline) {
  console.warn(`⚠️  No baseline file at ${baselineFile || '(not provided)'} — running in threshold-only mode`);
}

let failed = false;
const rows = [];

for (const skill of current.components.skills) {
  const name = skill.name;
  const accuracy = skill.triggerAccuracy ?? 0;

  const baselineSkill = baseline?.components.skills.find((s) => s.name === name);
  const baselineAccuracy = baselineSkill?.triggerAccuracy ?? null;
  const delta = baselineAccuracy !== null ? accuracy - baselineAccuracy : null;

  const thresholdFail = accuracy < threshold;
  const dropFail = delta !== null && delta < -maxDrop;
  const passed = !thresholdFail && !dropFail;

  if (!passed) failed = true;

  rows.push({
    skill: name,
    accuracy: (accuracy * 100).toFixed(1) + '%',
    baseline: baselineAccuracy !== null ? (baselineAccuracy * 100).toFixed(1) + '%' : 'new',
    delta:
      delta === null
        ? 'n/a'
        : delta >= 0
        ? `+${(delta * 100).toFixed(1)}%`
        : `${(delta * 100).toFixed(1)}%`,
    status: passed ? '✓' : '✗',
  });
}

console.log('\n=== Behavioral Eval Results ===\n');
console.table(rows);

if (failed) {
  console.error(
    `\n❌ Regression detected. Threshold: ${(threshold * 100).toFixed(0)}%, max allowed drop: -${(maxDrop * 100).toFixed(0)}%`
  );
  process.exit(1);
}

console.log('\n✓ All auto-invoke skills within thresholds.');
process.exit(0);
