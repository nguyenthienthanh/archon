'use strict';

/**
 * af-net-guard — the gate every credentialed outbound request goes through.
 *
 * Two failures it exists to prevent: the Supabase service key travelling in
 * cleartext because SUPABASE_URL began with http://, and a credentialed request
 * being redirected to an arbitrary host by an edited env var. Both must fail
 * closed, so the negative cases carry as much weight here as the positive ones.
 */

const guard = require('../af-net-guard.cjs');

const {
  parseAllowlist, hostMatchesPattern, hostAllowed, allowlistFor,
  checkEndpoint, guardEndpoint, _resetWarnings,
} = guard;

describe('parseAllowlist', () => {
  it('splits on commas and whitespace, normalising case and trailing dots', () => {
    expect(parseAllowlist('A.Example.com, *.supabase.co\n  jira.internal.')).toEqual([
      'a.example.com', '*.supabase.co', 'jira.internal',
    ]);
  });

  it('is empty for unset/blank values', () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist('')).toEqual([]);
    expect(parseAllowlist('  , ,  ')).toEqual([]);
  });
});

describe('hostMatchesPattern', () => {
  it('matches an exact host', () => {
    expect(hostMatchesPattern('jira.internal', 'jira.internal')).toBe(true);
    expect(hostMatchesPattern('jira.internal', 'other.internal')).toBe(false);
  });

  it('matches a subdomain under a leading wildcard', () => {
    expect(hostMatchesPattern('abcd.supabase.co', '*.supabase.co')).toBe(true);
    expect(hostMatchesPattern('a.b.supabase.co', '*.supabase.co')).toBe(true);
  });

  it('does not match the bare suffix under a wildcard', () => {
    expect(hostMatchesPattern('supabase.co', '*.supabase.co')).toBe(false);
  });

  it('does not match lookalike hosts that merely contain the suffix', () => {
    // The whole point of anchoring on the dotted suffix: an attacker who
    // registers these must not inherit the allowlist entry.
    expect(hostMatchesPattern('supabase.co.evil.test', '*.supabase.co')).toBe(false);
    expect(hostMatchesPattern('notsupabase.co', '*.supabase.co')).toBe(false);
    expect(hostMatchesPattern('evil-supabase.co', '*.supabase.co')).toBe(false);
  });

  it('is false for empty inputs', () => {
    expect(hostMatchesPattern('', '*.supabase.co')).toBe(false);
    expect(hostMatchesPattern('x.supabase.co', '')).toBe(false);
  });
});

describe('hostAllowed / allowlistFor', () => {
  it('accepts a host matching any pattern in the list', () => {
    expect(hostAllowed('x.supabase.co', ['jira.internal', '*.supabase.co'])).toBe(true);
    expect(hostAllowed('x.other.co', ['jira.internal', '*.supabase.co'])).toBe(false);
  });

  it('defaults supabase to *.supabase.co and jira to *.atlassian.net', () => {
    expect(allowlistFor('supabase', {}).hosts).toEqual(['*.supabase.co']);
    expect(allowlistFor('jira', {}).hosts).toEqual(['*.atlassian.net']);
  });

  it('lets the env var REPLACE the default, so an operator can move hosts', () => {
    const env = { AF_LEARNING_HOST_ALLOWLIST: 'db.corp.example' };
    expect(allowlistFor('supabase', env).hosts).toEqual(['db.corp.example']);
    expect(hostAllowed('x.supabase.co', allowlistFor('supabase', env).hosts)).toBe(false);
  });

  it('is inert for an unknown kind (allowlist empty ⇒ nothing passes)', () => {
    expect(allowlistFor('nope', {}).hosts).toEqual([]);
  });
});

describe('checkEndpoint', () => {
  it('accepts an https allowlisted endpoint and returns the parsed URL', () => {
    const v = checkEndpoint('https://abcd.supabase.co/rest/v1/patterns', 'supabase', {});
    expect(v.ok).toBe(true);
    expect(v.url.hostname).toBe('abcd.supabase.co');
    expect(v.url.pathname).toBe('/rest/v1/patterns');
  });

  it('refuses http even when the host itself is allowlisted', () => {
    const v = checkEndpoint('http://abcd.supabase.co/rest/v1/patterns', 'supabase', {});
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/https is required/);
  });

  it('refuses non-http(s) schemes outright', () => {
    for (const u of ['ftp://abcd.supabase.co/x', 'file:///etc/passwd']) {
      expect(checkEndpoint(u, 'supabase', {}).ok).toBe(false);
    }
  });

  it('refuses an https endpoint on a host outside the allowlist', () => {
    const v = checkEndpoint('https://evil.test/rest/v1/patterns', 'supabase', {});
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/not in the allowlist/);
    expect(v.reason).toMatch(/AF_LEARNING_HOST_ALLOWLIST/);
  });

  it('names the jira env var in the jira refusal, so self-hosters know the knob', () => {
    const v = checkEndpoint('https://jira.corp.example/rest/api/3/issue/AB-1', 'jira', {});
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/AF_JIRA_HOST_ALLOWLIST/);
  });

  it('accepts a self-hosted jira once it is allowlisted', () => {
    const env = { AF_JIRA_HOST_ALLOWLIST: 'jira.corp.example' };
    expect(checkEndpoint('https://jira.corp.example/rest/api/3/issue/AB-1', 'jira', env).ok).toBe(true);
  });

  it('refuses a malformed URL rather than throwing', () => {
    for (const u of ['', 'not a url', undefined, '///', 'https://']) {
      const v = checkEndpoint(u, 'supabase', {});
      expect(v.ok).toBe(false);
    }
  });

  it('refuses an undefined base URL — the unset-env case', () => {
    // This is literally `${process.env.SUPABASE_URL}/rest/v1/x` with the var unset.
    const v = checkEndpoint('undefined/rest/v1/patterns', 'supabase', {});
    expect(v.ok).toBe(false);
  });

  it('is not fooled by userinfo pointing at an allowlisted host', () => {
    const v = checkEndpoint('https://abcd.supabase.co@evil.test/rest/v1/x', 'supabase', {});
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/evil\.test/);
  });
});

describe('guardEndpoint', () => {
  let stderr;
  beforeEach(() => {
    _resetWarnings();
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => stderr.mockRestore());

  it('returns the URL and stays quiet when the endpoint is fine', () => {
    const url = guardEndpoint('https://abcd.supabase.co/rest/v1/x', 'supabase', 'af-learning', {});
    expect(url).not.toBeNull();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('returns null and warns once per distinct reason', () => {
    expect(guardEndpoint('http://abcd.supabase.co/a', 'supabase', 'af-learning', {})).toBeNull();
    expect(guardEndpoint('http://abcd.supabase.co/b', 'supabase', 'af-learning', {})).toBeNull();
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stderr.mock.calls[0][0]).toMatch(/\[af-learning] SECURITY: request skipped/);
  });

  it('still warns for a second, different reason', () => {
    guardEndpoint('http://abcd.supabase.co/a', 'supabase', 'af-learning', {});
    guardEndpoint('https://evil.test/a', 'supabase', 'af-learning', {});
    expect(stderr).toHaveBeenCalledTimes(2);
  });
});
