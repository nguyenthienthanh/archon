#!/usr/bin/env node
/**
 * Archon OS — Task Model Tracker (PreToolUse)
 *
 * Fires: PreToolUse with matcher "Task"
 * Purpose: When the model dispatches a subagent via the Task tool, push the
 *          subagent's frontmatter `model:` onto a JSONL stack so the
 *          statusline can show the model that is *actually* executing the
 *          step — not just the session model from Claude Code's stdin.
 *
 * State file: .aura-frog/runtime/model-stack.jsonl
 *   - JSONL stack: push = append line; pop = remove last line
 *   - Top of stack = `tail -n 1`
 *   - Removed by `task-clear-model.cjs` on PostToolUse(Task)
 *   - Override path with $AF_MODEL_STACK_FILE (used by tests)
 *
 * Fail-open contract: this hook always exits 0. A broken hook must never
 * block a Task dispatch — model tracking is observability, not critical
 * path. Errors go to stderr only.
 *
 * Disable: rename or chmod -x this file. The plugin registration in
 * archon-os/hooks/hooks.json is opt-in by design — see the matcher: Task
 * block.
 *
 * @version 1.0.0 (v3.7.4 follow-up)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { readStdinSafely, parseStdinJson, installWatchdog } = require('./lib/safe-stdin.cjs');

const BUILTIN_AGENTS = new Set(['Explore', 'general-purpose', 'Plan', 'statusline-setup']);

/**
 * Map a Claude model id (or any provider id) to a short human label.
 * Claude pattern: `claude-{family}-{major}-{minor}[<suffix>]`.
 *   - Family is one of opus/sonnet/haiku (case-insensitive).
 *   - Suffix can be a date (`-20251001`) or bracket annotation (`[1m]`) —
 *     both are stripped before the version regex runs.
 *
 * Falls through to:
 *   - `(inherit)` for empty / null / "inherit"
 *   - Title-cased family alone if no version digits found
 *   - Raw value for non-Claude providers
 */
function mapModelDisplay(modelId) {
  if (!modelId) return '(inherit)';
  const m = String(modelId).trim();
  if (!m || m.toLowerCase() === 'inherit') return '(inherit)';

  // Strip bracket annotation (e.g. [1m]) so it doesn't confuse the version regex.
  const stripped = m.replace(/\[[^\]]*\]/g, '');

  const familyMatch = stripped.match(/(opus|sonnet|haiku)/i);
  if (!familyMatch) return m;

  const family = familyMatch[1][0].toUpperCase() + familyMatch[1].slice(1).toLowerCase();
  // Find the first major.minor pair after the family name. Date suffixes
  // like `-20251001` are 8-digit clusters and are filtered out by capping
  // the major/minor capture to 1-2 digits.
  const after = stripped.slice(stripped.toLowerCase().indexOf(familyMatch[1].toLowerCase()) + familyMatch[1].length);
  const verMatch = after.match(/[-.](\d{1,2})[-.](\d{1,2})(?!\d)/);
  if (verMatch) return `${family} ${verMatch[1]}.${verMatch[2]}`;
  return family;
}

/**
 * Parse the `model:` field out of a YAML frontmatter block at the head of
 * the file. Returns "inherit" if missing, malformed, or absent. Only reads
 * the leading `---\n...---\n` envelope — body lines containing "model:"
 * are ignored.
 */
