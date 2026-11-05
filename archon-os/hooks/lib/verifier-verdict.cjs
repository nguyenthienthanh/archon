#!/usr/bin/env node
/**
 * verifier-verdict.cjs — the verdict pipeline of FEAT-E.
 *
 * Four properties this module exists to enforce BY CONSTRUCTION, because a rule
 * that asks the model to police itself is not a gate:
 *
 *  1. CONFIDENCE COMES FROM AGREEMENT, NOT SELF-REPORT. Logprobs are
 *     unavailable (the OpenAI-compat layer ignores the request field and always
 *     returns the response field empty) and verbalized confidence is measurably
 *     overconfident. So `normalizeSample` DELETES any confidence the model
 *     reports, and the only number the escalation rule consumes is the modal
 *     verdict fraction over k independent samples.
 *
 *  2. ASYMMETRIC AUTHORITY. SUPPORTED is advisory and silences nothing;
 *     OVERGENERALIZED / WRONG_CAUSE / REFUTED may block. Every branch of
 *     `applyAuthority` returns min(prior, derived), so NO code path can raise
 *     confidence. A rubber stamp is therefore a no-op, which is what makes the
 *     "models elaborate a planted error in up to 83% of cases" finding
 *     survivable: agreement with a wrong claim buys the claim nothing.
 *
 *  3. A RETRY MUST CHANGE THE EVIDENCE. `evaluateRetry` rejects a retry with no
 *     new probe, and the loop target is "pass the threshold or escalate to a
 *     human" — never "maximize a score", which is reward hacking.
 *
 *  4. INDEPENDENCE. `checkIndependence` refuses a self-graded result and any
 *     input that leaks the producer's trace.
 *
 * Pure module: no I/O, no process exit. Entrypoint: `scripts/verify-claim.cjs`.
 */

// Mirrors legacy AF_* / AURA_FROG_* variables onto their ARCHON_* names.
require('./env-compat.cjs');

const VERDICTS = [
  'SUPPORTED',
  'OVERGENERALIZED',
  'WRONG_CAUSE',
  'UNDERSPECIFIED',
  'REFUTED',
  'CANNOT_CHECK',
];

// Only these three may block. SUPPORTED is advisory; UNDERSPECIFIED and
// CANNOT_CHECK withhold endorsement without silencing anything.
const BLOCKING_VERDICTS = ['OVERGENERALIZED', 'WRONG_CAUSE', 'REFUTED'];

// A 3-value enum, not a number: the model must not be able to express a
// precision it does not have.
const CONFIDENCE_LADDER = ['LOW', 'MEDIUM', 'HIGH'];

// k=3 Haiku costs ~$0.0016 via the in-session Agent tool (model: "haiku"),
// about 7% of one Sonnet pass. threshold 0.67 = 2 of 3 agreeing; loopCap 2
// retries before a human is asked. Fitted on scripts/verifier-corpus/, not
// transferred from a paper — FrugalGPT learns cascade thresholds per dataset
// and the literature offers no portable number.
// agreementThreshold is written as the exact fraction 2/3 — "2 of 3 samples
// agree". Spelling it 0.67 would exclude that very case, since 2/3 = 0.6666...
const DEFAULTS = Object.freeze({ k: 3, agreementThreshold: 2 / 3, loopCap: 2 });

// Shape for `claude -p --json-schema`: enums and typed numbers, never a bare
// `{verdict: string}` — with a bare string schema the model stuffs an entire
// JSON document into the field.
const VERDICT_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'checks_not_possible', 'strongest_supportable_statement'],
  properties: {
    verdict: { type: 'string', enum: VERDICTS },
    // Accepted on input for schema compatibility and then DISCARDED by
    // normalizeSample — the model never supplies the number that matters.
    confidence: { type: 'string', enum: CONFIDENCE_LADDER },
    checks_not_possible: { type: 'array', items: { type: 'string' } },
    strongest_supportable_statement: { type: 'string' },
    alternative_causes: { type: 'array', items: { type: 'string' } },
    instances_covered: { type: 'integer', minimum: 0 },
  },
});

const rank = (confidence) => {
  const idx = CONFIDENCE_LADDER.indexOf(confidence);
  return idx === -1 ? CONFIDENCE_LADDER.indexOf('HIGH') : idx;
};
const lower = (a, b) => (rank(a) <= rank(b) ? CONFIDENCE_LADDER[rank(a)] : CONFIDENCE_LADDER[rank(b)]);
const isBlocking = (verdict) => BLOCKING_VERDICTS.includes(verdict);
const uniq = (list) => [...new Set(list)];

