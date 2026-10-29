#!/usr/bin/env node
/**
 * Archon OS - Compact Handoff Hook
 *
 * Fires:
 *   - PreCompact (--pre-compact)  → always save a handoff (trigger: manual|auto)
 *   - Stop (no args, via dispatch) → save only when context usage ≥ threshold,
 *                                    so a handoff exists before auto-compact
 *   - SessionStart (--resume)      → same session: inject its handoff as
 *                                    additionalContext. New session: list the
 *                                    named handoffs only (never another
 *                                    session's context).
 *   - CLI (--save [--note <t>] [--name <n>], --show <name>, --list) → the
 *     manual `handoff` / `/run resume <name>` path.
 *
 * One handoff per session, named after the session title (/rename custom-title
 * → ai-title → session-<id8>): .claude/handoffs/<name>.{json,md}. Sessions in
 * the same project no longer overwrite or steal each other's handoff.
 *
 * The handoff follows the project's own plan: the plan tree (resolved from the
 * project root, not cwd) plus plan docs (ROADMAP.md, *_PLAN.md, docs/*plan*…).
 * Non-code projects (no .git, no manifest) never get run/plan logs written.
 *
 * State sources (newest schema first):
 *   1. .claude/logs/runs/<id>/run-state.json  — what /run writes today
 *   2. .claude/plans/active.json               — hierarchical plan anchor
 *   3. .claude/cache/workflow-state.json + AF_WORKFLOW_ID env — legacy workflows
 *
 * Context usage comes from .claude/cache/context-usage.json, written by
 * scripts/statusline.sh (the only surface Claude Code hands used_percentage to).
 *
 * Env:
 *   AF_HANDOFF_THRESHOLD=70    Stop-save threshold (percent)
 *   AF_CLAUDE_SESSION_ID / AF_TRANSCRIPT_PATH — exported on SessionStart via
 *     CLAUDE_ENV_FILE so the manual --save knows which session it is.
 *   AF_COMPACT_HANDOFF_DISABLED=true
 *
 * Exit Codes:
 *   0 - always (non-blocking)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('./lib/hook-runtime.cjs');
const turnIndex = require('./lib/turn-index.cjs');

const DEFAULT_THRESHOLD = 70;
/**
 * Total characters of user prompts a handoff may carry.
 *
 * A stated budget, not a per-prompt clip. The old code cut every prompt at 300
 * characters, which is shorter than most real requests in this repo — the
 * handoff kept the opening clause of each ask and dropped the part that said
 * what to do. Spending one budget across the kept prompts means a single long
 * request survives whole instead of three stubs surviving equally badly.
 */
const PROMPT_BUDGET_CHARS = 4000;
/** No single prompt may eat the whole budget and starve the others. */
const PROMPT_MAX_CHARS = 2000;
/**
 * Turns a handoff carries. The measured real session had 73, and 73 rendered
 * lines is ~8.8k characters against the 10,000-character hook injection cap —
 * 1.1x headroom. Capping the handoff copy well below that leaves room for the
 * rest of the resume context; the full index still regenerates from the
 * transcript on demand.
 */
const TURN_INDEX_HANDOFF_LIMIT = 40;
const USAGE_MAX_AGE_MS = 10 * 60 * 1000;
// A Stop-save at 70% can precede the actual auto-compact by many turns.
const COMPACT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const RESUME_MAX_AGE_MS = 30 * 60 * 1000;
// Named handoffs stay listable this long; older ones are pruned on save.
const KEEP_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const LIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CODE_MARKERS = ['.git', 'package.json', 'pyproject.toml', 'requirements.txt', 'setup.py',
  'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'composer.json',
  'Gemfile', 'pubspec.yaml', 'Package.swift', 'mix.exs', 'deno.json', 'CMakeLists.txt', 'Makefile'];
const PLAN_DOC_RE = /(plan|roadmap|handoff|backlog|todo)[^/]*\.(md|markdown|html|txt)$/i;
const OPEN_RUN_STATUSES = new Set(['in_progress', 'paused', 'active', 'blocked']);

