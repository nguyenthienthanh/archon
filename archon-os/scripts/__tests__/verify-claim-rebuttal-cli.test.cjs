/**
 * verify-claim.cjs --rebuttal and the round1->round2 flip log written by
 * --aggregate (the sycophancy metric — DESIGN_DECISIONS D7).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '../verify-claim.cjs');
const run = (args, input, env = {}) => spawnSync('node', [CLI, ...args], {
  input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ARCHON_CLAIM_GATE: undefined, ...env },
});

const CLAIM = {
  conclusion: 'claude -p never accepts slash commands',
  observation: 'Error: Reached max turns (1)',
  evidence: [{ probe: 'claude -p "/run"', outcome: 'fail' }],
};
const ROUND1 = { verdict: 'WRONG_CAUSE', blocked: true, confidence: 'MEDIUM' };

describe('verify-claim --rebuttal', () => {
  it('prints a BLIND input for fresh samples when a new probe is added — no argument, no round-1 text', () => {
    const r = run(['--rebuttal', '--json'], {
      claim: CLAIM, round1: ROUND1, attempt: 0, probe_ledger: ['claude -p "/run"'],
      rebuttal: { action: 'new_evidence', argument: 'I am sure', probes: [{ probe: 'claude -p "/run" --max-turns 5', outcome: 'pass' }] },
    });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.allowed).toBe(true);
    expect(out.blind_input.evidence).toHaveLength(2);
    expect(out.verdict_schema).toBeDefined();
    const blind = JSON.stringify(out.blind_input);
    expect(blind).not.toContain('I am sure');
    expect(blind).not.toContain('WRONG_CAUSE');
  });

  it('exits 1 and keeps round 1 when the rebuttal adds no new evidence', () => {
    const r = run(['--rebuttal', '--json'], {
      claim: CLAIM, round1: ROUND1, attempt: 0, probe_ledger: ['claude -p "/run"'],
      rebuttal: { action: 'new_evidence', probes: [{ probe: 'claude -p "/run"', outcome: 'fail' }] },
    });
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout)).toMatchObject({ reason: 'no_new_evidence', final: ROUND1 });
  });

  it('exits 2 on a non-numeric or negative attempt (review #9)', () => {
    for (const attempt of ['abc', -1]) {
      const r = run(['--rebuttal', '--json'], { claim: CLAIM, round1: ROUND1, attempt, rebuttal: { action: 'concede' } });
      expect(r.status).toBe(2);
    }
  });

  it('exits 2 on empty stdin', () => {
    expect(spawnSync('node', [CLI, '--rebuttal'], { input: '', encoding: 'utf8' }).status).toBe(2);
  });
});

describe('verify-claim --aggregate flip log', () => {
  it('appends one flip record when round1_verdict is given', () => {
    const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'flip-')), 'debate.jsonl');
    const samples = ['SUPPORTED', 'SUPPORTED', 'SUPPORTED'].map((verdict) => ({ verdict, checks_not_possible: ['x'] }));
    const r = run(['--aggregate', '--json'], {
      gate: { blocked: false, model_calls_needed: true }, samples, priorConfidence: 'HIGH',
      round1_verdict: 'WRONG_CAUSE', rebuttal_action: 'new_evidence',
    }, { ARCHON_DEBATE_LOG: log });
    const round2 = JSON.parse(r.stdout).verdict;
    const rows = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ round1: 'WRONG_CAUSE', round2, action: 'new_evidence', flipped: round2 !== 'WRONG_CAUSE' });
    expect(round2).not.toBe('WRONG_CAUSE');
  });

  it('still prints the verdict when the flip log cannot be written (review #3)', () => {
    const r = run(['--aggregate', '--json'], {
      gate: { blocked: false, model_calls_needed: true }, samples: [{ verdict: 'SUPPORTED', checks_not_possible: ['x'] }],
      priorConfidence: 'HIGH', round1_verdict: 'REFUTED',
    }, { ARCHON_DEBATE_LOG: '/dev/null/x/y.jsonl' });
    expect(JSON.parse(r.stdout).verdict).toBeDefined();
    expect(r.stderr).toMatch(/flip log/);
  });

  it('writes nothing without round1_verdict', () => {
    const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'flip-')), 'debate.jsonl');
    run(['--aggregate', '--json'], {
      gate: { blocked: false, model_calls_needed: true }, samples: [{ verdict: 'SUPPORTED', checks_not_possible: ['x'] }], priorConfidence: 'HIGH',
    }, { ARCHON_DEBATE_LOG: log });
    expect(fs.existsSync(log)).toBe(false);
  });
});
