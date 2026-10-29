'use strict';

/**
 * json-toon-projector.cjs — collectRecentJson, the bounded .claude/logs scan.
 *
 * This runs on a hot path (PostToolUse for every Read | mcp__.*), so the point
 * of these tests is the BOUNDS: depth limit, candidate cap, size floor+ceiling,
 * the 60s recency window, stale-directory pruning, and exactly one statSync per
 * entry (three copies of a huge JSON is the cost we are avoiding).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { collectRecentJson } = require('../../archon-os/hooks/json-toon-projector.cjs');

let root;
const NOW = Date.now();
const BIG = 'x'.repeat(4000);

/** Write a .json file of at least `bytes`, with an explicit mtime age. */
function writeJson(relPath, { ageMs = 0, bytes = 4000 } = {}) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const pad = 'x'.repeat(Math.max(0, bytes - 20));
  fs.writeFileSync(abs, JSON.stringify({ pad }));
  const t = new Date(NOW - ageMs);
  fs.utimesSync(abs, t, t);
  return abs;
}

/** Backdate a directory's mtime so the prune path is exercised. */
function ageDir(relPath, ageMs) {
  const t = new Date(NOW - ageMs);
  fs.utimesSync(path.join(root, relPath), t, t);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-toon-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('collectRecentJson', () => {
  it('returns a recent, big-enough JSON file', () => {
    writeJson('a.json', { ageMs: 1000 });
    const out = collectRecentJson(root, { now: NOW });
    expect(out).toHaveLength(1);
    expect(path.basename(out[0].p)).toBe('a.json');
    expect(out[0].s).toBeGreaterThan(2000);
  });

  it('skips files older than the 60s window', () => {
    writeJson('old.json', { ageMs: 120_000 });
    expect(collectRecentJson(root, { now: NOW })).toEqual([]);
  });

  it('skips files below the size floor', () => {
    writeJson('tiny.json', { ageMs: 1000, bytes: 50 });
    expect(collectRecentJson(root, { now: NOW })).toEqual([]);
  });

  it('skips files above the size ceiling instead of triple-copying them', () => {
    writeJson('huge.json', { ageMs: 1000, bytes: 40_000 });
    expect(collectRecentJson(root, { now: NOW, maxBytes: 10_000 })).toEqual([]);
    // ...and would have taken it without the cap.
    expect(collectRecentJson(root, { now: NOW, maxBytes: 100_000 })).toHaveLength(1);
  });

  it('ignores non-.json files', () => {
    const abs = path.join(root, 'a.log');
    fs.writeFileSync(abs, BIG);
    fs.utimesSync(abs, new Date(NOW), new Date(NOW));
    expect(collectRecentJson(root, { now: NOW })).toEqual([]);
  });

  it('sorts newest first', () => {
    writeJson('older.json', { ageMs: 30_000 });
    writeJson('newer.json', { ageMs: 1_000 });
    const out = collectRecentJson(root, { now: NOW });
    expect(out.map(x => path.basename(x.p))).toEqual(['newer.json', 'older.json']);
  });

  describe('bounds', () => {
    it('does not descend past maxDepth', () => {
      writeJson('d1/d2/d3/deep.json', { ageMs: 1000 });
      expect(collectRecentJson(root, { now: NOW, maxDepth: 1 })).toEqual([]);
      expect(collectRecentJson(root, { now: NOW, maxDepth: 5 })).toHaveLength(1);
    });

    it('stops collecting at maxCandidates', () => {
      for (let i = 0; i < 10; i++) writeJson(`f${i}.json`, { ageMs: 1000 });
      expect(collectRecentJson(root, { now: NOW, maxCandidates: 3 })).toHaveLength(3);
    });

    it('prunes directories whose mtime is beyond the grace window', () => {
      writeJson('archive/recent.json', { ageMs: 1000 });
      ageDir('archive', 48 * 60 * 60 * 1000);
      // Pruned: the stale dir is never descended into.
      expect(collectRecentJson(root, { now: NOW, pruneGraceMs: 60_000 })).toEqual([]);
      // With the real 24h grace the same dir would still be pruned...
      expect(collectRecentJson(root, { now: NOW })).toEqual([]);
    });

    it('does NOT prune a fresh directory (in-place appends stay findable)', () => {
      writeJson('live/recent.json', { ageMs: 1000 });
      ageDir('live', 60 * 60 * 1000); // 1h old dir, within the 24h grace
      expect(collectRecentJson(root, { now: NOW })).toHaveLength(1);
    });
  });

  it('calls statSync exactly once per visited entry', () => {
    writeJson('sub/a.json', { ageMs: 1000 });
    writeJson('sub/b.json', { ageMs: 1000 });
    const spy = jest.spyOn(fs, 'statSync');
    collectRecentJson(root, { now: NOW });
    // 3 entries visited: the `sub` dir + its 2 files. One stat each — the bug
    // was two stats per file (one for mtime, one for size).
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });

  it('is resilient to an unreadable root (fail-open, returns [])', () => {
    expect(collectRecentJson(path.join(root, 'does-not-exist'), { now: NOW })).toEqual([]);
  });
});
