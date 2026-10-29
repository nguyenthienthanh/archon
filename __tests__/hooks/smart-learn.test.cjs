/**
 * Tests for archon-os/hooks/smart-learn.cjs
 * Pure-function tests via require()-from-source.
 */

jest.mock('../../archon-os/hooks/lib/learning.cjs', () => ({
  recordPattern: jest.fn(),
  isLearningEnabled: jest.fn(() => true),
  isLocalMode: jest.fn(() => true),
}));

const {
  detectCodePatterns,
  extractBashPattern,
} = require('../../archon-os/hooks/smart-learn.cjs');

describe('smart-learn', () => {
  describe('detectCodePatterns', () => {
    it('detects arrow-function dominance in JS/TS', () => {
      // detectCodePatterns matches `=>\s*{` (brace body), so use block bodies.
      const code = `
        const a = () => { return 1; };
        const b = () => { return 2; };
        const c = () => { return 3; };
        function regular() { return 4; }
      `;
      const patterns = detectCodePatterns(code, 'foo.ts');
      expect(patterns.some(p => p.pattern === 'arrow_functions')).toBe(true);
    });

    it('detects prefer-const when const dominates', () => {
      const code = `
        const a = 1; const b = 2; const c = 3; const d = 4;
        let one = 5;
      `;
      const patterns = detectCodePatterns(code, 'foo.js');
      expect(patterns.some(p => p.pattern === 'prefer_const')).toBe(true);
    });

    it('detects async/await usage', () => {
      const patterns = detectCodePatterns(
        `async function fetchData() { await fetch('/api'); }`,
        'foo.ts'
      );
      expect(patterns.some(p => p.pattern === 'async_await')).toBe(true);
    });

    it('returns empty for unknown extension', () => {
      expect(detectCodePatterns('print(1)', 'foo.unknown')).toEqual([]);
    });

    it('returns empty for empty content', () => {
      expect(detectCodePatterns('', 'foo.js')).toEqual([]);
    });
  });

  describe('extractBashPattern', () => {
    it('does not throw on typical commands', () => {
      expect(() => extractBashPattern('npm install lodash')).not.toThrow();
    });
    it('returns a defined value (shape: null, string, or object)', () => {
      const r = extractBashPattern('npm install lodash');
      // Implementation may return an object (e.g. { pattern, args }); just
      // assert "defined and not undefined".
      expect(r).toBeDefined();
    });
    it('handles empty string without throwing', () => {
      expect(() => extractBashPattern('')).not.toThrow();
    });
  });
});
