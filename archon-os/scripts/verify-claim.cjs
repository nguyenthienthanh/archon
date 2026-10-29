#!/usr/bin/env node
/**
 * verify-claim.cjs — the ONE entrypoint of the independent verifier (FEAT-E).
 *
 * It holds no logic of its own: the deterministic gate lives in
 * `hooks/lib/claim-scope-gate.cjs` and the verdict pipeline in
 * `hooks/lib/verifier-verdict.cjs`. One gate, one job, one place.
 *
 * Modes
 *   --hook              PostToolUse(Task) — scan a subagent's returned result.
 *                       Exit 2 feeds the reason back to the calling model.
 *   --gate              Structured claim on stdin → deterministic verdict plus
 *                       the BLIND input and JSON schema to hand the verifier.
 *   --aggregate         {gate, samples, priorConfidence, producer, verifier} on
                       stdin → one verdict. Refuses to issue one at all when the
                       verifier is the producer or shared its context.
  --retry             {attempt, probe_ledger, new_probe} on stdin → whether the
                       retry adds EVIDENCE, or escalates to a human.
 *
 * Flags
 *   --json              Machine-readable output (default for --gate/--aggregate
 *                       is still JSON; --json suppresses the human summary).
 *
 * Exit codes
 *   0  nothing adverse  |  1  adverse verdict (blocked)  |  2  usage error, or
 *   in --hook mode, blocked (PostToolUse exit 2 returns stderr to the model).
 *
 * Disable the hook: ARCHON_CLAIM_GATE=false
 * Tune: ARCHON_VERIFIER_K, ARCHON_VERIFIER_THRESHOLD, ARCHON_VERIFIER_LOOP_CAP
 */

const path = require('path');
const { readStdinSafely } = require(path.join(__dirname, '../hooks/lib/safe-stdin.cjs'));
const { evaluateScope, scanResultText, buildBlindInput } = require(path.join(__dirname, '../hooks/lib/claim-scope-gate.cjs'));
const {
  finalizeVerdict,
  loadVerifierConfig,
  evaluateRetry,
  checkIndependence,
  VERDICT_JSON_SCHEMA,
} = require(path.join(__dirname, '../hooks/lib/verifier-verdict.cjs'));

const USAGE = `Usage:
  verify-claim.cjs --hook                     # PostToolUse(Task) claim-scope gate
  verify-claim.cjs --gate [--json]      < claim.json
  verify-claim.cjs --aggregate [--json] < samples.json
  verify-claim.cjs --retry [--json]     < retry.json

Env: ARCHON_CLAIM_GATE=false (disable hook), ARCHON_VERIFIER_K, ARCHON_VERIFIER_THRESHOLD, ARCHON_VERIFIER_LOOP_CAP`;

