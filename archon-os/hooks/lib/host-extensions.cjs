/**
 * host-extensions.cjs — discover the host's own rules / skills / agents.
 *
 * Claude Code loads ~/.claude/{rules,skills,agents} and <project>/.claude/{rules,skills,agents}
 * itself, but Archon OS's routing (agent-detector, run-orchestrator, plugin subagents) only
 * knew its own components — so host skills were bypassed and plugin subagents never saw them.
 * This builds a compact index that session-start and subagent-init inject, and flags skill
 * files Claude Code will NOT register (flat `skills/foo.md`, or SKILL.md without `name`/`description`).
 *
 * Disable: AF_HOST_EXTENSIONS_DISABLED=true
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function listDir(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

/** Parse simple `key: value` YAML frontmatter. Returns {} when absent. */
function frontmatter(text) {
  if (!text || !text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end === -1) return {};
  const out = {};
  for (const line of text.slice(3, end).split('\n')) {
    const m = line.match(/^([A-Za-z_-]+)\s*:\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function listRules(dir) {
  const out = [];
  for (const e of listDir(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listRules(p));
    else if (e.isFile() && e.name.endsWith('.md')) {
      const fm = frontmatter(readSafe(p));
      out.push({ path: p, scoped: 'paths' in fm });
    }
  }
  return out;
}

/**
 * Skills: `<dir>/<name>/SKILL.md` with name+description frontmatter is what Claude Code
 * registers. Anything else (flat `<dir>/<name>.md`, missing frontmatter) is reported as unregistered.
 */
function listSkills(dir) {
  const skills = [];
  const unregistered = [];
  for (const e of listDir(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const skillFile = path.join(p, 'SKILL.md');
      const text = readSafe(skillFile);
      if (text === null) continue;
      const fm = frontmatter(text);
      if (fm.description) skills.push({ name: fm.name || e.name, path: skillFile });
      else unregistered.push({ path: skillFile, reason: 'SKILL.md has no `description` frontmatter' });
    } else if (e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md') {
      unregistered.push({ path: p, reason: 'flat .md — must be <name>/SKILL.md' });
    }
  }
  return { skills, unregistered };
}

function listAgents(dir) {
  return listDir(dir)
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
    .map((e) => path.basename(e.name, '.md'));
}

function scanScope(base) {
  const claudeDir = path.join(base, '.claude');
  const { skills, unregistered } = listSkills(path.join(claudeDir, 'skills'));
  return {
    rules: listRules(path.join(claudeDir, 'rules')),
    skills,
    unregistered,
    agents: listAgents(path.join(claudeDir, 'agents')),
  };
}

/**
 * Scan user (~/.claude) and project (<projectDir>/.claude) scopes.
 * When projectDir is the home dir, the project scope is skipped (same files).
 */
function discover(projectDir = process.cwd(), { home = os.homedir() } = {}) {
  const user = scanScope(home);
  const sameDir = path.resolve(projectDir) === path.resolve(home);
  const project = sameDir ? { rules: [], skills: [], unregistered: [], agents: [] } : scanScope(projectDir);
  return { user, project };
}

function isEmpty(scope) {
  return !scope.rules.length && !scope.skills.length && !scope.agents.length && !scope.unregistered.length;
}

const MAX_NAMES = 25;
const names = (arr) => (arr.length > MAX_NAMES ? `${arr.slice(0, MAX_NAMES).join(', ')}, … +${arr.length - MAX_NAMES}` : arr.join(', '));

/**
 * Compact text index. `forSubagent` adds read-the-file guidance (subagents may lack the
 * Skill tool and only see CLAUDE.md, not the session's skill listing).
 */
function formatIndex(found, { projectDir = process.cwd(), forSubagent = false } = {}) {
  if (process.env.AF_HOST_EXTENSIONS_DISABLED === 'true') return null;
  const { user, project } = found;
  if (isEmpty(user) && isEmpty(project)) return null;

  const tilde = (p) => p.replace(os.homedir(), '~');
  const rel = (p) => (p.startsWith(projectDir + path.sep) ? path.relative(projectDir, p) : tilde(p));
  const lines = ['🧩 Host extensions (user + project) — these OVERRIDE plugin defaults on conflict; prefer a matching host skill over a plugin skill:'];

  for (const [label, scope, dir] of [['user', user, '~/.claude'], ['project', project, '.claude']]) {
    if (isEmpty(scope)) continue;
    const parts = [];
    if (scope.rules.length) {
      const scoped = scope.rules.filter((r) => r.scoped).length;
      parts.push(`rules ${scope.rules.length}${scoped ? ` (${scoped} path-scoped)` : ''} in ${dir}/rules/`);
    }
    if (scope.skills.length) parts.push(`skills: ${names(scope.skills.map((s) => s.name))}`);
    if (scope.agents.length) parts.push(`agents: ${names(scope.agents)}`);
    if (parts.length) lines.push(`   ${label}: ${parts.join(' | ')}`);
  }

  if (forSubagent) {
    const rules = [...project.rules, ...user.rules].filter((r) => !r.scoped);
    if (rules.length) {
      lines.push('   Host rules — Read the ones that apply to your task and follow them:');
      lines.push(`     ${names(rules.map((r) => rel(r.path)))}`);
    }
    lines.push('   Host skills — if one matches, use it via the Skill tool (or Read its SKILL.md). Project first:');
    for (const s of [...project.skills, ...user.skills].slice(0, MAX_NAMES)) lines.push(`     ${s.name} → ${rel(s.path)}`);
  }

  const unregistered = [...user.unregistered, ...project.unregistered];
  if (unregistered.length && !forSubagent) {
    lines.push(`⚠️  ${unregistered.length} host skill file(s) are NOT registered by Claude Code (never auto-loaded):`);
    for (const u of unregistered.slice(0, 5)) lines.push(`   ${rel(u.path)} — ${u.reason}`);
    if (unregistered.length > 5) lines.push(`   … +${unregistered.length - 5} more`);
    lines.push(`   Fix: node ${tilde(path.join(__dirname, '..', '..', 'scripts', 'migrate-host-skills.cjs'))} <project-dir> (dry-run; --apply to convert)`);
  }
  return lines.join('\n');
}

module.exports = { discover, formatIndex, frontmatter, listSkills, listRules };
