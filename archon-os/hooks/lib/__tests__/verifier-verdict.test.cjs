/**
 * Tests for archon-os/hooks/lib/verifier-verdict.cjs — FEAT-E AC2-AC6.
 *
 * Covers: the structured verdict with checks_not_possible, confidence from k=3
 * agreement (never self-report), asymmetric authority by construction, retry
 * requires a NEW probe, and a configurable loop cap + threshold with defaults.
 */

const {
  VERDICTS,
  BLOCKING_VERDICTS,
  CONFIDENCE_LADDER,
  DEFAULTS,
  loadVerifierConfig,
  normalizeSample,
  aggregateSamples,
  applyAuthority,
  finalizeVerdict,
  evaluateRetry,
  checkIndependence,
  isBlocking,
  VERDICT_JSON_SCHEMA,
} = require('../verifier-verdict.cjs');

const sample = (verdict, extra = {}) => ({ verdict, checks_not_possible: [], ...extra });

describe('verdict enum + schema', () => {
  it('is exactly FEAT-E six-value enum', () => {
    expect(VERDICTS).toEqual([
      'SUPPORTED', 'OVERGENERALIZED', 'WRONG_CAUSE', 'UNDERSPECIFIED', 'REFUTED', 'CANNOT_CHECK',
    ]);
  });

  it('lets only the three adverse verdicts block', () => {
    expect(BLOCKING_VERDICTS).toEqual(['OVERGENERALIZED', 'WRONG_CAUSE', 'REFUTED']);
    expect(BLOCKING_VERDICTS).not.toContain('SUPPORTED');
    expect(BLOCKING_VERDICTS).not.toContain('CANNOT_CHECK');
  });

  it('exposes isBlocking as the one predicate for "may this block?"', () => {
    for (const v of VERDICTS) expect(isBlocking(v)).toBe(BLOCKING_VERDICTS.includes(v));
    expect(isBlocking('NOT_A_VERDICT')).toBe(false);
  });

  it('exposes a --json-schema with ENUMS and typed numbers, not bare strings', () => {
    const props = VERDICT_JSON_SCHEMA.properties;
    expect(props.verdict.enum).toEqual(VERDICTS);
    expect(props.confidence.enum).toEqual(CONFIDENCE_LADDER);
    expect(props.checks_not_possible.type).toBe('array');
    expect(VERDICT_JSON_SCHEMA.required).toContain('checks_not_possible');
    expect(VERDICT_JSON_SCHEMA.required).toContain('verdict');
  });
});

describe('loadVerifierConfig — AC6 configurable with a default', () => {
  it('defaults to k=3 with a threshold and a loop cap', () => {
    const c = loadVerifierConfig({});
    expect(c.k).toBe(3);
    expect(c.k).toBe(DEFAULTS.k);
    expect(c.agreementThreshold).toBe(DEFAULTS.agreementThreshold);
    expect(c.loopCap).toBe(DEFAULTS.loopCap);
  });

  it('honours user overrides', () => {
    const c = loadVerifierConfig({
      ARCHON_VERIFIER_K: '5',
      ARCHON_VERIFIER_THRESHOLD: '0.8',
      ARCHON_VERIFIER_LOOP_CAP: '4',
    });
    expect(c.k).toBe(5);
    expect(c.agreementThreshold).toBe(0.8);
    expect(c.loopCap).toBe(4);
  });

  it('clamps nonsense back to the default instead of disabling the gate', () => {
    const c = loadVerifierConfig({ ARCHON_VERIFIER_K: '0', ARCHON_VERIFIER_THRESHOLD: 'abc', ARCHON_VERIFIER_LOOP_CAP: '-3' });
    expect(c.k).toBe(DEFAULTS.k);
    expect(c.agreementThreshold).toBe(DEFAULTS.agreementThreshold);
    expect(c.loopCap).toBe(DEFAULTS.loopCap);
  });
});

