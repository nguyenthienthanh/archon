/**
 * Tests for aura-frog/hooks/lib/claim-scope-gate.cjs — FEAT-E AC1.
 *
 * The deterministic, zero-cost, NON-LLM gate that runs BEFORE any model call.
 * Tested at BOTH ends on purpose: a gate exercised only on the blocking side is
 * a gate that always blocks (FEAT-E AC1, verbatim).
 */

const {
  UNIVERSAL_PATTERNS,
  CONFOUNDER_SIGNATURES,
  PRODUCER_FIELDS,
  findUniversalQuantifier,
  countDistinctProbes,
  counterfactualRan,
  positiveControlPassed,
  findConfounders,
  buildBlindInput,
  evaluateScope,
} = require('../claim-scope-gate.cjs');

// The motivating failure, verbatim from FEAT-E: a TRUE observation and a FALSE,
// over-generalized conclusion, from exactly ONE probe.
const MOTIVATING_CASE = {
  conclusion: 'claude -p does not accept slash commands',
  observation: 'ran claude -p "/run" and it printed: Error: Reached max turns (1)',
  evidence: [{ probe: 'claude -p "/run"', outcome: 'fail' }],
};

describe('claim-scope-gate — pattern tables', () => {
  it('ships the universal quantifiers FEAT-E names', () => {
    expect(UNIVERSAL_PATTERNS.length).toBeGreaterThan(0);
    for (const phrase of ['does not support', 'cannot', 'always', 'never', 'is broken']) {
      expect(findUniversalQuantifier(`the tool ${phrase} it`)).toBeTruthy();
    }
  });

  it('maps confounder signatures to a non-capability cause', () => {
    expect(Object.keys(CONFOUNDER_SIGNATURES).length).toBeGreaterThan(0);
  });
});

describe('findUniversalQuantifier', () => {
  it('flags a universal claim', () => {
    expect(findUniversalQuantifier('claude -p does not accept slash commands')).toBe('does not accept');
  });

  it('flags cannot / never / always / is broken', () => {
    expect(findUniversalQuantifier('the hook cannot read stdin')).toBe('cannot');
    expect(findUniversalQuantifier('the cache is never written')).toBe('never');
    expect(findUniversalQuantifier('jest always forks a worker')).toBe('always');
    expect(findUniversalQuantifier('the dispatcher is broken')).toBe('is broken');
  });

  // NEGATIVE END — a properly scoped claim must not match.
  it('does NOT flag a claim scoped to its evidence', () => {
    expect(findUniversalQuantifier(
      'claude -p "/run" exited with "Reached max turns (1)" under --max-turns 1'
    )).toBeNull();
    expect(findUniversalQuantifier(
      'the plugin command /aura-frog:run executed in print mode'
    )).toBeNull();
    expect(findUniversalQuantifier('88 of 89 jest suites passed on this branch')).toBeNull();
  });

  it('tolerates empty and non-string input', () => {
    expect(findUniversalQuantifier('')).toBeNull();
    expect(findUniversalQuantifier(undefined)).toBeNull();
    expect(findUniversalQuantifier(null)).toBeNull();
  });
});

describe('countDistinctProbes', () => {
  it('counts distinct probe inputs', () => {
    expect(countDistinctProbes([
      { probe: 'claude -p "/run"', outcome: 'fail' },
      { probe: 'claude -p "/aura-frog:run"', outcome: 'pass' },
    ])).toBe(2);
  });

  it('counts a repeat of the SAME input as one instance', () => {
    expect(countDistinctProbes([
      { probe: 'claude -p "/run"', outcome: 'fail' },
      { probe: 'claude  -p   "/run"', outcome: 'fail' },
    ])).toBe(1);
  });

  it('treats a prose blob as at most one instance', () => {
    expect(countDistinctProbes('I ran it and it failed')).toBe(1);
    expect(countDistinctProbes('')).toBe(0);
    expect(countDistinctProbes(undefined)).toBe(0);
    expect(countDistinctProbes([])).toBe(0);
  });
});

