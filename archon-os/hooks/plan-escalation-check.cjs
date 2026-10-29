#!/usr/bin/env node
/**
 * Archon OS — Plan Escalation Check (UserPromptSubmit)
 *
 * Enforces the project-scope escalation heuristic from
 * rules/workflow/run-plan-bridge.md so it no longer depends ONLY on the model
 * remembering to read run-orchestrator Step 0. When a fresh prompt scores
 * weight ≥ 3 on the 8-signal rubric AND no plan tree exists, this hook emits a
 * stderr nudge telling Claude to offer the user the `plan` / `deep` / `details`
 * choice before diving into implementation.
 *
 * Fires only when ALL of:
 *   • neither AF_RUN_PLAN_BRIDGE_DISABLED nor AF_ESCALATION_DISABLED is set
 *   • no active plan tree (.claude/plans/active.json absent) — escalation is
 *     the "no_plan" state; anchoring/idle states are handled elsewhere
 *   • prompt is not a slash command and carries no override/force prefix
 *     (task: / project: / must do: / just do: / exactly:)
 *   • the 8-signal weight sums to ≥ 3
 *
 * Weights mirror rules/workflow/run-plan-bridge.md#escalation_triggers exactly.
 * The hook only emits a hint to stderr (Claude reads stderr; the user usually
 * does not) — it never blocks the prompt.
 *
 * Latency budget: ≤20ms. Reads at most one file (active.json). No network.
 *
 * Exit codes:
 *   0 — always (informational, non-blocking)
 *
 * @version 1.0.0
 */

const fs = require('node:fs');
const path = require('node:path');
const { readPromptFromStdin, installWatchdog } = require('./lib/safe-stdin.cjs');

// Suggest planning when the summed weight reaches this threshold.
const ESCALATION_THRESHOLD = 3;

// Prefixes that bypass the escalation heuristic entirely (run-plan-bridge.md):
//   task:     → force task mode (skip ask)
//   project:  → force project mode (already routes to /archon-os:plan)
//   must do: / just do: / exactly: → force modes that skip the whole bridge
const BYPASS_PREFIXES = ['task:', 'project:', 'must do:', 'just do:', 'exactly:'];

// 8-signal rubric. Each entry: { signal, weight, test(lower, wordCount) }.
// Regexes are deliberately conservative — a false "needs a plan" nudge is more
// annoying than a missed one, and the model still owns the final judgement.
const SIGNALS = [
  {
    signal: 'multi_feature',
    weight: 2,
    // Two-plus capabilities joined by + or a 3-item comma enumeration.
    test: (s) => /\w+\s*\+\s*\w+/.test(s) || /\w+\s*,\s*\w+\s*,\s*(?:and\s+)?\w+/.test(s),
  },
  {
    signal: 'multi_week',
    weight: 2,
    test: (s) => /\b(roadmap|epic|initiative|multi-week|multi week|phase \d+ of)\b/.test(s)
      || /\bover \d+\s+(weeks?|months?)\b/.test(s),
  },
  {
    signal: 'shipping_scope',
    weight: 2,
    test: (s) => /\b(ship v|v\d+\.\d+|rollout|roll out|launch)\b/.test(s)
      || /\bmigrate\s+from\s+.+\s+to\s+/.test(s),
  },
  {
    signal: 'scale_words',
    weight: 1,
    test: (s) => /\bacross \d+\s+teams?\b/.test(s)
      || /\b\d{2,}\+?\s+files\b/.test(s)
      || /\bmonorepo migration\b/.test(s)
      || /\borg-wide\b/.test(s),
  },
  {
    signal: 'cross_session',
    weight: 1,
    test: (s) => /\b(continue from yesterday|session reset|come back to)\b/.test(s),
  },
  {
    signal: 'user_explicit',
    weight: 3,
    test: (s) => /\b(plan first|decompose|hierarchical)\b/.test(s),
  },
  {
    signal: 'word_count',
    weight: 1,
    test: (_s, wordCount) => wordCount > 80,
  },
  {
    signal: 'scope_verbs',
    weight: 2,
    test: (s) => /\b(rebuild|redesign|rewrite|from-scratch|from scratch|overhaul)\b/.test(s),
  },
];