function positiveNumber(raw, fallback, { integer = false } = {}) {
  const value = integer ? parseInt(raw, 10) : parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

/** Loop cap and acceptance threshold: user-settable, with a default (AC6). */
function loadVerifierConfig(env = process.env) {
  const source = env || {};
  const threshold = positiveNumber(source.ARCHON_VERIFIER_THRESHOLD, DEFAULTS.agreementThreshold);
  return {
    k: positiveNumber(source.ARCHON_VERIFIER_K, DEFAULTS.k, { integer: true }),
    agreementThreshold: threshold > 1 ? DEFAULTS.agreementThreshold : threshold,
    loopCap: positiveNumber(source.ARCHON_VERIFIER_LOOP_CAP, DEFAULTS.loopCap, { integer: true }),
  };
}

/** Strip the model's self-report; coerce an unknown verdict to CANNOT_CHECK. */
function normalizeSample(raw) {
  const sample = raw && typeof raw === 'object' ? raw : {};
  const verdict = VERDICTS.includes(sample.verdict) ? sample.verdict : 'CANNOT_CHECK';
  const checks = sample.checks_not_possible;
  return {
    verdict,
    checks_not_possible: Array.isArray(checks) ? checks.map(String) : (checks ? [String(checks)] : []),
    strongest_supportable_statement: typeof sample.strongest_supportable_statement === 'string'
      ? sample.strongest_supportable_statement
      : undefined,
    alternative_causes: Array.isArray(sample.alternative_causes) ? sample.alternative_causes.map(String) : [],
  };
}

/**
 * Modal verdict over k independent samples; confidence is a function of the
 * agreement fraction ALONE.
 *
 * Tie policy: a two-way split between an endorsement and an adverse finding
 * resolves ADVERSE (asymmetric authority again — the cost of wrongly blocking
 * is a probe, the cost of wrongly endorsing is a shipped falsehood). A wider
 * split carries no signal at all, so it returns CANNOT_CHECK.
 */
function aggregateSamples(samples, config = loadVerifierConfig()) {
  const normalized = (Array.isArray(samples) ? samples : []).map(normalizeSample);
  const k = normalized.length;
  const checksNotPossible = uniq(normalized.flatMap(s => s.checks_not_possible));

  if (k === 0) {
    return {
      k: 0,
      verdict: 'CANNOT_CHECK',
      modalCount: 0,
      agreement: 0,
      confidence: 'LOW',
      tie: false,
      checks_not_possible: uniq([...checksNotPossible, 'no_samples_collected']),
      alternative_causes: [],
    };
  }

  const counts = new Map();
  for (const s of normalized) counts.set(s.verdict, (counts.get(s.verdict) || 0) + 1);
  const modalCount = Math.max(...counts.values());
  const tiedOrder = normalized.map(s => s.verdict).filter((v, i, arr) => arr.indexOf(v) === i);
  const tied = tiedOrder.filter(v => counts.get(v) === modalCount);

  let verdict;
  if (tied.length === 1) {
    verdict = tied[0];
  } else if (tied.length === 2) {
    verdict = tied.find(isBlocking) || 'CANNOT_CHECK';
  } else {
    verdict = 'CANNOT_CHECK';
  }

  const agreement = modalCount / k;
  const confidence = agreement === 1
    ? 'HIGH'
    : (agreement >= config.agreementThreshold ? 'MEDIUM' : 'LOW');

  return {
    k,
    verdict,
    modalCount,
    agreement,
    confidence,
    tie: tied.length > 1,
    checks_not_possible: checksNotPossible,
    alternative_causes: uniq(normalized.flatMap(s => s.alternative_causes)),
  };
}

/**
 * Asymmetric authority. Every return path is min(prior, derived) — the one
 * invariant the whole feature rests on.
 */
function applyAuthority({ priorConfidence = 'HIGH', aggregate, config = loadVerifierConfig() }) {
  const prior = CONFIDENCE_LADDER.includes(priorConfidence) ? priorConfidence : 'HIGH';
  const agg = aggregate || aggregateSamples([], config);

  // SUPPORTED is a NO-OP: it cannot raise confidence and it silences nothing.
  if (agg.verdict === 'SUPPORTED') {
    return { verdict: 'SUPPORTED', confidence: prior, blocked: false, advisory: true };
  }

  if (isBlocking(agg.verdict)) {
    const blocked = agg.agreement >= config.agreementThreshold;
    return {
      verdict: agg.verdict,
      confidence: blocked ? lower(prior, 'LOW') : lower(prior, 'MEDIUM'),
      blocked,
      advisory: !blocked,
    };
  }

  // UNDERSPECIFIED / CANNOT_CHECK: withhold endorsement, block nothing.
  return {
    verdict: agg.verdict,
    confidence: lower(prior, 'MEDIUM'),
    blocked: false,
    advisory: true,
  };
}

/**
 * The single composition point: deterministic gate first (zero cost), model
 * samples second, and the counterfactual-coverage rule last.
 */
function finalizeVerdict({ gate, samples, priorConfidence = 'HIGH', config = loadVerifierConfig() }) {
  const g = gate && typeof gate === 'object' ? gate : {};
  const prior = CONFIDENCE_LADDER.includes(priorConfidence) ? priorConfidence : 'HIGH';
  const gateChecks = Array.isArray(g.checks_not_possible) ? g.checks_not_possible : [];
  const gateReasons = Array.isArray(g.reasons) ? g.reasons : [];

  // The deterministic gate already decided adversely — no model call needed,
  // and no model result may overturn it (it can only ever lower, never raise).
  if (g.blocked) {
    return {
      verdict: isBlocking(g.verdict) ? g.verdict : 'OVERGENERALIZED',
      // `confidence` is the CLAIM's confidence after the verifier lowered it;
      // `agreement_confidence` is how much the samples agreed. The
      // deterministic gate is not a sample, so its agreement is total.
      confidence: lower(prior, 'LOW'),
      agreement_confidence: 'HIGH',
      agreement: 1,
      k: 0,
      blocked: true,
      advisory: false,
      model_calls_needed: false,
      reasons: gateReasons,
      checks_not_possible: uniq(gateChecks),
      alternative_causes: Array.isArray(g.alternative_causes) ? g.alternative_causes : [],
      required_probes: Array.isArray(g.required_probes) ? g.required_probes : [],
      escalate_to_human: false,
    };
  }

  const list = Array.isArray(samples) ? samples : [];
  const aggregate = aggregateSamples(list, config);
  const authority = applyAuthority({ priorConfidence: prior, aggregate, config });

  let verdict = authority.verdict;
  let confidence = authority.confidence;
  const checks = uniq([...gateChecks, ...aggregate.checks_not_possible]);

  // A verdict whose counterfactual probe did not run may not be SUPPORTED.
  if (verdict === 'SUPPORTED' && g.counterfactual_ran !== true) {
    verdict = 'CANNOT_CHECK';
    confidence = lower(prior, 'MEDIUM');
    if (!checks.includes('counterfactual_probe_not_run')) checks.push('counterfactual_probe_not_run');
  }

  return {
    verdict,
    confidence,
    agreement_confidence: aggregate.confidence,
    agreement: aggregate.agreement,
    k: aggregate.k,
    blocked: authority.blocked,
    advisory: !authority.blocked,
    model_calls_needed: list.length === 0,
    reasons: gateReasons,
    checks_not_possible: checks,
    alternative_causes: aggregate.alternative_causes,
    required_probes: Array.isArray(g.required_probes) ? g.required_probes : [],
    escalate_to_human: false,
  };
}

/**
 * A retry is legitimate only when it adds EVIDENCE. Rephrasing is a no-op, and
 * at the loop cap the run escalates to a human instead of grinding on a score.
 */
function evaluateRetry({ attempt = 0, probeLedger = [], newProbe = null, config = loadVerifierConfig() }) {
  const ledger = (Array.isArray(probeLedger) ? probeLedger : []).map(p => String(p).trim().replace(/\s+/g, ' ').toLowerCase());

  if (attempt >= config.loopCap) {
    return { allowed: false, reason: 'loop_cap_reached', escalate_to_human: true, probeLedger: [...ledger] };
  }

  const candidate = typeof newProbe === 'string' ? newProbe.trim().replace(/\s+/g, ' ').toLowerCase() : '';
  if (!candidate || ledger.includes(candidate)) {
    return { allowed: false, reason: 'no_new_evidence', escalate_to_human: false, probeLedger: [...ledger] };
  }

  return { allowed: true, reason: 'new_probe', escalate_to_human: false, probeLedger: [...ledger, candidate] };
}

const LEAK_FIELDS = [
  'author', 'agent', 'agent_id', 'agentId', 'produced_by', 'producedBy', 'producer',
  'confidence', 'confidence_score', 'certainty',
  'reasoning', 'reasoning_trace', 'rationale', 'thinking', 'thought', 'trace', 'chain_of_thought',
];

/** The verifier must not be the producer, and must not see the producer's context. */
function checkIndependence({ producer, verifier, sharedContext = false, input = null }) {
  const reasons = [];
  const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();

  if (norm(producer) && norm(producer) === norm(verifier)) reasons.push('same_agent');
  if (sharedContext === true) reasons.push('shared_context');
  if (input && typeof input === 'object') {
    if (Object.keys(input).some(key => LEAK_FIELDS.includes(key))) reasons.push('leaked_producer_fields');
  }

  return { independent: reasons.length === 0, reasons };
}

module.exports = {
  VERDICTS,
  BLOCKING_VERDICTS,
  CONFIDENCE_LADDER,
  DEFAULTS,
  VERDICT_JSON_SCHEMA,
  loadVerifierConfig,
  normalizeSample,
  aggregateSamples,
  applyAuthority,
  finalizeVerdict,
  evaluateRetry,
  checkIndependence,
  isBlocking,
};
