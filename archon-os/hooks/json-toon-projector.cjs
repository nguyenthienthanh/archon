#!/usr/bin/env node
/**
 * Aura Frog — Generic JSON → TOON Projector
 *
 * Fires: PostToolUse (Read | mcp__.*) async
 * Purpose: When a tool call yields JSON destined for context, run a
 *          deterministic schema-aware projection (via scripts/json-to-toon.cjs)
 *          and emit the TOON to stderr alongside the raw output. The model
 *          gets a much smaller, table-shaped context for the same data —
 *          without an AI-side "summarize" step burning tokens.
 *
 * Behavior:
 *   - Read tool: if file_path ends in .json AND size > MIN_BYTES → project
 *   - mcp__.* tools: read most-recently-touched cache file under
 *     .claude/logs/ matching the tool's args (best-effort)
 *   - Schema sniffing (top-level shape):
 *       jira      ← key + fields.summary + fields.status
 *       tests     ← numTotalTests | (passed && failed)
 *       pr        ← number + title + state
 *       pkg       ← name + version + (dependencies || devDependencies)
 *       generic   ← otherwise (top-level primitives only)
 *   - Skip plugin config files (.mcp.json, plugin.json, marketplace.json,
 *     hooks.json, package.json without deps, *.test.json fixtures)
 *
 * Why a hook (not a rule):
 *   Rules teach the AI to do the projection — but the AI has already
 *   received the raw JSON by the time it acts on the rule. A hook does
 *   the projection deterministically before the AI is asked anything,
 *   saving both tokens and round-trips.
 *
 * Configuration env vars:
 *   AF_JSON_TOON_DISABLED=true  → skip entirely (fallback for debugging)
 *   AF_JSON_TOON_MIN_BYTES=2000 → minimum file/payload size to project
 *   AF_JSON_TOON_MAX_BYTES=1048576 → maximum size; above it the file is skipped
 *                                    (projection would hold raw + parsed + TOON)
 *
 * Exit codes:
 *   0 — always (informational; never blocks)
 *
 * @version 1.0.0 (v3.7.0)
 */

'use strict';

const fs = require('fs');
const { readStdinSafely } = require('./lib/safe-stdin.cjs');
const path = require('path');

if (process.env.AF_JSON_TOON_DISABLED === 'true') process.exit(0);

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');
const TOON_CONVERTER_PATH = path.join(PLUGIN_ROOT, 'scripts', 'json-to-toon.cjs');
const MIN_BYTES = parseInt(process.env.AF_JSON_TOON_MIN_BYTES || '2000', 10);
// Upper cap. Projecting means holding the raw string + the parsed object + the
// TOON string at once — three copies. Above this, skipping is cheaper than any
// context saving the projection could buy, and this hook runs on EVERY Read.
const MAX_BYTES = parseInt(process.env.AF_JSON_TOON_MAX_BYTES || '1048576', 10);

// Bounds for the .claude/logs scan (mcp__.* path). Without these the walk
// recurses an unbounded tree on a hot path.
const LOG_SCAN_MAX_DEPTH = 4;
const LOG_SCAN_MAX_CANDIDATES = 50;
const LOG_SCAN_WINDOW_MS = 60_000;
// Directory-prune grace. A dir's mtime changes when entries are added/removed,
// but NOT when an existing file is rewritten in place — so pruning strictly at
// the 60s window would miss in-place appends. A full day of slack keeps the
// prune limited to what it is actually for: stale archive/date directories.
const LOG_SCAN_PRUNE_GRACE_MS = 24 * 60 * 60 * 1000;

const SKIP_FILES = new Set([
  '.mcp.json',
  'plugin.json',
  'marketplace.json',
  'hooks.json',
  'tsconfig.json',
  'jest.config.json',
  'vitest.config.json',
  '.eslintrc.json',
  '.prettierrc.json',
]);

function safeExit(code = 0) { process.exit(code); }

let convert;
try {
  ({ convert } = require(TOON_CONVERTER_PATH));
} catch {
  safeExit(0); // converter unavailable; nothing to do
}

// ---------- shape detection ----------

function detectSchema(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  // JIRA issue payload
  if (data.key && data.fields && (data.fields.summary || data.fields.status)) return 'jira';

  // Test runner output
  if (typeof data.numTotalTests === 'number') return 'tests';
  if (typeof data.passed === 'number' && typeof data.failed === 'number') return 'tests';

  // GH PR
  if (typeof data.number === 'number' && data.title && data.state) return 'pr';

  // package.json — but only project if it's the runtime kind, not config-only
  if (data.name && data.version && (data.dependencies || data.devDependencies)) return 'pkg';

  // Otherwise → generic top-level
  return 'generic';
}

function readPromptInput() {
  let raw = '';
  try { raw = readStdinSafely(); } catch {/* no stdin */}
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { raw }; }
}

// Read + memoize the hook stdin payload once (stdin can only be consumed once).
let _cachedInput;
function getHookInput() {
  if (_cachedInput === undefined) {
    let raw = '';
    try { raw = readStdinSafely(); } catch { /* no stdin */ }
    try { _cachedInput = raw ? JSON.parse(raw) : {}; } catch { _cachedInput = {}; }
  }
  return _cachedInput;
}

// Tool args come from the stdin tool_input (the hook contract) — NOT the
// CLAUDE_TOOL_ARGS env var, which the API never sets (kept only as a fallback).
function getToolArgs(input = getHookInput()) {
  const ti = input && input.tool_input;
  if (ti && typeof ti === 'object') return ti;
  const argsRaw = process.env.CLAUDE_TOOL_ARGS || '';
  if (!argsRaw) return {};
  try { return JSON.parse(argsRaw); } catch { return {}; }
}

