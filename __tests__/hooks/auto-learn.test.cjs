/**
 * Tests for archon-os/hooks/auto-learn.cjs
 * Pure-function tests via require()-from-source.
 */

const {
  analyzeInput,
  categorizeCorrection,
  isLearnableFeedback,
  generateHash,
} = require('../../archon-os/hooks/auto-learn.cjs');

describe('auto-learn', () => {
  describe('generateHash', () => {
    it('is deterministic', () => {
      expect(generateHash('always prefer tabs')).toBe(generateHash('always prefer tabs'));
    });
    it('is 12 hex chars', () => {
      expect(generateHash('anything')).toMatch(/^[0-9a-f]{12}$/);
    });
    it('normalizes case and whitespace to the same hash', () => {
      expect(generateHash('Hello   World')).toBe(generateHash('hello world'));
    });
    it('trims surrounding whitespace', () => {
      expect(generateHash('  hello world  ')).toBe(generateHash('hello world'));
    });
    it('different content gives a different hash', () => {
      expect(generateHash('alpha')).not.toBe(generateHash('beta'));
    });
  });

  describe('isLearnableFeedback', () => {
    it('rejects input under the minimum length', () => {
      const r = isLearnableFeedback('no');
      expect(r.isLearnable).toBe(false);
      expect(r.reason).toBe('too_short');
    });

    it('rejects input over the maximum length', () => {
      const r = isLearnableFeedback('always '.repeat(40)); // 280 chars
      expect(r.isLearnable).toBe(false);
      expect(r.reason).toBe('too_long');
    });

    it('accepts general style feedback', () => {
      const r = isLearnableFeedback('always prefer tabs over spaces');
      expect(r.isLearnable).toBe(true);
      expect(r.reason).toBe('general_indicator');
    });

    it('rejects feedback with two or more task-specific signals', () => {
      const r = isLearnableFeedback('change the color to #fff in src/components/Button.tsx');
      expect(r.isLearnable).toBe(false);
      expect(r.reason).toBe('task_specific');
      expect(Array.isArray(r.matches)).toBe(true);
    });

    it('rejects a single task-specific signal with no general signal', () => {
      const r = isLearnableFeedback('rename foo to bar please');
      expect(r.isLearnable).toBe(false);
      expect(r.reason).toBe('likely_task_specific');
    });

    it('accepts long-enough feedback with no signals either way', () => {
      const r = isLearnableFeedback('please respond faster');
      expect(r.isLearnable).toBe(true);
      expect(r.reason).toBe('no_specific_indicators');
    });

    // The length guards run before any pattern matching.
    it('length check precedes indicator checks', () => {
      expect(isLearnableFeedback('always').reason).toBe('too_short');
    });
  });

  describe('categorizeCorrection', () => {
    it('maps negative comment feedback to no_excessive_comments', () => {
      const r = categorizeCorrection("don't add a comment here");
      expect(r.category).toBe('code_style');
      expect(r.rule).toBe('no_excessive_comments');
    });
    it('maps positive comment feedback to add_comments', () => {
      const r = categorizeCorrection('please add a comment to this');
      expect(r.category).toBe('code_style');
      expect(r.rule).toBe('add_comments');
    });

    // Regression guards: the keyword lists were \b-anchored singulars, so the
    // single most common phrasing of a style correction ("stop adding so many
    // comments") missed the code_style branch and fell back to 'general'.
    it('matches plural "comments"', () => {
      const r = categorizeCorrection("don't add so many comments");
      expect(r.category).toBe('code_style');
      expect(r.rule).toBe('no_excessive_comments');
    });
    it('matches plural "types"', () => {
      expect(categorizeCorrection('use explicit types here').category).toBeTruthy();
    });
    it('matches plural "tests"', () => {
      expect(categorizeCorrection('write more tests').category).toBeTruthy();
    });
    it('maps negative emoji feedback to no_emojis', () => {
      const r = categorizeCorrection('no emojis please');
      expect(r.category).toBe('code_style');
      expect(r.rule).toBe('no_emojis');
    });
    it('always returns a category and rule', () => {
      const r = categorizeCorrection('something entirely unrelated');
      expect(r).toHaveProperty('category');
      expect(r).toHaveProperty('rule');
    });
  });

  describe('analyzeInput', () => {
    it('returns a result object for learnable general feedback', () => {
      const r = analyzeInput('always prefer tabs over spaces');
      expect(r).toBeTruthy();
      expect(typeof r).toBe('object');
    });
    it('does not throw on empty input', () => {
      expect(() => analyzeInput('')).not.toThrow();
    });
  });
});
