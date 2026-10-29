#!/usr/bin/env node
/**
 * Aura Frog — MCP Call Gate
 *
 * Fires: PreToolUse (mcp__.*)
 * Purpose: Per-agent allowlist + rate limit + audit logging for MCP calls.
 *          Blocks calls violating the allowlist or hitting hard rate limits.
 *
 * Behavior:
 *   - Resolve tool name + calling agent from the stdin hook payload
 *     (readHookInputCompat — the documented contract; env vars are NOT set
 *     by the hook API, so the old CLAUDE_TOOL_NAME read left the gate dead).
 *   - Read allowlist from agent's frontmatter `mcp_servers:` field
 *     (default: all MCPs allowed — backward-compat)
 *   - Block calls to disallowed MCPs (exit 2)
 *   - Track per-MCP rate counters; warn at 80% (soft); block at 100% (hard).
 *     The per-session counter resets on a rolling window boundary so a
 *     long-lived counter file cannot hard-block a fresh session forever.
 *   - Run `scripts/security/sanitize-mcp-input.sh` on input before audit append
 *   - Append sanitized entry to <security-dir>/mcp-audit.jsonl
 *     (lib/security-dir.cjs: .claude/security if present, else .aura/security;
 *      AF_SECURITY_DIR overrides)
 *
 * Configuration:
 *   AF_MCP_AUDIT_DISABLED=true        — skip audit (still enforce allowlist + rate limits)
 *   AF_MCP_SESSION_WINDOW_MS=3600000  — rolling window for the per-session counter reset
 *   AF_MCP_AUDIT_RETENTION_DAYS=30    — pruning happens via session-start sweep, not here
 *   plugin.json#mcp_rate_limits       — per-MCP overrides
 *
 * Exit codes:
 *   0 — pass (call proceeds; audit appended)
 *   2 — BLOCK (allowlist violation OR hard rate limit hit)
 *
 * @version 2.0.0 (FEAT-010 / STORY-0021 / TASK-00035 — stdin contract + windowed reset)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readHookInputCompat, findProjectRoot } = require('./lib/hook-runtime.cjs');
const { resolveMcpAuditFile } = require('./lib/security-dir.cjs');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');
const SANITIZER = path.join(PLUGIN_ROOT, 'scripts', 'security', 'sanitize-mcp-input.sh');
const PLUGIN_JSON = path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
const AGENTS_DIR = path.join(PLUGIN_ROOT, 'agents');

// Resolved, not hardcoded: this hook is the sole WRITER of the audit log, and
// the sweep, the dashboard and the auditor skill all have to agree with it on
// where that log is. See lib/security-dir.cjs for the resolution order.
const AUDIT_FILE = resolveMcpAuditFile(findProjectRoot());
const COUNTER_FILE = path.join(findProjectRoot(), '.claude', 'logs', '.mcp-rate-counter.json');

const DEFAULT_LIMITS = { max_calls_per_minute: 30, max_calls_per_session: 200 };
const HARD_BLOCK_LIMIT = 1.0;
const SOFT_WARN_LIMIT = 0.8;
// Rolling window after which the per-session counter is considered stale and
// reset. The per-session cap is a rate limit, not a lifetime quota — without a
// window a persisted counter file hard-blocks every future call once it hits
// max_calls_per_session. Default 1h, matching other AF cache TTLs.
const SESSION_WINDOW_MS = Number(process.env.AF_MCP_SESSION_WINDOW_MS) || 3600000;

function safeExit(code = 0) { process.exit(code); }

// ---------- pure helpers (exported for tests) ----------

// Parse mcp__plugin_<plugin>_<server>__<method> or mcp__<server>__<method>.
// Server names MAY contain single underscores (e.g. "my_server"). Method names
// MAY contain double underscores; we anchor on the LAST literal "__" as the
// server↔method separator, then peel the plugin prefix from the head.
function parseMcpToolName(name) {
  const stripped = String(name || '').replace(/^mcp__/, '');
  const sepIndex = stripped.lastIndexOf('__');
  if (sepIndex <= 0) return null;
  const head = stripped.slice(0, sepIndex);
  const method = stripped.slice(sepIndex + 2);
  if (!method) return null;

  // Plugin-prefixed form: "plugin_<plugin>_<server>". The plugin token cannot
  // contain an underscore in Claude Code conventions, so we strip exactly one
  // token after "plugin_" to get the plugin id; the rest is the server name
  // (which may legally contain underscores).
  const pluginMatch = head.match(/^plugin_([^_]+)_(.+)$/);
  if (pluginMatch) return { server: pluginMatch[2], method };
  return { server: head, method };
}

// Resolve the tool name from the hook payload. The hook contract delivers it
// via stdin JSON — NOT process.env.CLAUDE_TOOL_NAME (which the API never sets;
// reading it left the whole gate disabled).
function resolveToolName(input) {
  return (input && typeof input.tool_name === 'string') ? input.tool_name : '';
}

// Resolve the calling agent from the payload. Agent identity is not a
// documented stdin field; readHookInputCompat already applies the
// CLAUDE_AGENT_NAME env fallback. null → caller defaults to "main" (allow-all,
// backward-compat).
function resolveAgent(input) {
  if (!input) return null;
  return input.agent_name || null;
}

// Return counters, resetting to a fresh window when the stored window is stale,
// missing, or malformed. Pure: caller supplies `now` + `windowMs`.
function normalizeCounters(raw, now, windowMs) {
  if (!raw || typeof raw !== 'object' || !raw.session_start
      || (now - raw.session_start) > windowMs) {
    return { session_start: now, per_server: {} };
  }
  if (!raw.per_server || typeof raw.per_server !== 'object') raw.per_server = {};
  return raw;
}

// Compute rate-limit pressure as the max of per-minute and per-session usage.
function computeUsage(serverCounter, limits) {
  const minuteUsage = (serverCounter.last_minute || []).length / limits.max_calls_per_minute;
  const sessionUsage = serverCounter.session / limits.max_calls_per_session;
  return { minuteUsage, sessionUsage, usage: Math.max(minuteUsage, sessionUsage) };
}

// ---------- IO-bound helpers ----------

function readAgentFromInput(input) {
  try { return resolveAgent(input); } catch { return null; }
}

// Look up allowlist from agent file
function getAllowlist(agentId) {
  if (agentId === 'main' || !agentId) return null; // null = default = all allowed
  const candidatePaths = [
    path.join(AGENTS_DIR, `${agentId}.md`),
    path.join(AGENTS_DIR, 'reference', `${agentId}.md`),
    path.join(AGENTS_DIR, `${agentId.replace(/^archon-os:/, '')}.md`),
  ];
  for (const p of candidatePaths) {
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf8');
    const m = content.match(/^mcp_servers:\s*\[([^\]]*)\]/m);
    if (m) return m[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  return null; // not declared → default all allowed (backward-compat)
}

// Look up rate limit from plugin.json
function getRateLimits(server) {
  try {
    const pkg = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8'));
    const limits = pkg.mcp_rate_limits || {};
    return limits[server] || limits.default || DEFAULT_LIMITS;
  } catch {
    return DEFAULT_LIMITS;
  }
}

// Counter management (windowed reset applied on read)
function getCounters() {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8')); }
  catch { raw = null; }
  return normalizeCounters(raw, Date.now(), SESSION_WINDOW_MS);
}

function saveCounters(c) {
  try {
    fs.mkdirSync(path.dirname(COUNTER_FILE), { recursive: true });
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(c, null, 2));
  } catch {/* best-effort */}
}

