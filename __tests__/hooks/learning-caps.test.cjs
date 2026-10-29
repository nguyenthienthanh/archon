/**
 * Cap tests for the learning caches.
 *
 * Each of these maps/lists used to grow forever. For every cap the assertions
 * are the same two: the cap HOLDS after N+1 inserts, and the RIGHT entries
 * survive (the ones carrying the signal the feature exists to surface).
 */

const {
  trimPatternCounts,
  capPatternBlocks,
  MAX_PATTERN_BLOCKS,
  MAX_PATTERN_COUNTS,
} = require('../../archon-os/hooks/auto-learn.cjs');

const {
  trimKeyedMap,
  trimCache,
  MAP_MAX_KEYS,
  SUB_PATTERN_MAX_KEYS,
} = require('../../archon-os/hooks/smart-learn.cjs');

describe('auto-learn: cache.patterns cap', () => {
  it('holds the cap after N+1 inserts', () => {
    const patterns = {};
    for (let i = 0; i < MAX_PATTERN_COUNTS + 1; i++) patterns[`cat:rule${i}`] = 1;
    expect(Object.keys(trimPatternCounts(patterns)).length).toBe(MAX_PATTERN_COUNTS);
  });

  it('keeps the highest-count rules and drops the one-offs', () => {
    const patterns = { 'style:confirmed': 40, 'style:emerging': 7 };
    for (let i = 0; i < MAX_PATTERN_COUNTS; i++) patterns[`noise:rule${i}`] = 1;

    const trimmed = trimPatternCounts(patterns);
    expect(Object.keys(trimmed).length).toBe(MAX_PATTERN_COUNTS);
    expect(trimmed['style:confirmed']).toBe(40);
    expect(trimmed['style:emerging']).toBe(7);
  });

  it('leaves an under-cap map untouched', () => {
    const patterns = { a: 1, b: 2 };
    expect(trimPatternCounts(patterns)).toEqual({ a: 1, b: 2 });
  });

  it('does not throw on a missing/garbage map', () => {
    expect(trimPatternCounts(undefined)).toEqual({});
    expect(trimPatternCounts(null)).toEqual({});
  });

  it('respects an explicit smaller max', () => {
    const trimmed = trimPatternCounts({ a: 1, b: 9, c: 5 }, 2);
    expect(Object.keys(trimmed).sort()).toEqual(['b', 'c']);
  });
});

describe('auto-learn: learned-patterns.md block cap', () => {
  const header = '# Learned Patterns\n\nUpdated: now\n\n---\n\n';
  const block = (name, occurrences) =>
    `<!-- PATTERN:cat:${name} -->\n## cat: ${name}\n\n**Occurrences:** ${occurrences}\n**Latest:** why...\n\n---\n\n`;

  const countBlocks = (md) => (md.match(/<!-- PATTERN:/g) || []).length;

  it('holds the cap after N+1 blocks', () => {
    let md = header;
    for (let i = 0; i < MAX_PATTERN_BLOCKS + 1; i++) md += block(`r${i}`, 1);
    expect(countBlocks(md)).toBe(MAX_PATTERN_BLOCKS + 1);
    expect(countBlocks(capPatternBlocks(md))).toBe(MAX_PATTERN_BLOCKS);
  });

  it('keeps the most-confirmed rules and evicts the single-occurrence ones', () => {
    let md = header + block('confirmed', 99);
    for (let i = 0; i < MAX_PATTERN_BLOCKS; i++) md += block(`noise${i}`, 1);

    const capped = capPatternBlocks(md);
    expect(countBlocks(capped)).toBe(MAX_PATTERN_BLOCKS);
    expect(capped).toContain('<!-- PATTERN:cat:confirmed -->');
    expect(capped).toContain('**Occurrences:** 99');
  });

  it('preserves the header above the first marker', () => {
    let md = header;
    for (let i = 0; i < MAX_PATTERN_BLOCKS + 5; i++) md += block(`r${i}`, i);
    expect(capPatternBlocks(md).startsWith(header)).toBe(true);
  });

  it('keeps surviving blocks in original file order (diff-stable)', () => {
    const md = header + block('a', 5) + block('b', 1) + block('c', 4);
    const capped = capPatternBlocks(md, 2);
    expect(capped.indexOf('cat:a')).toBeLessThan(capped.indexOf('cat:c'));
    expect(capped).not.toContain('cat:b');
  });

  it('breaks ties toward the newer (later) block', () => {
    const md = header + block('older', 3) + block('newer', 3);
    const capped = capPatternBlocks(md, 1);
    expect(capped).toContain('cat:newer');
    expect(capped).not.toContain('cat:older');
  });

  it('is a no-op below the cap', () => {
    const md = header + block('a', 1);
    expect(capPatternBlocks(md)).toBe(md);
  });

  it('does not throw on empty or marker-free content', () => {
    expect(capPatternBlocks('')).toBe('');
    expect(capPatternBlocks(header)).toBe(header);
  });
});