describe('normalizeSample — the model never supplies the number that matters', () => {
  it('drops a model-reported confidence', () => {
    const n = normalizeSample({ verdict: 'REFUTED', confidence: 'HIGH', checks_not_possible: [] });
    expect(n.verdict).toBe('REFUTED');
    expect(n.confidence).toBeUndefined();
  });

  it('drops any numeric self-score', () => {
    const n = normalizeSample({ verdict: 'SUPPORTED', confidence_score: 0.99, certainty: 1 });
    expect(n.confidence_score).toBeUndefined();
    expect(n.certainty).toBeUndefined();
  });

  it('coerces an unknown or missing verdict to CANNOT_CHECK', () => {
    expect(normalizeSample({ verdict: 'LOOKS_FINE' }).verdict).toBe('CANNOT_CHECK');
    expect(normalizeSample({}).verdict).toBe('CANNOT_CHECK');
    expect(normalizeSample(null).verdict).toBe('CANNOT_CHECK');
  });

  it('always populates checks_not_possible — AC2', () => {
    expect(normalizeSample({ verdict: 'SUPPORTED' }).checks_not_possible).toEqual([]);
    expect(normalizeSample({ verdict: 'SUPPORTED', checks_not_possible: 'nope' }).checks_not_possible).toEqual(['nope']);
  });
});

describe('aggregateSamples — AC3 confidence from k=3 agreement', () => {
  const cfg = loadVerifierConfig({});

  it('3/3 agreement is HIGH with agreement 1', () => {
    const a = aggregateSamples([sample('REFUTED'), sample('REFUTED'), sample('REFUTED')], cfg);
    expect(a.k).toBe(3);
    expect(a.verdict).toBe('REFUTED');
    expect(a.agreement).toBe(1);
    expect(a.confidence).toBe('HIGH');
  });

  it('2/3 agreement is MEDIUM with the modal verdict', () => {
    const a = aggregateSamples([sample('OVERGENERALIZED'), sample('OVERGENERALIZED'), sample('SUPPORTED')], cfg);
    expect(a.verdict).toBe('OVERGENERALIZED');
    expect(a.agreement).toBeCloseTo(2 / 3, 5);
    expect(a.confidence).toBe('MEDIUM');
  });

  it('a 3-way split is LOW and refuses to pick a winner', () => {
    const a = aggregateSamples([sample('SUPPORTED'), sample('REFUTED'), sample('UNDERSPECIFIED')], cfg);
    expect(a.confidence).toBe('LOW');
    expect(a.tie).toBe(true);
    expect(a.verdict).toBe('CANNOT_CHECK');
  });

  it('breaks an even tie toward the adverse verdict, never toward SUPPORTED', () => {
    const a = aggregateSamples([sample('SUPPORTED'), sample('WRONG_CAUSE')], cfg);
    expect(a.verdict).toBe('WRONG_CAUSE');
  });

  it('ignores a unanimous model self-report of HIGH when the samples disagree', () => {
    const a = aggregateSamples([
      sample('SUPPORTED', { confidence: 'HIGH' }),
      sample('REFUTED', { confidence: 'HIGH' }),
      sample('REFUTED', { confidence: 'HIGH' }),
    ], cfg);
    expect(a.confidence).toBe('MEDIUM');
    expect(a.verdict).toBe('REFUTED');
  });

  it('cannot check with no samples', () => {
    const a = aggregateSamples([], cfg);
    expect(a.verdict).toBe('CANNOT_CHECK');
    expect(a.confidence).toBe('LOW');
    expect(a.agreement).toBe(0);
  });

  it('unions checks_not_possible across samples', () => {
    const a = aggregateSamples([
      sample('SUPPORTED', { checks_not_possible: ['no_network'] }),
      sample('SUPPORTED', { checks_not_possible: ['no_network', 'no_db'] }),
      sample('SUPPORTED'),
    ], cfg);
    expect(a.checks_not_possible.sort()).toEqual(['no_db', 'no_network']);
  });
});

