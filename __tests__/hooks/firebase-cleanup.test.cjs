/**
 * Tests for archon-os/hooks/firebase-cleanup.cjs
 *
 * Only isFirebaseConfigured is exercised. cleanupDebugLog is deliberately NOT
 * called: it unlinks firebase-debug.log from the real process.cwd() (the path is
 * frozen at module load, so it cannot be redirected at a temp dir), and a unit
 * test must not delete a file out of the working repo.
 */

const { isFirebaseConfigured } = require('../../archon-os/hooks/firebase-cleanup.cjs');

const ENV_KEYS = ['FIREBASE_TOKEN', 'GOOGLE_APPLICATION_CREDENTIALS'];
let saved;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('firebase-cleanup', () => {
  describe('isFirebaseConfigured', () => {
    it('is true when FIREBASE_TOKEN is set', () => {
      process.env.FIREBASE_TOKEN = 'fake-token';
      expect(isFirebaseConfigured()).toBe(true);
    });

    it('is true when GOOGLE_APPLICATION_CREDENTIALS is set', () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/creds.json';
      expect(isFirebaseConfigured()).toBe(true);
    });

    it('returns a boolean with no env configured', () => {
      expect(typeof isFirebaseConfigured()).toBe('boolean');
    });

    it('does not throw when firebase CLI is absent', () => {
      expect(() => isFirebaseConfigured()).not.toThrow();
    });
  });
});