// Resolved per call (not at module load) so AF_PROJECT_ROOT can redirect tests.
function getPaths(root = findProjectRoot()) {
  const cache = path.join(root, '.claude', 'cache');
  return {
    root,
    cache,
    runsDir: path.join(root, '.claude', 'logs', 'runs'),
    workflowsDir: path.join(root, '.claude', 'logs', 'workflows'),
    handoffsDir: path.join(root, '.claude', 'handoffs'),
    workflowState: path.join(cache, 'workflow-state.json'),
    contextUsage: path.join(cache, 'context-usage.json'),
    turnIndexFile: path.join(cache, 'turn-index.tsv'),
  };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

function readHookInput() {
  try {
    const { readStdinSafely } = require('./lib/safe-stdin.cjs');
    const raw = readStdinSafely();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Newest open run (by mtime) under .claude/logs/runs, or null. */
function findActiveRun(p = getPaths()) {
  let best = null;
  let entries;
  try { entries = fs.readdirSync(p.runsDir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const file = path.join(p.runsDir, e.name, 'run-state.json');
    let mtime;
    try { mtime = fs.statSync(file).mtimeMs; } catch { continue; }
    const state = readJson(file);
    if (!state || !OPEN_RUN_STATUSES.has(state.status)) continue;
    if (!best || mtime > best.mtime) {
      best = { run_id: state.run_id || e.name, file: path.relative(p.root, file), mtime, state };
    }
  }
  if (!best) return null;
  const s = best.state;
  return {
    run_id: best.run_id,
    state_file: best.file,
    task: s.task,
    status: s.status,
    complexity: s.complexity,
    flow: s.flow,
    current_phase: s.current_phase,
    current_step: s.current_step || s.step,
    active_agent: s.active_agent,
    next_action: s.next_action || s.next_step,
  };
}

function readActivePlan(root) {
  try {
    const resolvePlansDir = require('./lib/plans-dir.cjs');
    // Project root, not cwd: a session working in a subdirectory still follows
    // the project's plan tree.
    const active = readJson(path.join(resolvePlansDir(root), 'active.json'));
    const a = active && active.active;
    return a && (a.feature || a.initiative || a.mission) ? a : null;
  } catch {
    return null;
  }
}

/** Code project = has .git or a build/package manifest at the root. */
function isCodeProject(root) {
  return CODE_MARKERS.some((m) => fs.existsSync(path.join(root, m)));
}

/** The project's own plan docs (root + docs/), newest first, relative paths. */
function findPlanDocs(root, limit = 6) {
  const found = [];
  for (const dir of ['', 'docs', path.join('docs', 'plans'), 'plans']) {
    let entries;
    try { entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile() || !PLAN_DOC_RE.test(e.name)) continue;
      const rel = path.join(dir, e.name);
      try { found.push({ rel, mtime: fs.statSync(path.join(root, rel)).mtimeMs }); } catch { /* raced */ }
    }
  }
  return found.sort((a, b) => b.mtime - a.mtime).slice(0, limit).map((f) => f.rel);
}

/** Pure: filesystem-safe slug; strips Vietnamese diacritics (đ → d). */
function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Session title from the transcript: latest /rename custom-title, else the
 * latest ai-title, else null. Scans the raw text — title records are small
 * and can sit anywhere in the file.
 */
function sessionTitle(transcriptPath) {
  if (!transcriptPath) return null;
  let text;
  try { text = fs.readFileSync(transcriptPath, 'utf-8'); } catch { return null; }
  let custom = null;
  let ai = null;
  for (const line of text.split('\n')) {
    if (!line.includes('-title"')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === 'custom-title' && e.customTitle) custom = e.customTitle;
    else if (e.type === 'ai-title' && e.aiTitle) ai = e.aiTitle;
  }
  return custom || ai || null;
}

/** Existing handoffs, newest first. */
function listHandoffs(p = getPaths()) {
  let files;
  try { files = fs.readdirSync(p.handoffsDir).filter((f) => f.endsWith('.json')); } catch { return []; }
  return files
    .map((f) => readJson(path.join(p.handoffsDir, f)))
    .filter((h) => h && h.name && h.saved_at)
    .sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
}

/**
 * Handoff name for a session: slug(title) or session-<id8>. When another
 * session already owns that name, suffix this session's short id.
 */
function resolveHandoffName(p, sessionId, title) {
  const shortId = String(sessionId || 'unknown').slice(0, 8);
  const base = slugify(title) || `session-${slugify(shortId) || 'unknown'}`;
  const owner = readJson(path.join(p.handoffsDir, `${base}.json`));
  if (!owner || !owner.session_id || owner.session_id === sessionId) return base;
  return `${base}-${slugify(shortId)}`;
}

/** Legacy workflow state (pre-/run). */
function getLegacyWorkflowState(p = getPaths()) {
  for (const loc of [p.workflowState, path.join(p.workflowsDir, 'current', 'workflow-state.json')]) {
    const state = readJson(loc);
    if (state && state.workflow_id) return state;
  }
  if (process.env.AF_WORKFLOW_ID || process.env.AF_CURRENT_PHASE) {
    return {
      workflow_id: process.env.AF_WORKFLOW_ID || `session-${Date.now()}`,
      current_phase: parseInt(process.env.AF_CURRENT_PHASE || '1', 10),
      current_sub_phase: process.env.AF_CURRENT_SUBPHASE || null,
      status: 'in_progress',
      task: { description: process.env.AF_TASK_DESCRIPTION || 'Workflow in progress' },
      agents: { primary: process.env.AF_CURRENT_AGENT || 'general-purpose' },
    };
  }
  return null;
}

/**
 * The transcript for this handoff: what the hook was handed, else what the
 * environment names, else the newest transcript Claude Code wrote for this
 * project.
 *
 * Discovery is the part that matters. A hook invoked without stdin — a manual
 * `--save`, a CLI run — gets no `transcript_path`, and the old code treated
 * that as "there is no transcript". The handoff on disk proved it:
 * `recent_prompts: []`, `session_id: null`, `title: null`. The transcript was
 * there the whole time; nothing looked for it.
 */
function resolveTranscript(input = {}, { cwd, home, env = process.env } = {}) {
  if (input && input.transcript_path) return input.transcript_path;
  if (env && env.AF_TRANSCRIPT_PATH) return env.AF_TRANSCRIPT_PATH;
  const opts = {};
  if (cwd) opts.cwd = cwd;
  if (home) opts.home = home;
  return turnIndex.discoverTranscript(opts);
}

/** Pure: the current git branch for a directory, or null. */
function gitBranch(root) {
  try {
    const { execSync } = require('child_process');
    const { TIMEOUT_DEFAULT_MS, MAX_BUFFER_DEFAULT } = require('./lib/af-exec.cjs');
    const out = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', {
      cwd: root,
      encoding: 'utf-8',
      timeout: TIMEOUT_DEFAULT_MS,
      killSignal: 'SIGKILL',
      maxBuffer: MAX_BUFFER_DEFAULT,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Pure-ish: the project's own name, from its manifest, else its directory. */
function projectName(root) {
  for (const manifest of ['package.json', 'deno.json']) {
    const data = readJson(path.join(root, manifest));
    if (data && data.name) return data.name;
  }
  return path.basename(root) || null;
}

/**
 * What this session is working on.
 *
 * Every field used to come from an env var, every env var was usually unset,
 * and `JSON.stringify` drops `undefined` — so the handoff recorded
 * `context: {}` and a cold session learned nothing. Env vars are still honoured
 * first (a caller that sets them means them), but each one now falls back to
 * the thing on disk that actually answers the question.
 */
function getSessionContext({ root = findProjectRoot(), env = process.env } = {}) {
  const plan = readActivePlan(root);
  const ctx = {
    project_name: env.PROJECT_NAME || env.AF_PROJECT_NAME || projectName(root),
    project_type: env.AF_PROJECT_TYPE || (isCodeProject(root) ? 'code' : 'non-code'),
    framework: env.AF_FRAMEWORK,
    git_branch: env.AF_GIT_BRANCH || gitBranch(root),
    active_plan: env.AF_ACTIVE_PLAN
      || (plan ? plan.task || plan.story || plan.feature || plan.initiative || plan.mission : null),
    current_agent: env.AF_CURRENT_AGENT,
    complexity: env.AF_COMPLEXITY,
  };
  for (const k of Object.keys(ctx)) if (ctx[k] == null || ctx[k] === '') delete ctx[k];
  return ctx;
}

/** used_percentage from the statusline cache, or null when absent/stale. */
function readContextUsage(p = getPaths(), nowMs = Date.now()) {
  const data = readJson(p.contextUsage);
  if (!data || typeof data.used_percentage !== 'number') return null;
  if (data.ts && nowMs - data.ts * 1000 > USAGE_MAX_AGE_MS) return null;
  return data.used_percentage;
}

/**
 * Pure: should a Stop event save a handoff?
 * Known usage → compare with threshold. Unknown usage (no statusline) → save
 * only when there is open work worth resuming.
 */
function shouldSaveOnStop({ usage, threshold = DEFAULT_THRESHOLD, hasOpenWork }) {
  if (typeof usage === 'number') return usage >= threshold;
  return Boolean(hasOpenWork);
}

/** Pure: clip with an explicit ellipsis, so a reader can see it was clipped. */
function clip(text, max) {
  const t = String(text || '');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * Pure: fit prompts into one character budget, newest first.
 *
 * Newest prompts are the ones a resume acts on, so they get the budget first;
 * an older prompt that no longer fits is dropped whole rather than reduced to a
 * fragment that reads like a complete request.
 */
function allocatePromptBudget(prompts, budget = PROMPT_BUDGET_CHARS) {
  const kept = [];
  let left = budget;
  for (let i = prompts.length - 1; i >= 0; i -= 1) {
    const p = prompts[i];
    if (p.length <= left) { kept.unshift(p); left -= p.length; continue; }
    // Room for a meaningful head of this one, but nothing older.
    if (left >= 200) kept.unshift(clip(p, left));
    break;
  }
  return kept;
}

/** Real user prompts in a chunk of transcript JSONL (skips tool results + injected tags). */
function parseUserPrompts(text) {
  const prompts = [];
  for (const line of text.split('\n')) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || entry.type !== 'user' || entry.isMeta) continue;
    let content = entry.message && entry.message.content;
    if (Array.isArray(content)) {
      content = content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n');
    }
    if (typeof content !== 'string') continue;
    content = content.trim();
    if (content.startsWith('<')) {
      // Slash commands arrive wrapped in tags; keep them when they carry args
      // (`/run <task>` is often the most important request in the session).
      const cmd = content.match(/<command-name>([^<]*)<\/command-name>/);
      const args = content.match(/<command-args>([\s\S]*?)<\/command-args>/);
      content = cmd && args && args[1].trim() ? `${cmd[1].trim()} ${args[1].trim()}` : '';
    }
    if (!content) continue;
    prompts.push(clip(content, PROMPT_MAX_CHARS));
  }
  return prompts;
}

/**
 * Last N real user prompts from a transcript JSONL. Reads the tail and widens
 * the window until N prompts are found: long agentic turns push the last
 * prompt far back behind tool output.
 */
function recentUserPrompts(transcriptPath, n = 3, windows = [512 * 1024, 4 * 1024 * 1024, 16 * 1024 * 1024]) {
  if (!transcriptPath) return [];
  let fd;
  try { fd = fs.openSync(transcriptPath, 'r'); } catch { return []; }
  try {
    const size = fs.fstatSync(fd).size;
    let prompts = [];
    for (const w of windows) {
      const len = Math.min(size, w);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      prompts = parseUserPrompts(buf.toString('utf-8'));
      if (prompts.length >= n || len === size) break;
    }
    return allocatePromptBudget(prompts.slice(-n));
  } catch {
    return [];
  } finally {
    fs.closeSync(fd);
  }
}

function modifiedFiles(root) {
  try {
    const { execSync } = require('child_process');
    const { TIMEOUT_DEFAULT_MS, MAX_BUFFER_LARGE } = require('./lib/af-exec.cjs');
    const out = execSync('git diff --name-only HEAD 2>/dev/null', {
      cwd: root,
      encoding: 'utf-8',
      timeout: TIMEOUT_DEFAULT_MS,
      killSignal: 'SIGKILL',
      maxBuffer: MAX_BUFFER_LARGE,
    }).trim();
    return out ? out.split('\n').slice(0, 20) : [];
  } catch {
    return [];
  }
}

function buildHandoff({ p = getPaths(), input = {}, reason = 'compact', kind = 'auto', note = null } = {}) {
  const codeProject = isCodeProject(p.root);
  const run = findActiveRun(p);
  // Legacy workflows are a code-run concept; env leftovers must not turn a
  // docs/notes project into a "workflow".
  const workflow = run || !codeProject ? null : getLegacyWorkflowState(p);
  const plan = readActivePlan(p.root);
  const context = getSessionContext();
  const sessionId = input.session_id || process.env.AF_CLAUDE_SESSION_ID || null;
  const transcript = resolveTranscript(input, { cwd: p.root });
  const title = sessionTitle(transcript);
  const name = resolveHandoffName(p, sessionId, title);
  return {
    version: '3.0.0',
    name,
    title,
    session_id: sessionId,
    kind,
    saved_at: new Date().toISOString(),
    reason,
    trigger: input.trigger || null,
    context_usage: readContextUsage(p),
    project: { kind: codeProject ? 'code' : 'non-code', plan_docs: findPlanDocs(p.root) },
    run,
    workflow,
    plan,
    context,
    note,
    modified_files: codeProject ? modifiedFiles(p.root) : [],
    recent_prompts: recentUserPrompts(transcript),
    // Pointers, not copies: each line carries the turn's uuid so the resuming
    // session can read that exact turn in the transcript instead of trusting a
    // summary of it. The index is derived — see hooks/lib/turn-index.cjs.
    turn_index: transcript
      ? turnIndex.buildTurnIndex(transcript, { limit: TURN_INDEX_HANDOFF_LIMIT }).map(turnIndex.renderLine)
      : [],
    resume_hint: `/run resume ${name}`,
  };
}

function pruneHandoffs(p, nowMs = Date.now()) {
  for (const h of listHandoffs(p)) {
    if (nowMs - new Date(h.saved_at).getTime() <= KEEP_MAX_AGE_MS) continue;
    removeHandoff(p, h.name);
  }
}

function removeHandoff(p, name) {
  for (const ext of ['.json', '.md']) {
    try { fs.unlinkSync(path.join(p.handoffsDir, name + ext)); } catch { /* already gone */ }
  }
}

/** Save a handoff. Returns false when there is nothing worth resuming. */
function saveHandoff({ input = {}, reason = 'compact', kind = 'auto', note = null } = {}) {
  try {
    const p = getPaths();
    const handoff = buildHandoff({ p, input, reason, kind, note });
    if (!handoff.run && !handoff.workflow && !handoff.plan && !handoff.note &&
        !handoff.context.project_name && handoff.recent_prompts.length === 0 &&
        !handoff.session_id) {
      return false;
    }
    fs.mkdirSync(p.handoffsDir, { recursive: true });
    const prev = readJson(path.join(p.handoffsDir, `${handoff.name}.json`));
    // An auto save must not erase the note of a manual handoff for this session.
    if (prev && prev.kind === 'manual' && kind === 'auto') {
      handoff.kind = 'manual';
      handoff.note = prev.note;
    }
    fs.writeFileSync(path.join(p.handoffsDir, `${handoff.name}.json`), JSON.stringify(handoff, null, 2));
    fs.writeFileSync(path.join(p.handoffsDir, `${handoff.name}.md`), generateResumeContext(handoff) + '\n');
    pruneHandoffs(p);

    // Legacy workflows (code projects only): mark paused so /run resume shows the right status.
    if (handoff.workflow && handoff.workflow.workflow_id) {
      const dir = path.join(p.workflowsDir, handoff.workflow.workflow_id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'workflow-state.json'), JSON.stringify({
        ...handoff.workflow,
        status: 'paused',
        paused_at: handoff.saved_at,
        paused_reason: reason,
      }, null, 2));
    }
    return handoff;
  } catch (error) {
    process.stderr.write(`Handoff save error: ${error.message}\n`);
    return false;
  }
}

/**
 * The handoff belonging to this session (by session_id), if fresh enough for
 * this SessionStart source; null otherwise. Never returns another session's.
 */
function loadHandoff({ source = 'unknown', sessionId = null, nowMs = Date.now(), p = getPaths() } = {}) {
  if (source === 'clear' || !sessionId) return null;
  const mine = listHandoffs(p).find((h) => h.session_id === sessionId);
  if (!mine) return null;
  if (mine.kind !== 'manual') {
    const maxAge = source === 'compact' ? COMPACT_MAX_AGE_MS : RESUME_MAX_AGE_MS;
    if (nowMs - new Date(mine.saved_at).getTime() > maxAge) return null;
  }
  return mine;
}

/** Find a handoff by name, slug of a title, or session id. */
/**
 * Rebuild the on-disk turn index from the transcript. Returns the turns.
 *
 * Called on Stop and before a compaction. A full rebuild every time, not an
 * append: the index is derived, so it must be able to shrink, and a rebuild is
 * the only version of this that cannot drift from the transcript.
 */
function refreshTurnIndex(p = getPaths(), transcript = null) {
  const file = transcript || resolveTranscript({}, { cwd: p.root });
  if (!file) return [];
  const turns = turnIndex.buildTurnIndex(file);
  turnIndex.writeTurnIndex(p.turnIndexFile, turns);
  return turns;
}

/**
 * Append the turn index to a SessionStart payload, within the hook's
 * 10,000-character output cap.
 *
 * SessionStart is also the post-compaction injection point: Claude Code fires it
 * with `source: "compact"` once compaction finishes, and this hook is already
 * registered there. A second hook on PostCompact would be a second gate for the
 * same job — and PostCompact has no documented `additionalContext` channel, only
 * stderr, which `post-compact.cjs` already owns for state-corruption warnings.
 *
 * Self-healing: a missing or empty index file is rebuilt from the transcript
 * rather than reported, because the index is a cache and the transcript is the
 * source.
 */
function appendTurnIndex(additionalContext, p = getPaths(), input = {}) {
  const base = additionalContext || '';
  // The handoff already embedded its own index — do not print it twice.
  if (base.includes('Turn index (oldest')) return base;
  let turns = turnIndex.readTurnIndex(p.turnIndexFile);
  if (!turns.length) {
    // Rebuild only from a transcript THIS session named. Discovery would pick
    // the project's newest transcript, which on a fresh session is a different
    // session's — and its prompts are not ours to inject.
    const own = (input && input.transcript_path) || process.env.AF_TRANSCRIPT_PATH || null;
    turns = own ? refreshTurnIndex(p, own) : [];
  }
  if (!turns.length) return additionalContext;

  const margin = 200;
  const room = turnIndex.TURN_INDEX_MAX_CHARS - base.length - margin;
  if (room < 400) return additionalContext;
  const block = turnIndex.formatTurnIndex(turns, { maxChars: room });
  return base ? `${base}\n\n${block}` : block;
}

function findHandoff(query, p = getPaths()) {
  if (!query) return null;
  const all = listHandoffs(p);
  const q = slugify(query);
  return all.find((h) => h.name === query || h.name === q) ||
    all.find((h) => h.session_id === query || slugify(h.title) === q) || null;
}

/** Pure: short index of named handoffs for a NEW session (no content leak). */
function generateHandoffIndex(handoffs = []) {
  if (!handoffs.length) return '';
  const lines = ['# 🦉 Archon OS — saved handoffs in this project', ''];
  for (const h of handoffs) {
    const what = (h.run && h.run.task) || h.note || '';
    lines.push(`- **${h.name}**${h.title && slugify(h.title) !== h.name ? ` (${h.title})` : ''} · saved ${h.saved_at.slice(0, 16).replace('T', ' ')}` +
      `${what ? ` · ${String(what).replace(/\n+/g, ' ').slice(0, 80)}` : ''} → \`/run resume ${h.name}\``);
  }
  lines.push('', 'These belong to other sessions. Only load one when the user asks to resume it.');
  return lines.join('\n');
}

/** Pure: render the resume context injected after compaction. */
function generateResumeContext(handoff = {}) {
  const heading = handoff.title || handoff.name;
  const lines = [`# 🔄 Archon OS — resume${heading ? `: ${heading}` : ''}`, ''];
  if (handoff.name) lines.push(`Handoff \`${handoff.name}\` · saved ${handoff.saved_at || '?'} · resume with \`/run resume ${handoff.name}\``, '');

  if (handoff.note) {
    lines.push('## Handoff note', handoff.note, '');
  }

  if (handoff.run) {
    const r = handoff.run;
    lines.push(`## Active run: ${r.run_id}`);
    if (r.task) lines.push(`- **Task:** ${r.task}`);
    const where = [r.complexity, r.flow, r.current_phase != null ? `phase ${r.current_phase}` : null, r.current_step]
      .filter(Boolean).join(' · ');
    if (where) lines.push(`- **Where:** ${where}`);
    if (r.active_agent) lines.push(`- **Agent:** ${r.active_agent}`);
    if (r.next_action) lines.push(`- **Next:** ${r.next_action}`);
    lines.push(`- **State file:** \`${r.state_file}\``);
    lines.push('');
  }

  if (handoff.workflow) {
    const wf = handoff.workflow;
    lines.push(`## Workflow: ${wf.workflow_id}`);
    lines.push(`- **Task:** ${(wf.task && wf.task.description) || 'In progress'}`);
    lines.push(`- **Phase:** ${wf.current_phase}${wf.current_sub_phase || ''}`);
    lines.push(`- **Agent:** ${(wf.agents && wf.agents.primary) || 'general-purpose'}`);
    lines.push('');
  }

  const planDocs = (handoff.project && handoff.project.plan_docs) || [];
  if (handoff.plan || planDocs.length) {
    lines.push("## Project's plan (source of truth — follow it)");
    if (handoff.plan) {
      const a = handoff.plan;
      const parts = [a.feature || a.initiative || a.mission, a.story, a.task].filter(Boolean);
      lines.push(`- **Plan anchor:** ${parts.join(' → ')}`);
    }
    planDocs.forEach((d) => lines.push(`- \`${d}\``));
    lines.push('');
  }

  const ctx = handoff.context || {};
  const ctxLines = [
    ctx.project_name && `- **Project:** ${ctx.project_name}`,
    ctx.framework && `- **Framework:** ${ctx.framework}`,
    (ctx.git_branch || ctx.branch) && `- **Branch:** ${ctx.git_branch || ctx.branch}`,
  ].filter(Boolean);
  if (ctxLines.length) lines.push('## Session', ...ctxLines, '');

  if (handoff.recent_prompts && handoff.recent_prompts.length) {
    lines.push('## Last user requests (oldest → newest)');
    handoff.recent_prompts.forEach((q) => lines.push(`- ${q.replace(/\n+/g, ' ')}`));
    lines.push('');
  }

  if (handoff.turn_index && handoff.turn_index.length) {
    lines.push('## Turn index (oldest → newest) — what this session already did');
    lines.push('Each line ends in the turn\'s uuid; grep it in the session transcript to read that turn in full.');
    lines.push('```');
    handoff.turn_index.forEach((l) => lines.push(l));
    lines.push('```', '');
  }

  if (handoff.modified_files && handoff.modified_files.length) {
    lines.push('## Uncommitted files');
    handoff.modified_files.forEach((f) => lines.push(`- ${f}`));
    lines.push('');
  }

  lines.push('## How to continue');
  if (handoff.plan || planDocs.length) {
    lines.push("Re-read the project's plan above first and continue from where it stands — do not invent a new plan.");
  }
  if (handoff.project && handoff.project.kind === 'non-code') {
    lines.push('Non-code project: do not create run-state or plan logs; keep notes in the handoff (`--save --note`).');
  }
  if (handoff.run) {
    lines.push(`Re-read \`${handoff.run.state_file}\` (and its deliverables) before acting, then continue the run from its current phase. Do not restart completed phases.`);
  } else if (handoff.workflow && handoff.resume_hint) {
    lines.push(`Run \`${handoff.resume_hint}\` or re-read the workflow state, then continue.`);
  } else if (handoff.note) {
    lines.push('Continue from the handoff note above; verify file state before editing.');
  } else {
    lines.push('Continue the last user request above; verify file state before editing.');
  }
  return lines.join('\n');
}

function shq(v) {
  return `'${String(v).replace(/'/g, `'\\''`)}'`;
}

/** Let later Bash calls (manual --save) know which session they belong to. */
function exportSessionEnv(input) {
  const envFile = process.env.CLAUDE_ENV_FILE;
  if (!envFile || !input.session_id) return;
  const lines = [`export AF_CLAUDE_SESSION_ID=${shq(input.session_id)}`];
  if (input.transcript_path) lines.push(`export AF_TRANSCRIPT_PATH=${shq(input.transcript_path)}`);
  try { fs.appendFileSync(envFile, lines.join('\n') + '\n'); } catch { /* best effort */ }
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

function main() {
  if (process.env.AF_COMPACT_HANDOFF_DISABLED === 'true') return;
  const argv = process.argv.slice(2);
  const mode = argv[0] || 'stop';

  if (mode === '--save') {
    const handoff = saveHandoff({ reason: 'manual', kind: 'manual', note: argValue(argv, '--note') });
    if (!handoff) {
      process.stdout.write('Nothing to hand off (no session id, run, plan or prompts).\n');
      return;
    }
    process.stdout.write(`Handoff saved: ${path.join('.claude', 'handoffs', `${handoff.name}.md`)}\n` +
      `Resume: /run resume ${handoff.name}${handoff.title ? ` (or: claude --resume "${handoff.title}")` : ''}\n`);
    return;
  }

  if (mode === '--show') {
    const h = findHandoff(argv[1]);
    if (!h) {
      const names = listHandoffs().map((x) => x.name);
      process.stdout.write(`No handoff "${argv[1] || ''}". Available: ${names.join(', ') || '(none)'}\n`);
      return;
    }
    process.stdout.write(generateResumeContext(h) + '\n');
    return;
  }

  if (mode === '--list') {
    process.stdout.write((generateHandoffIndex(listHandoffs()) || 'No handoffs.') + '\n');
    return;
  }

  const input = readHookInput();

  if (mode === '--resume' || mode === 'resume') {
    exportSessionEnv(input);
    const p = getPaths();
    const handoff = loadHandoff({ source: input.source, sessionId: input.session_id, p });
    let additionalContext = null;
    if (handoff) {
      additionalContext = generateResumeContext(handoff);
      // Auto snapshots are consumed; manual handoffs stay until pruned.
      if (handoff.kind !== 'manual') removeHandoff(p, handoff.name);
    } else if (input.source !== 'clear' && input.source !== 'compact') {
      const nowMs = Date.now();
      const recent = listHandoffs(p)
        .filter((h) => h.session_id !== input.session_id)
        .filter((h) => nowMs - new Date(h.saved_at).getTime() <= LIST_MAX_AGE_MS)
        .slice(0, 5);
      additionalContext = generateHandoffIndex(recent) || null;
    }
    // Inject the turn index only when this session is continuing its own work:
    // a resumed handoff of ours, or the SessionStart that follows a compaction.
    // The other branch is a LIST of other sessions' handoffs — attaching our
    // transcript's turns there would leak one session's prompts into another,
    // and `source: clear` means the user asked for a clean slate.
    const ownContinuation = Boolean(handoff) || input.source === 'compact';
    if (ownContinuation) additionalContext = appendTurnIndex(additionalContext, p, input);
    if (!additionalContext) return;
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
    }));
    return;
  }

  if (mode === '--pre-compact') {
    refreshTurnIndex(getPaths(), resolveTranscript(input));
    saveHandoff({ input, reason: `compact-${input.trigger || 'unknown'}` });
    return;
  }

  // Stop: pre-emptive save before auto-compact.
  const p = getPaths();
  // The index refreshes on every Stop, not only when a handoff is saved: it is
  // what makes the turns before this one reachable, and the turn that needed it
  // is always one that already happened.
  refreshTurnIndex(p, resolveTranscript(input, { cwd: p.root }));
  const usage = readContextUsage(p);
  const threshold = Number(process.env.AF_HANDOFF_THRESHOLD) || DEFAULT_THRESHOLD;
  if (shouldSaveOnStop({ usage, threshold, hasOpenWork: Boolean(findActiveRun(p)) })) {
    saveHandoff({ input, reason: 'stop-threshold' });
  }
}

module.exports = {
  getPaths,
  findActiveRun,
  isCodeProject,
  findPlanDocs,
  slugify,
  sessionTitle,
  listHandoffs,
  findHandoff,
  generateHandoffIndex,
  readContextUsage,
  shouldSaveOnStop,
  recentUserPrompts,
  allocatePromptBudget,
  resolveTranscript,
  refreshTurnIndex,
  appendTurnIndex,
  getSessionContext,
  gitBranch,
  projectName,
  PROMPT_BUDGET_CHARS,
  PROMPT_MAX_CHARS,
  TURN_INDEX_HANDOFF_LIMIT,
  buildHandoff,
  saveHandoff,
  loadHandoff,
  generateResumeContext,
};

if (require.main === module) {
  main();
  process.exit(0);
}
