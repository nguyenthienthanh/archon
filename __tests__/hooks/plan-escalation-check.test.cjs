/**
 * Tests for archon-os/hooks/plan-escalation-check.cjs
 * Pure-function tests + end-to-end stdin invocation.
 */

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const {
  ESCALATION_THRESHOLD,
  computeWeight,
  classify,
} = require('../../archon-os/hooks/plan-escalation-check.cjs');

const HOOK = path.join(__dirname, '..', '..', 'archon-os', 'hooks', 'plan-escalation-check.cjs');

describe('plan-escalation-check', () => {
  describe('computeWeight', () => {
    it('scores 0 for a simple single-file ask', () => {
      const { weight, signals } = computeWeight('fix the login button not disabling');
      expect(weight).toBe(0);
      expect(signals).toEqual([]);
    });

    it('fires user_explicit (weight 3) on "plan first"', () => {
      const { weight, signals } = computeWeight('build the dashboard but plan first');
      expect(signals).toContain('user_explicit');
      expect(weight).toBeGreaterThanOrEqual(3);
    });

    it('fires scope_verbs (weight 2) on rewrite/overhaul', () => {
      expect(computeWeight('rewrite the auth module').signals).toContain('scope_verbs');
      expect(computeWeight('overhaul the billing system').signals).toContain('scope_verbs');
    });

    it('fires shipping_scope on rollout / version / migrate-from-to', () => {
      expect(computeWeight('rollout the new pricing').signals).toContain('shipping_scope');
      expect(computeWeight('ship v2.0 of the app').signals).toContain('shipping_scope');
      expect(computeWeight('migrate from MySQL to Postgres').signals).toContain('shipping_scope');
    });

    it('fires multi_feature on plus-joined capabilities', () => {
      expect(computeWeight('implement auth + billing + dashboard').signals).toContain('multi_feature');
    });

    it('fires multi_week on epic / roadmap', () => {
      expect(computeWeight('kick off the Q3 epic').signals).toContain('multi_week');
      expect(computeWeight('this is the roadmap for next quarter').signals).toContain('multi_week');
    });

    it('fires word_count past 80 words', () => {
      const long = Array.from({ length: 90 }, (_, i) => `word${i}`).join(' ');
      expect(computeWeight(long).signals).toContain('word_count');
    });

    it('sums weights across multiple signals', () => {
      const { weight, signals } = computeWeight('rewrite and rollout auth + billing');
      // scope_verbs(2) + shipping_scope(2) + multi_feature(2)
      expect(signals.length).toBeGreaterThanOrEqual(2);
      expect(weight).toBeGreaterThanOrEqual(ESCALATION_THRESHOLD);
    });

    it('handles empty / null safely', () => {
      expect(computeWeight('')).toEqual({ weight: 0, signals: [] });
      expect(computeWeight(null)).toEqual({ weight: 0, signals: [] });
    });
  });

  describe('classify', () => {
    it('does not escalate below threshold', () => {
      expect(classify('add a tooltip to the navbar').escalate).toBe(false);
    });

    it('escalates when weight >= threshold', () => {
      const r = classify('rebuild the entire billing platform and migrate from Stripe to Adyen');
      expect(r.escalate).toBe(true);
      expect(r.weight).toBeGreaterThanOrEqual(ESCALATION_THRESHOLD);
    });

    it('skips slash commands', () => {
      expect(classify('/run rebuild the whole thing from scratch').reason).toBe('already_command');
    });

    it('skips bypass prefixes', () => {
      expect(classify('project: rebuild everything from scratch').reason).toBe('bypass_prefix');
      expect(classify('must do: rewrite and overhaul the platform').reason).toBe('bypass_prefix');
      expect(classify('task: redesign the dashboard').reason).toBe('bypass_prefix');
    });

    it('skips empty input', () => {
      expect(classify('').reason).toBe('empty');
    });
  });

  // End-to-end: spawn the hook with a stdin JSON payload, the way the runtime
  // actually invokes it. Run inside a temp dir with NO plan tree so planActive
  // is false and the escalation path is exercised.
  describe('end-to-end (stdin JSON — production path)', () => {
    let tmpDir;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-esc-e2e-'));
    });
    afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    function runHook(prompt, env = {}) {
      return spawnSync('node', [HOOK], {
        input: JSON.stringify({ prompt }),
        cwd: tmpDir,
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_USER_PROMPT: '', ARCHON_PLANS_DIR: path.join(tmpDir, '.claude', 'plans'), ...env },
        timeout: 10000,
        killSignal: 'SIGKILL',
      });
    }

    it('emits the escalation nudge for a project-scope prompt', () => {
      const r = runHook('rebuild the entire billing platform and migrate from Stripe to Adyen');
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('plan-escalation');
      expect(r.stderr).toContain('plan');
    });

    it('stays silent for a small task', () => {
      const r = runHook('fix the typo in the footer');
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain('plan-escalation');
    });

    it('stays silent when ARCHON_ESCALATION_DISABLED=true', () => {
      const r = runHook('rebuild everything from scratch and rollout v2.0', { ARCHON_ESCALATION_DISABLED: 'true' });
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain('plan-escalation');
    });

    it('stays silent when a plan tree already exists', () => {
      const plansDir = path.join(tmpDir, '.claude', 'plans');
      fs.mkdirSync(plansDir, { recursive: true });
      fs.writeFileSync(path.join(plansDir, 'active.json'), '{}');
      const r = runHook('rebuild everything from scratch and rollout v2.0');
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain('plan-escalation');
    });
  });
});
