/**
 * Throttling tests for archon-os/hooks/lint-autofix.cjs
 *
 * The hook fires on EVERY Write|Edit and used to re-probe every linter, re-lint
 * unchanged files, and let concurrent Writes stack linter processes. These
 * assert the three bounds that now stop that.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let hook;
let prevProjectRoot;

beforeEach(() => {
  prevProjectRoot = process.env.AF_PROJECT_ROOT;
  jest.resetModules();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'af-lint-throttle-'));
  process.env.AF_PROJECT_ROOT = tmpRoot;
  hook = require('../../archon-os/hooks/lint-autofix.cjs');
});

afterEach(() => {
  // Restore rather than delete — AF_PROJECT_ROOT may be set ambiently, and
  // other suites in this worker rely on it.
  if (prevProjectRoot === undefined) delete process.env.AF_PROJECT_ROOT;
  else process.env.AF_PROJECT_ROOT = prevProjectRoot;
  jest.restoreAllMocks();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const writeFile = (name, content) => {
  const p = path.join(tmpRoot, name);
  fs.writeFileSync(p, content);
  return p;
};

describe('lint-autofix: per-linter timeout', () => {
  it('is well under the old 30s-per-linter budget', () => {
    expect(hook.LINTER_TIMEOUT_MS).toBeLessThanOrEqual(15000);
    expect(hook.LINTER_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe('lint-autofix: debounce', () => {
  it('does not debounce a file it has never seen', () => {
    const p = writeFile('a.ts', 'const a = 1;\n');
    expect(hook.isDebounced(p)).toBe(false);
  });

  it('debounces a file whose content is unchanged since the last lint', () => {
    const p = writeFile('a.ts', 'const a = 1;\n');
    hook.recordLinted(p);
    expect(hook.isDebounced(p)).toBe(true);
  });

  it('stops debouncing once the content changes', () => {
    const p = writeFile('a.ts', 'const a = 1;\n');
    hook.recordLinted(p);
    fs.writeFileSync(p, 'const a = 2;\n');
    expect(hook.isDebounced(p)).toBe(false);
  });

  it('records the POST-lint content, so a formatter rewrite still debounces', () => {
    const p = writeFile('a.ts', 'const a=1\n');
    fs.writeFileSync(p, 'const a = 1;\n'); // simulate the fixer rewriting it
    hook.recordLinted(p);
    expect(hook.isDebounced(p)).toBe(true);
  });

  it('does not throw or debounce for a missing file', () => {
    const p = path.join(tmpRoot, 'nope.ts');
    expect(() => hook.isDebounced(p)).not.toThrow();
    expect(hook.isDebounced(p)).toBe(false);
  });

  describe('cap', () => {
    const buildEntries = (n) => {
      const files = {};
      for (let i = 0; i < n; i++) files[`/f${i}.ts`] = { hash: `h${i}`, ts: i };
      return files;
    };

    it('holds the cap after N+1 inserts', () => {
      const trimmed = hook.trimDebounceEntries(buildEntries(hook.DEBOUNCE_MAX_ENTRIES + 1));
      expect(Object.keys(trimmed).length).toBe(hook.DEBOUNCE_MAX_ENTRIES);
    });

    it('keeps the most recently linted files', () => {
      const files = buildEntries(hook.DEBOUNCE_MAX_ENTRIES + 5);
      const trimmed = hook.trimDebounceEntries(files);
      const newest = hook.DEBOUNCE_MAX_ENTRIES + 4;
      expect(trimmed[`/f${newest}.ts`]).toBeDefined();
      expect(trimmed['/f0.ts']).toBeUndefined();
    });

    it('is a no-op below the cap', () => {
      const files = buildEntries(3);
      expect(hook.trimDebounceEntries(files)).toEqual(files);
    });

    it('survives entries with no timestamp', () => {
      const files = { '/a.ts': { hash: 'x' }, '/b.ts': { hash: 'y', ts: 99 } };
      expect(Object.keys(hook.trimDebounceEntries(files, 1))).toEqual(['/b.ts']);
    });

    it('the on-disk cache stays capped after N+1 recordLinted calls', () => {
      const over = hook.DEBOUNCE_MAX_ENTRIES + 3;
      for (let i = 0; i < over; i++) {
        hook.recordLinted(writeFile(`f${i}.ts`, `const a = ${i};\n`));
      }
      const onDisk = JSON.parse(
        fs.readFileSync(path.join(tmpRoot, '.claude', 'cache', 'lint-debounce.json'), 'utf-8')
      );
      expect(Object.keys(onDisk.files).length).toBe(hook.DEBOUNCE_MAX_ENTRIES);
      // The last file written is the one that must still be debounced.
      expect(hook.isDebounced(path.join(tmpRoot, `f${over - 1}.ts`))).toBe(true);
    });
  });
});

describe('lint-autofix: availability cache', () => {
  // The memo is the thing that stops `which` running up to 7x per Write, so
  // prove a second call never re-probes: delete the on-disk cache underneath it
  // and confirm the answer still comes back without the file being rebuilt.
  it('answers a repeated query from the process memo without re-probing', () => {
    const cacheFile = path.join(tmpRoot, '.claude', 'cache', 'lint-availability.json');
    const first = hook.isLinterAvailable('gofmt');
    expect(fs.existsSync(cacheFile)).toBe(true);

    fs.unlinkSync(cacheFile);
    expect(hook.isLinterAvailable('gofmt')).toBe(first);
    expect(fs.existsSync(cacheFile)).toBe(false);
  });

  it('reloads a verdict from disk in a fresh process (cold memo)', () => {
    hook.isLinterAvailable('gofmt');
    jest.resetModules();
    const reloaded = require('../../archon-os/hooks/lint-autofix.cjs');
    const cacheFile = path.join(tmpRoot, '.claude', 'cache', 'lint-availability.json');
    const before = fs.statSync(cacheFile).mtimeMs;
    reloaded.isLinterAvailable('gofmt');
    // Served from disk — no re-probe, so no rewrite.
    expect(fs.statSync(cacheFile).mtimeMs).toBe(before);
  });

  it('persists the verdict keyed by cwd + a manifest fingerprint', () => {
    hook.isLinterAvailable('eslint');
    const cache = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, '.claude', 'cache', 'lint-availability.json'), 'utf-8')
    );
    expect(cache.cwd).toBe(process.cwd());
    expect(typeof cache.probeHash).toBe('string');
    expect(cache.probeHash.length).toBeGreaterThan(0);
    expect(typeof cache.linters.eslint).toBe('boolean');
  });

  it('the fingerprint changes when a watched manifest changes', () => {
    const cwd = tmpRoot;
    const before = hook.computeProbeHash(cwd);
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ devDependencies: { eslint: '9' } }));
    expect(hook.computeProbeHash(cwd)).not.toBe(before);
  });

  it('the fingerprint is stable when nothing changes', () => {
    expect(hook.computeProbeHash(tmpRoot)).toBe(hook.computeProbeHash(tmpRoot));
  });

  it('still reports false for an unknown linter', () => {
    expect(hook.isLinterAvailable('not-a-real-linter')).toBe(false);
  });
});