describe('applyAuthority — AC4 asymmetric authority by construction', () => {
  const cfg = loadVerifierConfig({});
  const agg = (verdict, agreement = 1) => ({ verdict, agreement, confidence: agreement === 1 ? 'HIGH' : 'MEDIUM', k: 3, checks_not_possible: [] });

  it('a SUPPORTED verdict is a NO-OP: it never raises confidence', () => {
    for (const prior of CONFIDENCE_LADDER) {
      const r = applyAuthority({ priorConfidence: prior, aggregate: agg('SUPPORTED'), config: cfg });
      expect(r.confidence).toBe(prior);
      expect(r.blocked).toBe(false);
      expect(r.advisory).toBe(true);
    }
  });

  it('an adverse verdict above threshold blocks and lowers confidence', () => {
    const r = applyAuthority({ priorConfidence: 'HIGH', aggregate: agg('OVERGENERALIZED'), config: cfg });
    expect(r.blocked).toBe(true);
    expect(r.confidence).toBe('LOW');
  });

  it('an adverse verdict below threshold still cannot raise confidence', () => {
    const r = applyAuthority({ priorConfidence: 'LOW', aggregate: agg('REFUTED', 0.34), config: cfg });
    expect(CONFIDENCE_LADDER.indexOf(r.confidence)).toBeLessThanOrEqual(CONFIDENCE_LADDER.indexOf('LOW'));
    expect(r.blocked).toBe(false);
  });

  it('holds the monotonic invariant for EVERY verdict x prior pair', () => {
    for (const verdict of VERDICTS) {
      for (const prior of CONFIDENCE_LADDER) {
        for (const agreement of [0, 0.34, 2 / 3, 1]) {
          const r = applyAuthority({ priorConfidence: prior, aggregate: agg(verdict, agreement), config: cfg });
          expect(CONFIDENCE_LADDER.indexOf(r.confidence))
            .toBeLessThanOrEqual(CONFIDENCE_LADDER.indexOf(prior));
        }
      }
    }
  });
});

describe('finalizeVerdict — the single composition point', () => {
  const cfg = loadVerifierConfig({});

  it('a verdict whose counterfactual probe did not run may not be SUPPORTED', () => {
    const r = finalizeVerdict({
      gate: { blocked: false, verdict: null, counterfactual_ran: false, checks_not_possible: ['counterfactual_probe_not_run'] },
      samples: [sample('SUPPORTED'), sample('SUPPORTED'), sample('SUPPORTED')],
      priorConfidence: 'HIGH',
      config: cfg,
    });
    expect(r.verdict).toBe('CANNOT_CHECK');
    expect(r.checks_not_possible).toContain('counterfactual_probe_not_run');
  });

  it('a unanimous model SUPPORTED cannot overturn the deterministic gate', () => {
    const r = finalizeVerdict({
      gate: {
        blocked: true, verdict: 'WRONG_CAUSE', counterfactual_ran: false,
        reasons: ['universal_from_single_instance'], checks_not_possible: ['counterfactual_probe_not_run'],
      },
      samples: [sample('SUPPORTED'), sample('SUPPORTED'), sample('SUPPORTED')],
      priorConfidence: 'HIGH',
      config: cfg,
    });
    expect(r.blocked).toBe(true);
    expect(r.verdict).toBe('WRONG_CAUSE');
    expect(r.confidence).toBe('LOW');
    expect(r.model_calls_needed).toBe(false);
  });

  it('runs the deterministic gate at zero model cost when it already blocks', () => {
    const r = finalizeVerdict({
      gate: { blocked: true, verdict: 'OVERGENERALIZED', counterfactual_ran: false, reasons: [], checks_not_possible: [] },
      samples: [],
      priorConfidence: 'MEDIUM',
      config: cfg,
    });
    expect(r.blocked).toBe(true);
    expect(r.model_calls_needed).toBe(false);
  });

  it('keeps SUPPORTED advisory when the counterfactual did run', () => {
    const r = finalizeVerdict({
      gate: { blocked: false, verdict: null, counterfactual_ran: true, reasons: [], checks_not_possible: [] },
      samples: [sample('SUPPORTED'), sample('SUPPORTED'), sample('SUPPORTED')],
      priorConfidence: 'MEDIUM',
      config: cfg,
    });
    expect(r.verdict).toBe('SUPPORTED');
    expect(r.blocked).toBe(false);
    expect(r.confidence).toBe('MEDIUM');
  });

  it('always returns the full structured verdict — AC2', () => {
    const r = finalizeVerdict({ gate: {}, samples: [], priorConfidence: 'HIGH', config: cfg });
    for (const key of ['verdict', 'confidence', 'agreement_confidence', 'agreement', 'k', 'blocked', 'checks_not_possible', 'reasons']) {
      expect(r).toHaveProperty(key);
    }
    expect(VERDICTS).toContain(r.verdict);
    expect(CONFIDENCE_LADDER).toContain(r.confidence);
  });
});

