'use strict';
/**
 * context-snapshot.test.cjs — Phase 2 RED tests for FEAT-008 / STORY-0014
 *
 * Contract for the durable, SHA-stamped project-context snapshot. The snapshot
 * is what lets future sessions SKIP re-scanning: it persists the consolidated
 * project context with a git-HEAD + content-hash stamp, and is considered
 * "fresh" (reusable as-is) only while the codebase is unchanged.
 *
 * Test framework: Jest (see jest.config.cjs).
 */

const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

const snap = require('../context-snapshot.cjs');

function mkTmp(prefix) { return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix)); }
function rmTmp(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

function seedProject(root) {
  fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'agents', 'a.md'), 'agent a');
  fs.mkdirSync(path.join(root, '.claude', 'project-contexts', path.basename(root)), { recursive: true });
}

describe('context-snapshot: API surface', () => {
  test('exports generateSnapshot, readSnapshotMeta, isSnapshotFresh, getSnapshotPath', () => {
    expect(typeof snap.generateSnapshot).toBe('function');
    expect(typeof snap.readSnapshotMeta).toBe('function');
    expect(typeof snap.isSnapshotFresh).toBe('function');
    expect(typeof snap.getSnapshotPath).toBe('function');
  });
});

describe('context-snapshot: generateSnapshot writes a SHA-stamped artifact', () => {
  test('produces snapshot.md with frontmatter (schema, contentHash, generatedAt) under the canonical context dir', () => {
    const root = mkTmp('snap-gen-');
    try {
      seedProject(root);
      // runGenerators:false keeps the unit test fast + bash-free; freshness logic is what we assert.
      const res = snap.generateSnapshot(root, { runGenerators: false });
      expect(fs.existsSync(res.path)).toBe(true);
      expect(res.path).toContain(path.join('.claude', 'project-contexts'));
      const body = fs.readFileSync(res.path, 'utf8');
      expect(body.startsWith('---')).toBe(true);          // has YAML frontmatter
      expect(body).toMatch(/schema:/);
      expect(body).toMatch(/contentHash:/);
      expect(body).toMatch(/generatedAt:/);
      const meta = snap.readSnapshotMeta(root);
      expect(meta).not.toBeNull();
      expect(typeof meta.contentHash).toBe('string');
      expect(meta.contentHash.length).toBeGreaterThan(0);
    } finally { rmTmp(root); }
  });
});

describe('context-snapshot: freshness = unchanged codebase (the reuse guarantee)', () => {
  test('isSnapshotFresh is true immediately after generation', () => {
    const root = mkTmp('snap-fresh-');
    try {
      seedProject(root);
      snap.generateSnapshot(root, { runGenerators: false });
      expect(snap.isSnapshotFresh(root)).toBe(true);
    } finally { rmTmp(root); }
  });

  test('isSnapshotFresh becomes false after a watched dir changes (content drift)', () => {
    const root = mkTmp('snap-drift-');
    try {
      seedProject(root);
      snap.generateSnapshot(root, { runGenerators: false });
      expect(snap.isSnapshotFresh(root)).toBe(true);
      fs.writeFileSync(path.join(root, 'agents', 'b.md'), 'agent b'); // codebase changed
      expect(snap.isSnapshotFresh(root)).toBe(false);
    } finally { rmTmp(root); }
  });

  test('isSnapshotFresh is false when no snapshot exists; readSnapshotMeta returns null', () => {
    const root = mkTmp('snap-none-');
    try {
      seedProject(root);
      expect(snap.readSnapshotMeta(root)).toBeNull();
      expect(snap.isSnapshotFresh(root)).toBe(false);
    } finally { rmTmp(root); }
  });
});
