#!/usr/bin/env node
/**
 * claim-scope-gate.cjs — the deterministic, NON-LLM half of FEAT-E.
 *
 * Runs BEFORE any model call and costs nothing:
 *
 *   If a conclusion carries a UNIVERSAL QUANTIFIER ("does not support",
 *   "cannot", "always", "never", "is broken") and the evidence covers
 *   <= 1 instance, BLOCK.
 *
 * Why this file is the most valuable part of the feature: the defect class it
 * targets is wrong causal attribution / invalid generalization from a TRUE
 * observation — not hallucination. A verifier that merely re-checks "did it
 * fail?" CONFIRMS the false conclusion, because the failure really happened.
 * What breaks the generalization is a counterfactual probe: a different valid
 * input of the same class. So this gate scores COVERAGE OF EVIDENCE, not truth,
 * and that is decidable without a model.
 *
 * Asymmetric authority (FEAT-E): this gate can only ever LOWER confidence. It
 * never returns SUPPORTED — the most it says is "nothing deterministic to flag,
 * ask the model".
 *
 * Pure module: no I/O, no process exit. The entrypoint is
 * `scripts/verify-claim.cjs`.
 */

// Universal quantifiers, deliberately NARROW. Bare "all"/"every"/"any" are left
// out: they appear constantly in correctly scoped prose ("all 1591 tests in
// this run passed"), and a gate with a high false-positive rate gets switched
// off, which costs more than the cases it would have caught.
const UNIVERSAL_PATTERNS = [
  /\b(?:does|do|did)\s+not\s+(?:support|accept|work|handle|allow|exist)\b/i,
  /\b(?:doesn't|don't|didn't)\s+(?:support|accept|work|handle|allow|exist)\b/i,
  /\b(?:cannot|can't|can\s+not)\b/i,
  /\bnever\b/i,
  /\balways\b/i,
  /\b(?:is|are|was|were)\s+broken\b/i,
  /\bnot\s+supported\b/i,
  /\bunsupported\b/i,
  /\bno\s+support\s+for\b/i,
  /\b(?:impossible|not\s+possible)\b/i,
];

// Output signatures that explain a failure WITHOUT the tool lacking the
// capability. This is the "the tool is broken" vs "you called it wrong"
// discriminator — the whole reason the motivating case fooled an agent.
const CONFOUNDER_SIGNATURES = {
  max_turns_limit: /reached\s+max\s+turns/i,
  command_name_not_found: /command\s+isn'?t\s+installed|unknown\s+command|command\s+not\s+found|no\s+such\s+command/i,
  builtin_unavailable_in_print_mode: /isn'?t\s+available\s+in\s+this\s+environment|not\s+available\s+in\s+this\s+environment/i,
  permission_denied: /permission\s+denied|not\s+permitted|eacces/i,
  target_not_found: /no\s+such\s+file|enoent|not\s+found\b/i,
  timeout: /timed?\s*out|etimedout/i,
  quota_exhausted: /rate\s*limit|quota\s+exceeded|429/i,
  auth_missing: /unauthoriz|invalid\s+api\s+key|401\b/i,
  flag_suppressed_feature: /--disable-[a-z-]+|--no-[a-z-]+/i,
};

// Fields that would de-blind the verifier: who produced the claim, how sure it
// said it was, and how it got there. Withheld to kill self-preference,
// familiarity and agreement bias.
const PRODUCER_FIELDS = [
  'author', 'agent', 'agent_id', 'agentId', 'produced_by', 'producedBy', 'producer',
  'confidence', 'confidence_score', 'confidenceScore', 'certainty', 'self_confidence',
  'reasoning', 'reasoning_trace', 'rationale', 'thinking', 'thought', 'trace', 'chain_of_thought',
];

const asText = (value) => (typeof value === 'string' ? value : '');

/** Return the universal quantifier a text carries, or null. */
function findUniversalQuantifier(text) {
  const str = asText(text);
  if (!str) return null;
  for (const re of UNIVERSAL_PATTERNS) {
    const m = str.match(re);
    if (m) return m[0].toLowerCase().replace(/\s+/g, ' ');
  }
  return null;
}

const normalizeProbe = (probe) => asText(typeof probe === 'string' ? probe : (probe && (probe.probe || probe.command)))
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

/**
 * Distinct evidence instances. A repeat of the SAME input is one instance —
 * running `claude -p "/run"` twice does not widen the evidence at all.
 */
function countDistinctProbes(evidence) {
  if (Array.isArray(evidence)) {
    const seen = new Set(evidence.map(normalizeProbe).filter(Boolean));
    return seen.size;
  }
  // A prose blob is at most one instance: it reports an experiment, not a set.
  return asText(evidence).trim() ? 1 : 0;
}

/** True once a DIFFERENT valid input of the same class has been tried. */
function counterfactualRan(evidence) {
  return countDistinctProbes(evidence) >= 2;
}

const PASS_OUTCOMES = new Set(['pass', 'passed', 'success', 'succeeded', 'ok', 'true', '0']);

/** True when some probe of the same class SUCCEEDED — which kills a universal claim. */
function positiveControlPassed(evidence) {
  if (!Array.isArray(evidence)) return false;
  return evidence.some(e => e && PASS_OUTCOMES.has(String(e.outcome ?? e.result ?? '').trim().toLowerCase()));
}

/** Known non-capability explanations present in the observed output. */
function findConfounders(text) {
  const str = asText(text);
  if (!str) return [];
  return Object.entries(CONFOUNDER_SIGNATURES)
    .filter(([, re]) => re.test(str))
    .map(([name]) => name);
}

/**
 * Strip every producer field and rename `conclusion` to `claim_under_test`, so
 * the verifier is never shown a conclusion to confirm — it is shown a claim to
 * test against the observation.
 */
function buildBlindInput(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const blind = {};
  for (const [key, value] of Object.entries(source)) {
    if (PRODUCER_FIELDS.includes(key)) continue;
    if (key === 'conclusion') continue;
    blind[key] = value;
  }
  blind.claim_under_test = asText(source.claim_under_test || source.conclusion || source.claim);
  return blind;
}

// A backticked or $-prefixed span counts as a probe citation only when it looks
// like a command: a known runner, or a flag/path. `verdict` in backticks is prose.
const COMMANDISH = /^(?:[a-z0-9_.\/-]+\s+(?:-{1,2}[a-z0-9]|[a-z0-9_.\/"'-]+\s)|(?:npx|npm|pnpm|yarn|node|git|claude|bash|sh|python3?|jest|docker|curl)\b)/i;

/** Extract command citations from a free-text agent result. */
function extractProbeCitations(text) {
  const str = asText(text);
  if (!str) return [];
  const found = [];
  for (const m of str.matchAll(/`([^`\n]{3,200})`/g)) found.push(m[1].trim());
  for (const m of str.matchAll(/^\s*\$\s+(.{3,200})$/gm)) found.push(m[1].trim());
  const seen = new Set();
  return found.filter((cmd) => {
    if (!COMMANDISH.test(cmd)) return false;
    const key = cmd.replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Build a scope-gate input from a free-text agent result: the conclusion is the
 * first sentence carrying a universal quantifier, the observation is the whole
 * text (so confounders stay visible), and the evidence is the cited probes.
 */
function scanResultText(text) {
  const str = asText(text);
  const sentences = str.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
  const conclusion = sentences.find(s => findUniversalQuantifier(s)) || null;
  return {
    conclusion,
    observation: str,
    evidence: extractProbeCitations(str).map(probe => ({ probe, outcome: 'unknown' })),
  };
}

/**
 * The gate. Returns a verdict ONLY when it can decide adversely with zero model
 * calls; otherwise `verdict: null, needs_model: true`.
 */
function evaluateScope(claim) {
  const input = claim && typeof claim === 'object' ? claim : {};
  const conclusion = asText(input.conclusion || input.claim_under_test || input.claim);
  const observation = asText(input.observation);
  const evidence = input.evidence;

  const quantifier = findUniversalQuantifier(conclusion);
  const instances = countDistinctProbes(evidence);
  const counterfactual = counterfactualRan(evidence);
  const positiveControl = positiveControlPassed(evidence);
  const alternativeCauses = findConfounders(observation);

  const reasons = [];
  const checksNotPossible = [];
  const requiredProbes = [];

  if (!counterfactual) {
    checksNotPossible.push('counterfactual_probe_not_run');
  }
  if (Array.isArray(evidence) && evidence.length && !evidence.some(e => e && (e.outcome ?? e.result) !== undefined)) {
    checksNotPossible.push('probe_outcomes_not_recorded');
  }
  if (!Array.isArray(evidence)) {
    checksNotPossible.push('evidence_not_itemized');
  }

  // `universal_from_single_instance` covers ZERO cited instances too: a
  // universal claim with no probe behind it is the same defect with less
  // evidence, not a different one. Known false-positive class: a capability
  // claim backed by documentation rather than by a probe. The cost is one line
  // of feedback asking for the probe or a narrower claim, so it is left in.
  if (quantifier && instances <= 1) reasons.push('universal_from_single_instance');
  if (quantifier && positiveControl) reasons.push('positive_control_contradicts');

  const blocked = reasons.length > 0;

  if (blocked) {
    requiredProbes.push('run a DIFFERENT valid input of the same class and record its outcome');
    for (const cause of alternativeCauses) {
      requiredProbes.push(`re-run with the "${cause}" confounder removed before concluding a capability gap`);
    }
  }

  // WRONG_CAUSE is the more specific adverse verdict: the observed output has a
  // known non-capability explanation, so "the tool cannot do X" is attributing
  // the failure to the wrong thing.
  const verdict = blocked
    ? (alternativeCauses.length ? 'WRONG_CAUSE' : 'OVERGENERALIZED')
    : null;

  return {
    verdict,
    blocked,
    needs_model: !blocked,
    quantifier,
    instances,
    counterfactual_ran: counterfactual,
    positive_control_passed: positiveControl,
    alternative_causes: alternativeCauses,
    required_probes: requiredProbes,
    reasons,
    checks_not_possible: checksNotPossible,
    model_calls: 0,
  };
}

module.exports = {
  UNIVERSAL_PATTERNS,
  CONFOUNDER_SIGNATURES,
  PRODUCER_FIELDS,
  findUniversalQuantifier,
  countDistinctProbes,
  counterfactualRan,
  positiveControlPassed,
  findConfounders,
  buildBlindInput,
  extractProbeCitations,
  scanResultText,
  evaluateScope,
};
