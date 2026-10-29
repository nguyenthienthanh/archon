/**
 * Tests for archon-os/hooks/tool-call-tracer.cjs
 *
 * The whole tracer used to run at module scope with process.exit() on require.
 * Restructured into a main() (FEAT-007 / issue #5), exposing the pure helpers.
 * main and append (process/file I/O keyed off env vars) stay unexported.
 *
 * NOTE: main() still reads CLAUDE_TOOL_* / CLAUDE_HOOK_PHASE env vars the hook
 * API does not set — migrating those to the stdin payload is STORY-0010 and
 * needs the exit-code/duration probe first. This change only makes the pure
 * helpers testable so that migration can land safely.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  resolveTaskFolder,
  cachedTaskFolder,
  resolveTracePaths,
  taskSlugOf,
  nextEventId,
  hashFileBounded,
  hash,
  extractReadPath,
} = require('../../archon-os/hooks/tool-call-tracer.cjs');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tct-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

describe('tool-call-tracer — hash', () => {
  it('is a 16-char hex digest, deterministic', () => {
    expect(hash('abc')).toBe(hash('abc'));
    expect(hash('abc')).toMatch(/^[0-9a-f]{16}$/);
  });
  it('treats null/undefined/empty as the same empty hash', () => {
    expect(hash(null)).toBe(hash(''));
    expect(hash(undefined)).toBe(hash(''));
  });
  it('differs for different input', () => {
    expect(hash('a')).not.toBe(hash('b'));
  });
});

describe('tool-call-tracer — taskSlugOf', () => {
  it('replaces runs of non-alphanumerics with a single dash', () => {
    expect(taskSlugOf('T2.3')).toBe('T2-3');
    expect(taskSlugOf('TASK/00042')).toBe('TASK-00042');
    expect(taskSlugOf('a  b__c')).toBe('a-b-c');
  });
  it('keeps a clean id unchanged', () => {
    expect(taskSlugOf('TASK00042')).toBe('TASK00042');
  });
  // The reason the slug exists: T2.3 and T23 must not collide.
  it('keeps distinct ids distinct', () => {
    expect(taskSlugOf('T2.3')).not.toBe(taskSlugOf('T23'));
  });
});

describe('tool-call-tracer — extractReadPath', () => {
  it('reads file_path from JSON args', () => {
    expect(extractReadPath('{"file_path":"/a/b.ts"}')).toBe('/a/b.ts');
  });
  it('falls back to path in JSON args', () => {
    expect(extractReadPath('{"path":"/a/c.ts"}')).toBe('/a/c.ts');
  });
  it('extracts from a non-JSON string via regex', () => {
    expect(extractReadPath('file_path: /a/d.ts more')).toBe('/a/d.ts');
  });
  it('is null for empty args', () => {
    expect(extractReadPath('')).toBeNull();
    expect(extractReadPath(null)).toBeNull();
  });
  it('is null when no path is present', () => {
    expect(extractReadPath('{"other":1}')).toBeNull();
    expect(extractReadPath('nothing here')).toBeNull();
  });
});

describe('tool-call-tracer — hashFileBounded', () => {
  it('hashes a small file to 16 hex chars', () => {
    const p = path.join(dir, 'f.txt');
    fs.writeFileSync(p, 'hello');
    expect(hashFileBounded(p)).toMatch(/^[0-9a-f]{16}$/);
  });
  it('is null for a missing file', () => {
    expect(hashFileBounded(path.join(dir, 'nope'))).toBeNull();
  });
  it('marks an oversize file instead of hashing it', () => {
    const p = path.join(dir, 'big.bin');
    fs.writeFileSync(p, Buffer.alloc(1024 * 1024 + 1));
    expect(hashFileBounded(p)).toMatch(/^oversize-\d+$/);
  });
});

describe('tool-call-tracer — nextEventId', () => {
  it('starts at 001 for a fresh counter and formats the id', () => {
    const cf = path.join(dir, '.count');
    expect(nextEventId(cf, 'TASK-1')).toBe('TR-TASK-1-001');
  });
  it('increments and persists across calls', () => {
    const cf = path.join(dir, '.count');
    expect(nextEventId(cf, 'X')).toBe('TR-X-001');
    expect(nextEventId(cf, 'X')).toBe('TR-X-002');
    expect(nextEventId(cf, 'X')).toBe('TR-X-003');
    expect(fs.readFileSync(cf, 'utf8')).toBe('3');
  });
  it('zero-pads to three digits', () => {
    const cf = path.join(dir, '.count');
    fs.writeFileSync(cf, '41');
    expect(nextEventId(cf, 'X')).toBe('TR-X-042');
  });
});

describe('tool-call-tracer — resolveTaskFolder / resolveTracePaths', () => {
  const seedTask = (id) => {
    const folder = path.join(dir, 'features', 'F', 'stories', 'S', 'tasks', `${id}_slug`);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'task.md'), `---\nid: ${id}\n---\n`);
    return folder;
  };

  it('finds the task folder by matching id: frontmatter', () => {
    const folder = seedTask('TASK-7');
    expect(resolveTaskFolder(dir, 'TASK-7')).toBe(folder);
  });
  it('is null when no task folder matches', () => {
    seedTask('TASK-7');
    expect(resolveTaskFolder(dir, 'TASK-NONE')).toBeNull();
  });
  it('is null when there is no features dir', () => {
    expect(resolveTaskFolder(path.join(dir, 'empty'), 'X')).toBeNull();
  });

  it('resolveTracePaths uses the co-located layout when the task folder exists', () => {
    const folder = seedTask('TASK-7');
    const { traceFile, counterFile } = resolveTracePaths(dir, 'TASK-7');
    expect(traceFile).toBe(path.join(folder, 'trace.jsonl'));
    expect(counterFile).toBe(path.join(folder, '.trace.count'));
  });

  it('resolveTracePaths falls back to a legacy traces/ dir (and creates it)', () => {
    const { traceFile, counterFile } = resolveTracePaths(dir, 'LEGACY-1');
    expect(traceFile).toBe(path.join(dir, 'traces', 'LEGACY-1.jsonl'));
    expect(counterFile).toBe(path.join(dir, 'traces', 'LEGACY-1.count'));
    expect(fs.existsSync(path.join(dir, 'traces'))).toBe(true);
  });
});

describe('tool-call-tracer — cachedTaskFolder (walk cache)', () => {
  const seedTask = (id) => {
    const folder = path.join(dir, 'features', 'F', 'stories', 'S', 'tasks', `${id}_slug`);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'task.md'), `---\nid: ${id}\n---\n`);
    return folder;
  };
  const cacheFile = () => path.join(dir, '.trace-folder-cache.json');

  it('writes the cache on first resolve and serves the hit without a walk', () => {
    const folder = seedTask('TASK-9');
    expect(cachedTaskFolder(dir, 'TASK-9')).toBe(folder);
    expect(JSON.parse(fs.readFileSync(cacheFile(), 'utf8'))['TASK-9']).toBe(folder);
    // Poison the tree: if the second call walked, it would find nothing.
    fs.rmSync(path.join(dir, 'features'), { recursive: true, force: true });
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'task.md'), '---\nid: OTHER\n---\n');
    expect(cachedTaskFolder(dir, 'TASK-9')).toBe(folder);
  });

  it('re-walks when the cached folder no longer holds a task.md', () => {
    const folder = seedTask('TASK-9');
    expect(cachedTaskFolder(dir, 'TASK-9')).toBe(folder);
    fs.rmSync(folder, { recursive: true, force: true });
    const moved = path.join(dir, 'features', 'F2', 'stories', 'S', 'tasks', 'TASK-9_slug');
    fs.mkdirSync(moved, { recursive: true });
    fs.writeFileSync(path.join(moved, 'task.md'), '---\nid: TASK-9\n---\n');
    expect(cachedTaskFolder(dir, 'TASK-9')).toBe(moved);
    expect(JSON.parse(fs.readFileSync(cacheFile(), 'utf8'))['TASK-9']).toBe(moved);
  });

  it('tolerates a corrupt cache file', () => {
    const folder = seedTask('TASK-9');
    fs.writeFileSync(cacheFile(), '{not json');
    expect(cachedTaskFolder(dir, 'TASK-9')).toBe(folder);
  });

  it('returns null (and caches nothing) for an unknown task', () => {
    seedTask('TASK-9');
    expect(cachedTaskFolder(dir, 'TASK-NONE')).toBeNull();
  });
});