function incrementCounter(server) {
  const c = getCounters();
  if (!c.per_server[server]) c.per_server[server] = { session: 0, last_minute: [] };
  const now = Date.now();
  c.per_server[server].session += 1;
  c.per_server[server].last_minute = (c.per_server[server].last_minute || []).filter(ts => (now - ts) < 60000);
  c.per_server[server].last_minute.push(now);
  saveCounters(c);
  return c.per_server[server];
}

// ---------- audit appender ----------

function appendAudit(agentName, parsed, toolInput, extra) {
  if (process.env.AF_MCP_AUDIT_DISABLED === 'true') return;

  const argsRaw = (toolInput !== undefined && toolInput !== null)
    ? (typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput))
    : '{}';
  let sanitizedInput = argsRaw;
  if (fs.existsSync(SANITIZER)) {
    const result = spawnSync('bash', [SANITIZER], {
      input: argsRaw,
      encoding: 'utf-8',
      timeout: 1000,
    });
    if (result.stdout) sanitizedInput = result.stdout.trim();
  }

  let parsedInput;
  try { parsedInput = JSON.parse(sanitizedInput); }
  catch { parsedInput = { _raw: sanitizedInput.slice(0, 256) }; }

  const entry = {
    ts: new Date().toISOString(),
    agent: agentName,
    mcp: parsed.server,
    method: parsed.method,
    input: parsedInput,
    success: !extra.blocked,
    BLOCKED: extra.blocked || false,
    reason: extra.reason || null,
  };

  try {
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
  } catch {/* best-effort */}
}