describe('counterfactual probe + positive control', () => {
  it('reports no counterfactual when only one input was tried', () => {
    expect(counterfactualRan(MOTIVATING_CASE.evidence)).toBe(false);
    expect(positiveControlPassed(MOTIVATING_CASE.evidence)).toBe(false);
  });

  it('reports a counterfactual once a second valid input of the same class ran', () => {
    const ev = [
      { probe: 'claude -p "/run"', outcome: 'fail' },
      { probe: 'claude -p "/aura-frog:run"', outcome: 'pass' },
    ];
    expect(counterfactualRan(ev)).toBe(true);
    expect(positiveControlPassed(ev)).toBe(true);
  });

  it('a second FAILING input is still a counterfactual but not a positive control', () => {
    const ev = [
      { probe: 'claude -p "/help"', outcome: 'fail' },
      { probe: 'claude -p "/zzz-does-not-exist"', outcome: 'fail' },
    ];
    expect(counterfactualRan(ev)).toBe(true);
    expect(positiveControlPassed(ev)).toBe(false);
  });
});

describe('findConfounders — "the tool is broken" vs "you called it wrong"', () => {
  it('identifies --max-turns exhaustion, not a capability gap', () => {
    expect(findConfounders('Error: Reached max turns (1)')).toContain('max_turns_limit');
  });

  it('identifies a command name that does not exist', () => {
    expect(findConfounders("command isn't installed")).toContain('command_name_not_found');
  });

  it('identifies a terminal-only built-in in print mode', () => {
    expect(findConfounders("/help isn't available in this environment"))
      .toContain('builtin_unavailable_in_print_mode');
  });

  it('returns nothing for output with no known confounder', () => {
    expect(findConfounders('assertion failed: expected 2 received 3')).toEqual([]);
  });
});

describe('buildBlindInput — FEAT-E blind inputs', () => {
  const raw = {
    conclusion: 'x cannot y',
    observation: 'it failed',
    evidence: [{ probe: 'p', outcome: 'fail' }],
    author: 'architect',
    agent_id: 'architect',
    produced_by: 'architect',
    confidence: 'HIGH',
    reasoning: 'I think because...',
    thinking: 'chain of thought',
    trace: ['step 1'],
  };

  it('withholds who produced the claim, its self-confidence and its reasoning', () => {
    const blind = buildBlindInput(raw);
    const serialized = JSON.stringify(blind);
    for (const banned of ['author', 'agent_id', 'produced_by', 'confidence', 'reasoning', 'thinking', 'trace']) {
      expect(Object.keys(blind)).not.toContain(banned);
      expect(serialized).not.toContain(banned);
    }
  });

  it('names every producer field it strips, in one list', () => {
    for (const banned of Object.keys(raw).filter(k => !['conclusion', 'observation', 'evidence'].includes(k))) {
      expect(PRODUCER_FIELDS).toContain(banned);
    }
  });

  it('keeps the observation and the evidence', () => {
    const blind = buildBlindInput(raw);
    expect(blind.observation).toBe('it failed');
    expect(blind.evidence).toHaveLength(1);
  });

  it('does not show the conclusion for confirmation — it is carried as the claim under test', () => {
    const blind = buildBlindInput(raw);
    expect(blind.claim_under_test).toBe('x cannot y');
    expect(blind.conclusion).toBeUndefined();
  });
});

describe('evaluateScope — BLOCKING end', () => {
  it('blocks the motivating case: universal quantifier from one instance', () => {
    const r = evaluateScope(MOTIVATING_CASE);
    expect(r.blocked).toBe(true);
    expect(['OVERGENERALIZED', 'WRONG_CAUSE']).toContain(r.verdict);
    expect(r.quantifier).toBe('does not accept');
    expect(r.instances).toBe(1);
    expect(r.reasons).toContain('universal_from_single_instance');
    expect(r.checks_not_possible).toContain('counterfactual_probe_not_run');
  });

  it('names the real cause of the motivating case instead of "the tool is broken"', () => {
    const r = evaluateScope(MOTIVATING_CASE);
    expect(r.verdict).toBe('WRONG_CAUSE');
    expect(r.alternative_causes).toContain('max_turns_limit');
    expect(r.required_probes.length).toBeGreaterThan(0);
  });

  it('blocks a universal claim contradicted by a passing instance of the same class', () => {
    const r = evaluateScope({
      conclusion: 'claude -p does not accept slash commands',
      observation: 'ran claude -p "/run": Error: Reached max turns (1)',
      evidence: [
        { probe: 'claude -p "/run"', outcome: 'fail' },
        { probe: 'claude -p "/help"', outcome: 'fail' },
        { probe: 'claude -p "/aura-frog:run"', outcome: 'pass' },
      ],
    });
    expect(r.blocked).toBe(true);
    expect(r.reasons).toContain('positive_control_contradicts');
    expect(r.instances).toBe(3);
  });

  it('never returns SUPPORTED — the deterministic gate may only lower', () => {
    for (const fixture of [MOTIVATING_CASE, { conclusion: 'x', observation: 'y', evidence: [] }]) {
      expect(evaluateScope(fixture).verdict).not.toBe('SUPPORTED');
    }
  });
});

