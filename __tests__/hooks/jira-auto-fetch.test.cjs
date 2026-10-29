/**
 * Tests for archon-os/hooks/jira-auto-fetch.cjs
 *
 * fetchTicket (network), writeCacheFromFetch / showEnvHintOnce (write into the
 * real repo) and safeExit (process.exit) are deliberately not exercised.
 */

const path = require('path');

const {
  extractTickets,
  applyProjectAllowlist,
  envConfigured,
  cachePath,
  cacheFresh,
  readCachedJson,
} = require('../../archon-os/hooks/jira-auto-fetch.cjs');

const ENV_KEYS = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_PROJECT_PREFIXES'];
let saved;
beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

describe('jira-auto-fetch', () => {
  describe('extractTickets', () => {
    it('finds a ticket id', () => {
      expect(extractTickets('please look at JIRA-123')).toEqual(['JIRA-123']);
    });

    // The cache path and the API call must both use one canonical key.
    it('normalises the project key to uppercase', () => {
      expect(extractTickets('fix jira-123 now')).toEqual(['JIRA-123']);
    });

    it('de-duplicates repeats, including case variants', () => {
      expect(extractTickets('JIRA-1 and jira-1 and JIRA-1')).toEqual(['JIRA-1']);
    });

    it('finds several distinct tickets', () => {
      expect(extractTickets('AB-1 then XYZ-42').sort()).toEqual(['AB-1', 'XYZ-42']);
    });

    it('is empty when there is no ticket', () => {
      expect(extractTickets('no tickets in this sentence')).toEqual([]);
    });

    it('ignores a one-letter prefix and an over-long one', () => {
      expect(extractTickets('A-1 and ABCDEFGHIJK-1')).toEqual([]);
    });

    it('ignores more than six digits', () => {
      expect(extractTickets('AB-1234567')).toEqual([]);
    });

    // TICKET_PATTERN is a module-level /g regex; a leaked lastIndex between
    // calls would silently drop the first match on alternating calls.
    it('is not corrupted by regex state across calls', () => {
      const a = extractTickets('JIRA-123 and JIRA-456');
      const b = extractTickets('JIRA-123 and JIRA-456');
      expect(b).toEqual(a);
      expect(b.sort()).toEqual(['JIRA-123', 'JIRA-456']);
    });
  });

  describe('applyProjectAllowlist', () => {
    const tickets = ['ABC-1', 'XYZ-2'];

    it('passes everything through when no allowlist is set', () => {
      expect(applyProjectAllowlist(tickets)).toEqual(tickets);
    });

    it('keeps only the allowed prefixes', () => {
      process.env.JIRA_PROJECT_PREFIXES = 'ABC';
      expect(applyProjectAllowlist(tickets)).toEqual(['ABC-1']);
    });

    it('accepts a comma list and trims whitespace', () => {
      process.env.JIRA_PROJECT_PREFIXES = ' ABC , XYZ ';
      expect(applyProjectAllowlist(tickets)).toEqual(tickets);
    });

    it('matches the prefix case-insensitively', () => {
      process.env.JIRA_PROJECT_PREFIXES = 'abc';
      expect(applyProjectAllowlist(tickets)).toEqual(['ABC-1']);
    });

    it('treats an empty/whitespace allowlist as no allowlist', () => {
      process.env.JIRA_PROJECT_PREFIXES = ' , ';
      expect(applyProjectAllowlist(tickets)).toEqual(tickets);
    });
  });

  describe('envConfigured', () => {
    it('is false with nothing set', () => {
      expect(envConfigured()).toBe(false);
    });

    it('is false when only some vars are set', () => {
      process.env.JIRA_BASE_URL = 'https://x.atlassian.net';
      process.env.JIRA_EMAIL = 'a@b.c';
      expect(envConfigured()).toBe(false);
    });

    it('is true when all three are set', () => {
      process.env.JIRA_BASE_URL = 'https://x.atlassian.net';
      process.env.JIRA_EMAIL = 'a@b.c';
      process.env.JIRA_API_TOKEN = 't';
      expect(envConfigured()).toBe(true);
    });
  });

  describe('cachePath', () => {
    it('is an absolute .json path named after the ticket', () => {
      const p = cachePath('JIRA-123');
      expect(path.isAbsolute(p)).toBe(true);
      expect(path.basename(p)).toBe('JIRA-123.json');
    });
    it('lands under .claude/logs/jira', () => {
      expect(cachePath('JIRA-123').replace(/\\/g, '/')).toContain('.claude/logs/jira');
    });
  });

  // Read-only against the real cache dir — assert the safe-degradation contract
  // rather than a machine-specific value.
  describe('cacheFresh / readCachedJson', () => {
    it('cacheFresh is false for a ticket with no cache file', () => {
      expect(cacheFresh('NOPE-999999')).toBe(false);
    });
    it('readCachedJson returns null for a missing ticket', () => {
      expect(readCachedJson('NOPE-999999')).toBeNull();
    });
    it('neither throws', () => {
      expect(() => cacheFresh('NOPE-999999')).not.toThrow();
      expect(() => readCachedJson('NOPE-999999')).not.toThrow();
    });
  });
});
