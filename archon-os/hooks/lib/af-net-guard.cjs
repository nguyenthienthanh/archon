'use strict';

/**
 * Aura Frog — outbound endpoint guard
 *
 * Every outbound request this plugin makes carries a long-lived credential: the
 * Supabase service key (apikey + Bearer) for the learning tier, a base64 Jira
 * API token for ticket fetches. Two things therefore have to be true before a
 * request is allowed to leave:
 *
 *   1. The transport is TLS. The learning client used to pick `http` whenever
 *      SUPABASE_URL began with http://, which put the service key on the wire in
 *      cleartext for anything between here and the host.
 *   2. The host is one we meant to talk to. SUPABASE_URL / JIRA_BASE_URL come
 *      from the environment (.envrc, shell profile, a checked-in template), so a
 *      single edited line was enough to redirect every credentialed request to
 *      an attacker's host without changing a byte of plugin code.
 *
 * Both checks fail CLOSED: the caller skips the request and warns, rather than
 * sending the secret anyway. Sites that legitimately live elsewhere — a
 * self-hosted Jira, a proxied Supabase — name their hosts in the corresponding
 * AF_*_HOST_ALLOWLIST env var; the warning says which one to set.
 *
 * @version 1.0.0
 */

// Default allowlists per endpoint kind. Overridable via the paired env var.
const ENDPOINTS = {
  supabase: { envVar: 'AF_LEARNING_HOST_ALLOWLIST', hosts: ['*.supabase.co'] },
  jira: { envVar: 'AF_JIRA_HOST_ALLOWLIST', hosts: ['*.atlassian.net'] },
};

// Pure: split an allowlist env value on commas/whitespace into normalised hosts.
function parseAllowlist(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[\s,]+/)
    .map(s => s.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean);
}

// Pure: does `host` match one allowlist pattern? Supports an exact host and a
// single leading-wildcard label group (`*.supabase.co`). The wildcard matches
// any subdomain of the suffix but NOT the bare suffix, and — because it anchors
// on endsWith of the dotted suffix — never matches a lookalike like
// `supabase.co.evil.test`.
function hostMatchesPattern(host, pattern) {
  if (!host || !pattern) return false;
  if (host === pattern) return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // '.supabase.co'
    return host.length > suffix.length && host.endsWith(suffix);
  }
  return false;
}

// Pure: is `host` allowed by any pattern in the list?
function hostAllowed(host, patterns) {
  return patterns.some(p => hostMatchesPattern(host, p));
}

// Resolve the effective allowlist for an endpoint kind: the env override when
// set (it REPLACES the default, so an operator can move off supabase.co
// entirely), else the built-in default.
function allowlistFor(kind, env = process.env) {
  const spec = ENDPOINTS[kind];
  if (!spec) return { envVar: null, hosts: [] };
  const override = parseAllowlist(env[spec.envVar]);
  return { envVar: spec.envVar, hosts: override.length ? override : spec.hosts };
}

/**
 * Decide whether a credentialed request to `rawUrl` may proceed.
 *
 * Pure — no I/O, no warning. Returns {ok:true, url} or {ok:false, reason} with
 * a reason already phrased for an operator reading stderr.
 */
function checkEndpoint(rawUrl, kind, env = process.env) {
  const { envVar, hosts } = allowlistFor(kind, env);

  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    return { ok: false, reason: `malformed URL (${JSON.stringify(String(rawUrl).slice(0, 80))})` };
  }

  if (url.protocol !== 'https:') {
    return {
      ok: false,
      reason: `refusing to send credentials over ${url.protocol}// — https is required`,
    };
  }

  if (!hostAllowed(url.hostname, hosts)) {
    return {
      ok: false,
      reason: `host ${url.hostname} is not in the allowlist (${hosts.join(', ')})` +
        (envVar ? ` — set ${envVar} to permit it` : ''),
    };
  }

  return { ok: true, url };
}

// One warning per process per (kind, reason): these guards sit on hot paths that
// run per prompt, and a misconfigured .envrc would otherwise print on every one.
const warned = new Set();

/**
 * I/O wrapper around checkEndpoint: warns once on stderr and returns the parsed
 * URL, or null when the request must be skipped.
 */
function guardEndpoint(rawUrl, kind, label, env = process.env) {
  const verdict = checkEndpoint(rawUrl, kind, env);
  if (verdict.ok) return verdict.url;
  const key = `${kind}:${verdict.reason}`;
  if (!warned.has(key)) {
    warned.add(key);
    try {
      process.stderr.write(`[${label}] SECURITY: request skipped — ${verdict.reason}\n`);
    } catch { /* stderr closed — never block on the warning */ }
  }
  return null;
}

// Test seam: drop the once-per-process warning memo.
function _resetWarnings() {
  warned.clear();
}

module.exports = {
  ENDPOINTS,
  parseAllowlist,
  hostMatchesPattern,
  hostAllowed,
  allowlistFor,
  checkEndpoint,
  guardEndpoint,
  _resetWarnings,
};
