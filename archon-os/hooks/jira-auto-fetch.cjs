#!/usr/bin/env node
/**
 * Aura Frog — JIRA Auto-Fetch
 *
 * Fires: UserPromptSubmit (async)
 * Purpose: Detect JIRA ticket patterns ([A-Z]{2,10}-[0-9]{1,6}) in user prompts,
 *          fetch the ticket via the Atlassian REST API, and cache per-project
 *          at .claude/logs/jira/{TICKET_ID}.json with 24h TTL. Surfaces a
 *          1-line TOON summary per ticket to stderr (Claude reads stderr; the
 *          user typically does not).
 *
 * Behavior:
 *   - Silent if no [A-Za-z]{2,10}-[0-9]{1,6} tokens in prompt
 *   - Case-insensitive: 'ignt-2034' and 'IGNT-2034' both match; the cache key
 *     and API request always use UPPERCASE-<digits>.
 *   - Silent if JIRA env not configured (one-time hint per session via flag file)
 *   - Cap: 3 unique tickets per prompt (anti-fatigue)
 *   - Cache 24h TTL per ticket; subsequent prompts reuse the cache silently
 *   - Optional JIRA_PROJECT_PREFIXES env (comma-separated allowlist) to filter
 *     out false positives like UTF-8, RFC-123, HTTP-200
 *
 * Single source of truth:
 *   This hook is the only JIRA-fetch path in Aura Frog. There is no standalone
 *   CLI script — credentials, curl call, and TOON projection all live here.
 *
 * Exit codes:
 *   0 — always (non-blocking; this is informational context, not a guard)
 *
 * @version 1.2.0 (case-insensitive ticket match; normalises to UPPERCASE)
 */

'use strict';

const fs = require('fs');
const { readStdinSafely } = require('./lib/safe-stdin.cjs');
const path = require('path');
const { execFileSync } = require('child_process');
const { guardEndpoint } = require('./lib/af-net-guard.cjs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');
const TOON_CONVERTER = path.join(PLUGIN_ROOT, 'scripts', 'json-to-toon.cjs');

const { findProjectRoot } = require('./lib/hook-runtime.cjs');
const PROJECT_CACHE_DIR = path.join(findProjectRoot(), '.claude', 'logs', 'jira');
const SESSION_HINT_FLAG = path.join(findProjectRoot(), '.claude', 'logs', '.jira-env-hint-shown');

let toonConverter = null;
try {
  toonConverter = require(TOON_CONVERTER);
} catch {/* converter unavailable; will fall back to one-line summary */}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TICKETS_PER_PROMPT = 3;
// Case-insensitive — users frequently type `ignt-2034` or `Ignt-2034` in chat
// while JIRA itself canonicalises the project key in uppercase. We accept any
// case and normalise to UPPERCASE-<digits> for the cache key and API call.
const TICKET_PATTERN = /\b([A-Za-z]{2,10})-(\d{1,6})\b/g;

function safeExit(code = 0) { process.exit(code); }

function readPrompt() {
  let input = '';
  try {
    input = readStdinSafely();
  } catch {/* no stdin */}
  if (input) {
    try {
      const data = JSON.parse(input);
      return data.prompt || data.user_prompt || '';
    } catch {
      return input;
    }
  }
  return process.env.CLAUDE_USER_PROMPT || '';
}

function extractTickets(prompt) {
  const found = new Set();
  let m;
  TICKET_PATTERN.lastIndex = 0;
  while ((m = TICKET_PATTERN.exec(prompt)) !== null) {
    // Normalise to UPPERCASE-<digits> so the cache file path and JIRA API
    // call both use the canonical key regardless of how the user typed it.
    found.add(`${m[1].toUpperCase()}-${m[2]}`);
  }
  return Array.from(found);
}

function applyProjectAllowlist(tickets) {
  const raw = process.env.JIRA_PROJECT_PREFIXES;
  if (!raw) return tickets;
  const allowed = new Set(raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
  if (allowed.size === 0) return tickets;
  return tickets.filter(t => allowed.has(t.split('-')[0]));
}

function envConfigured() {
  return Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN);
}

function cachePath(ticketId) {
  return path.join(PROJECT_CACHE_DIR, `${ticketId}.json`);
}