describe('evaluateRetry — AC5 a retry must change the EVIDENCE', () => {
  const cfg = loadVerifierConfig({});

  it('rejects a retry that only rephrases', () => {
    const r = evaluateRetry({ attempt: 1, probeLedger: ['claude -p "/run"'], newProbe: null, config: cfg });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('no_new_evidence');
  });

  it('rejects a retry that repeats a probe already in the ledger', () => {
    const r = evaluateRetry({ attempt: 1, probeLedger: ['claude -p "/run"'], newProbe: 'claude  -p "/run"', config: cfg });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('no_new_evidence');
  });

  it('allows a retry that adds a genuinely new probe', () => {
    const r = evaluateRetry({ attempt: 1, probeLedger: ['claude -p "/run"'], newProbe: 'claude -p "/archon-os:run"', config: cfg });
    expect(r.allowed).toBe(true);
    expect(r.probeLedger).toHaveLength(2);
  });

  it('escalates to a HUMAN at the loop cap instead of optimizing a score', () => {
    const r = evaluateRetry({ attempt: cfg.loopCap, probeLedger: ['a'], newProbe: 'b', config: cfg });
    expect(r.allowed).toBe(false);
    expect(r.escalate_to_human).toBe(true);
    expect(r.reason).toBe('loop_cap_reached');
  });

  it('respects a user-raised loop cap', () => {
    const cfg4 = loadVerifierConfig({ ARCHON_VERIFIER_LOOP_CAP: '4' });
    expect(evaluateRetry({ attempt: 2, probeLedger: ['a'], newProbe: 'b', config: cfg4 }).allowed).toBe(true);
  });
});

describe('checkIndependence — the verifier is provably not the builder', () => {
  it('rejects a self-graded result', () => {
    const r = checkIndependence({ producer: 'architect', verifier: 'architect' });
    expect(r.independent).toBe(false);
    expect(r.reasons).toContain('same_agent');
  });

  it('rejects shared context even between different agents', () => {
    const r = checkIndependence({ producer: 'architect', verifier: 'independent-verifier', sharedContext: true });
    expect(r.independent).toBe(false);
    expect(r.reasons).toContain('shared_context');
  });

  it('rejects an input that leaks the producer reasoning trace', () => {
    const r = checkIndependence({
      producer: 'architect',
      verifier: 'independent-verifier',
      input: { claim_under_test: 'x', reasoning: 'because I said so' },
    });
    expect(r.independent).toBe(false);
    expect(r.reasons).toContain('leaked_producer_fields');
  });

  it('accepts a fresh verifier with a blind input', () => {
    const r = checkIndependence({
      producer: 'architect',
      verifier: 'independent-verifier',
      input: { claim_under_test: 'x', observation: 'y', evidence: [] },
    });
    expect(r.independent).toBe(true);
    expect(r.reasons).toEqual([]);
  });
});
