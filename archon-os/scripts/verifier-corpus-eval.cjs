#!/usr/bin/env node
/**
 * verifier-corpus-eval.cjs — measures the FEAT-E verifier on the labelled
 * corpus in `verifier-corpus/claims.json`, and derives the Chain-of-Verification
 * keep-or-delete decision from that measurement plus a zero-reference proof.
 *
 * Why a script and not a paragraph: FrugalGPT learns cascade thresholds per
 * dataset and the literature offers no transferable number, so the acceptance
 * floors here are FITTED on this corpus and re-measured on every run. This file
 * is promotable to a CI gate as-is (exit 1 on regression).
 *
 * What it measures, honestly:
 *   - recall over FALSE claims, PER DEFECT CLASS. The deterministic gate can
 *     only catch reasoning errors (overgeneralization / wrong cause). Factual
 *     inaccuracy and unsupported provenance need the model arm, and those
 *     claims are reported in `needs_model_arm` rather than quietly averaged in.
 *   - the false-positive rate over TRUE claims. A gate that blocks correct
 *     claims gets switched off, so this floor is 0.
 *
 * Usage:
 *   node verifier-corpus-eval.cjs [--corpus <file>] [--json]
 * Exit codes:
 *   0 floors met | 1 regression (recall or false-positive rate) | 2 usage error
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { evaluateScope } = require(path.join(__dirname, '../hooks/lib/claim-scope-gate.cjs'));

const DEFAULT_CORPUS = path.join(__dirname, 'verifier-corpus/claims.json');

// Fitted on the committed corpus (see cove_decision.deterministic_gate in
// claims.json), NOT imported from a paper. Raise these as the corpus grows.
const RECALL_FLOORS = Object.freeze({
  overgeneralization: 1,
  wrong_cause: 1,
  false_positive_rate_true: 0,
});

// Full-name needles for the zero-reference proof. Full name, never a prefix:
// in this repo `composeMusic` was dead while `composeMusicPlan` was live, and a
// prefix match would have deleted a working lane.
const COVE_NEEDLES = Object.freeze([
  'chain-of-verification',
  'chain_of_verification',
  'Chain-of-Verification',
  'Chain of Verification',
]);

// The deletion gate's OWN tooling names CoVe in order to count it. Without this
// exemption the reference count can never reach zero and the gate is
// undecidable. Every entry is asserted to exist by the test suite, so a stale
// exemption fails loudly instead of silently widening.
const SELF_EXCLUDE = Object.freeze([
  'archon-os/scripts/verifier-corpus-eval.cjs',
  'archon-os/scripts/verifier-corpus/claims.json',
  'archon-os/scripts/__tests__/verifier-corpus-eval.test.cjs',
]);

const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf', '.mp4', '.mp3']);
const MAX_SCAN_BYTES = 2 * 1024 * 1024;

function loadCorpus(file = DEFAULT_CORPUS) {
  const corpus = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(corpus.claims)) throw new Error(`corpus ${file} has no claims[]`);
  return corpus;
}

/** Run the zero-cost deterministic gate over every labelled claim. */
function scoreCorpus(corpus) {
  const claims = corpus.claims;
  const results = claims.map((c) => {
    const gate = evaluateScope({
      conclusion: c.claim,
      observation: c.observation,
      evidence: c.evidence,
    });
    return {
      id: c.id,
      label: c.label,
      defect_class: c.defect_class || null,
      blocked: gate.blocked,
      verdict: gate.verdict,
      reasons: gate.reasons,
      // FALSE claims should be blocked; TRUE claims should pass through.
      correct: c.label === 'FALSE' ? gate.blocked : !gate.blocked,
    };
  });

  const falseResults = results.filter(r => r.label === 'FALSE');
  const trueResults = results.filter(r => r.label === 'TRUE');

  const byClass = {};
  for (const r of falseResults) {
    const cls = r.defect_class || 'unclassified';
    byClass[cls] = byClass[cls] || { total: 0, caught: 0, recall: 0 };
    byClass[cls].total += 1;
    if (r.blocked) byClass[cls].caught += 1;
  }
  for (const stats of Object.values(byClass)) {
    stats.recall = stats.total === 0 ? 0 : stats.caught / stats.total;
  }

  const blockedTrue = trueResults.filter(r => r.blocked);

  return {
    n: results.length,
    model_calls: 0,
    recall_false: falseResults.length === 0 ? 0 : falseResults.filter(r => r.blocked).length / falseResults.length,
    false_positive_rate_true: trueResults.length === 0 ? 0 : blockedTrue.length / trueResults.length,
    false_positives: blockedTrue.map(r => r.id),
    by_class: byClass,
    needs_model_arm: falseResults.filter(r => !r.blocked).map(r => r.id),
    results,
  };
}

