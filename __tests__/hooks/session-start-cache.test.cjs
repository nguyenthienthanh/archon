/**
 * Tests for archon-os/hooks/session-start.cjs — session cache staleness rules.
 *
 * cacheStaleReason is pure (every environment fact is an argument), so these run
 * without touching the real .claude/cache or the working tree's git state.
 *
 * The branch_switched cases are the regression guard that shipped fix `fcd1934`
 * (FEAT-007/STORY-0029, "invalidate session cache on git branch switch") never
 * had — session-start.cjs used to run main() on require, so none of its logic
 * was reachable from a test.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  cacheStaleReason,
  getValidCache,
  buildContextOutput,
  listFiles,
  pruneJsonlByTimestamp,
  emitContextStalenessBanner,
} = require('../../archon-os/hooks/session-start.cjs');

const TTL = 60 * 60 * 1000; // 1 hour, mirrors SESSION_CACHE_TTL
const NOW = 1_700_000_000_000;

const env = (over = {}) => ({
  now: NOW,
  ttl: TTL,
  envrcMtime: null,
  currentBranch: 'main',
  ...over,
});

const cacheOn = (branch, over = {}) => ({
  cachedAt: NOW - 1000,
  envVars: branch === undefined ? {} : { AF_GIT_BRANCH: branch },
  ...over,
});

describe('session-start — cacheStaleReason', () => {
  it('reports missing for a null cache', () => {
    expect(cacheStaleReason(null, env())).toBe('missing');
  });

  it('accepts a fresh cache on the same branch', () => {
    expect(cacheStaleReason(cacheOn('main'), env())).toBeNull();
  });

  describe('TTL', () => {
    it('expires a cache older than the TTL', () => {
      const stale = cacheOn('main', { cachedAt: NOW - TTL - 1 });
      expect(cacheStaleReason(stale, env())).toBe('ttl_expired');
    });
    it('keeps a cache exactly at the TTL boundary', () => {
      const edge = cacheOn('main', { cachedAt: NOW - TTL });
      expect(cacheStaleReason(edge, env())).toBeNull();
    });
    it('treats a cache with no cachedAt as expired', () => {
      expect(cacheStaleReason({ envVars: {} }, env())).toBe('ttl_expired');
    });
  });

  describe('.envrc', () => {
    it('invalidates when .envrc changed after the cache was written', () => {
      expect(cacheStaleReason(cacheOn('main'), env({ envrcMtime: NOW })))
        .toBe('envrc_changed');
    });
    it('ignores an .envrc older than the cache', () => {
      expect(cacheStaleReason(cacheOn('main'), env({ envrcMtime: NOW - 50_000 })))
        .toBeNull();
    });
    it('ignores a missing .envrc', () => {
      expect(cacheStaleReason(cacheOn('main'), env({ envrcMtime: null }))).toBeNull();
    });
  });

  // Regression guard for fcd1934 — without this the fast path replays a stale
  // AF_GIT_BRANCH for up to an hour after `git checkout`.
  describe('git branch switch (fcd1934)', () => {
    it('invalidates when the branch changed since caching', () => {
      expect(cacheStaleReason(cacheOn('main'), env({ currentBranch: 'feature/x' })))
        .toBe('branch_switched');
    });
    it('keeps the cache when the branch is unchanged', () => {
      expect(cacheStaleReason(cacheOn('feature/x'), env({ currentBranch: 'feature/x' })))
        .toBeNull();
    });

    // Safe-by-construction: it may only ever invalidate, never assert a wrong
    // branch. An undetectable branch must fall back to TTL-only behaviour.
    it('falls through when the current branch cannot be detected', () => {
      expect(cacheStaleReason(cacheOn('main'), env({ currentBranch: '' }))).toBeNull();
    });
    it('skips the check when the cache recorded no branch', () => {
      expect(cacheStaleReason(cacheOn(undefined), env({ currentBranch: 'main' })))
        .toBeNull();
    });
    it('skips the check when the cache has no envVars at all', () => {
      expect(cacheStaleReason({ cachedAt: NOW - 1000 }, env())).toBeNull();
    });
  });

  describe('precedence', () => {
    it('reports ttl_expired before branch_switched', () => {
      const old = cacheOn('main', { cachedAt: NOW - TTL - 1 });
      expect(cacheStaleReason(old, env({ currentBranch: 'other' }))).toBe('ttl_expired');
    });
    it('reports envrc_changed before branch_switched', () => {
      expect(cacheStaleReason(cacheOn('main'), env({ envrcMtime: NOW, currentBranch: 'other' })))
        .toBe('envrc_changed');
    });
  });
});

describe('session-start — getValidCache', () => {
  // Read-only against the real .claude/cache. Never asserts a specific value —
  // only that the I/O wrapper degrades safely whatever the machine's state.
  it('returns null or an object without throwing', () => {
    let out;
    expect(() => { out = getValidCache(); }).not.toThrow();
    expect(out === null || typeof out === 'object').toBe(true);
  });
});

describe('session-start — emitContextStalenessBanner', () => {
  // Read-only (reads the snapshot / detection cache and logs a line). Its whole
  // contract is "best-effort, never block startup", so both paths are asserted
  // to stay silent-and-safe rather than to produce a particular message.
  const KEY = 'AF_CONTEXT_STALE_BANNER_DISABLED';
  let saved, log;
  beforeEach(() => { saved = process.env[KEY]; log = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => {
    if (saved === undefined) delete process.env[KEY]; else process.env[KEY] = saved;
    log.mockRestore();
  });

  it('emits nothing when disabled by env', () => {
    process.env[KEY] = 'true';
    emitContextStalenessBanner();
    expect(log).not.toHaveBeenCalled();
  });

  it('never throws when enabled', () => {
    delete process.env[KEY];
    expect(() => emitContextStalenessBanner()).not.toThrow();
  });
});

describe('session-start — buildContextOutput', () => {
  const detections = { type: 'single-repo', pm: 'pnpm', framework: 'nextjs' };

  it('renders type, package manager and framework', () => {
    const out = buildContextOutput({}, detections, {}, null);
    expect(out).toContain('Type: single-repo');
    expect(out).toContain('PM: pnpm');
    expect(out).toContain('Framework: nextjs');
  });

  it('labels a session-resolved plan as Plan', () => {
    const out = buildContextOutput({}, {}, { path: '/p/plans/auth.md', resolvedBy: 'session' }, null);
    expect(out).toContain('Plan: auth.md');
  });

  it('labels a branch-matched plan as Suggested (a hint, not a directive)', () => {
    const out = buildContextOutput({}, {}, { path: '/p/plans/auth.md', resolvedBy: 'branch' }, null);
    expect(out).toContain('Suggested: auth.md');
  });

  it('omits the plan when it resolved by neither', () => {
    const out = buildContextOutput({}, detections, { path: '/p/x.md', resolvedBy: 'other' }, null);
    expect(out).not.toContain('x.md');
  });

  it('reports loaded memory and marks a cached load', () => {
    expect(buildContextOutput({}, {}, {}, { loaded: true, count: 3 })).toContain('Memory: 3 items');
    expect(buildContextOutput({}, {}, {}, { loaded: true, count: 3, cached: true }))
      .toContain('Memory: 3 items (cached)');
  });

  it('omits memory when it did not load', () => {
    expect(buildContextOutput({}, detections, {}, { loaded: false })).not.toContain('Memory');
  });

  it('returns an empty string when there is nothing to report', () => {
    expect(buildContextOutput({}, {}, {}, null)).toBe('');
  });
});

describe('session-start — listFiles', () => {
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-lf-'));
    fs.writeFileSync(path.join(dir, 'a.jsonl'), '');
    fs.writeFileSync(path.join(dir, 'b.json'), '');
    fs.writeFileSync(path.join(dir, 'c.md'), '');
  });
  afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

  it('returns only .json and .jsonl files, as full paths', () => {
    const out = listFiles(dir).map(f => path.basename(f)).sort();
    expect(out).toEqual(['a.jsonl', 'b.json']);
    expect(listFiles(dir).every(f => path.isAbsolute(f))).toBe(true);
  });

  it('is empty for a missing directory', () => {
    expect(listFiles(path.join(dir, 'nope'))).toEqual([]);
  });
});

describe('session-start — pruneJsonlByTimestamp', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-pr-')); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

  const write = (name, lines) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, lines.join('\n') + '\n');
    // Backdate mtime so the "recently written" fast path doesn't skip the prune.
    const old = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    fs.utimesSync(p, old, old);
    return p;
  };
  const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean) : null);

  const OLD_TS = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const NEW_TS = new Date().toISOString();
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;

  it('drops entries older than the cutoff and keeps newer ones', () => {
    const p = write('a.jsonl', [
      JSON.stringify({ ts: OLD_TS, v: 'old' }),
      JSON.stringify({ ts: NEW_TS, v: 'new' }),
    ]);
    pruneJsonlByTimestamp(p, cutoff);
    const kept = read(p);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toContain('new');
  });

  // Never silently destroy data the parser cannot read.
  it('keeps malformed lines', () => {
    const p = write('b.jsonl', ['{not json', JSON.stringify({ ts: OLD_TS, v: 'old' })]);
    pruneJsonlByTimestamp(p, cutoff);
    expect(read(p)).toEqual(['{not json']);
  });

  it('accepts timestamp, ts or lastUpdated as the time field', () => {
    for (const field of ['ts', 'timestamp', 'lastUpdated']) {
      const p = write(`${field}.jsonl`, [JSON.stringify({ [field]: OLD_TS, v: 'old' })]);
      pruneJsonlByTimestamp(p, cutoff);
      expect(read(p)).toBeNull(); // every line aged out → file removed
    }
  });

  it('does not throw on a missing file', () => {
    expect(() => pruneJsonlByTimestamp(path.join(dir, 'nope.jsonl'), cutoff)).not.toThrow();
  });
});