describe('evaluateScope — PASSING end (the gate is not a blanket block)', () => {
  it('passes a claim scoped to its single instance', () => {
    const r = evaluateScope({
      conclusion: 'claude -p "/run" exits with "Reached max turns" under --max-turns 1',
      observation: 'Error: Reached max turns (1)',
      evidence: [{ probe: 'claude -p "/run" --max-turns 1', outcome: 'fail' }],
    });
    expect(r.blocked).toBe(false);
    expect(r.verdict).toBeNull();
    expect(r.needs_model).toBe(true);
  });

  it('passes a universal claim whose counterfactual ran and did not contradict it', () => {
    const r = evaluateScope({
      conclusion: 'claude -p cannot run terminal-only built-ins',
      observation: "both printed: isn't available in this environment",
      evidence: [
        { probe: 'claude -p "/help"', outcome: 'fail' },
        { probe: 'claude -p "/login"', outcome: 'fail' },
      ],
    });
    expect(r.blocked).toBe(false);
    expect(r.instances).toBe(2);
    expect(r.checks_not_possible).not.toContain('counterfactual_probe_not_run');
  });

  it('passes a properly scoped measurement claim', () => {
    const r = evaluateScope({
      conclusion: '88 of 89 jest suites pass on branch feat/session-memory-and-verifier',
      observation: 'npx jest printed: Tests: 1591 passed, 1 failed',
      evidence: [{ probe: 'npx jest', outcome: 'fail' }],
    });
    expect(r.blocked).toBe(false);
  });

  it('always populates checks_not_possible, on every path', () => {
    for (const fixture of [
      MOTIVATING_CASE,
      { conclusion: 'scoped thing happened once', observation: 'o', evidence: [{ probe: 'p', outcome: 'pass' }] },
      {},
    ]) {
      expect(Array.isArray(evaluateScope(fixture).checks_not_possible)).toBe(true);
    }
  });
});

describe('extractProbeCitations + scanResultText — free-text agent results', () => {
  const { extractProbeCitations, scanResultText } = require('../claim-scope-gate.cjs');

  it('extracts backticked and $-prefixed command citations', () => {
    const text = 'I ran `claude -p "/run"` and then\n$ npx jest\nboth misbehaved.';
    const probes = extractProbeCitations(text);
    expect(probes).toContain('claude -p "/run"');
    expect(probes).toContain('npx jest');
  });

  it('ignores prose in backticks that is not a command', () => {
    expect(extractProbeCitations('the `verdict` field is `SUPPORTED`')).toEqual([]);
  });

  it('builds a scope-gate input from a subagent result blob', () => {
    const scanned = scanResultText(
      'Checked it: I ran `claude -p "/run"` which printed Error: Reached max turns (1). '
      + 'Conclusion: claude -p does not accept slash commands.'
    );
    expect(scanned.conclusion).toMatch(/does not accept slash commands/);
    expect(scanned.evidence).toHaveLength(1);
    expect(evaluateScope(scanned).blocked).toBe(true);
  });

  it('returns no conclusion for a result with no universal claim', () => {
    expect(scanResultText('Added two files and ran the suite: 1591 passed.').conclusion).toBeNull();
  });

  it('does not block a free-text result that cites two distinct probes', () => {
    const scanned = scanResultText(
      'Probed `claude -p "/help"` and `claude -p "/login"`; both say not available. '
      + 'So claude -p cannot run terminal-only built-ins.'
    );
    expect(evaluateScope(scanned).blocked).toBe(false);
  });
});