function cacheFresh(ticketId) {
  const p = cachePath(ticketId);
  if (!fs.existsSync(p)) return false;
  try {
    const stat = fs.statSync(p);
    return (Date.now() - stat.mtimeMs) < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

const JIRA_FIELDS = 'summary,description,status,priority,assignee,reporter,labels,components,' +
  'fixVersions,parent,subtasks,issuelinks,comment,issuetype,created,updated';

function fetchTicket(ticketId) {
  const baseUrl = process.env.JIRA_BASE_URL.replace(/\/$/, '');
  // JIRA_BASE_URL comes from the environment, and the request below carries a
  // basic-auth API token — so a single edited .envrc line could ship that token
  // to any host. Require https + an allowlisted host before building the call.
  const endpoint = guardEndpoint(
    `${baseUrl}/rest/api/3/issue/${ticketId}`, 'jira', 'jira-auto-fetch');
  if (!endpoint) return null;
  endpoint.searchParams.set('fields', JIRA_FIELDS);

  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  const url = endpoint.toString();
  try {
    const out = execFileSync('curl', [
      '-sf', '--max-time', '10',
      '-H', `Authorization: Basic ${auth}`,
      '-H', 'Accept: application/json',
      url,
    ], { encoding: 'utf-8', timeout: 12000 });
    JSON.parse(out);
    return out;
  } catch (err) {
    const safe = String(err.code || err.status || err.signal || 'failed');
    process.stderr.write(`[jira-auto-fetch] WARN: fetch failed for ${ticketId} (${safe})\n`);
    return null;
  }
}

function readCachedJson(ticketId) {
  try {
    const raw = fs.readFileSync(cachePath(ticketId), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCacheFromFetch(ticketId, rawJsonString) {
  if (!fs.existsSync(PROJECT_CACHE_DIR)) fs.mkdirSync(PROJECT_CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(ticketId), rawJsonString);
}

function showEnvHintOnce() {
  try {
    if (fs.existsSync(SESSION_HINT_FLAG)) return;
    fs.mkdirSync(path.dirname(SESSION_HINT_FLAG), { recursive: true });
    fs.writeFileSync(SESSION_HINT_FLAG, new Date().toISOString());
    process.stderr.write(
      `[jira-auto-fetch] Detected ticket pattern but JIRA env not set.\n` +
      `  To enable auto-fetch: export JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN in .envrc\n` +
      `  See archon-os/.envrc.template for the full list.\n`
    );
  } catch {/* best-effort */}
}

function main() {
  const prompt = readPrompt();
  if (!prompt) safeExit(0);

  const tickets = applyProjectAllowlist(extractTickets(prompt));
  if (tickets.length === 0) safeExit(0);

  const limited = tickets.slice(0, MAX_TICKETS_PER_PROMPT);

  if (!envConfigured()) {
    showEnvHintOnce();
    safeExit(0);
  }

  const projectedTickets = [];
  const failedTickets = [];

  for (const ticketId of limited) {
    if (!cacheFresh(ticketId)) {
      const out = fetchTicket(ticketId);
      if (out) writeCacheFromFetch(ticketId, out);
    }
    const cached = readCachedJson(ticketId);
    if (!cached) { failedTickets.push(ticketId); continue; }

    if (toonConverter && cached) {
      try {
        const toon = toonConverter.convert(cached, { schema: 'jira' });
        projectedTickets.push(toon);
        continue;
      } catch {/* fall through to one-line summary */}
    }

    // Fallback if converter unavailable: minimal one-line summary
    const summary = cached?.fields?.summary || '';
    const status = cached?.fields?.status?.name || '?';
    if (summary) {
      projectedTickets.push(`ticket{key,status,summary}:\n  ${ticketId},${status},"${summary.replace(/"/g, '""').slice(0, 120)}"`);
    } else {
      failedTickets.push(ticketId);
    }
  }

  const blocks = [];
  for (const t of projectedTickets) blocks.push(t);
  for (const f of failedTickets) blocks.push(`# ${f} — fetch failed or empty cache`);

  if (tickets.length > MAX_TICKETS_PER_PROMPT) {
    blocks.push(`# ... ${tickets.length - MAX_TICKETS_PER_PROMPT} more ticket(s) detected; cap at ${MAX_TICKETS_PER_PROMPT}/prompt`);
  }

  if (blocks.length === 0) safeExit(0);

  process.stderr.write(`[jira-auto-fetch | trust:file]\n${blocks.join('\n\n')}\n`);
  safeExit(0);
}

// Run as a hook; stay importable for tests. Requiring this file used to execute
// main() as a side effect (read stdin, hit the JIRA API, write the cache), so
// none of its logic was reachable from a test. FEAT-007 / issue #5.
if (require.main === module) {
  main();
} else {
  module.exports = {
    extractTickets, applyProjectAllowlist, envConfigured, cachePath, cacheFresh, readCachedJson,
  };
}
