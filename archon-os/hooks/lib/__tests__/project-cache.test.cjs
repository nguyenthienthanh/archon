'use strict';
/**
 * project-cache.test.cjs — Phase 2 RED tests for FEAT-008 / STORY-0013
 *
 * Defines the BEHAVIORAL CONTRACT for the rewritten cache-invalidation logic in
 * archon-os/hooks/lib/project-cache.cjs.
 *
 * Root cause being fixed: the old invalidation keyed off a 24h TTL + a KEY_FILES
 * list that only contains JS/TS/Go/Python config files. For a markdown/bash/yaml
 * project (this plugin) NONE of those files exist, so the cache never invalidated
 * and `project-detection.json` froze for months while the repo drifted.
 *
 * New contract (STORY-0013):
 *   - Invalidation keys off git HEAD SHA + a content-hash of watch targets.
 *   - The 24h TTL is GONE — a cache stays valid as long as the codebase is unchanged.
 *   - Watch targets are project-type-aware: KEY_FILES when they exist, otherwise
 *     STRUCTURAL_DIRS (agents/skills/rules/commands/hooks/src/lib/docs).
 *   - A schema-version bump invalidates old-format caches (rebuilds the stale one).
 *   - Staleness is inspectable (for the session-start banner).
 *
 * Test framework: Jest (see jest.config.cjs). Every test here MUST fail before
 * Phase 3 implementation and pass without modification after.
 */

const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const cache = require('../project-cache.cjs');

const REPO_ROOT = process.cwd();

// --- temp-dir helpers ---------------------------------------------------------
function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
}
function rmTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

describe('project-cache: new invalidation API surface (STORY-0013)', () => {
  test('exports the new functions + schema constant', () => {
    expect(typeof cache.getGitHead).toBe('function');
    expect(typeof cache.calculateContentHash).toBe('function');
    expect(typeof cache.resolveWatchMode).toBe('function');
    expect(typeof cache.getCacheStaleness).toBe('function');
    expect(typeof cache.CACHE_SCHEMA_VERSION).toBe('number');
    expect(Array.isArray(cache.STRUCTURAL_DIRS)).toBe(true);
  });
});

describe('project-cache: getGitHead', () => {
  test('returns the current HEAD sha (40-hex) when called on a git repo', () => {
    const expected = execSync('git rev-parse HEAD', { cwd: REPO_ROOT }).toString().trim();
    expect(cache.getGitHead(REPO_ROOT)).toBe(expected);
    expect(cache.getGitHead(REPO_ROOT)).toMatch(/^[0-9a-f]{40}$/);
  });

  test('returns null for a non-git directory (fail-safe)', () => {
    const tmp = mkTmp('af-nogit-');
    try {
      expect(cache.getGitHead(tmp)).toBeNull();
    } finally {
      rmTmp(tmp);
    }
  });
});

describe('project-cache: calculateContentHash + resolveWatchMode (project-type-aware)', () => {
  test('content hash is stable across calls for an unchanged dir', () => {
    const tmp = mkTmp('af-stable-');
    try {
      fs.mkdirSync(path.join(tmp, 'agents'));
      fs.writeFileSync(path.join(tmp, 'agents', 'a.md'), 'x');
      const h1 = cache.calculateContentHash(tmp);
      const h2 = cache.calculateContentHash(tmp);
      expect(h1).toBe(h2);
      expect(typeof h1).toBe('string');
      expect(h1.length).toBeGreaterThan(0);
    } finally {
      rmTmp(tmp);
    }
  });

  test('uses key-files mode when a KEY_FILE exists', () => {
    const tmp = mkTmp('af-keyfiles-');
    try {
      fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"x"}');
      expect(cache.resolveWatchMode(tmp)).toBe('key-files');
    } finally {
      rmTmp(tmp);
    }
  });

  test('falls back to structural mode for a markdown/plugin project (no KEY_FILES)', () => {
    const tmp = mkTmp('af-structural-');
    try {
      fs.mkdirSync(path.join(tmp, 'skills'));
      fs.writeFileSync(path.join(tmp, 'skills', 's.md'), 'x');
      expect(cache.resolveWatchMode(tmp)).toBe('structural');
    } finally {
      rmTmp(tmp);
    }
  });

  test('structural hash CHANGES when a watched dir gains a file (the bug we fix)', () => {
    const tmp = mkTmp('af-change-');
    try {
      fs.mkdirSync(path.join(tmp, 'agents'));
      fs.writeFileSync(path.join(tmp, 'agents', 'a.md'), 'one');
      const before = cache.calculateContentHash(tmp);
      // add a second agent — count + mtime change
      fs.writeFileSync(path.join(tmp, 'agents', 'b.md'), 'two');
      const after = cache.calculateContentHash(tmp);
      expect(after).not.toBe(before);
    } finally {
      rmTmp(tmp);
    }
  });
});

