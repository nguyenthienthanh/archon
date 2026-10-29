'use strict';
/**
 * context-snapshot.cjs — Durable, SHA-stamped project-context snapshot.
 * FEAT-008 / STORY-0014.
 *
 * Problem: the rich context generators (repo-map-gen.sh, file-registry-gen.sh,
 * architecture-gen.sh) existed but were never run + persisted, and there was no
 * single artifact a future session could load INSTEAD of re-scanning the code.
 *
 * This module produces one consolidated `snapshot.md` under the canonical
 * context dir (.claude/project-contexts/<name>/) with a frontmatter stamp:
 *   - schema      : snapshot format version
 *   - gitHead     : git HEAD sha at generation time
 *   - contentHash : project-type-aware content hash (see project-cache)
 *   - generatedAt : ISO timestamp (informational only)
 *
 * A snapshot is "fresh" — reusable without re-scanning — iff the current
 * gitHead + contentHash still match the stamp. Freshness reuses STORY-0013's
 * invalidation primitives so there is ONE source of truth for "did the codebase
 * change".
 *
 * CLI: node context-snapshot.cjs [project-root]   (runs the real generators)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const cache = require('../hooks/lib/project-cache.cjs');

const SNAPSHOT_FILE = 'snapshot.md';
const SNAPSHOT_SCHEMA_VERSION = 1;

// Generators: [script, output-filename-under-context-dir]
const GENERATORS = [
  ['repo-map-gen.sh', 'repo-map.md'],
  ['file-registry-gen.sh', 'file-registry.yaml'],
  ['architecture-gen.sh', 'architecture.md'],
];

function contextDir(projectRoot = '.') {
  const name = cache.getProjectName(projectRoot);
  return path.join(path.resolve(projectRoot), cache.PROJECT_CONTEXTS_DIR, name);
}

function getSnapshotPath(projectRoot = '.') {
  return path.join(contextDir(projectRoot), SNAPSHOT_FILE);
}

/**
 * Run the three shell generators into the context dir. Best-effort per
 * generator: a failing/absent generator is logged to the returned list, never
 * fatal (the snapshot stamp is still written so freshness tracking works).
 */
function runGenerators(projectRoot, ctxDir) {
  const scriptsDir = __dirname;
  const produced = [];
  for (const [script, outName] of GENERATORS) {
    const scriptPath = path.join(scriptsDir, script);
    const outPath = path.join(ctxDir, outName);
    try {
      if (!fs.existsSync(scriptPath)) { produced.push({ outName, ok: false, reason: 'generator missing' }); continue; }
      execFileSync('bash', [scriptPath, path.resolve(projectRoot), outPath], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      produced.push({ outName, ok: fs.existsSync(outPath) });
    } catch (e) {
      produced.push({ outName, ok: false, reason: (e && e.message) ? e.message.split('\n')[0] : 'failed' });
    }
  }
  return produced;
}

function buildFrontmatter(meta) {
  return [
    '---',
    `schema: ${meta.schema}`,
    `projectName: ${meta.projectName}`,
    `gitHead: ${meta.gitHead || ''}`,
    `contentHash: ${meta.contentHash}`,
    `generatedAt: ${meta.generatedAt}`,
    '---',
  ].join('\n');
}

/**
 * Generate (or regenerate) the snapshot. Returns { path, gitHead, contentHash,
 * projectName, generators }.
 *
 * @param {string} projectRoot
 * @param {object} [opts]
 * @param {boolean} [opts.runGenerators=true]  Run the bash generators (set false in unit tests).
 * @param {string}  [opts.generatedAt]         ISO timestamp override (tests pass a fixed value).
 */
function generateSnapshot(projectRoot = '.', opts = {}) {
  const doGenerators = opts.runGenerators !== false;
  const ctxDir = contextDir(projectRoot);
  fs.mkdirSync(ctxDir, { recursive: true });

  const generators = doGenerators ? runGenerators(projectRoot, ctxDir) : [];

  const meta = {
    schema: SNAPSHOT_SCHEMA_VERSION,
    projectName: cache.getProjectName(projectRoot),
    gitHead: cache.getGitHead(projectRoot),
    contentHash: cache.calculateContentHash(projectRoot),
    generatedAt: opts.generatedAt || new Date().toISOString(),
  };

  const body = [
    buildFrontmatter(meta),
    '',
    '# Project Context Snapshot',
    '',
    `> Durable, reusable project context for **${meta.projectName}**. Generated at git \`${(meta.gitHead || 'no-git').substring(0, 12)}\`.`,
    '> Load this INSTEAD of re-scanning the codebase while it is fresh (SHA + content-hash unchanged).',
    '',
    '## Consolidated sources',
    '',
    ...GENERATORS.map(([, outName]) => {
      const exists = fs.existsSync(path.join(ctxDir, outName));
      return `- \`${outName}\` ${exists ? '✓ generated' : '— (not generated)'}`;
    }),
    '',
    '## Reuse contract',
    '',
    '- **Fresh** (gitHead + contentHash match): reuse as-is, skip re-scan.',
    '- **Stale**: run `/project refresh` or `node archon-os/scripts/context-snapshot.cjs` to regenerate.',
    '',
  ].join('\n');

  const snapshotPath = getSnapshotPath(projectRoot);
  fs.writeFileSync(snapshotPath, body);

  return { path: snapshotPath, ...meta, generators };
}

/**
 * Parse the snapshot frontmatter. Returns { schema, projectName, gitHead,
 * contentHash, generatedAt } or null if the snapshot is absent/unparseable.
 */
function readSnapshotMeta(projectRoot = '.') {
  const snapshotPath = getSnapshotPath(projectRoot);
  if (!fs.existsSync(snapshotPath)) return null;
  let text;
  try { text = fs.readFileSync(snapshotPath, 'utf8'); } catch (_) { return null; }
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    meta[kv[1]] = kv[2];
  }
  if (meta.schema !== undefined) meta.schema = Number(meta.schema);
  if (meta.gitHead === '') meta.gitHead = null;
  return Object.keys(meta).length ? meta : null;
}

/**
 * Is the snapshot fresh (reusable without re-scanning)?
 * Fresh iff: snapshot exists, schema matches, contentHash matches the current
 * codebase, and (when git is available on both sides) gitHead matches.
 */
function isSnapshotFresh(projectRoot = '.') {
  const meta = readSnapshotMeta(projectRoot);
  if (!meta) return false;
  if (meta.schema !== SNAPSHOT_SCHEMA_VERSION) return false;
  if (meta.contentHash !== cache.calculateContentHash(projectRoot)) return false;
  const currentGit = cache.getGitHead(projectRoot);
  if (currentGit && meta.gitHead && meta.gitHead !== currentGit) return false;
  return true;
}

module.exports = {
  generateSnapshot,
  readSnapshotMeta,
  isSnapshotFresh,
  getSnapshotPath,
  contextDir,
  SNAPSHOT_FILE,
  SNAPSHOT_SCHEMA_VERSION,
};

// CLI entry — run the real generators + write the snapshot.
if (require.main === module) {
  const root = process.argv[2] || '.';
  const res = generateSnapshot(root, { runGenerators: true });
  const ok = res.generators.filter((g) => g.ok).length;
  process.stdout.write(
    `📸 Snapshot written: ${res.path}\n` +
    `   gitHead=${(res.gitHead || 'none').substring(0, 12)} contentHash=${res.contentHash} generators=${ok}/${res.generators.length}\n`
  );
}
