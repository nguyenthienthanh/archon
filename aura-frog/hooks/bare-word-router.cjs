#!/usr/bin/env node
/**
 * Aura Frog — Bare-Word Plan Router (UserPromptSubmit)
 *
 * Fires only when:
 *   1. .claude/plans/active.json exists (project has a plan tree)
 *   2. AF_BARE_WORD_ROUTER_DISABLED env var is NOT set
 *
 * Heuristic: route when ALL of
 *   • first token of prompt matches a verb in the plan vocabulary
 *   • total word count <= MAX_WORDS (default 5)
 *   • prompt does not start with a slash (already a command), '/', or 'must do:' / 'just do:' / 'exactly:' override prefixes (those are handled elsewhere)
 *
 * On match, prints a routing hint to stderr (Claude reads stderr; user
 * typically doesn't): suggests interpreting the prompt as `/archon-os:plan <input>`.
 *
 * Verbs: bootstrap, expand, next, status, replan, promote, archive, undo,
 *        freeze, thaw, conflicts  (11 total — matches verb_table in
 *        skills/plan-orchestrator/SKILL.md)
 *
 * Latency budget: ≤20ms. Reads only one file (active.json). No network.
 *
 * Exit codes:
 *   0 — always (informational, non-blocking)
 *
 * @version 1.0.0
 */

const fs = require('node:fs');
const path = require('node:path');
const { readPromptFromStdin, installWatchdog } = require('./lib/safe-stdin.cjs');

const PLAN_VERBS = [
  'bootstrap', 'expand', 'next', 'status', 'replan',
  'promote', 'archive', 'undo', 'freeze', 'thaw', 'conflicts',
];

const MAX_WORDS = 5;

const OVERRIDE_PREFIXES = [
  'must do:', 'just do:', 'exactly:',
];

// readPrompt is now a thin wrapper. The actual logic — fstatSync gate + JSON
// parse + env fallback — lives in lib/safe-stdin.cjs to fix the production
// TTY-hang bug (fs.readFileSync(0) on a TTY blocks forever, with no error).
// Kept exported under the same name so external callers / tests continue
// working.
function readPrompt() {
  return readPromptFromStdin();
}

function planActive(cwd) {
  // Delegate to lib/plans-dir.cjs so the resolution stays in lock-step with
  // every other hook + scripts/plans/_lib.sh#plans_dir().
  try {
    const resolvePlansDir = require('./lib/plans-dir.cjs');
    const plansDir = resolvePlansDir(cwd);
    return fs.existsSync(path.join(plansDir, 'active.json'));
  } catch {
    return false;
  }
}

function classify(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { match: false, reason: 'empty' };
  }

  const trimmed = prompt.trim();
  if (!trimmed) return { match: false, reason: 'empty' };

  if (trimmed.startsWith('/')) return { match: false, reason: 'already_command' };

  const lower = trimmed.toLowerCase();
  for (const prefix of OVERRIDE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return { match: false, reason: 'override_prefix' };
    }
  }

  // Split into words (drop trailing punctuation on the first token only —
  // a verb like "next." or "next?" should still match).
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > MAX_WORDS) {
    return { match: false, reason: 'too_long' };
  }

  const firstWordRaw = words[0];
  const firstWord = firstWordRaw.toLowerCase().replace(/[^a-z]+$/, '');

  if (!PLAN_VERBS.includes(firstWord)) {
    return { match: false, reason: 'first_token_not_verb' };
  }

  return { match: true, verb: firstWord, words };
}

function emitHint(verb, prompt) {
  // Claude reads stderr; this hint is metadata, not user-facing output.
  const target = `/archon-os:plan ${prompt}`;
  process.stderr.write(
    `\n🐸 plan-router: bare-word verb '${verb}' detected; treat as: ${target}\n`
  );
}

function main(opts = {}) {
  // opts.env, opts.cwd, opts.prompt are test injection points; in production
  // these come from process.env / process.cwd() / stdin via readPrompt().
  const env = opts.env || process.env;
  const cwd = opts.cwd || process.cwd();

  if (env.AF_BARE_WORD_ROUTER_DISABLED === 'true') {
    return 0;
  }

  if (!planActive(cwd)) {
    return 0;
  }

  const prompt = opts.prompt !== undefined ? opts.prompt : readPrompt();
  const result = classify(prompt);
  if (result.match) {
    emitHint(result.verb, prompt.trim());
  }
  return 0;
}

if (require.main === module) {
  // Belt-and-suspenders watchdog — bare-word-router fires on every
  // UserPromptSubmit. If anything ever blocks despite the safe-stdin guard,
  // the user's prompt is wedged. 200ms is generous (real work is <20ms).
  // Armed only when invoked directly, NOT when required from tests, so
  // jest's longer-lived worker process isn't killed mid-test.
  installWatchdog(200, 0);
  try {
    process.exit(main());
  } catch {
    // Defense in depth: never block the user prompt on a hook crash.
    process.exit(0);
  }
}

// Exported for unit tests.
module.exports = { PLAN_VERBS, MAX_WORDS, OVERRIDE_PREFIXES, classify, planActive, readPrompt, main, emitHint };
