/**
 * Tests for archon-os/hooks/update-check.cjs
 *
 * checkForUpdate (network) and writeCache (writes the real cache) are not exercised.
 */

const {
  getCurrentVersion,
  readCache,
  shouldCheck,
  compareVersions,
} = require('../../archon-os/hooks/update-check.cjs');

describe('update-check — compareVersions', () => {
  describe('numeric core', () => {
    it.each([
      ['3.8.0', '3.9.0'],
      ['3.8.0', '3.8.1'],
      ['3.8.0', '4.0.0'],
    ])('%s -> %s is an update', (c, l) => expect(compareVersions(c, l)).toBe(true));

    it.each([
      ['3.8.0', '3.8.0'],
      ['3.9.0', '3.8.0'],
      ['4.0.0', '3.9.9'],
    ])('%s -> %s is not an update', (c, l) => expect(compareVersions(c, l)).toBe(false));

    it('tolerates a leading v on either side', () => {
      expect(compareVersions('v3.8.0', 'v3.8.1')).toBe(true);
      expect(compareVersions('v3.8.1', 'v3.8.0')).toBe(false);
    });

    it('treats a missing component as zero', () => {
      expect(compareVersions('3.8', '3.8.1')).toBe(true);
      expect(compareVersions('3.8.0', '3.8')).toBe(false);
    });
  });

  // Regression guards. The old implementation did
  //   '3.8.0-alpha.8'.split('.').map(Number)  ->  [3, 8, NaN, 8]
  // and NaN || 0 collapsed to 0, so a prerelease compared EQUAL to its release —
  // every prerelease user silently missed the matching stable release.
  describe('prereleases (semver §11)', () => {
    it('a prerelease is older than its release', () => {
      expect(compareVersions('3.8.0-alpha.8', '3.8.0')).toBe(true);
    });

    it('never pushes a stable user back onto a prerelease', () => {
      expect(compareVersions('3.8.0', '3.8.0-alpha.9')).toBe(false);
    });

    it('compares prerelease numbers numerically, not as text', () => {
      expect(compareVersions('3.8.0-alpha.8', '3.8.0-alpha.9')).toBe(true);
      expect(compareVersions('3.8.0-alpha.9', '3.8.0-alpha.8')).toBe(false);
      // '10' > '9' numerically, though '10' < '9' as a string.
      expect(compareVersions('3.8.0-alpha.9', '3.8.0-alpha.10')).toBe(true);
    });

    it('ranks more identifiers above fewer', () => {
      expect(compareVersions('3.8.0-alpha', '3.8.0-alpha.1')).toBe(true);
      expect(compareVersions('3.8.0-alpha.1', '3.8.0-alpha')).toBe(false);
    });

    it('falls back to ASCII order for non-numeric identifiers', () => {
      expect(compareVersions('3.8.0-alpha.1', '3.8.0-beta.1')).toBe(true);
      expect(compareVersions('3.8.0-beta.1', '3.8.0-alpha.1')).toBe(false);
    });

    it('is not an update against itself', () => {
      expect(compareVersions('3.8.0-alpha.8', '3.8.0-alpha.8')).toBe(false);
    });

    it('still sees a minor bump from a prerelease', () => {
      expect(compareVersions('3.8.0-alpha.8', '3.9.0')).toBe(true);
    });
  });
});

describe('update-check — environment readers', () => {
  it('getCurrentVersion falls back to 0.0.0 without CLAUDE_PLUGIN_ROOT', () => {
    const saved = process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    try {
      expect(getCurrentVersion()).toBe('0.0.0');
    } finally {
      if (saved === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
      else process.env.CLAUDE_PLUGIN_ROOT = saved;
    }
  });

  it('getCurrentVersion reads the real plugin.json when pointed at it', () => {
    const saved = process.env.CLAUDE_PLUGIN_ROOT;
    process.env.CLAUDE_PLUGIN_ROOT = require('path').join(process.cwd(), 'archon-os');
    try {
      expect(getCurrentVersion()).toMatch(/^\d+\.\d+\.\d+/);
    } finally {
      if (saved === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
      else process.env.CLAUDE_PLUGIN_ROOT = saved;
    }
  });

  // Read-only smoke tests — assert safe degradation, not machine state.
  it('readCache returns an object and never throws', () => {
    let out;
    expect(() => { out = readCache(); }).not.toThrow();
    expect(typeof out).toBe('object');
  });

  it('shouldCheck returns a boolean and never throws', () => {
    let out;
    expect(() => { out = shouldCheck(); }).not.toThrow();
    expect(typeof out).toBe('boolean');
  });
});