describe('smart-learn: keyed-map caps', () => {
  it('holds the cap after N+1 inserts', () => {
    const map = {};
    for (let i = 0; i < MAP_MAX_KEYS + 1; i++) map[`cmd${i}`] = { count: 1 };
    expect(Object.keys(trimKeyedMap(map, MAP_MAX_KEYS)).length).toBe(MAP_MAX_KEYS);
  });

  it('keeps the highest-count commands', () => {
    const map = { 'npm test': { count: 50 } };
    for (let i = 0; i < MAP_MAX_KEYS; i++) map[`oneoff${i}`] = { count: 1 };

    const trimmed = trimKeyedMap(map, MAP_MAX_KEYS);
    expect(Object.keys(trimmed).length).toBe(MAP_MAX_KEYS);
    expect(trimmed['npm test']).toEqual({ count: 50 });
  });

  it('breaks count ties toward the more recent lastSuccess', () => {
    const map = {
      stale: { count: 1, lastSuccess: 1 },
      fresh: { count: 1, lastSuccess: 9999 },
    };
    expect(Object.keys(trimKeyedMap(map, 1))).toEqual(['fresh']);
  });

  it('does not throw on garbage input', () => {
    expect(trimKeyedMap(undefined, 5)).toEqual({});
    expect(trimKeyedMap({ a: null }, 5)).toEqual({ a: null });
  });
});

describe('smart-learn: trimCache applies every cap', () => {
  const buildOversizedCache = () => {
    const cache = { filePatterns: {}, codePatterns: {}, bashPatterns: {}, successfulActions: [] };
    for (let i = 0; i < MAP_MAX_KEYS + 5; i++) {
      cache.filePatterns[`.ext${i}`] = { successCount: 1, patterns: {} };
      cache.codePatterns[`type${i}`] = { count: 1 };
      cache.bashPatterns[`cmd${i}`] = { count: 1 };
    }
    for (let i = 0; i < 500; i++) cache.successfulActions.push({ i });
    return cache;
  };

  it('caps all three maps and the action list', () => {
    const cache = trimCache(buildOversizedCache());
    expect(Object.keys(cache.filePatterns).length).toBe(MAP_MAX_KEYS);
    expect(Object.keys(cache.codePatterns).length).toBe(MAP_MAX_KEYS);
    expect(Object.keys(cache.bashPatterns).length).toBe(MAP_MAX_KEYS);
    expect(cache.successfulActions.length).toBe(200);
  });

  it('keeps the newest successful actions', () => {
    const cache = trimCache(buildOversizedCache());
    expect(cache.successfulActions[cache.successfulActions.length - 1]).toEqual({ i: 499 });
  });

  it('caps the per-extension sub-pattern map too', () => {
    const cache = { filePatterns: { '.ts': { successCount: 1, patterns: {} } } };
    for (let i = 0; i < SUB_PATTERN_MAX_KEYS + 10; i++) {
      cache.filePatterns['.ts'].patterns[`style:p${i}`] = { count: 1 };
    }
    trimCache(cache);
    expect(Object.keys(cache.filePatterns['.ts'].patterns).length).toBe(SUB_PATTERN_MAX_KEYS);
  });

  it('keeps the busiest extension when the outer map overflows', () => {
    const cache = { filePatterns: { '.ts': { successCount: 999, patterns: {} } } };
    for (let i = 0; i < MAP_MAX_KEYS; i++) {
      cache.filePatterns[`.x${i}`] = { successCount: 1, patterns: {} };
    }
    trimCache(cache);
    expect(cache.filePatterns['.ts']).toBeDefined();
    expect(Object.keys(cache.filePatterns).length).toBe(MAP_MAX_KEYS);
  });

  it('does not throw on an empty cache', () => {
    expect(() => trimCache({})).not.toThrow();
  });
});
