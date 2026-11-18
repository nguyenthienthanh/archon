/**
 * Tests for archon-os/scripts/quality/diff-smells.cjs — the deterministic
 * (zero-model) enforcement of rules/core/simplicity-over-complexity.md and
 * rules/core/code-quality.md. Every smell is tested at both ends: a clean diff
 * gives 0 findings, a dirty one gives exactly the expected finding.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const CLI = path.join(__dirname, '../quality/diff-smells.cjs');

function makeRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-smells-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  write(dir, files);
  git('add', '-A');
  git('commit', '-q', '-m', 'base', '--allow-empty');
  return dir;
}

function write(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
}

function scan(dir, args = []) {
  const r = spawnSync('node', [CLI, '--json', ...args], { cwd: dir, encoding: 'utf8' });
  let out = null;
  try { out = JSON.parse(r.stdout); } catch { /* asserted below */ }
  return { status: r.status, out, stderr: r.stderr };
}

const smells = (out) => out.findings.map((f) => f.smell).sort();

describe('diff-smells — clean diff', () => {
  it('reports 0 findings and exits 0 when nothing smells', () => {
    const dir = makeRepo({ 'src/a.js': 'const x = 1;\nmodule.exports = { x };\n', 'src/b.js': "const { x } = require('./a');\n" });
    write(dir, { 'src/a.js': 'const x = 2;\nmodule.exports = { x };\n' });
    const r = scan(dir);
    expect(r.out).not.toBeNull();
    expect(r.out.findings).toEqual([]);
    expect(r.status).toBe(0);
  });

  it('exits 2 outside a git repo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-smells-nogit-'));
    expect(scan(dir).status).toBe(2);
  });
});

describe('diff-smells — user-path', () => {
  it('flags an added /Users/<name>/ path with file:line', () => {
    const dir = makeRepo({ 'src/a.js': '\n' });
    write(dir, { 'src/a.js': "\nconst CFG = '/Users/alice/projects/cfg.json';\n" });
    const r = scan(dir);
    expect(smells(r.out)).toEqual(['user-path']);
    expect(r.out.findings[0]).toMatchObject({ file: 'src/a.js', line: 2 });
    expect(r.status).toBe(1);
  });

  it('does not flag a placeholder path or a test fixture', () => {
    const dir = makeRepo({ 'src/a.js': '\n' });
    write(dir, {
      'src/a.js': "const p = '/Users/<you>/x'; const q = `${HOME}/x`;\n",
      '__tests__/a.test.js': "const p = '/home/bob/fixture';\n",
    });
    expect(scan(dir).out.findings).toEqual([]);
  });
});

describe('diff-smells — adhoc-schedule', () => {
  it('flags setInterval / crontab / launchctl in new code, including untracked files', () => {
    const dir = makeRepo({ 'src/keep.js': '\n' });
    write(dir, {
      'src/poll.js': 'setInterval(check, 5000);\n',
      'scripts/install.sh': 'echo "0 * * * * run" | crontab -\nlaunchctl load ~/Library/LaunchAgents/x.plist\n',
    });
    const found = scan(dir).out.findings.filter((f) => f.smell === 'adhoc-schedule');
    expect(found.map((f) => f.file).sort()).toEqual(['scripts/install.sh', 'scripts/install.sh', 'src/poll.js']);
  });

  it('does not flag the file that declares itself the scheduler seam', () => {
    const dir = makeRepo({ 'src/keep.js': '\n' });
    write(dir, { 'src/scheduler.js': '// archon:scheduler-seam\nsetInterval(tick, 1000);\n' });
    expect(scan(dir).out.findings.filter((f) => f.smell === 'adhoc-schedule')).toEqual([]);
  });
});