function parseModelFromFrontmatter(content) {
  if (!content || typeof content !== 'string') return 'inherit';
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return 'inherit';
  const fm = fmMatch[1];
  // Allow `model: value` and `model:value` (no space). Strip surrounding
  // quotes and trailing comments.
  const m = fm.match(/^model:\s*(.+?)\s*$/m);
  if (!m) return 'inherit';
  let val = m[1].trim();
  val = val.replace(/^["']|["']$/g, '');
  val = val.split(/#/)[0].trim();
  if (!val) return 'inherit';
  return val;
}

/**
 * Parse the reasoning `effort:` field out of a YAML frontmatter block. Returns
 * null when absent/malformed (so the statusline shows just the model). Only
 * accepts the known effort tiers.
 */
const EFFORT_TIERS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
function parseEffortFromFrontmatter(content) {
  if (!content || typeof content !== 'string') return null;
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const m = fmMatch[1].match(/^(?:effort|reasoning_effort):\s*(.+?)\s*$/m);
  if (!m) return null;
  const val = m[1].trim().replace(/^["']|["']$/g, '').split(/#/)[0].trim().toLowerCase();
  return EFFORT_TIERS.has(val) ? val : null;
}

/**
 * Strip a plugin namespace prefix (e.g. `archon-os:foo` → `foo`). Returns
 * null for empty / falsy input. The Agent tool accepts both prefixed and
 * bare ids; the bare form is what maps to the on-disk filename.
 */
function normalizeSubagentType(subagentType) {
  if (!subagentType || typeof subagentType !== 'string') return null;
  const colonIdx = subagentType.indexOf(':');
  if (colonIdx >= 0) return subagentType.slice(colonIdx + 1);
  return subagentType;
}

/**
 * Resolve the on-disk agent definition for a normalized subagent id.
 * Built-in agents (Explore, general-purpose, Plan, statusline-setup) have
 * no on-disk file — return null silently for them.
 *
 * Search order:
 *   1. <projectRoot>/archon-os/agents/<id>.md   (plugin-source layout)
 *   2. <projectRoot>/.claude/agents/<id>.md     (project-local layout)
 *
 * Returns the absolute path to the .md file, or null if not found.
 */
function resolveAgentFile(subagentType, projectRoot) {
  if (!subagentType) return null;
  if (BUILTIN_AGENTS.has(subagentType)) return null;

  // CLAUDE_PLUGIN_ROOT first: in an installed plugin the agent files live in the
  // plugin cache dir, NOT under <projectRoot>/archon-os — without this the model
  // stack never populated for real users (only inside this dev repo).
  const candidates = [];
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    candidates.push(path.join(process.env.CLAUDE_PLUGIN_ROOT, 'agents', `${subagentType}.md`));
  }
  candidates.push(
    path.join(projectRoot, 'archon-os', 'agents', `${subagentType}.md`),
    path.join(projectRoot, '.claude', 'agents', `${subagentType}.md`),
  );
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch { /* swallow — fail-open */ }
  }
  return null;
}

/**
 * Build a stack-entry object from resolved fields. No I/O.
 */
function buildStackEntry({ subagentType, agentFile, model, effort, sessionId }) {
  return {
    phase: normalizeSubagentType(subagentType) || subagentType || null,
    agent_file: agentFile || null,
    model: model || 'inherit',
    model_display: mapModelDisplay(model),
    effort: effort || null,
    started_at: new Date().toISOString(),
    session_id: sessionId || null,
  };
}

/**
 * Push an entry by appending a single JSONL line. Creates the parent dir
 * if missing. Returns true on success, false on failure (errors go to
 * stderr only — never throws).
 */
function pushStackEntry(stackFile, entry) {
  try {
    fs.mkdirSync(path.dirname(stackFile), { recursive: true });
    fs.appendFileSync(stackFile, JSON.stringify(entry) + '\n');
    return true;
  } catch (err) {
    try { process.stderr.write(`[task-track-model] WARN: push failed: ${err.message}\n`); } catch { /* swallow */ }
    return false;
  }
}

/**
 * End-to-end pre-hook logic, factored out of the CLI entry point so it can
 * be tested without spawning a subprocess. Always returns; never throws.
 *
 * @param {object} input - parsed stdin JSON
 * @param {object} opts - { projectRoot, stackFile }
 * @returns {{action: 'skip'|'push', entry?: object}}
 */
function processPreToolUse(input, opts) {
  const projectRoot = opts.projectRoot || process.cwd();
  const stackFile = opts.stackFile || path.join(projectRoot, '.aura-frog', 'runtime', 'model-stack.jsonl');

  if (!input || typeof input !== 'object') return { action: 'skip' };
  if (input.tool_name !== 'Task') return { action: 'skip' };

  const rawSubagent = input.tool_input && input.tool_input.subagent_type;
  const subagentType = normalizeSubagentType(rawSubagent);
  if (!subagentType) return { action: 'skip' };

  // Per-call overrides from the Task tool_input win over agent frontmatter.
  const ti = input.tool_input || {};
  const tiModel = typeof ti.model === 'string' && ti.model.trim() ? ti.model.trim() : null;
  const tiEffort = typeof ti.effort === 'string' && ti.effort.trim() ? ti.effort.trim().toLowerCase() : null;

  const agentFile = resolveAgentFile(subagentType, projectRoot);
  let frontmatter = '';
  if (agentFile) {
    try { frontmatter = fs.readFileSync(agentFile, 'utf8'); } catch { /* fall through to inherit */ }
  }

  // Built-in agents (Explore, general-purpose, …) have no frontmatter file —
  // still track them WHEN the call carries an explicit model/effort override;
  // otherwise there's nothing to display, so skip.
  if (!agentFile && !tiModel && !tiEffort) {
    try { process.stderr.write(`[task-track-model] no agent file / no override for "${rawSubagent}" — skipping push\n`); } catch { /* swallow */ }
    return { action: 'skip' };
  }

  const model = tiModel || parseModelFromFrontmatter(frontmatter);
  const effort = tiEffort || parseEffortFromFrontmatter(frontmatter);
  const entry = buildStackEntry({
    subagentType: rawSubagent,
    agentFile,
    model,
    effort,
    sessionId: input.session_id || null,
  });
  pushStackEntry(stackFile, entry);
  return { action: 'push', entry };
}

// ----- CLI entry point ------------------------------------------------------
// Guarded so `require()` from tests doesn't trigger stdin read or file I/O.
if (require.main === module) {
  // 1.5s watchdog is plenty for a JSON parse + 1 file read + 1 append.
  installWatchdog(1500, 0);
  try {
    const raw = readStdinSafely();
    const input = parseStdinJson(raw) || {};
    processPreToolUse(input, {});
  } catch (err) {
    try { process.stderr.write(`[task-track-model] WARN: ${err.message}\n`); } catch { /* swallow */ }
  }
  process.exit(0);
}

module.exports = {
  mapModelDisplay,
  parseModelFromFrontmatter,
  parseEffortFromFrontmatter,
  normalizeSubagentType,
  resolveAgentFile,
  buildStackEntry,
  pushStackEntry,
  processPreToolUse,
};