// ---------- main paths ----------

function projectReadTool() {
  const args = getToolArgs();
  const filePath = args.file_path || args.path;
  if (!filePath || !filePath.endsWith('.json')) return null;

  const baseName = path.basename(filePath);
  if (SKIP_FILES.has(baseName)) return null;
  if (baseName.endsWith('.test.json')) return null;
  if (filePath.includes('/.claude/plans/active.json')) return null; // already minimal

  let stat;
  try { stat = fs.statSync(filePath); } catch { return null; }
  if (stat.size < MIN_BYTES || stat.size > MAX_BYTES) return null;

  let raw;
  try { raw = fs.readFileSync(filePath, 'utf-8'); } catch { return null; }

  let data;
  try { data = JSON.parse(raw); } catch { return null; }

  const schema = detectSchema(data);
  if (!schema) return null;

  try {
    const toon = convert(data, { schema });
    return { source: filePath, schema, toon, originalBytes: stat.size };
  } catch {
    return null;
  }
}

// Bounded scan for recent, projectable JSON under `root`.
//
// Runs on a hot path (every mcp__.* tool result), so every step is bounded:
//   - depth-limited recursion (LOG_SCAN_MAX_DEPTH)
//   - stops collecting at LOG_SCAN_MAX_CANDIDATES qualifying files
//   - EXACTLY ONE statSync per file — it yields both mtime and size
//   - stale directories are pruned by mtime before descending
// Returns qualifying {p, m, s} records, newest first. Pure enough to test:
// takes `now` and its bounds as arguments.
function collectRecentJson(root, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const windowMs = opts.windowMs != null ? opts.windowMs : LOG_SCAN_WINDOW_MS;
  const minBytes = opts.minBytes != null ? opts.minBytes : MIN_BYTES;
  const maxBytes = opts.maxBytes != null ? opts.maxBytes : MAX_BYTES;
  const maxDepth = opts.maxDepth != null ? opts.maxDepth : LOG_SCAN_MAX_DEPTH;
  const maxCandidates = opts.maxCandidates != null ? opts.maxCandidates : LOG_SCAN_MAX_CANDIDATES;
  const pruneGraceMs = opts.pruneGraceMs != null ? opts.pruneGraceMs : LOG_SCAN_PRUNE_GRACE_MS;

  const found = [];

  function walk(dir, depth) {
    if (depth > maxDepth || found.length >= maxCandidates) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (found.length >= maxCandidates) return;
      const p = path.join(dir, e.name);

      let stat;
      try { stat = fs.statSync(p); } catch { continue; }  // ONE stat, reused below

      if (e.isDirectory()) {
        // Prune stale trees. A dir untouched for a day cannot hold a file
        // modified in the last 60s (an in-place rewrite bumps the dir's own
        // mtime on the filesystems we care about only sometimes — hence grace).
        if ((now - stat.mtimeMs) > pruneGraceMs) continue;
        walk(p, depth + 1);
      } else if (e.isFile() && p.endsWith('.json')) {
        if ((now - stat.mtimeMs) >= windowMs) continue;
        if (stat.size < minBytes || stat.size > maxBytes) continue;
        found.push({ p, m: stat.mtimeMs, s: stat.size });
      }
    }
  }
  walk(root, 0);

  return found.sort((a, b) => b.m - a.m);
}

function projectMcpResult() {
  // MCP tool results are typically not directly file-backed. Best-effort:
  // peek at recent cache files (.claude/logs/**/*.json) modified within
  // the last 60 seconds. If any large + recent JSON cache exists, project it.

  const { findProjectRoot } = require('./lib/hook-runtime.cjs');
  const logsDir = path.join(findProjectRoot(), '.claude', 'logs');
  if (!fs.existsSync(logsDir)) return null;

  const candidates = collectRecentJson(logsDir);
  if (candidates.length === 0) return null;

  const target = candidates[0];
  let raw;
  try { raw = fs.readFileSync(target.p, 'utf-8'); } catch { return null; }

  let data;
  try { data = JSON.parse(raw); } catch { return null; }

  const schema = detectSchema(data);
  if (!schema) return null;

  try {
    const toon = convert(data, { schema });
    return { source: target.p, schema, toon, originalBytes: target.s };
  } catch {
    return null;
  }
}

function main() {
  const toolName = getHookInput().tool_name || process.env.CLAUDE_TOOL_NAME || '';

  let result = null;
  if (toolName === 'Read') {
    result = projectReadTool();
  } else if (/^mcp__/.test(toolName)) {
    result = projectMcpResult();
  }

  if (!result) safeExit(0);

  const savedRatio = result.toon.length / result.originalBytes;
  const savedPct = Math.round((1 - savedRatio) * 100);

  process.stderr.write(
    `[json-toon | trust:file | schema:${result.schema} | ${savedPct}% smaller]\n` +
    `  source: ${result.source}\n` +
    `  ${result.originalBytes} bytes JSON → ${result.toon.length} bytes TOON (use this projection; raw JSON is the noisy version)\n\n` +
    result.toon + '\n'
  );

  safeExit(0);
}

if (require.main === module) {
  main();
} else {
  module.exports = { getHookInput, getToolArgs, collectRecentJson, MIN_BYTES, MAX_BYTES };
}
