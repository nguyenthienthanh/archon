/**
 * Tests for archon-os/hooks/scope-drift.cjs
 * Pure-function tests via require()-from-source.
 */

jest.mock('../../archon-os/hooks/lib/af-config-utils.cjs', () => ({
  readSessionState: jest.fn(() => ({})),
}));

const {
  extractKeywords,
  calculateOverlap,
  FEATURE_TRIGGERS,
  STOPWORDS,
} = require('../../archon-os/hooks/scope-drift.cjs');

describe('scope-drift', () => {
  describe('extractKeywords', () => {
    it('lowercases and splits', () => {
      expect(extractKeywords('Hello World')).toEqual(['hello', 'world']);
    });

    it('filters stopwords', () => {
      expect(extractKeywords('the dog is happy')).toEqual(['dog', 'happy']);
    });

    it('drops words <3 chars', () => {
      expect(extractKeywords('a be cat')).toEqual(['cat']);
    });

    it('strips punctuation', () => {
      expect(extractKeywords('hello, world!')).toEqual(['hello', 'world']);
    });

    it('keeps hyphenated words', () => {
      expect(extractKeywords('cross-cutting concern')).toContain('cross-cutting');
    });

    it('handles empty string', () => {
      expect(extractKeywords('')).toEqual([]);
    });
  });

  describe('calculateOverlap', () => {
    it('returns 1 when no prompt keywords (no signal)', () => {
      expect(calculateOverlap(['a', 'b'], [])).toBe(1);
    });
    it('returns 1 when no task keywords', () => {
      expect(calculateOverlap([], ['a', 'b'])).toBe(1);
    });
    it('returns 1 on full overlap', () => {
      expect(calculateOverlap(['auth', 'login'], ['auth', 'login'])).toBe(1);
    });
    it('returns 0 on no overlap', () => {
      expect(calculateOverlap(['auth'], ['payment'])).toBe(0);
    });
    it('returns partial ratio', () => {
      expect(calculateOverlap(['auth', 'user'], ['auth', 'payment'])).toBe(0.5);
    });
  });

  describe('FEATURE_TRIGGERS', () => {
    [
      ['also add login', true],
      ["while you're at it", true],
      ['can you also fix that', true],
      ['we need a new feature', true],
      ['fix the bug in line 42', false],
    ].forEach(([prompt, expected]) => {
      it(`${expected ? 'matches' : 'rejects'} "${prompt}"`, () => {
        expect(FEATURE_TRIGGERS.some(re => re.test(prompt))).toBe(expected);
      });
    });
  });

  describe('STOPWORDS', () => {
    it('contains common stopwords', () => {
      ['the', 'a', 'is', 'and', 'or'].forEach(w => expect(STOPWORDS.has(w)).toBe(true));
    });
    it('excludes content words', () => {
      ['auth', 'database', 'payment'].forEach(w => expect(STOPWORDS.has(w)).toBe(false));
    });
  });
});
