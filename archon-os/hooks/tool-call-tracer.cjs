#!/usr/bin/env node
/**
 * Aura Frog — Tool Call Tracer
 *
 * Fires: PreToolUse + PostToolUse for Bash | Edit | Write | Read | Grep | Glob
 * Purpose: Emit append-only trace events to .claude/plans/traces/{TASK_ID}.jsonl
 *          Used by /archon-os:trace and grounding-discipline rule.
 *
 * Behavior:
 *   - Silent if no active task
 *   - Pre-phase: emits `tool_call` event with tool_name + args_hash
 *   - Post-phase: emits `tool_result` event with exit_code + result_hash + duration_ms
 *   - For Read: also emits a `file_read` event with path + sha256 (cheap, exact)
 *
 * Disable:
 *   AF_TRACE_DISABLED=true — no trace events emitted; .claude/plans/traces/ stays empty.
 *
 * Exit codes:
 *   0 — success (always; this is a recorder)
 *
 * @version 1.1.0 (AF_TRACE_DISABLED wired)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const resolvePlansDir = require('./lib/plans-dir.cjs');
const { readStdinSafely, parseStdinJson } = require('./lib/hook-runtime.cjs');
const { readToolName, readExitCode, readArgs, readDurationMs } = require('./lib/tool-context.cjs');

const PLANS_DIR = resolvePlansDir();
const ACTIVE_FILE = path.join(PLANS_DIR, 'active.json');

function safeExit(code = 0) { process.exit(code); }

// v3.7.3+: trace.jsonl lives INSIDE the task folder
// (features/.../stories/.../tasks/{ID}_{slug}/trace.jsonl). Find that folder
// by searching for a file whose `id:` frontmatter matches taskId. Pure fs walk.
function resolveTaskFolder(plansDir, id) {
  const featuresRoot = path.join(plansDir, 'features');
  if (!fs.existsSync(featuresRoot)) return null;
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        // Look for a task.md inside this dir with matching id.
        const candidate = path.join(full, 'task.md');
        if (fs.existsSync(candidate)) {
          try {
            const body = fs.readFileSync(candidate, 'utf8');
            const m = body.match(/^id:\s*(.+?)\s*$/m);
            if (m && m[1].trim().replace(/^["']|["']$/g, '') === id) return full;
          } catch { /* skip */ }
        }
        const sub = walk(full);
        if (sub) return sub;
      }
    }
    return null;
  };
  return walk(featuresRoot);
}

