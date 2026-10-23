#!/usr/bin/env node
/**
 * migrate-host-skills — convert host skill files Claude Code never registers into the
 * `<name>/SKILL.md` + frontmatter layout it does.
 *
 * Claude Code only discovers `.claude/skills/<name>/SKILL.md` with `description` frontmatter.
 * Flat `.claude/skills/<name>.md` files (and SKILL.md without frontmatter) are silently ignored,
 * so they never appear in the skill listing — with or without Aura Frog.
 *
 * Usage:
 *   node migrate-host-skills.cjs [projectDir|~] [--apply]
 *   Default is a dry run. `~` targets ~/.claude/skills.
 * Description = `**Trigger:**` line when present, else the first `# heading`.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { listSkills, frontmatter } = require('../hooks/lib/host-extensions.cjs');

function describe(body, name) {
  const trigger = body.match(/^\*\*Trigger:?\*\*:?\s*(.+)$/m);
  const heading = body.match(/^#\s+(?:Skill:\s*)?(.+)$/m);
  // Without a Trigger line: heading + first prose line (or bullet) after it.
  const prose = heading && body.slice(heading.index + heading[0].length).split('\n')
    .map((l) => l.trim()).find((l) => l && !l.startsWith('#') && !l.startsWith('```'));
  const fallback = heading ? (prose ? `${heading[1]}. ${prose.replace(/^[-*]\s+/, '')}` : heading[1]) : name;
  const text = (trigger ? trigger[1] : fallback).replace(/\s+/g, ' ').trim();
  return text.length > 1000 ? `${text.slice(0, 997)}...` : text;
}

const yamlStr = (s) => JSON.stringify(s); // JSON string is valid YAML double-quoted scalar

/** Plan the conversion of one unregistered file. Returns { from, to, content } or null. */
function planOne(file) {
  const text = fs.readFileSync(file, 'utf8');
  const isFlat = path.basename(file) !== 'SKILL.md';
  const name = isFlat ? path.basename(file, '.md') : path.basename(path.dirname(file));
  const fm = frontmatter(text);
  const hasFm = text.startsWith('---') && Object.keys(fm).length > 0;
  const body = hasFm ? text.slice(text.indexOf('\n---', 3) + 4).replace(/^\n+/, '') : text;
  const fields = { ...fm, name: fm.name || name, description: fm.description || describe(body, name) };
  const header = Object.entries(fields).map(([k, v]) => `${k}: ${k === 'description' || k === 'name' ? yamlStr(v) : v}`);
  const to = isFlat ? path.join(path.dirname(file), name, 'SKILL.md') : file;
  if (isFlat && fs.existsSync(to)) return { from: file, to, conflict: true };
  return { from: file, to, content: `---\n${header.join('\n')}\n---\n\n${body}` };
}

function migrate(skillsDir, { apply = false } = {}) {
  const { unregistered } = listSkills(skillsDir);
  const plans = unregistered.map((u) => planOne(u.path)).filter(Boolean);
  if (apply) {
    for (const p of plans) {
      if (p.conflict) continue;
      fs.mkdirSync(path.dirname(p.to), { recursive: true });
      fs.writeFileSync(p.to, p.content);
      if (p.from !== p.to) fs.unlinkSync(p.from);
    }
  }
  return plans;
}

module.exports = { migrate, planOne, describe };

if (require.main === module) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const target = args.find((a) => !a.startsWith('--')) || process.cwd();
  const base = target === '~' ? os.homedir() : path.resolve(target);
  const skillsDir = path.join(base, '.claude', 'skills');
  const plans = migrate(skillsDir, { apply });
  if (!plans.length) {
    console.log(`✅ ${skillsDir}: every skill is registrable.`);
    process.exit(0);
  }
  for (const p of plans) {
    const rel = (f) => path.relative(base, f);
    if (p.conflict) console.log(`⚠️  skip ${rel(p.from)} — ${rel(p.to)} already exists`);
    else console.log(`${apply ? '✔' : '→'} ${rel(p.from)}${p.from !== p.to ? ` → ${rel(p.to)}` : ' (add frontmatter)'}`);
  }
  console.log(apply ? `\nConverted ${plans.filter((p) => !p.conflict).length}. Restart Claude Code to load them.` : '\nDry run. Re-run with --apply to convert.');
}
