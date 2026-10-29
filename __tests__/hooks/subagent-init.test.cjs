/**
 * Tests for archon-os/hooks/subagent-init.cjs
 *
 * saveSessionState (writes real state) and trackAgentUsage (reads fd 0, which
 * would block or throw under a test runner) are not exported.
 */

const { loadSessionState, detectPhase, getProjectName } = require('../../archon-os/hooks/subagent-init.cjs');

describe('subagent-init', () => {
  it('does not export the state writer or the stdin reader', () => {
    const api = require('../../archon-os/hooks/subagent-init.cjs');
    expect(api.saveSessionState).toBeUndefined();
    expect(api.trackAgentUsage).toBeUndefined();
  });

  describe('detectPhase', () => {
    const KEY = 'AF_CURRENT_PHASE';
    let saved;
    beforeEach(() => { saved = process.env[KEY]; delete process.env[KEY]; });
    afterEach(() => {
      if (saved === undefined) delete process.env[KEY]; else process.env[KEY] = saved;
    });

    it('prefers the env var over any file marker', () => {
      process.env[KEY] = '4';
      expect(detectPhase()).toBe('4');
    });

    it('returns a string or null without throwing when no env is set', () => {
      let out;
      expect(() => { out = detectPhase(); }).not.toThrow();
      expect(out === null || typeof out === 'string').toBe(true);
    });
  });

  describe('getProjectName', () => {
    // Reads package.json / composer.json / Cargo.toml / go.mod / pubspec.yaml
    // from cwd — read-only, and this repo has a package.json.
    it('returns a string or null without throwing', () => {
      let out;
      expect(() => { out = getProjectName(); }).not.toThrow();
      expect(out === null || typeof out === 'string').toBe(true);
    });
  });

  describe('loadSessionState', () => {
    it('returns an object and never throws', () => {
      let out;
      expect(() => { out = loadSessionState(); }).not.toThrow();
      expect(typeof out).toBe('object');
      expect(out).not.toBeNull();
    });
  });
});
