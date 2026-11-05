#!/usr/bin/env node
/**
 * Context budget — measure the instruction files Claude Code loads at session start.
 *
 * Claude Code warns once the total passes 150k chars ("N instruction files add up to …").
 * By then every session is already paying for it. This measures the same set earlier
 * so session-start can warn at a lower threshold and name the fix.
 *
 * Counted (mirrors Claude Code's memory loading):
 *   - ~/.claude/CLAUDE.md, ~/.claude/rules/**.md
 *   - CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md in the project dir and each ancestor
 *   - <project>/.claude/rules/**.md
 *   - `@path` imports inside any of the above (depth ≤ 5)
 * Skipped: rule files with `paths:` frontmatter — those load only when matching files are read.
 *
 * Usage:
 *   node context-budget.cjs [projectDir] [--json]
 *   require('./context-budget.cjs').measure(projectDir) → { total, files: [{ path, chars }] }
 */
'use strict';

// Mirrors legacy AF_* / AURA_FROG_* variables onto their ARCHON_* names.
require('../hooks/lib/env-compat.cjs');

const fs = require('fs');
const os = require('os');
const path = require('path');

const CLAUDE_LIMIT = 150000;
const DEFAULT_WARN = 100000;
const MAX_IMPORT_DEPTH = 5;

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

/** True when a rule file declares `paths:` in its YAML frontmatter (loaded on demand, not at startup). */
function isPathScoped(text) {
  if (!text.startsWith('---')) return false;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return false;
  return /^paths\s*:/m.test(text.slice(3, end));
}

function listMarkdown(dir) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listMarkdown(p));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/** `@path` imports — one per line, outside code fences. */
function importsOf(text, fromFile) {
  const out = [];
  let fenced = false;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = line.match(/^\s*@(\S+)\s*$/);
    if (!m) continue;
    const ref = m[1].startsWith('~/') ? path.join(os.homedir(), m[1].slice(2)) : path.resolve(path.dirname(fromFile), m[1]);
    out.push(ref);
  }
  return out;
}

function measure(projectDir = process.cwd(), { home = os.homedir() } = {}) {
  const root = path.resolve(projectDir);
  const seen = new Set();
  const files = [];

  const add = (p, depth = 0, { skipScoped = false } = {}) => {
    const abs = path.resolve(p);
    if (seen.has(abs)) return;
    const text = readSafe(abs);
    if (text === null) return;
    if (skipScoped && isPathScoped(text)) return;
    seen.add(abs);
    files.push({ path: abs, chars: text.length });
    if (depth < MAX_IMPORT_DEPTH) for (const ref of importsOf(text, abs)) add(ref, depth + 1);
  };

  add(path.join(home, '.claude', 'AGENTS.md'));
  add(path.join(home, '.claude', 'CLAUDE.md'));
  for (const f of listMarkdown(path.join(home, '.claude', 'rules'))) add(f, 0, { skipScoped: true });

  const instructionNames = [
    'AGENTS.md',
    'CLAUDE.md',
    path.join('.claude', 'AGENTS.md'),
    path.join('.claude', 'CLAUDE.md'),
    'AGENTS.local.md',
    'CLAUDE.local.md'
  ];

  for (let dir = root; ; dir = path.dirname(dir)) {
    for (const name of instructionNames) add(path.join(dir, name));
    if (dir === path.dirname(dir)) break;
  }
  for (const f of listMarkdown(path.join(root, '.claude', 'rules'))) add(f, 0, { skipScoped: true });

  files.sort((a, b) => b.chars - a.chars);
  return { total: files.reduce((s, f) => s + f.chars, 0), files };
}

function warnThreshold() {
  const n = parseInt(process.env.ARCHON_CONTEXT_BUDGET_WARN || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WARN;
}

const k = (n) => `${(n / 1000).toFixed(1)}k`;

/** One-paragraph warning for session-start, or null when under budget. */
function budgetWarning(projectDir, opts) {
  if (process.env.ARCHON_CONTEXT_BUDGET_DISABLED === 'true') return null;
  const { total, files } = measure(projectDir, opts);
  if (total < warnThreshold()) return null;
  const rel = (p) => (p.startsWith(projectDir) ? path.relative(projectDir, p) : p.replace(os.homedir(), '~'));
  const top = files.slice(0, 3).map((f) => `${rel(f.path)} (${k(f.chars)})`).join(', ');
  return [
    `⚠️  Startup instructions: ${files.length} files = ${k(total)} chars (Claude Code limit ${k(CLAUDE_LIMIT)}). Largest: ${top}.`,
    '   Fix: add `paths:` frontmatter to domain rules (load on demand), move logs/quick-refs from CLAUDE.md into docs/.',
    `   Details: node ${__filename.replace(os.homedir(), '~')}`,
  ].join('\n');
}

module.exports = { measure, budgetWarning, isPathScoped, importsOf, CLAUDE_LIMIT, DEFAULT_WARN };

if (require.main === module) {
  const args = process.argv.slice(2);
  const dir = path.resolve(args.find((a) => !a.startsWith('--')) || process.cwd());
  const { total, files } = measure(dir);
  if (args.includes('--json')) {
    console.log(JSON.stringify({ total, limit: CLAUDE_LIMIT, files }, null, 2));
  } else {
    console.log(`Startup instruction load for ${dir}`);
    console.log(`  ${files.length} files · ${k(total)} chars · limit ${k(CLAUDE_LIMIT)} · warn ${k(warnThreshold())}\n`);
    for (const f of files.slice(0, 25)) console.log(`  ${k(f.chars).padStart(7)}  ${f.path.replace(os.homedir(), '~')}`);
    if (files.length > 25) console.log(`  … ${files.length - 25} more`);
  }
  process.exitCode = total >= CLAUDE_LIMIT ? 1 : 0;
}
