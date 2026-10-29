/**
 * Tests for archon-os/hooks/teammate-idle.cjs, thinking-boost.cjs and
 * changelog-notify.cjs — the read-only halves of three small hooks made
 * importable by FEAT-007 / issue #5.
 *
 * changelog-notify.setLastSeen stays unexported: it writes the real marker file.
 */

const { getTeammateName, getTeammateRole } = require('../../archon-os/hooks/teammate-idle.cjs');
const { readSessionState } = require('../../archon-os/hooks/thinking-boost.cjs');
const changelog = require('../../archon-os/hooks/changelog-notify.cjs');

const KEY = 'CLAUDE_TEAMMATE_NAME';
let saved;
beforeEach(() => { saved = process.env[KEY]; delete process.env[KEY]; });
afterEach(() => {
  if (saved === undefined) delete process.env[KEY]; else process.env[KEY] = saved;
});

describe('teammate-idle', () => {
  describe('getTeammateName', () => {
    it('is null when the env var is unset', () => {
      expect(getTeammateName()).toBeNull();
    });
    it('returns the env var verbatim', () => {
      process.env[KEY] = 'frontend-alice';
      expect(getTeammateName()).toBe('frontend-alice');
    });
  });

  describe('getTeammateRole', () => {
    it('is null without a teammate name', () => {
      expect(getTeammateRole()).toBeNull();
    });

    it('extracts a known agent from a "role-name" teammate', () => {
      process.env[KEY] = 'frontend-alice';
      expect(getTeammateRole()).toBe('frontend');
    });

    it.each(['architect', 'tester', 'security', 'mobile', 'devops', 'lead'])(
      'recognises %s', (agent) => {
        process.env[KEY] = `${agent}-bob`;
        expect(getTeammateRole()).toBe(agent);
      },
    );

    it('matches when the name is a substring of the agent', () => {
      process.env[KEY] = 'lead';
      expect(getTeammateRole()).toBe('lead');
    });

    it('falls back to the raw name when no agent matches', () => {
      process.env[KEY] = 'zzz-unknown';
      expect(getTeammateRole()).toBe('zzz-unknown');
    });
  });
});

describe('thinking-boost — readSessionState', () => {
  it('returns an object and never throws', () => {
    let out;
    expect(() => { out = readSessionState(); }).not.toThrow();
    expect(typeof out).toBe('object');
    expect(out).not.toBeNull();
  });
});

describe('changelog-notify', () => {
  it('does not export the marker writer', () => {
    expect(changelog.setLastSeen).toBeUndefined();
  });

  it('getCurrentVersion returns a version-ish string, never throwing', () => {
    let out;
    expect(() => { out = changelog.getCurrentVersion(); }).not.toThrow();
    expect(typeof out).toBe('string');
    expect(out).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('getLastSeen falls back to 0.0.0 rather than throwing', () => {
    let out;
    expect(() => { out = changelog.getLastSeen(); }).not.toThrow();
    expect(typeof out).toBe('string');
  });
});
