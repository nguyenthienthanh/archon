/**
 * Cap test for af-learning's local pattern store.
 *
 * recordPattern() used to `allPatterns.push(...)` with no slice, unlike its
 * siblings (feedback -500, workflow events -1000) — and updateLearnedRulesMD()
 * renders the whole list on every call. This asserts the cap now holds and that
 * a brand-new pattern (frequency 1) survives the trim that saves it.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let learning;
let LOCAL_PATTERNS_FILE;
let prevProjectRoot;

beforeEach(() => {
  prevProjectRoot = process.env.AF_PROJECT_ROOT;
  jest.resetModules();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'af-learning-caps-'));
  // AF_PROJECT_ROOT short-circuits findProjectRoot(), sandboxing every path
  // af-learning resolves at module load.
  process.env.AF_PROJECT_ROOT = tmpRoot;

  // Force local mode (no Supabase) so recordPattern hits the local store.
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  process.env.AF_LEARNING_ENABLED = 'true';

  learning = require('../af-learning.cjs');
  LOCAL_PATTERNS_FILE = learning.LOCAL_PATTERNS_FILE;
});

afterEach(() => {
  jest.restoreAllMocks();
  // Restore rather than delete — AF_PROJECT_ROOT may be set ambiently, and
  // other suites in this worker rely on it.
  if (prevProjectRoot === undefined) delete process.env.AF_PROJECT_ROOT;
  else process.env.AF_PROJECT_ROOT = prevProjectRoot;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const readPatterns = () => JSON.parse(fs.readFileSync(LOCAL_PATTERNS_FILE, 'utf-8'));

describe('af-learning local pattern cap', () => {
  it('exposes a finite cap', () => {
    expect(learning.MAX_LOCAL_PATTERNS).toBeGreaterThan(0);
    expect(Number.isFinite(learning.MAX_LOCAL_PATTERNS)).toBe(true);
  });

  it('holds the cap after N+1 inserts', async () => {
    const max = learning.MAX_LOCAL_PATTERNS;

    // Seed the store at exactly the cap, then record one more.
    const seeded = [];
    for (let i = 0; i < max; i++) {
      seeded.push({ id: `seed-${i}`, category: 'seed', description: `d${i}`, frequency: 1 });
    }
    learning.saveLocalFile(LOCAL_PATTERNS_FILE, seeded);

    await learning.recordPattern({
      type: 'code_style',
      category: 'new',
      description: 'the newest pattern',
      rule: 'newest',
      evidence: [],
    });

    expect(readPatterns().length).toBe(max);
  });

  it('keeps the just-recorded pattern and drops the oldest', async () => {
    const max = learning.MAX_LOCAL_PATTERNS;
    const seeded = [];
    for (let i = 0; i < max; i++) {
      seeded.push({ id: `seed-${i}`, category: 'seed', description: `d${i}`, frequency: 1 });
    }
    learning.saveLocalFile(LOCAL_PATTERNS_FILE, seeded);

    await learning.recordPattern({
      type: 'code_style',
      category: 'new',
      description: 'the newest pattern',
      rule: 'newest',
      evidence: [],
    });

    const after = readPatterns();
    expect(after[after.length - 1].description).toBe('the newest pattern');
    // Oldest seeded entry evicted, newest seeded entry retained.
    expect(after.some(p => p.description === 'd0')).toBe(false);
    expect(after.some(p => p.description === `d${max - 1}`)).toBe(true);
  });

  it('does not trim below the cap', async () => {
    await learning.recordPattern({
      type: 'code_style',
      category: 'new',
      description: 'only one',
      rule: 'only',
      evidence: [],
    });
    expect(readPatterns().length).toBe(1);
  });

  it('bounds the rendered markdown per category', () => {
    const max = learning.MAX_RENDERED_PATTERNS_PER_CATEGORY;
    const many = [];
    for (let i = 0; i < max + 20; i++) {
      many.push({ category: 'style', description: `pattern-${i}`, frequency: i, evidence: [] });
    }
    learning.saveLocalFile(LOCAL_PATTERNS_FILE, many);

    learning.updateLearnedRulesMD();
    const md = fs.readFileSync(learning.LEARNED_RULES_MD, 'utf-8');

    expect((md.match(/^### /gm) || []).length).toBe(max);
    // Highest-frequency survives, lowest does not.
    expect(md).toContain(`pattern-${max + 19}`);
    expect(md).not.toContain('### pattern-0\n');
  });
});