/**
 * Score a prompt against the 8-signal rubric.
 * @param {string} prompt
 * @returns {{ weight: number, signals: string[] }}
 */
function computeWeight(prompt) {
  if (!prompt || typeof prompt !== 'string') return { weight: 0, signals: [] };
  const lower = prompt.toLowerCase();
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;

  let weight = 0;
  const signals = [];
  for (const { signal, weight: w, test } of SIGNALS) {
    if (test(lower, wordCount)) {
      weight += w;
      signals.push(signal);
    }
  }
  return { weight, signals };
}

/**
 * Decide whether to nudge. Returns { escalate, reason?, weight?, signals? }.
 */
function classify(prompt) {
  if (!prompt || typeof prompt !== 'string') return { escalate: false, reason: 'empty' };

  const trimmed = prompt.trim();
  if (!trimmed) return { escalate: false, reason: 'empty' };
  if (trimmed.startsWith('/')) return { escalate: false, reason: 'already_command' };

  const lower = trimmed.toLowerCase();
  for (const prefix of BYPASS_PREFIXES) {
    if (lower.startsWith(prefix)) return { escalate: false, reason: 'bypass_prefix' };
  }

  const { weight, signals } = computeWeight(trimmed);
  if (weight < ESCALATION_THRESHOLD) {
    return { escalate: false, reason: 'below_threshold', weight, signals };
  }
  return { escalate: true, weight, signals };
}

function planActive(cwd) {
  // Same resolver every other plan-aware hook uses — keep them in lock-step.
  try {
    const resolvePlansDir = require('./lib/plans-dir.cjs');
    const plansDir = resolvePlansDir(cwd);
    return fs.existsSync(path.join(plansDir, 'active.json'));
  } catch {
    return false;
  }
}

function emitHint(weight, signals) {
  // Claude reads stderr; this hint is metadata, not user-facing output.
  process.stderr.write(
    `\n🦉 plan-escalation: task scores ${weight} (≥${ESCALATION_THRESHOLD}) on the escalation rubric` +
    ` — signals: ${signals.join(', ')}. No active plan tree.\n` +
    `   Per rules/workflow/run-plan-bridge.md, offer the user before implementing:\n` +
    `     plan    — bootstrap /archon-os:plan first\n` +
    `     deep    — proceed inline (record escalation_declined: true)\n` +
    `     details — show which signals fired\n`
  );
}

function main(opts = {}) {
  // opts.env, opts.cwd, opts.prompt are test injection points; in production
  // these come from process.env / process.cwd() / stdin via readPromptFromStdin().
  const env = opts.env || process.env;
  const cwd = opts.cwd || process.cwd();

  if (env.AF_RUN_PLAN_BRIDGE_DISABLED === 'true' || env.AF_ESCALATION_DISABLED === 'true') {
    return 0;
  }

  // Escalation is the "no_plan" state only — an existing plan tree means the
  // anchoring/idle bridge states apply, handled by other hooks/skills.
  if (planActive(cwd)) return 0;

  const prompt = opts.prompt !== undefined ? opts.prompt : readPromptFromStdin();
  const result = classify(prompt);
  if (result.escalate) emitHint(result.weight, result.signals);
  return 0;
}

if (require.main === module) {
  // Belt-and-suspenders watchdog — fires on every UserPromptSubmit. If anything
  // ever blocks despite the safe-stdin guard, the user's prompt is wedged.
  // Armed only when invoked directly, NOT when required from tests.
  installWatchdog(200, 0);
  try {
    process.exit(main());
  } catch {
    // Defense in depth: never block the user prompt on a hook crash.
    process.exit(0);
  }
}

module.exports = {
  ESCALATION_THRESHOLD,
  BYPASS_PREFIXES,
  SIGNALS,
  computeWeight,
  classify,
  planActive,
  emitHint,
  main,
};