describe('diff-smells — dup-literal', () => {
  it('flags the same magic number added in two different files', () => {
    const dir = makeRepo({ 'src/keep.js': '\n' });
    write(dir, {
      'src/a.js': 'const timeout = 86400;\nmodule.exports = { timeout };\n',
      'src/b.js': "const ttl = 86400;\nrequire('./a');\nmodule.exports = { ttl };\n",
      'src/c.js': "require('./b');\n",
    });
    const dup = scan(dir).out.findings.filter((f) => f.smell === 'dup-literal');
    expect(dup).toHaveLength(1);
    expect(dup[0].evidence).toContain('86400');
    expect(dup[0].files.sort()).toEqual(['src/a.js', 'src/b.js']);
  });

  it('ignores literals in comments and year-like numbers (review #5)', () => {
    const dir = makeRepo({ 'src/keep.js': '\n' });
    write(dir, {
      'src/a.js': '// updated 2026-11-18, retries 4000\nconst y = 2026;\n',
      'src/b.js': '# updated 2026-11-18\nconst t = 4000; // was 4000 in the old code\nconst z = 2026;\n',
    });
    expect(scan(dir).out.findings.filter((f) => f.smell === 'dup-literal')).toEqual([]);
  });

  it('parses paths under diff.noprefix and with spaces (review #6)', () => {
    const dir = makeRepo({ 'src/my file.js': '\n' });
    execFileSync('git', ['config', 'diff.noprefix', 'true'], { cwd: dir });
    write(dir, { 'src/my file.js': "\nconst p = '/Users/alice/x';\n" });
    expect(scan(dir).out.findings).toEqual([expect.objectContaining({ smell: 'user-path', file: 'src/my file.js', line: 2 })]);
  });

  it('ignores a literal repeated in one file, common numbers, and require paths', () => {
    const dir = makeRepo({ 'src/keep.js': '\n' });
    write(dir, {
      'src/a.js': "const lib = require('./lib/hook-runtime.cjs');\nconst a = 100; const b = 86400; const c = 86400;\n",
      'src/b.js': "const lib = require('./lib/hook-runtime.cjs');\nconst d = 100;\n",
    });
    expect(scan(dir).out.findings.filter((f) => f.smell === 'dup-literal')).toEqual([]);
  });
});

describe('diff-smells — dead-export', () => {
  it('flags a newly exported name that nothing references', () => {
    const dir = makeRepo({ 'src/keep.js': '\n' });
    write(dir, { 'src/util.js': 'function usedHelper() {}\nfunction neverCalledHelper() {}\nmodule.exports = { usedHelper, neverCalledHelper };\n', 'src/main.js': "const { usedHelper } = require('./util');\nusedHelper();\n" });
    const dead = scan(dir).out.findings.filter((f) => f.smell === 'dead-export');
    expect(dead.map((f) => f.evidence)).toEqual(['neverCalledHelper']);
  });

  it('does not treat config-object keys with literal values as exported names', () => {
    const dir = makeRepo({ 'src/keep.js': '\n' });
    write(dir, { 'jest.config.cjs': "module.exports = {\n  testEnvironment: 'node',\n  maxWorkers: '50%',\n  roots: ['<rootDir>'],\n};\n" });
    expect(scan(dir).out.findings.filter((f) => f.smell === 'dead-export')).toEqual([]);
  });

  it('still counts `name: identifier` entries as exports', () => {
    const dir = makeRepo({ 'src/keep.js': '\n' });
    write(dir, { 'src/u.js': 'function impl() {}\nmodule.exports = { publicName: impl };\n' });
    const dead = scan(dir).out.findings.filter((f) => f.smell === 'dead-export');
    expect(dead.map((f) => f.evidence)).toEqual(['publicName']);
  });

  it('matches whole words, not prefixes (composeMusic vs composeMusicPlan)', () => {
    const dir = makeRepo({ 'src/keep.js': '\n' });
    write(dir, { 'src/m.js': 'export function composeMusic() {}\n', 'src/n.js': "import { composeMusicPlan } from './p';\n" });
    const dead = scan(dir).out.findings.filter((f) => f.smell === 'dead-export');
    expect(dead.map((f) => f.evidence)).toEqual(['composeMusic']);
  });
});

describe('diff-smells — large output through a pipe', () => {
  it('is not truncated at the 64 KB pipe buffer (process.exit used to cut stdout)', () => {
    const files = {};
    for (let i = 0; i < 800; i++) files[`src/f${i}.js`] = `const p${i} = '/Users/alice/project/some/long/path/segment/number/${i}';\n`;
    const dir = makeRepo({ 'src/keep.js': '\n' });
    write(dir, files);
    // A real shell pipe: the reader (cat) is slower than spawnSync's own drain.
    const r = spawnSync('sh', ['-c', `node "${CLI}" --json | cat`], { cwd: dir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    expect(r.stdout.length).toBeGreaterThan(65536);
    expect(JSON.parse(r.stdout).findings.filter((f) => f.smell === 'user-path')).toHaveLength(800);
  });
});

describe('diff-smells — --all scans the whole tree', () => {
  it('reports committed debt only with --all', () => {
    const dir = makeRepo({ 'src/a.js': "const CFG = '/Users/alice/cfg';\n" });
    expect(scan(dir).out.findings).toEqual([]);
    expect(smells(scan(dir, ['--all']).out)).toEqual(['user-path']);
  });
});
