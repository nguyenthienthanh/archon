'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  virtualizeToolOutput,
  vaultRawOutput,
  checkReplanCircuitBreaker,
  DEFAULT_MAX_OUTPUT_CHARS,
} = require('../memory-manager.cjs');

describe('Archon Memory Manager (AMM)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'amm-test-')));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.ARCHON_MAX_TOOL_OUTPUT;
    delete process.env.AF_MAX_TOOL_OUTPUT;
  });

  describe('virtualizeToolOutput', () => {
    it('passes small outputs through untouched', () => {
      const small = 'Hello, this is a short test output.\nAll good!';
      const res = virtualizeToolOutput(small, { projectRoot: tmpDir, maxChars: 500 });

      expect(res.virtualized).toBe(false);
      expect(res.output).toBe(small);
    });

    it('virtualizes outputs exceeding maxChars and writes 100% raw data to Vault', () => {
      // Create 200 lines of data (~12KB)
      const lines = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}: detailed research data payload ${i}`);
      const rawContent = lines.join('\n');

      const res = virtualizeToolOutput(rawContent, {
        projectRoot: tmpDir,
        toolName: 'bash',
        maxChars: 1000,
        headLines: 10,
        tailLines: 10,
      });

      expect(res.virtualized).toBe(true);
      expect(res.vaultPath).toBeDefined();
      expect(fs.existsSync(res.vaultPath)).toBe(true);

      // Verify Vault has 100% of raw content
      const vaultedContent = fs.readFileSync(res.vaultPath, 'utf-8');
      expect(vaultedContent).toBe(rawContent);

      // Verify context digest format
      expect(res.output).toContain('[ARCHON MEMORY MANAGER: Output was');
      expect(res.output).toContain('[PAGING ACTIVE: 100% of raw content safely vaulted at:');
      expect(res.output).toContain('Line 1:');
      expect(res.output).toContain('Line 10:');
      expect(res.output).toContain('Line 200:');
      expect(res.output).toContain('lines paged to disk vault to protect Context RAM');
    });

    it('respects custom threshold via environment variable ARCHON_MAX_TOOL_OUTPUT', () => {
      process.env.ARCHON_MAX_TOOL_OUTPUT = '200';
      const medium = 'A'.repeat(300);

      const res = virtualizeToolOutput(medium, { projectRoot: tmpDir });
      expect(res.virtualized).toBe(true);
    });
  });

  describe('checkReplanCircuitBreaker', () => {
    it('allows replan when budget remains', () => {
      const res = checkReplanCircuitBreaker({ replan_budget_remaining: 2 });
      expect(res.allowed).toBe(true);
      expect(res.budgetRemaining).toBe(2);
    });

    it('freezes and refuses execution when replan budget is 0', () => {
      const res = checkReplanCircuitBreaker({ replan_budget_remaining: 0 });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe('replan_budget_exhausted');
      expect(res.message).toContain('🚨 ARCHON CIRCUIT BREAKER');
    });
  });
});