describe('project-cache: isCacheValid — git-SHA + content-hash, NO 24h clock', () => {
  function freshCacheForDir(dir) {
    return {
      gitHead: cache.getGitHead(dir),
      contentHash: cache.calculateContentHash(dir),
      cacheSchema: cache.CACHE_SCHEMA_VERSION,
      timestamp: Date.now(),
    };
  }

  test('VALID even when timestamp is ancient (>24h) — proves the TTL was dropped', () => {
    const c = freshCacheForDir(REPO_ROOT);
    c.timestamp = Date.now() - 100 * 24 * 60 * 60 * 1000; // 100 days old
    expect(cache.isCacheValid(c, REPO_ROOT)).toBe(true);
  });

  test('INVALID for an old-schema cache (the stale 2026-02-11 shape with no cacheSchema)', () => {
    const legacy = { timestamp: Date.now(), keyFilesHash: 'deadbeef' }; // pre-STORY-0013 shape
    expect(cache.isCacheValid(legacy, REPO_ROOT)).toBe(false);
  });

  test('INVALID when git HEAD sha mismatches', () => {
    const c = freshCacheForDir(REPO_ROOT);
    c.gitHead = '0000000000000000000000000000000000000000';
    expect(cache.isCacheValid(c, REPO_ROOT)).toBe(false);
  });

  test('INVALID when content hash mismatches even if git HEAD matches', () => {
    const c = freshCacheForDir(REPO_ROOT);
    c.contentHash = 'not-the-real-hash';
    expect(cache.isCacheValid(c, REPO_ROOT)).toBe(false);
  });

  test('git-unavailable dir: validity falls back to content-hash equality (no clock)', () => {
    const tmp = mkTmp('af-nogit-valid-');
    try {
      fs.mkdirSync(path.join(tmp, 'rules'));
      fs.writeFileSync(path.join(tmp, 'rules', 'r.md'), 'x');
      const c = {
        gitHead: null,
        contentHash: cache.calculateContentHash(tmp),
        cacheSchema: cache.CACHE_SCHEMA_VERSION,
        timestamp: Date.now() - 100 * 24 * 60 * 60 * 1000,
      };
      expect(cache.isCacheValid(c, tmp)).toBe(true);
      // mutate the watched dir → now invalid
      fs.writeFileSync(path.join(tmp, 'rules', 'r2.md'), 'y');
      expect(cache.isCacheValid(c, tmp)).toBe(false);
    } finally {
      rmTmp(tmp);
    }
  });
});

describe('project-cache: getProjectName resolution order (STORY-0014 — fix ghost-dir bug)', () => {
  // Bug: getProjectName preferred package.json `name` ("archon-dev") over the
  // dir basename ("archon") where the real context lives → permanent cache miss.
  // Fix: an existing .claude/project-contexts/<basename>/ dir wins over package.json.
  function mkProj(name) {
    const base = mkTmp('af-name-');
    const proj = path.join(base, name);
    fs.mkdirSync(proj);
    return { base, proj };
  }

  test('prefers package.json name when no context dir exists yet (fresh project)', () => {
    const { base, proj } = mkProj('mydir');
    try {
      fs.writeFileSync(path.join(proj, 'package.json'), '{"name":"pkgname"}');
      expect(cache.getProjectName(proj)).toBe('pkgname');
    } finally { rmTmp(base); }
  });

  test('prefers dir basename when .claude/project-contexts/<basename>/ already exists', () => {
    const { base, proj } = mkProj('archon');
    try {
      fs.writeFileSync(path.join(proj, 'package.json'), '{"name":"archon-dev"}');
      fs.mkdirSync(path.join(proj, '.claude', 'project-contexts', 'archon'), { recursive: true });
      expect(cache.getProjectName(proj)).toBe('archon');
    } finally { rmTmp(base); }
  });

  test('falls back to dir basename when no package.json and no context dir', () => {
    const { base, proj } = mkProj('barez');
    try {
      expect(cache.getProjectName(proj)).toBe('barez');
    } finally { rmTmp(base); }
  });
});

describe('project-cache: getCacheStaleness (powers the session-start banner)', () => {
  test('reports stale=true with a sha-mismatch reason', () => {
    const c = {
      gitHead: '0000000000000000000000000000000000000000',
      contentHash: cache.calculateContentHash(REPO_ROOT),
      cacheSchema: cache.CACHE_SCHEMA_VERSION,
      timestamp: Date.now(),
    };
    const s = cache.getCacheStaleness(c, REPO_ROOT);
    expect(s.stale).toBe(true);
    expect(s.valid).toBe(false);
    expect(s.cachedSha).toBe('0000000000000000000000000000000000000000');
    expect(s.currentSha).toBe(cache.getGitHead(REPO_ROOT));
    expect(String(s.reason)).toMatch(/sha|commit|head/i);
  });

  test('reports stale=false for a fresh, matching cache', () => {
    const c = {
      gitHead: cache.getGitHead(REPO_ROOT),
      contentHash: cache.calculateContentHash(REPO_ROOT),
      cacheSchema: cache.CACHE_SCHEMA_VERSION,
      timestamp: Date.now(),
    };
    const s = cache.getCacheStaleness(c, REPO_ROOT);
    expect(s.stale).toBe(false);
    expect(s.valid).toBe(true);
  });
});
