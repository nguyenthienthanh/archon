/**
 * Tests for aura-frog/hooks/prompt-logger.cjs
 * Pure-function tests via require()-from-source.
 */

const {
  detectIntent,
  detectComplexity,
  extractReferences,
} = require('../../aura-frog/hooks/prompt-logger.cjs');

describe('prompt-logger', () => {
  describe('detectIntent', () => {
    it('a leading slash is a command', () => {
      expect(detectIntent('/run build the thing')).toBe('command');
    });
    it('bug language is debug', () => {
      expect(detectIntent('fix the login bug')).toBe('debug');
    });
    it('an interrogative opener is a question', () => {
      expect(detectIntent('how do I wire this up')).toBe('question');
    });
    it('a trailing question mark is a question', () => {
      expect(detectIntent('this seems off to you?')).toBe('question');
    });
    it('review language is review', () => {
      expect(detectIntent('review this PR')).toBe('review');
    });
    it('test language is test', () => {
      expect(detectIntent('add unit test for the parser')).toBe('test');
    });
    it('refactor language is refactor', () => {
      expect(detectIntent('refactor this module')).toBe('refactor');
    });
    it('build language is implement', () => {
      expect(detectIntent('implement the login screen')).toBe('implement');
    });
    it('a leading acknowledgement is feedback', () => {
      expect(detectIntent('thanks, that works')).toBe('feedback');
    });
    it('explain language is explain', () => {
      expect(detectIntent('explain the caching layer')).toBe('explain');
    });
    it('falls back to chat', () => {
      expect(detectIntent('hello there')).toBe('chat');
    });

    // Order in INTENT_PATTERNS decides ties — debug outranks the rest.
    it('debug wins over implement when both match', () => {
      expect(detectIntent('create a fix for the crash')).toBe('debug');
    });
    it('test wins over implement when both match', () => {
      expect(detectIntent('add a test')).toBe('test');
    });

    // Regression guards: the keyword lists were \b-anchored singulars, so the
    // most natural phrasing ("add unit tests", "fix the bugs") missed its intent
    // and fell through to a weaker one. Plurals are now matched.
    it('matches plural "tests"', () => {
      expect(detectIntent('add unit tests for the parser')).toBe('test');
    });
    it('matches plural "specs"', () => {
      expect(detectIntent('write specs for this')).toBe('test');
    });
    it('matches plural "bugs"', () => {
      expect(detectIntent('there are bugs here')).toBe('debug');
    });
    it('matches plural "errors"', () => {
      expect(detectIntent('the build prints errors')).toBe('debug');
    });
    it('matches plural "issues"', () => {
      expect(detectIntent('several issues showed up')).toBe('debug');
    });
  });

  describe('detectComplexity', () => {
    it('flags security', () => {
      expect(detectComplexity('add auth with encryption')).toContain('security');
    });
    it('flags performance and database together', () => {
      const s = detectComplexity('optimize the database query');
      expect(s).toContain('performance');
      expect(s).toContain('database');
    });
    it('flags architecture', () => {
      expect(detectComplexity('design the system')).toContain('architecture');
    });
    it('returns an empty list when nothing matches', () => {
      expect(detectComplexity('hello there')).toEqual([]);
    });
  });

  describe('extractReferences', () => {
    it('collects every slash command', () => {
      expect(extractReferences('/run then /check').commands).toEqual(['run', 'check']);
    });
    it('keeps namespaced commands intact', () => {
      expect(extractReferences('/archon-os:plan next').commands).toEqual(['archon-os:plan']);
    });
    it('extracts a named agent, lowercased', () => {
      expect(extractReferences('ask the Architect about it').agent).toBe('architect');
    });
    it('agent is null when none is named', () => {
      expect(extractReferences('just do the thing').agent).toBeNull();
    });
    it('no commands yields an empty array', () => {
      expect(extractReferences('no slashes here').commands).toEqual([]);
    });

    // SKILL_PATTERN is a module-level /g regex — a leaked lastIndex between
    // calls would silently drop the first match on every other call.
    it('is not corrupted by regex state across calls', () => {
      const first = extractReferences('/run and /check');
      const second = extractReferences('/run and /check');
      expect(second.commands).toEqual(first.commands);
      expect(second.commands).toEqual(['run', 'check']);
    });
  });
});
