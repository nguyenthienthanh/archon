'use strict';

/**
 * security-dir — one answer to "where does mcp-audit.jsonl live?".
 *
 * That path used to be hand-written in five places: the hook that writes the
 * log, the session-start sweep that prunes it, dashboard.sh that reads it,
 * new-plan.sh that creates it, and the auditor skill. Five spellings of one
 * path is how a store ends up split.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const resolveSecurityDir = require('../security-dir.cjs');
const { resolveMcpAuditFile, migrateLegacySecurityDir } = require('../security-dir.cjs');

let root;
let savedEnv;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-secdir-'));
  savedEnv = process.env.AF_SECURITY_DIR;
  delete process.env.AF_SECURITY_DIR;
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env.AF_SECURITY_DIR;
  else process.env.AF_SECURITY_DIR = savedEnv;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('resolveSecurityDir', () => {
  it('defaults to .aura/security — where every existing install has its log', () => {
    expect(resolveSecurityDir(root)).toBe(path.join(root, '.aura', 'security'));
  });

  it('prefers .claude/security when that directory exists', () => {
    fs.mkdirSync(path.join(root, '.claude', 'security'), { recursive: true });
    expect(resolveSecurityDir(root)).toBe(path.join(root, '.claude', 'security'));
  });

  it('honours AF_SECURITY_DIR over both, resolved to an absolute path', () => {
    fs.mkdirSync(path.join(root, '.claude', 'security'), { recursive: true });
    process.env.AF_SECURITY_DIR = path.join(root, 'elsewhere');
    expect(resolveSecurityDir(root)).toBe(path.join(root, 'elsewhere'));
  });

  it('resolveMcpAuditFile names the file inside the resolved dir', () => {
    expect(resolveMcpAuditFile(root))
      .toBe(path.join(root, '.aura', 'security', 'mcp-audit.jsonl'));
  });

  it('is exported both as the default and as a named function', () => {
    expect(require('../security-dir.cjs').resolveSecurityDir).toBe(resolveSecurityDir);
  });
});

describe('migrateLegacySecurityDir', () => {
  // Wired to nothing on purpose — relocating a security audit trail is a
  // maintainer decision. Tested so that turning it on later is a call, not a
  // rewrite.
  it('moves .aura/security to .claude/security when only the legacy dir exists', () => {
    const legacy = path.join(root, '.aura', 'security');
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, 'mcp-audit.jsonl'), '{"ts":"x"}\n');

    const res = migrateLegacySecurityDir(root);
    expect(res.migrated).toBe(true);
    expect(fs.existsSync(path.join(root, '.claude', 'security', 'mcp-audit.jsonl'))).toBe(true);
    expect(fs.existsSync(legacy)).toBe(false);
    expect(resolveSecurityDir(root)).toBe(path.join(root, '.claude', 'security'));
  });

  it('refuses when .claude/security already exists (never merges two logs)', () => {
    fs.mkdirSync(path.join(root, '.claude', 'security'), { recursive: true });
    fs.mkdirSync(path.join(root, '.aura', 'security'), { recursive: true });
    expect(migrateLegacySecurityDir(root).migrated).toBe(false);
    expect(fs.existsSync(path.join(root, '.aura', 'security'))).toBe(true);
  });

  it('is a no-op with nothing to migrate', () => {
    expect(migrateLegacySecurityDir(root).migrated).toBe(false);
  });

  it('does not move anything when the user pinned AF_SECURITY_DIR', () => {
    fs.mkdirSync(path.join(root, '.aura', 'security'), { recursive: true });
    process.env.AF_SECURITY_DIR = path.join(root, 'elsewhere');
    expect(migrateLegacySecurityDir(root).migrated).toBe(false);
    expect(fs.existsSync(path.join(root, '.aura', 'security'))).toBe(true);
  });
});

describe('the shell mirror agrees with the JS resolver', () => {
  const { spawnSync } = require('child_process');
  const LIB = path.join(__dirname, '..', '..', '..', 'scripts', 'plans', '_lib.sh');

  const shellSecurityDir = (cwd, env = {}) => spawnSync(
    'bash', ['-c', `. "${LIB}"; security_dir`],
    { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } },
  ).stdout.trim();

  it('both default to .aura/security', () => {
    expect(shellSecurityDir(root)).toBe('.aura/security');
    expect(resolveSecurityDir(root)).toBe(path.join(root, '.aura', 'security'));
  });

  it('both prefer .claude/security when it exists', () => {
    fs.mkdirSync(path.join(root, '.claude', 'security'), { recursive: true });
    expect(shellSecurityDir(root)).toBe('.claude/security');
    expect(resolveSecurityDir(root)).toBe(path.join(root, '.claude', 'security'));
  });

  it('both honour AF_SECURITY_DIR', () => {
    expect(shellSecurityDir(root, { AF_SECURITY_DIR: '/custom/sec' })).toBe('/custom/sec');
    process.env.AF_SECURITY_DIR = '/custom/sec';
    expect(resolveSecurityDir(root)).toBe('/custom/sec');
  });
});