// The fs walk above visits the whole features/ tree, and this hook fires on
// BOTH phases of every traced tool call — so the resolved folder is cached per
// task and revalidated with a single existsSync. A moved/archived task folder
// fails the check and triggers one fresh walk, which rewrites the cache.
function cachedTaskFolder(plansDir, taskId) {
  const cacheFile = path.join(plansDir, '.trace-folder-cache.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) || {}; }
  catch { /* no cache yet or unreadable — rebuild below */ }

  const hit = cache[taskId];
  if (hit && fs.existsSync(path.join(hit, 'task.md'))) return hit;

  const folder = resolveTaskFolder(plansDir, taskId);
  if (folder) {
    try {
      // Keyed by task id only; stale entries for finished tasks are harmless
      // (one existsSync miss) and the file stays a handful of entries.
      cache[taskId] = folder;
      fs.writeFileSync(cacheFile, JSON.stringify(cache));
    } catch { /* best-effort — next call just walks again */ }
  }
  return folder;
}

// Resolve where a task's trace + counter live: the v3.7.3+ co-located layout
// (inside the task folder) if found, else the legacy top-level traces/ dir.
// Pure except for the mkdir on the legacy path.
function resolveTracePaths(plansDir, taskId) {
  const taskFolder = cachedTaskFolder(plansDir, taskId);
  if (taskFolder) {
    return {
      traceFile: path.join(taskFolder, 'trace.jsonl'),
      counterFile: path.join(taskFolder, '.trace.count'),
    };
  }
  const tracesDir = path.join(plansDir, 'traces');
  if (!fs.existsSync(tracesDir)) fs.mkdirSync(tracesDir, { recursive: true });
  return {
    traceFile: path.join(tracesDir, `${taskId}.jsonl`),
    counterFile: path.join(tracesDir, `${taskId}.count`),
  };
}

// taskSlug keeps the id safe for taskIds like "T2.3" vs "T23". Pure.
function taskSlugOf(taskId) {
  return taskId.replace(/[^A-Za-z0-9]+/g, '-');
}

// Event counter — persisted in a sibling counter file so each fresh Node
// process reads at most 4 bytes (not the full trace). True O(1) per event.
// Atomic-ish: read counter → +1 → write counter (no flock; single-driver
// assumption per spec §2.1.6, and the JSONL append below would race anyway).
function nextEventId(counterFile, taskSlug) {
  let n = 0;
  try {
    n = parseInt(fs.readFileSync(counterFile, 'utf8'), 10) || 0;
  } catch {/* fresh task or unreadable — start from 0 */}
  n++;
  try {
    // Atomic write so a kill -9 mid-write doesn't corrupt the counter.
    const tmp = `${counterFile}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, String(n));
    fs.renameSync(tmp, counterFile);
  } catch {/* best-effort; never block trace emission on counter persist */}
  return `TR-${taskSlug}-${String(n).padStart(3, '0')}`;
}

// Cap file hashing to keep huge binaries from blocking the hook.
const MAX_HASH_BYTES = 1024 * 1024; // 1 MB
function hashFileBounded(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_HASH_BYTES) return `oversize-${stat.size}`;
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

function hash(s) {
  return crypto.createHash('sha256').update(s || '').digest('hex').slice(0, 16);
}

// Pure: pull the file path a Read tool call targets out of its raw args. Tries
// JSON first (the normal shape), then a regex fallback for a non-JSON string.
function extractReadPath(argsRaw) {
  if (!argsRaw) return null;
  try {
    const parsed = JSON.parse(argsRaw);
    return parsed.file_path || parsed.path || null;
  } catch {
    const m = argsRaw.match(/file_path["\s:]+([^"\s,}]+)/);
    return m ? m[1] : null;
  }
}

function append(traceFile, evt) {
  try {
    fs.appendFileSync(traceFile, JSON.stringify(evt) + '\n');
  } catch (err) {
    process.stderr.write(`[tool-tracer] WARN: trace append failed: ${err.message}\n`);
  }
}

function main() {
  if (process.env.AF_TRACE_DISABLED === 'true') return;
  if (!fs.existsSync(ACTIVE_FILE)) return;

  let active;
  try { active = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8')); }
  catch { return; }

  const taskId = active.active && active.active.task;
  if (!taskId) return;

  // STORY-0010: the tool context comes from the hook's stdin payload (the
  // CLAUDE_TOOL_* env vars this used to read were never set by the hook API). Env
  // is kept as a fallback throughout so an unpopulated payload is a no-op change.
  // CLAUDE_HOOK_PHASE is the exception — it IS set explicitly in hooks.json (the
  // pre/post wrappers), so it stays the source of truth for phase.
  const input = parseStdinJson(readStdinSafely()) || {};
  const phase = process.env.CLAUDE_HOOK_PHASE || 'pre';
  const toolName = readToolName(input) || process.env.CLAUDE_TOOL_NAME || 'unknown';
  const ts = new Date().toISOString();

  const { traceFile, counterFile } = resolveTracePaths(PLANS_DIR, taskId);
  const taskSlug = taskSlugOf(taskId);
  const argsRaw = readArgs(input) || process.env.CLAUDE_TOOL_ARGS || '';

  if (phase === 'pre') {
    append(traceFile, {
      ts, event_id: nextEventId(counterFile, taskSlug), task_id: taskId,
      type: 'tool_call', payload: { tool_name: toolName, args_hash: hash(argsRaw) },
    });

    if (toolName === 'Read') {
      const filePath = extractReadPath(argsRaw);
      if (filePath && fs.existsSync(filePath)) {
        append(traceFile, {
          ts, event_id: nextEventId(counterFile, taskSlug), task_id: taskId,
          type: 'file_read', payload: { path: filePath, sha256: hashFileBounded(filePath) },
        });
      }
    }
  } else {
    const exitCode = readExitCode(input) ?? (parseInt(process.env.CLAUDE_TOOL_EXIT_CODE || '0', 10) || 0);
    const durationMs = readDurationMs(input) ?? (parseInt(process.env.CLAUDE_TOOL_DURATION_MS || '0', 10) || 0);
    append(traceFile, {
      ts, event_id: nextEventId(counterFile, taskSlug), task_id: taskId,
      type: 'tool_result', payload: { tool_name: toolName, exit_code: exitCode, duration_ms: durationMs },
    });
  }
}

// Run as a hook; stay importable for tests. Previously the whole tracer ran at
// module scope with a process.exit() on require. FEAT-007 / issue #5.
if (require.main === module) {
  main();
} else {
  module.exports = {
    resolveTaskFolder, cachedTaskFolder, resolveTracePaths, taskSlugOf, nextEventId, hashFileBounded, hash, extractReadPath,
  };
}
