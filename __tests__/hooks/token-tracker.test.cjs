/**
 * Tests for archon-os/hooks/token-tracker.cjs
 * Pure-function tests via require()-from-source.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  TOKEN_COSTS,
  THRESHOLDS,
  CONTEXT_LIMIT,
  estimateFileTokens,
} = require('../../archon-os/hooks/token-tracker.cjs');

describe('token-tracker', () => {
  describe('TOKEN_COSTS', () => {
    it('has costs for common tools', () => {
      ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'default'].forEach(t => {
        expect(typeof TOKEN_COSTS[t]).toBe('number');
        expect(TOKEN_COSTS[t]).toBeGreaterThan(0);
      });
    });
    it('Task is most expensive (subagent overhead)', () => {
      expect(TOKEN_COSTS.Task).toBeGreaterThan(TOKEN_COSTS.Read);
      expect(TOKEN_COSTS.Task).toBeGreaterThan(TOKEN_COSTS.Bash);
    });
  });

  describe('THRESHOLDS', () => {
    it('has 3 thresholds in descending order', () => {
      expect(THRESHOLDS.length).toBe(3);
      expect(THRESHOLDS[0].pct).toBeGreaterThan(THRESHOLDS[1].pct);
      expect(THRESHOLDS[1].pct).toBeGreaterThan(THRESHOLDS[2].pct);
    });
    it('every threshold has icon, label, msg', () => {
      for (const t of THRESHOLDS) {
        expect(t.icon).toBeTruthy();
        expect(t.label).toBeTruthy();
        expect(t.msg).toBeTruthy();
      }
    });
  });

  describe('CONTEXT_LIMIT', () => {
    it('defaults to >=100K (env-overridable)', () => {
      expect(CONTEXT_LIMIT).toBeGreaterThanOrEqual(100_000);
    });
  });

  describe('estimateFileTokens', () => {
    const tmp = path.join(os.tmpdir(), `af-token-test-${process.pid}.txt`);
    afterEach(() => { try { fs.unlinkSync(tmp); } catch { /* */ } });

    it('returns 0 for nonexistent path', () => {
      expect(estimateFileTokens('/nonexistent/foo.txt')).toBe(0);
    });
    it('returns 0 for empty/null path', () => {
      expect(estimateFileTokens(null)).toBe(0);
      expect(estimateFileTokens(undefined)).toBe(0);
      expect(estimateFileTokens('')).toBe(0);
    });
    it('estimates ~size/4', () => {
      fs.writeFileSync(tmp, 'x'.repeat(400));
      expect(estimateFileTokens(tmp)).toBe(100);
    });
    it('caps at 10000 for huge files', () => {
      fs.writeFileSync(tmp, 'x'.repeat(100_000));
      expect(estimateFileTokens(tmp)).toBe(10_000);
    });
  });
});
