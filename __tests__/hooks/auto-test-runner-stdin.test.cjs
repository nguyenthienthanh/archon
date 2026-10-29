/**
 * FEAT-007 / STORY-0009+0010 — auto-test-runner reads the edited file from stdin.
 * main() read process.env.CLAUDE_FILE_PATHS (never set) → auto-test-running
 * never fired. Now resolves from tool_input; module is require-safe for tests.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  resolveFilePath,
  isTestRelevant,
  localBin,
  detectTestRunner,
  acquireRunLock,
} = require('../../archon-os/hooks/auto-test-runner.cjs');

describe('auto-test-runner.resolveFilePath', () => {
  it('reads tool_input.file_path from stdin', () => {
    expect(resolveFilePath({ tool_input: { file_path: '/x.test.js' } })).toBe('/x.test.js');
  });
  it('reads tool_input.path', () => {
    expect(resolveFilePath({ tool_input: { path: '/y.spec.ts' } })).toBe('/y.spec.ts');
  });
  it('falls back to CLAUDE_FILE_PATHS env', () => {
    const prev = process.env.CLAUDE_FILE_PATHS;
    process.env.CLAUDE_FILE_PATHS = '/legacy.py';
    try { expect(resolveFilePath({})).toBe('/legacy.py'); }
    finally { if (prev === undefined) delete process.env.CLAUDE_FILE_PATHS; else process.env.CLAUDE_FILE_PATHS = prev; }
  });
  it('returns empty for no source', () => {
    const prev = process.env.CLAUDE_FILE_PATHS;
    delete process.env.CLAUDE_FILE_PATHS;
    try { expect(resolveFilePath({})).toBe(''); }
    finally { if (prev !== undefined) process.env.CLAUDE_FILE_PATHS = prev; }
  });
});

describe('auto-test-runner.isTestRelevant', () => {
  it('true for code extensions', () => {
    expect(isTestRelevant('a.ts')).toBe(true);
    expect(isTestRelevant('b.py')).toBe(true);
  });
  it('false for non-code', () => {
    expect(isTestRelevant('README.md')).toBe(false);
  });
});

/**
 * The hook fires on every Write/Edit, so its resource shape is the contract:
 * local binaries only (npx would fetch an unpinned major and leave a resident
 * wrapper), no worker fan-out, related tests only, and one run at a time.
 */
describe('auto-test-runner — resource discipline', () => {
  let dir, cwd;

  beforeEach(() => {
    cwd = process.cwd();
    // realpath: on macOS /var is a symlink to /private/var, so process.cwd()
    // (which the hook uses) would not match the mkdtemp path.
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'atr-')));
    process.chdir(dir);
  });
  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const seedPkg = (deps) =>
    fs.writeFileSync('package.json', JSON.stringify({ devDependencies: deps }));
  const seedBin = (name) => {
    const binDir = path.join(dir, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    const bin = path.join(binDir, name);
    fs.writeFileSync(bin, '#!/bin/sh\n', { mode: 0o755 });
    return bin;
  };

  it('localBin returns null when the runner is not installed', () => {
    expect(localBin('jest')).toBeNull();
  });

  it('localBin resolves an executable in node_modules/.bin', () => {
    const bin = seedBin('jest');
    expect(localBin('jest')).toBe(bin);
  });

  it('refuses to run jest when it is only a declared dep, never via npx', () => {
    seedPkg({ jest: '^29.7.0' });
    // No node_modules/.bin/jest — npx would download an unpinned jest here.
    expect(detectTestRunner('/x.js')).toBeFalsy();
  });

  it('runs jest in band, scoped to the edited file', () => {
    seedPkg({ jest: '^29.7.0' });
    const bin = seedBin('jest');
    const r = detectTestRunner('/repo/src/thing.js');
    expect(r.cmd).toBe(bin); // the binary itself, not a shell string
    expect(r.args).toContain('--runInBand'); // zero worker processes
    expect(r.args).toContain('--findRelatedTests');
    expect(r.args).toContain('/repo/src/thing.js');
  });

  it('runs vitest without a worker pool, scoped to the edited file', () => {
    seedPkg({ vitest: '^2.0.0' });
    seedBin('vitest');
    const r = detectTestRunner('/repo/src/thing.ts');
    expect(r.args).toContain('--no-file-parallelism');
    expect(r.args[0]).toBe('related');
    expect(r.args).toContain('/repo/src/thing.ts');
  });

  it('never returns a shell string — argv only, so a path cannot inject', () => {
    seedPkg({ jest: '^29.7.0' });
    seedBin('jest');
    const r = detectTestRunner('/tmp/a b; rm -rf /.js');
    expect(Array.isArray(r.args)).toBe(true);
    expect(r.args).toContain('/tmp/a b; rm -rf /.js');
    expect(r.cmd).not.toMatch(/\s/); // no embedded command line
  });

  it('has no npm-test fallback that would run the whole suite', () => {
    fs.writeFileSync('package.json', JSON.stringify({ scripts: { test: 'mocha' } }));
    expect(detectTestRunner('/x.js')).toBeFalsy();
  });

  describe('single-flight lock', () => {
    beforeEach(() => fs.mkdirSync(path.join(dir, '.claude'), { recursive: true }));

    it('lets one run in and turns the next away', () => {
      const release = acquireRunLock();
      expect(release).toBeInstanceOf(Function);
      expect(acquireRunLock()).toBeNull();
      release();
      const again = acquireRunLock();
      expect(again).toBeInstanceOf(Function);
      again();
    });

    it('breaks a lock whose holder is gone', () => {
      const lockFile = path.join(dir, '.claude', 'cache', '.auto-test-runner.lock');
      fs.mkdirSync(path.dirname(lockFile), { recursive: true });
      fs.writeFileSync(lockFile, '999999'); // a pid that does not exist
      const release = acquireRunLock();
      expect(release).toBeInstanceOf(Function);
      release();
    });
  });
});
