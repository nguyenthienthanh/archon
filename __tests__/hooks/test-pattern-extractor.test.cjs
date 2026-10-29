/**
 * Tests for archon-os/hooks/test-pattern-extractor.cjs
 * extractPatterns reads a real file, so each case writes a throwaway fixture.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  findRecentTestFiles,
  extractPatterns,
} = require('../../archon-os/hooks/test-pattern-extractor.cjs');

let dir;
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpe-')); });
afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

const fixture = (name, content) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
};

describe('test-pattern-extractor', () => {
  describe('extractPatterns — framework detection', () => {
    it('detects vitest', () => {
      const p = fixture('a.test.ts', "import { it } from 'vitest';\nit('x', () => {});");
      expect(extractPatterns(p).framework).toBe('vitest');
    });

    it('detects jest', () => {
      const p = fixture('b.test.js', "jest.mock('./x');\ndescribe('y', () => {});");
      expect(extractPatterns(p).framework).toBe('jest');
    });

    it('detects pytest', () => {
      const p = fixture('c_test.py', 'import pytest\n\ndef test_x():\n    assert True');
      expect(extractPatterns(p).framework).toBe('pytest');
    });

    it('detects go_test by extension plus testing.T', () => {
      const p = fixture('d_test.go', 'func TestX(t *testing.T) {}');
      expect(extractPatterns(p).framework).toBe('go_test');
    });

    // vitest is checked before jest, so a file naming both reports vitest.
    it('vitest wins when both vitest and jest appear', () => {
      const p = fixture('e.test.ts', "import 'vitest';\njest.mock('./z');");
      expect(extractPatterns(p).framework).toBe('vitest');
    });

    it('leaves framework undefined when nothing matches', () => {
      const p = fixture('f.txt', 'just some prose, no framework here');
      expect(extractPatterns(p).framework).toBeUndefined();
    });
  });

  describe('extractPatterns — imports', () => {
    it('collects known testing libraries', () => {
      const p = fixture('g.test.tsx', "import '@testing-library/react';\nimport nock from 'nock';");
      const imports = extractPatterns(p).imports;
      expect(imports).toContain('@testing-library');
      expect(imports).toContain('nock');
    });

    it('is an empty array when no known library is used', () => {
      const p = fixture('h.test.js', "describe('x', () => {});");
      expect(extractPatterns(p).imports).toEqual([]);
    });
  });

  describe('extractPatterns — robustness', () => {
    it('always reports the file it read', () => {
      const p = fixture('i.test.js', 'test');
      expect(extractPatterns(p).file).toBe(p);
    });

    // Best-effort hook: a missing file must not throw.
    it('does not throw on a missing file', () => {
      expect(() => extractPatterns(path.join(dir, 'nope.test.js'))).not.toThrow();
    });
  });

  describe('findRecentTestFiles', () => {
    it('returns an array without throwing', () => {
      let out;
      expect(() => { out = findRecentTestFiles(); }).not.toThrow();
      expect(Array.isArray(out)).toBe(true);
    });
  });
});