// One-time stderr hint when we couldn't resolve the agent. Helps the user
// notice that the per-agent gate is in backward-compat mode (allow-all)
// instead of failing-closed silently.
function warnAgentUnknownOnce() {
  const flagFile = path.join(findProjectRoot(), '.claude', 'logs', '.mcp-agent-hint-shown');
  try {
    if (!fs.existsSync(flagFile)) {
      fs.mkdirSync(path.dirname(flagFile), { recursive: true });
      fs.writeFileSync(flagFile, new Date().toISOString());
      process.stderr.write(
        `[mcp-call-gate] WARN: agent identity unknown (no stdin agent_name / no CLAUDE_AGENT_NAME).\n` +
        `  Per-agent MCP allowlist is in backward-compat mode (allow-all). To enforce:\n` +
        `  set CLAUDE_AGENT_NAME in your wrapper OR declare mcp_servers: [...] in agent frontmatter.\n`
      );
    }
  } catch {/* best-effort; never block on hint */}
}

// ---------- gate entry point ----------

function main() {
  let input;
  try { input = readHookInputCompat(); } catch { safeExit(0); }

  const toolName = resolveToolName(input);
  if (!toolName.startsWith('mcp__')) safeExit(0);

  const parsed = parseMcpToolName(toolName);
  if (!parsed) safeExit(0);

  const resolvedAgent = readAgentFromInput(input);
  const agentName = resolvedAgent || 'main';
  const toolInput = input ? input.tool_input : null;

  if (!resolvedAgent) warnAgentUnknownOnce();

  // Allowlist check
  const allowlist = getAllowlist(agentName);
  if (allowlist !== null && !allowlist.includes(parsed.server)) {
    appendAudit(agentName, parsed, toolInput, { blocked: true, reason: 'allowlist_violation' });
    process.stderr.write(
      `[mcp-call-gate] BLOCKED: agent="${agentName}" not in allowlist for MCP "${parsed.server}"\n` +
      `  declared allowlist: [${allowlist.join(', ') || 'empty'}]\n` +
      `  edit archon-os/agents/${agentName}.md frontmatter mcp_servers: to allow\n`
    );
    safeExit(2);
  }

  // Rate limit check
  const limits = getRateLimits(parsed.server);
  const counter = incrementCounter(parsed.server);
  const { usage } = computeUsage(counter, limits);

  if (usage >= HARD_BLOCK_LIMIT) {
    appendAudit(agentName, parsed, toolInput, { blocked: true, reason: 'rate_limit_hard' });
    process.stderr.write(
      `[mcp-call-gate] BLOCKED: rate limit hit for "${parsed.server}"\n` +
      `  per-minute: ${counter.last_minute.length}/${limits.max_calls_per_minute}\n` +
      `  per-session: ${counter.session}/${limits.max_calls_per_session}\n` +
      `  to override: /archon-os:mcp reset-limits --mcp ${parsed.server}\n`
    );
    safeExit(2);
  }

  if (usage >= SOFT_WARN_LIMIT) {
    process.stderr.write(
      `[mcp-call-gate] WARN: ${Math.round(usage * 100)}% of rate limit for "${parsed.server}" — slow down\n`
    );
  }

  appendAudit(agentName, parsed, toolInput, { blocked: false });
  safeExit(0);
}

if (require.main === module) main();

module.exports = {
  parseMcpToolName,
  resolveToolName,
  resolveAgent,
  normalizeCounters,
  computeUsage,
  getAllowlist,
  getRateLimits,
  SESSION_WINDOW_MS,
  DEFAULT_LIMITS,
  HARD_BLOCK_LIMIT,
  SOFT_WARN_LIMIT,
};
