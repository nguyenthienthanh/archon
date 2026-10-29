/**
 * Tests for archon-os/hooks/lint-autofix.cjs
 * Pure-function tests via require()-from-source.
 */

const {
  getAvailableLinters,
  isLinterAvailable,
  extractFilePath,
} = require('../../archon-os/hooks/lint-autofix.cjs');

describe('lint-autofix', () => {
  describe('extractFilePath', () => {
    it('reads tool_input.file_path', () => {
      const s = JSON.stringify({ tool_input: { file_path: '/tmp/a.ts' } });
      expect(extractFilePath(s)).toBe('/tmp/a.ts');
    });

    it('falls back to tool_response.filePath', () => {
      const s = JSON.stringify({ tool_response: { filePath: '/tmp/b.ts' } });
      expect(extractFilePath(s)).toBe('/tmp/b.ts');
    });

    it('prefers tool_input over tool_response', () => {
      const s = JSON.stringify({
        tool_input: { file_path: '/tmp/win.ts' },
        tool_response: { filePath: '/tmp/lose.ts' },
      });
      expect(extractFilePath(s)).toBe('/tmp/win.ts');
    });

    it('returns null when neither field is present', () => {
      expect(extractFilePath(JSON.stringify({ tool_name: 'Write' }))).toBeNull();
    });

    // Fail-open: a hook must never throw on a malformed payload.
    it('returns null on malformed JSON instead of throwing', () => {
      expect(() => extractFilePath('{not json')).not.toThrow();
      expect(extractFilePath('{not json')).toBeNull();
    });

    it('returns null on empty input', () => {
      expect(extractFilePath('')).toBeNull();
    });
  });

  describe('isLinterAvailable', () => {
    it('is false for an unknown linter', () => {
      expect(isLinterAvailable('not-a-real-linter')).toBe(false);
    });
    it('returns a boolean for a known linter', () => {
      expect(typeof isLinterAvailable('eslint')).toBe('boolean');
    });
    it('does not throw on an empty name', () => {
      expect(() => isLinterAvailable('')).not.toThrow();
    });
  });

  describe('getAvailableLinters', () => {
    it('is empty for an extension no linter claims', () => {
      expect(getAvailableLinters('notes.xyz')).toEqual([]);
    });
    it('is empty for a file with no extension', () => {
      expect(getAvailableLinters('Makefile')).toEqual([]);
    });
    it('always returns an array for a known extension', () => {
      expect(Array.isArray(getAvailableLinters('a.ts'))).toBe(true);
    });
    it('only ever returns linters that report available', () => {
      for (const l of getAvailableLinters('a.ts')) {
        expect(isLinterAvailable(l)).toBe(true);
      }
    });
  });
});
