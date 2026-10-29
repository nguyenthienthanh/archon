/**
 * Tests for archon-os/scripts/verify-claim.cjs — the single entrypoint that
 * wires the deterministic gate (FEAT-E AC1) and the verdict pipeline (AC2-AC6)
 * into a hook command and a CLI. No logic of its own: it must delegate.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '../verify-claim.cjs');

const run = (args, input) => spawnSync('node', [CLI, ...args], {
  input: input === undefined ? '' : input,
  encoding: 'utf8',
  env: { ...process.env, ARCHON_CLAIM_GATE: undefined },
});

const MOTIVATING_RESULT = 'I ran `claude -p "/run"` and got Error: Reached max turns (1). '
  + 'Therefore claude -p does not accept slash commands.';

describe('verify-claim --hook (PostToolUse on Task)', () => {
  it('blocks a subagent result that generalizes from one instance', () => {
    const r = run(['--hook'], JSON.stringify({
      tool_name: 'Task',
      tool_response: MOTIVATING_RESULT,
    }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/WRONG_CAUSE|OVERGENERALIZED/);
    expect(r.stderr).toMatch(/max_turns_limit/);
  });

  it('allows a subagent result with a properly scoped claim', () => {
    const r = run(['--hook'], JSON.stringify({
      tool_name: 'Task',
      tool_response: 'Ran `npx jest`: 1591 passed, 1 failed in 89 suites on this branch.',
    }));
    expect(r.status).toBe(0);
  });

  it('allows a universal claim whose counterfactual probe ran', () => {
    const r = run(['--hook'], JSON.stringify({
      tool_name: 'Task',
      tool_response: 'Probed `claude -p "/help"` and `claude -p "/login"`: both unavailable. '
        + 'So claude -p cannot run terminal-only built-ins.',
    }));
    expect(r.status).toBe(0);
  });

  it('is disabled by ARCHON_CLAIM_GATE=false', () => {
    const r = spawnSync('node', [CLI, '--hook'], {
      input: JSON.stringify({ tool_name: 'Task', tool_response: MOTIVATING_RESULT }),
      encoding: 'utf8',
      env: { ...process.env, ARCHON_CLAIM_GATE: 'false' },
    });
    expect(r.status).toBe(0);
  });

  it('never blocks on malformed or empty stdin', () => {
    expect(run(['--hook'], '').status).toBe(0);
    expect(run(['--hook'], 'not json').status).toBe(0);
    expect(run(['--hook'], JSON.stringify({ tool_name: 'Read' })).status).toBe(0);
  });
});

describe('verify-claim --gate (structured claim in, verdict out)', () => {
  it('emits the structured verdict with checks_not_possible for a blocked claim', () => {
    const r = run(['--gate', '--json'], JSON.stringify({
      conclusion: 'claude -p does not accept slash commands',
      observation: 'Error: Reached max turns (1)',
      evidence: [{ probe: 'claude -p "/run"', outcome: 'fail' }],
    }));
    const out = JSON.parse(r.stdout);
    expect(out.blocked).toBe(true);
    expect(out.verdict).toBe('WRONG_CAUSE');
    expect(out.checks_not_possible).toContain('counterfactual_probe_not_run');
    expect(out.model_calls_needed).toBe(false);
    expect(r.status).toBe(1);
  });

  it('asks for the model only when the deterministic gate cannot decide', () => {
    const r = run(['--gate', '--json'], JSON.stringify({
      conclusion: '88 of 89 suites pass on this branch',
      observation: 'npx jest: 1591 passed, 1 failed',
      evidence: [{ probe: 'npx jest', outcome: 'fail' }],
    }));
    const out = JSON.parse(r.stdout);
    expect(out.blocked).toBe(false);
    expect(out.model_calls_needed).toBe(true);
    expect(out.k).toBe(3);
    expect(r.status).toBe(0);
  });

  it('publishes the blind input it would hand the verifier', () => {
    const r = run(['--gate', '--json'], JSON.stringify({
      conclusion: 'x fails once',
      observation: 'o',
      evidence: [{ probe: 'p', outcome: 'fail' }],
      author: 'architect',
      confidence: 'HIGH',
      reasoning: 'trust me',
    }));
    const out = JSON.parse(r.stdout);
    expect(out.blind_input.claim_under_test).toBe('x fails once');
    expect(JSON.stringify(out.blind_input)).not.toMatch(/architect|trust me|confidence/);
  });
});

describe('verify-claim --aggregate (k samples in, one verdict back)', () => {
  it('derives confidence from agreement and ignores model self-report', () => {
    const r = run(['--aggregate', '--json'], JSON.stringify({
      gate: { blocked: false, counterfactual_ran: true, checks_not_possible: [] },
      priorConfidence: 'HIGH',
      samples: [
        { verdict: 'REFUTED', confidence: 'HIGH', checks_not_possible: [] },
        { verdict: 'REFUTED', confidence: 'LOW', checks_not_possible: [] },
        { verdict: 'SUPPORTED', confidence: 'HIGH', checks_not_possible: [] },
      ],
    }));
    const out = JSON.parse(r.stdout);
    expect(out.verdict).toBe('REFUTED');
    // 2 of 3 samples agreed -> agreement_confidence MEDIUM; the CLAIM's own
    // confidence is lowered to LOW because an adverse verdict passed threshold.
    expect(out.agreement_confidence).toBe('MEDIUM');
    expect(out.confidence).toBe('LOW');
    expect(out.agreement).toBeCloseTo(2 / 3, 5);
    expect(r.status).toBe(1);
  });

  it('a unanimous SUPPORTED is a no-op that returns the prior confidence', () => {
    const r = run(['--aggregate', '--json'], JSON.stringify({
      gate: { blocked: false, counterfactual_ran: true, checks_not_possible: [] },
      priorConfidence: 'MEDIUM',
      samples: [{ verdict: 'SUPPORTED' }, { verdict: 'SUPPORTED' }, { verdict: 'SUPPORTED' }],
    }));
    const out = JSON.parse(r.stdout);
    expect(out.verdict).toBe('SUPPORTED');
    expect(out.confidence).toBe('MEDIUM');
    expect(r.status).toBe(0);
  });
});

describe('toolResponseText — a tool_response is not always a string', () => {
  const { toolResponseText } = require('../verify-claim.cjs');

  it('flattens the content-array form Claude Code actually sends', () => {
    expect(toolResponseText({ content: [{ type: 'text', text: 'it cannot work' }] })).toContain('it cannot work');
  });

  it('flattens a plain string and tolerates nothing at all', () => {
    expect(toolResponseText('plain')).toBe('plain');
    expect(toolResponseText(undefined)).toBe('');
    expect(toolResponseText(null)).toBe('');
  });
});

describe('verify-claim usage', () => {
  it('exits 2 with usage on an unknown mode', () => {
    const r = run(['--nope'], '');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Usage/);
  });
});

describe('verify-claim --aggregate enforces independence, it does not document it', () => {
  const payload = (extra) => JSON.stringify({
    gate: { blocked: false, counterfactual_ran: true, checks_not_possible: [] },
    priorConfidence: 'HIGH',
    samples: [{ verdict: 'SUPPORTED' }, { verdict: 'SUPPORTED' }, { verdict: 'SUPPORTED' }],
    ...extra,
  });

  it('refuses to issue a verdict when the verifier IS the producer', () => {
    const r = run(['--aggregate', '--json'], payload({ producer: 'architect', verifier: 'architect' }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/same_agent/);
  });

  it('refuses when the verifier shared the producer context', () => {
    const r = run(['--aggregate', '--json'], payload({
      producer: 'architect', verifier: 'independent-verifier', shared_context: true,
    }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/shared_context/);
  });

  it('issues the verdict for a declared independent verifier', () => {
    const r = run(['--aggregate', '--json'], payload({ producer: 'architect', verifier: 'independent-verifier' }));
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).verdict).toBe('SUPPORTED');
  });

  it('records undeclared independence as a coverage gap instead of assuming it', () => {
    const r = run(['--aggregate', '--json'], payload({}));
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).checks_not_possible).toContain('independence_not_declared');
  });
});

describe('verify-claim --retry (AC5: a retry must change the evidence)', () => {
  const retry = (body) => run(['--retry', '--json'], JSON.stringify(body));

  it('rejects a retry with no new probe', () => {
    const r = retry({ attempt: 1, probe_ledger: ['claude -p "/run"'], new_probe: null });
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe('no_new_evidence');
  });

  it('accepts a retry that adds a genuinely new probe', () => {
    const r = retry({ attempt: 1, probe_ledger: ['claude -p "/run"'], new_probe: 'claude -p "/archon-os:run"' });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).probeLedger).toHaveLength(2);
  });

  it('escalates to a human at the loop cap', () => {
    const r = retry({ attempt: 2, probe_ledger: ['a'], new_probe: 'b' });
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.escalate_to_human).toBe(true);
    expect(out.reason).toBe('loop_cap_reached');
  });
});
