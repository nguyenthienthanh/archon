/**
 * Tests for archon-os/scripts/verifier-corpus-eval.cjs — FEAT-E AC7.
 *
 * The labelled corpus is committed, the deterministic gate is measured on it,
 * and the CoVe keep-or-delete decision is DERIVED from those measurements plus
 * a zero-reference proof whose population comes FROM THE SOURCE (git ls-files),
 * never from a hand-written list of touch points.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '../verifier-corpus-eval.cjs');
const CORPUS = path.join(__dirname, '../verifier-corpus/claims.json');
const REPO_ROOT = path.join(__dirname, '../../..');

const {
  loadCorpus,
  scoreCorpus,
  coveReferences,
  decideCove,
  RECALL_FLOORS,
} = require('../verifier-corpus-eval.cjs');

describe('the committed corpus', () => {
  const corpus = loadCorpus(CORPUS);

  it('exists and is labelled', () => {
    expect(fs.existsSync(CORPUS)).toBe(true);
    expect(corpus.claims.length).toBeGreaterThanOrEqual(6);
    for (const c of corpus.claims) {
      expect(['TRUE', 'FALSE']).toContain(c.label);
      expect(typeof c.id).toBe('string');
      expect(typeof c.claim).toBe('string');
      expect(c.provenance).toBeTruthy();
    }
  });

  it('has unique ids', () => {
    const ids = corpus.claims.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries the FEAT-E seeds: the claude -p case, false claims and true claims', () => {
    const labels = corpus.claims.map(c => c.label);
    expect(labels.filter(l => l === 'FALSE').length).toBeGreaterThanOrEqual(2);
    expect(labels.filter(l => l === 'TRUE').length).toBeGreaterThanOrEqual(3);
    expect(corpus.claims.some(c => /claude -p/.test(c.claim))).toBe(true);
  });

  it('classifies every FALSE claim by defect class', () => {
    for (const c of corpus.claims.filter(x => x.label === 'FALSE')) {
      expect(['overgeneralization', 'wrong_cause', 'factual_inaccuracy', 'unsupported_provenance'])
        .toContain(c.defect_class);
      expect(c.real_cause).toBeTruthy();
    }
  });
});

describe('scoreCorpus — measured, not claimed', () => {
  const score = scoreCorpus(loadCorpus(CORPUS));

  it('catches every reasoning-error FALSE claim with zero model calls', () => {
    expect(score.by_class.overgeneralization.recall).toBe(1);
    expect(score.by_class.wrong_cause.recall).toBe(1);
    expect(score.model_calls).toBe(0);
  });

  it('does not block a single TRUE claim', () => {
    expect(score.false_positive_rate_true).toBe(0);
  });

  it('reports honestly that it cannot catch factual inaccuracy without the model arm', () => {
    expect(score.by_class.factual_inaccuracy.recall).toBeLessThan(1);
    expect(score.needs_model_arm.length).toBeGreaterThan(0);
  });

  it('keeps per-claim results auditable', () => {
    expect(score.results.length).toBe(loadCorpus(CORPUS).claims.length);
    for (const r of score.results) {
      expect(typeof r.blocked).toBe('boolean');
      expect(typeof r.correct).toBe('boolean');
    }
  });

  it('publishes floors fitted on this corpus, not a magic number', () => {
    expect(RECALL_FLOORS.overgeneralization).toBe(1);
    expect(RECALL_FLOORS.wrong_cause).toBe(1);
    expect(RECALL_FLOORS.false_positive_rate_true).toBe(0);
  });
});

describe('coveReferences — zero-reference proof, population FROM SOURCE', () => {
  const refs = coveReferences(REPO_ROOT);

  it('takes the file population from git ls-files, not a hand-written list', () => {
    expect(refs.scanned).toBeGreaterThan(100);
    expect(refs.source).toBe('git ls-files');
  });

  it('matches the full name, not a prefix', () => {
    expect(refs.needles).toContain('chain-of-verification');
    for (const n of refs.needles) expect(n.length).toBeGreaterThan(5);
  });

  it('finds the CoVe references that exist today', () => {
    expect(refs.count).toBeGreaterThan(0);
    expect(refs.files).toContain('archon-os/skills/chain-of-verification/SKILL.md');
    expect(refs.files).toContain('archon-os/rules/workflow/chain-of-verification.md');
  });

  it('finds MORE touch points than the 4 the spec listed', () => {
    expect(refs.count).toBeGreaterThan(4);
  });

  it('every self-exemption still exists — a stale exemption cannot widen quietly', () => {
    expect(refs.self_excluded.length).toBeGreaterThan(0);
    for (const rel of refs.self_excluded) {
      expect(fs.existsSync(path.join(REPO_ROOT, rel))).toBe(true);
    }
  });
});

describe('decideCove — the replacement must be EARNED', () => {
  const winning = { haiku_recall_false: 0.9, cove_recall_false: 0.5, haiku_agreement_with_false: 0.1, cove_agreement_with_false: 0.4 };

  it('keeps CoVe while any reference remains, even with a winning measurement', () => {
    const d = decideCove({ measurement: winning, refs: { count: 12 } });
    expect(d.decision).toBe('keep');
    expect(d.reasons).toContain('references_remain');
  });

  it('keeps CoVe while the Haiku arm is unmeasured', () => {
    const d = decideCove({ measurement: null, refs: { count: 0 } });
    expect(d.decision).toBe('keep');
    expect(d.reasons).toContain('haiku_arm_not_measured');
  });

  it('keeps CoVe when Haiku loses on recall over FALSE claims', () => {
    const d = decideCove({
      measurement: { ...winning, haiku_recall_false: 0.4, cove_recall_false: 0.6 },
      refs: { count: 0 },
    });
    expect(d.decision).toBe('keep');
    expect(d.reasons).toContain('haiku_loses_recall_over_false_claims');
  });

  it('keeps CoVe when Haiku agrees with false claims as often as CoVe', () => {
    const d = decideCove({
      measurement: { ...winning, haiku_agreement_with_false: 0.4 },
      refs: { count: 0 },
    });
    expect(d.decision).toBe('keep');
    expect(d.reasons).toContain('agreement_with_false_not_lower');
  });

  it('deletes only on a won corpus AND a zero-reference proof', () => {
    const d = decideCove({ measurement: winning, refs: { count: 0 } });
    expect(d.decision).toBe('delete');
    expect(d.reasons).toEqual([]);
  });

  it('agrees with the decision recorded in the corpus file today', () => {
    const corpus = loadCorpus(CORPUS);
    const derived = decideCove({ measurement: corpus.cove_decision.measurement, refs: coveReferences(REPO_ROOT) });
    expect(corpus.cove_decision.decision).toBe(derived.decision);
    expect(corpus.cove_decision.decision).toBe('keep');
    expect(corpus.cove_decision.reasons.sort()).toEqual(derived.reasons.sort());
  });
});

describe('verifier-corpus-eval CLI — promotable to a CI gate', () => {
  it('passes on the committed corpus', () => {
    const r = spawnSync('node', [SCRIPT, '--json'], { encoding: 'utf8', cwd: REPO_ROOT });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.cove_decision.decision).toBe('keep');
    expect(out.score.false_positive_rate_true).toBe(0);
  });

  it('fails when a reasoning-error FALSE claim stops being caught', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-corpus-'));
    const file = path.join(dir, 'claims.json');
    const corpus = loadCorpus(CORPUS);
    corpus.claims = [{
      id: 'R-001',
      label: 'FALSE',
      defect_class: 'overgeneralization',
      real_cause: 'regression fixture',
      provenance: 'synthetic',
      claim: 'the suite is fine',
      observation: 'it passed',
      evidence: [{ probe: 'npx jest', outcome: 'pass' }],
    }];
    fs.writeFileSync(file, JSON.stringify(corpus));
    const r = spawnSync('node', [SCRIPT, '--corpus', file], { encoding: 'utf8', cwd: REPO_ROOT });
    expect(r.status).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/recall/i);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
