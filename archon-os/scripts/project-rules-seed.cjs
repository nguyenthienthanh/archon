#!/usr/bin/env node
/**
 * project-rules-seed.cjs — `/project init` step: seed stack best-practice rules.
 *
 * Detects the stack with the existing detectFramework() and copies the matching
 * skills/framework-expert/refs/<ref>.md into <project>/.claude/rules/stack/,
 * which Claude Code auto-loads every session. Once seeded, the file is
 * PROJECT-OWNED: edit it freely; it is never overwritten without --force.
 *
 * The ref population comes from readdirSync(refs/) (id = filename). Only
 * framework ids that differ from a ref filename need an alias below.
 *
 * Usage: project-rules-seed.cjs [--dir <repo>] [--force] [--dry-run] [--json]
 * Exit:  0 ok | 2 usage / unreadable dir
 */

const fs = require('fs');
const path = require('path');
const { detectFramework } = require(path.join(__dirname, '../hooks/lib/config-utils.cjs'));

const PLUGIN_ROOT = path.join(__dirname, '..');
const REFS_DIR = path.join(PLUGIN_ROOT, 'skills/framework-expert/refs');

// detectFramework() id -> ref ids, only where they differ from the filename.
const ALIASES = {
  django: ['python'], fastapi: ['python'], flask: ['python'],
  express: ['nodejs'], nestjs: ['nodejs'], fastify: ['nodejs'], hono: ['nodejs'], elysia: ['nodejs'],
  gin: ['go'], echo: ['go'], fiber: ['go'],
  expo: ['react-native'],
  nextjs: ['nextjs', 'react'],
};

// A manifest with no framework detected still identifies the language.
const MANIFEST_FALLBACKS = [
  ['go.mod', 'go'], ['requirements.txt', 'python'], ['pyproject.toml', 'python'], ['package.json', 'nodejs'],
];

function availableRefs() {
  return new Set(fs.readdirSync(REFS_DIR).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)));
}

/** Ref ids for the project in `dir`, in a stable order. detectFramework reads cwd-relative paths. */
function detectRefs(dir) {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    const refs = availableRefs();
    const framework = detectFramework();
    let ids = framework ? (ALIASES[framework] || [framework]) : [];
    if (ids.length === 0) {
      const hit = MANIFEST_FALLBACKS.find(([file]) => fs.existsSync(file));
      if (hit) ids = [hit[1]];
    }
    if (fs.existsSync('tsconfig.json')) ids.push('typescript');
    return [...new Set(ids)].filter(id => refs.has(id)).sort();
  } finally {
    process.chdir(prev);
  }
}

function pluginVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin/plugin.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

function seed({ dir, force = false, dryRun = false }) {
  const refs = detectRefs(dir);
  const outDir = path.join(dir, '.claude/rules/stack');
  const result = { refs, written: [], skipped: [], dir: outDir };
  if (dryRun || refs.length === 0) return result;

  const version = pluginVersion();
  fs.mkdirSync(outDir, { recursive: true });
  if (fs.lstatSync(outDir).isSymbolicLink()) throw new Error(`refusing to write through a symlinked ${outDir}`);
  for (const id of refs) {
    const name = `${id}.md`;
    const target = path.join(outDir, name);
    // lstat, not exists: a (dangling) symlink must never be written through, --force or not.
    const existing = fs.lstatSync(target, { throwIfNoEntry: false });
    if (existing && (existing.isSymbolicLink() || !force)) {
      result.skipped.push(name);
      continue;
    }
    const body = fs.readFileSync(path.join(REFS_DIR, name), 'utf8').trim();
    const header = `<!-- archon-seed: source=skills/framework-expert/refs/${name} plugin=${version}`
      + ' — project-owned, edit freely; re-seed with project-rules-seed.cjs --force -->';
    fs.writeFileSync(target, `${header}\n\n${body}\n`);
    result.written.push(name);
  }
  return result;
}

function main(argv) {
  const args = argv.slice(2);
  const dirIdx = args.indexOf('--dir');
  const dirArg = dirIdx >= 0 ? args[dirIdx + 1] : process.cwd();
  if (!dirArg || dirArg.startsWith('--')) {
    console.error('project-rules-seed: --dir needs a path\nUsage: project-rules-seed.cjs [--dir <repo>] [--force] [--dry-run] [--json]');
    return 2;
  }
  const dir = path.resolve(dirArg);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`project-rules-seed: not a directory: ${dir}`);
    return 2;
  }

  const result = seed({ dir, force: args.includes('--force'), dryRun: args.includes('--dry-run') });
  if (args.includes('--json')) {
    console.log(JSON.stringify(result));
  } else if (result.refs.length === 0) {
    console.log('project-rules-seed: no stack with a framework-expert ref detected — nothing seeded');
  } else {
    for (const f of result.written) console.log(`  + .claude/rules/stack/${f}`);
    for (const f of result.skipped) console.log(`  = .claude/rules/stack/${f} (exists — kept; --force to re-seed)`);
  }
  return 0;
}

// exitCode, not process.exit(): exit() can cut stdout at the 64 KB pipe buffer.
process.exitCode = main(process.argv);