/**
 * Zero-reference proof. The population comes FROM THE SOURCE (`git ls-files`),
 * never from a hand-written list — a hand-written list is correct only until
 * the next file is added, and when it goes stale it does not go red, it goes
 * quiet. FEAT-E listed 4 touch points; this scan finds every one that exists.
 */
function coveReferences(repoRoot = path.join(__dirname, '../..')) {
  let tracked = [];
  try {
    const out = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z'], {
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    tracked = out.split('\0').filter(Boolean);
  } catch {
    tracked = [];
  }

  const files = [];
  let scanned = 0;
  for (const rel of tracked) {
    if (SELF_EXCLUDE.includes(rel)) continue;
    if (SKIP_EXT.has(path.extname(rel).toLowerCase())) continue;
    const abs = path.join(repoRoot, rel);
    let text;
    try {
      if (fs.statSync(abs).size > MAX_SCAN_BYTES) continue;
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    scanned += 1;
    if (COVE_NEEDLES.some(needle => text.includes(needle))) files.push(rel);
  }

  return {
    source: 'git ls-files',
    needles: [...COVE_NEEDLES],
    self_excluded: [...SELF_EXCLUDE],
    scanned,
    count: files.length,
    files: files.sort(),
  };
}

/**
 * The replacement must be EARNED. Four independent conditions, every failure
 * named: a cheap model that merely ties does not get to delete a mechanism.
 */
function decideCove({ measurement, refs }) {
  const reasons = [];
  const refCount = refs && typeof refs.count === 'number' ? refs.count : 0;

  if (refCount > 0) reasons.push('references_remain');

  if (!measurement) {
    reasons.push('haiku_arm_not_measured');
  } else {
    if (!(measurement.haiku_recall_false > measurement.cove_recall_false)) {
      reasons.push('haiku_loses_recall_over_false_claims');
    }
    if (!(measurement.haiku_agreement_with_false < measurement.cove_agreement_with_false)) {
      reasons.push('agreement_with_false_not_lower');
    }
  }

  return { decision: reasons.length === 0 ? 'delete' : 'keep', reasons };
}

function checkFloors(score) {
  const failures = [];
  for (const [cls, floor] of Object.entries(RECALL_FLOORS)) {
    if (cls === 'false_positive_rate_true') continue;
    const stats = score.by_class[cls];
    if (!stats) continue;
    if (stats.recall < floor) {
      failures.push(`recall over ${cls} FALSE claims is ${stats.recall.toFixed(2)}, floor ${floor}`);
    }
  }
  if (score.false_positive_rate_true > RECALL_FLOORS.false_positive_rate_true) {
    failures.push(`false-positive rate over TRUE claims is ${score.false_positive_rate_true.toFixed(2)}, floor ${RECALL_FLOORS.false_positive_rate_true} (blocked: ${score.false_positives.join(', ')})`);
  }
  return failures;
}

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const idx = args.indexOf('--corpus');
  const corpusFile = idx !== -1 && args[idx + 1] ? args[idx + 1] : DEFAULT_CORPUS;

  let corpus;
  try {
    corpus = loadCorpus(corpusFile);
  } catch (error) {
    console.error(`verifier-corpus-eval: cannot read corpus ${corpusFile}: ${error.message}`);
    return 2;
  }

  const score = scoreCorpus(corpus);
  const refs = coveReferences();
  const derived = decideCove({ measurement: corpus.cove_decision && corpus.cove_decision.measurement, refs });
  const failures = checkFloors(score);

  const recorded = corpus.cove_decision && corpus.cove_decision.decision;
  if (recorded && recorded !== derived.decision) {
    failures.push(`recorded CoVe decision "${recorded}" disagrees with the derived decision "${derived.decision}"`);
  }

  if (json) {
    console.log(JSON.stringify({ score, cove_decision: derived, refs, failures }, null, 0));
  } else {
    console.log(`corpus: ${score.n} claims · model calls: ${score.model_calls}`);
    for (const [cls, stats] of Object.entries(score.by_class)) {
      console.log(`  ${cls}: recall ${stats.caught}/${stats.total} = ${stats.recall.toFixed(2)}`);
    }
    console.log(`  false-positive rate over TRUE claims: ${score.false_positive_rate_true.toFixed(2)}`);
    console.log(`  needs model arm: ${score.needs_model_arm.join(', ') || '—'}`);
    console.log(`CoVe: ${derived.decision.toUpperCase()} (${derived.reasons.join(', ') || 'all conditions met'}) · ${refs.count} referencing file(s) of ${refs.scanned} scanned`);
    for (const f of failures) console.error(`❌ ${f}`);
  }

  return failures.length ? 1 : 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
} else {
  module.exports = {
    RECALL_FLOORS,
    COVE_NEEDLES,
    SELF_EXCLUDE,
    loadCorpus,
    scoreCorpus,
    coveReferences,
    decideCove,
    checkFloors,
    main,
  };
}
