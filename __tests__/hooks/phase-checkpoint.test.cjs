/**
 * Tests for archon-os/hooks/phase-checkpoint.cjs
 *
 * createCheckpoint and writeCache are NOT exported and must never be called from
 * a test: createCheckpoint runs `git add -A` + `git commit` against the real
 * working tree, and writeCache writes the real .claude/cache.
 *
 * What is left is read-only, so these assert the "best-effort, never block"
 * contract rather than machine-specific values.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  getWorkflowState,
  hasUncommittedChanges,
  getCacheFile,
  readCache,
  isIndexLocked,
} = require('../../archon-os/hooks/phase-checkpoint.cjs');

const HOOK_SRC = fs.readFileSync(
  path.join(__dirname, '../../archon-os/hooks/phase-checkpoint.cjs'), 'utf8');

describe('phase-checkpoint', () => {
  it('does not export the repo-mutating helpers', () => {
    const api = require('../../archon-os/hooks/phase-checkpoint.cjs');
    expect(api.createCheckpoint).toBeUndefined();
    expect(api.writeCache).toBeUndefined();
  });

  describe('getCacheFile', () => {
    it('is an absolute path to the project-scoped cache file', () => {
      const p = getCacheFile();
      expect(path.isAbsolute(p)).toBe(true);
      expect(path.basename(p)).toBe('af-phase-checkpoint-cache.json');
    });
    it('lives under .claude/cache', () => {
      expect(getCacheFile().replace(/\\/g, '/')).toContain('.claude/cache');
    });
    it('is stable across calls', () => {
      expect(getCacheFile()).toBe(getCacheFile());
    });
  });

  describe('getWorkflowState', () => {
    it('returns an object and never throws when no session state exists', () => {
      let out;
      expect(() => { out = getWorkflowState(); }).not.toThrow();
      expect(typeof out).toBe('object');
      expect(out).not.toBeNull();
    });
  });

  describe('hasUncommittedChanges', () => {
    // Read-only `git status --porcelain`; the value depends on the tree, the
    // contract is that it always answers with a boolean and never throws.
    it('returns a boolean and never throws', () => {
      let out;
      expect(() => { out = hasUncommittedChanges(); }).not.toThrow();
      expect(typeof out).toBe('boolean');
    });
  });

  describe('readCache', () => {
    it('returns an object and never throws', () => {
      let out;
      expect(() => { out = readCache(); }).not.toThrow();
      expect(typeof out).toBe('object');
      expect(out).not.toBeNull();
    });
  });

  // A checkpoint racing a user/Claude commit is what leaves "index.lock: File
  // exists" behind when several sessions share one repo.
  describe('index lock contention', () => {
    let repo;
    beforeEach(() => {
      repo = fs.mkdtempSync(path.join(os.tmpdir(), 'af-ckpt-'));
      execFileSync('git', ['init', '-q', repo]);
    });
    afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

    it('isIndexLocked is false for a clean repo', () => {
      expect(isIndexLocked(repo)).toBe(false);
    });

    it('isIndexLocked is true while another git process holds index.lock', () => {
      fs.writeFileSync(path.join(repo, '.git', 'index.lock'), '');
      expect(isIndexLocked(repo)).toBe(true);
    });

    it('isIndexLocked is false outside a git repo', () => {
      const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'af-plain-'));
      try { expect(isIndexLocked(plain)).toBe(false); }
      finally { fs.rmSync(plain, { recursive: true, force: true }); }
    });

    it('status check does not take the index lock', () => {
      expect(HOOK_SRC).toMatch(/git --no-optional-locks status --porcelain/);
    });
  });
});