function readJsonStdin() {
  try {
    const raw = readStdinSafely();
    if (!raw || !raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Flatten a tool_response that may be a string, a content array, or an object. */
function toolResponseText(response) {
  if (typeof response === 'string') return response;
  if (Array.isArray(response)) return response.map(toolResponseText).join('\n');
  if (response && typeof response === 'object') {
    if (typeof response.text === 'string') return response.text;
    if (response.content !== undefined) return toolResponseText(response.content);
    return Object.values(response).map(toolResponseText).join('\n');
  }
  return '';
}

function runHookMode() {
  if (process.env.ARCHON_CLAIM_GATE === 'false') return 0;

  const data = readJsonStdin();
  if (!data) return 0;

  // Only subagent results are in scope — this gate grades a produced RESULT,
  // and the tools that produce one are Task/Agent.
  const tool = String(data.tool_name || '');
  if (!/^(Task|Agent)$/i.test(tool)) return 0;

  const text = toolResponseText(data.tool_response);
  if (!text.trim()) return 0;

  const scanned = scanResultText(text);
  if (!scanned.conclusion) return 0;

  const gate = evaluateScope(scanned);
  if (!gate.blocked) return 0;

  const lines = [
    `⛔ Claim-scope gate: ${gate.verdict} — this result generalizes beyond its evidence.`,
    `   claim:      ${scanned.conclusion}`,
    `   quantifier: "${gate.quantifier}" over ${gate.instances} distinct probe(s)`,
    `   reasons:    ${gate.reasons.join(', ')}`,
  ];
  if (gate.alternative_causes.length) {
    lines.push(`   the failure already has a non-capability explanation: ${gate.alternative_causes.join(', ')}`);
  }
  for (const probe of gate.required_probes) lines.push(`   required:   ${probe}`);
  lines.push('   Narrow the claim to what was observed, or run the counterfactual probe. A retry must add EVIDENCE, not rewording.');
  console.error(lines.join('\n'));
  return 2;
}

function runGateMode(json) {
  const claim = readJsonStdin();
  if (!claim) {
    console.error('verify-claim --gate: expected a JSON claim on stdin');
    return 2;
  }

  const config = loadVerifierConfig(process.env);
  const gate = evaluateScope(claim);
  const verdict = finalizeVerdict({
    gate,
    samples: [],
    priorConfidence: 'HIGH',
    config,
  });

  const output = {
    ...verdict,
    // In gate mode `k` is the number of independent samples the caller must
    // still draw (none has been drawn yet).
    k: verdict.model_calls_needed ? config.k : verdict.k,
    quantifier: gate.quantifier,
    instances: gate.instances,
    counterfactual_ran: gate.counterfactual_ran,
    alternative_causes: gate.alternative_causes,
    required_probes: gate.required_probes,
    config,
    blind_input: buildBlindInput(claim),
    verdict_schema: VERDICT_JSON_SCHEMA,
  };

  console.log(JSON.stringify(output, null, json ? 0 : 2));
  return output.blocked ? 1 : 0;
}

function runAggregateMode(json) {
  const payload = readJsonStdin();
  if (!payload) {
    console.error('verify-claim --aggregate: expected {gate, samples, priorConfidence} on stdin');
    return 2;
  }

  const config = loadVerifierConfig(process.env);

  // Independence is a precondition, not a footnote: a self-graded result gets
  // no verdict at all. Undeclared identities cannot be checked, so they are
  // recorded as a coverage gap rather than assumed to be fine.
  const declared = payload.producer !== undefined || payload.verifier !== undefined;
  if (declared) {
    const independence = checkIndependence({
      producer: payload.producer,
      verifier: payload.verifier,
      sharedContext: payload.shared_context === true,
      input: payload.blind_input || null,
    });
    if (!independence.independent) {
      console.error(`⛔ verify-claim --aggregate: refusing a verdict — ${independence.reasons.join(', ')}`);
      console.error('   The verifier must not be the producing agent and must not share its context.');
      return 2;
    }
  }

  const verdict = finalizeVerdict({
    gate: payload.gate,
    samples: payload.samples,
    priorConfidence: payload.priorConfidence,
    config,
  });

  if (!declared && !verdict.checks_not_possible.includes('independence_not_declared')) {
    verdict.checks_not_possible.push('independence_not_declared');
  }

  console.log(JSON.stringify(verdict, null, json ? 0 : 2));
  return verdict.blocked ? 1 : 0;
}

function runRetryMode(json) {
  const payload = readJsonStdin();
  if (!payload) {
    console.error('verify-claim --retry: expected {attempt, probe_ledger, new_probe} on stdin');
    return 2;
  }

  const config = loadVerifierConfig(process.env);
  const decision = evaluateRetry({
    attempt: Number(payload.attempt) || 0,
    probeLedger: payload.probe_ledger || payload.probeLedger,
    newProbe: payload.new_probe || payload.newProbe || null,
    config,
  });

  console.log(JSON.stringify({ ...decision, config }, null, json ? 0 : 2));
  return decision.allowed ? 0 : 1;
}

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');

  if (args.includes('--hook')) return runHookMode();
  if (args.includes('--gate')) return runGateMode(json);
  if (args.includes('--aggregate')) return runAggregateMode(json);
  if (args.includes('--retry')) return runRetryMode(json);

  console.error(USAGE);
  return 2;
}

if (require.main === module) {
  process.exit(main(process.argv));
} else {
  module.exports = { toolResponseText, main };
}
