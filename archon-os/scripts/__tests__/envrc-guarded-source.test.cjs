'use strict';

/**
 * envrc-guarded-source.sh — the gate that stops a cloned repo's .envrc from
 * executing as the user on every SessionStart / PreToolUse / UserPromptSubmit.
 *
 * Driven end-to-end through a real shell: the interesting behaviour here is
 * sourcing, permission bits and temp-file handling, none of which survives being
 * unit-tested in isolation.
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'envrc-guarded-source.sh');

let dir;
let home;

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'af-envrc-')));
  home = path.join(dir, 'home');
  fs.mkdirSync(home, { recursive: true });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const writeEnvrc = (body, mode = 0o644) => {
  const p = path.join(dir, '.envrc');
  fs.writeFileSync(p, body);
  fs.chmodSync(p, mode);
  return p;
};

// `dirName` picks which config directory the approval is written to: v4 moved
// the trust file to ~/.config/archon/, and the gate still honours the pre-v4
// ~/.config/aura-frog/ so an upgrade does not revoke approvals the user made by
// hand. Both paths are exercised below.
const trust = (envrcPath, sha, dirName = 'archon') => {
  const cfg = path.join(home, '.config', dirName);
  fs.mkdirSync(cfg, { recursive: true });
  fs.writeFileSync(
    path.join(cfg, 'envrc-trust.json'),
    JSON.stringify({ [envrcPath]: { sha256: sha, approved_at: '2026-01-01T00:00:00Z' } }, null, 2),
  );
};

const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// Source the gate in `dir`, then report what it exported and what it printed.
function run(extraEnv = {}) {
  const out = execFileSync(
    'bash',
    ['-c', `. "${SCRIPT}"; echo "MARK:${'${ARCHON_TEST_VAR:-<unset>}'}"`],
    {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, HOME: home, TMPDIR: path.join(dir, 'tmp'), ...extraEnv },
    },
  );
  return out;
}

// stderr comes back separately so a warning can be asserted on its own.
function runFull(extraEnv = {}) {
  const res = require('child_process').spawnSync(
    'bash',
    ['-c', `. "${SCRIPT}"; echo "MARK:${'${ARCHON_TEST_VAR:-<unset>}'}"`],
    {
      cwd: dir,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: home, TMPDIR: path.join(dir, 'tmp'), ...extraEnv },
    },
  );
  return { stdout: res.stdout, stderr: res.stderr, status: res.status };
}

beforeEach(() => fs.mkdirSync(path.join(dir, 'tmp'), { recursive: true }));

describe('envrc-guarded-source — trust gate', () => {
  it('does nothing when there is no .envrc', () => {
    expect(runFull().stdout).toContain('MARK:<unset>');
  });

  it('sources an .envrc whose hash matches the trust file', () => {
    const p = writeEnvrc('export ARCHON_TEST_VAR=trusted\n');
    trust(p, sha256(p));
    const { stdout, stderr } = runFull();
    expect(stdout).toContain('MARK:trusted');
    expect(stderr).toBe('');
  });

  it('skips an .envrc with no trust entry, and says so once', () => {
    writeEnvrc('export ARCHON_TEST_VAR=untrusted\n');
    trust('/some/other/.envrc', 'deadbeef');
    const { stdout, stderr } = runFull();
    expect(stdout).toContain('MARK:<unset>');
    expect(stderr).toMatch(/not trusted/);
  });

  it('skips when the content changed after approval (hash mismatch)', () => {
    const p = writeEnvrc('export ARCHON_TEST_VAR=approved\n');
    trust(p, sha256(p));
    fs.writeFileSync(p, 'export ARCHON_TEST_VAR=tampered\n');
    expect(runFull().stdout).toContain('MARK:<unset>');
  });

  it('skips when there is no trust file at all', () => {
    writeEnvrc('export ARCHON_TEST_VAR=x\n');
    expect(runFull().stdout).toContain('MARK:<unset>');
  });

  // Every entry in the trust file is an .envrc a human approved by hand, so the
  // v4 move from ~/.config/aura-frog/ to ~/.config/archon/ must not revoke them.
  it('honours an approval left in the pre-v4 ~/.config/aura-frog trust file', () => {
    const p = writeEnvrc('export ARCHON_TEST_VAR=legacy\n');
    trust(p, sha256(p), 'aura-frog');
    const { stdout, stderr } = runFull();
    expect(stdout).toContain('MARK:legacy');
    expect(stderr).toBe('');
  });

  it('prefers the canonical trust file over the legacy one when both exist', () => {
    const p = writeEnvrc('export ARCHON_TEST_VAR=canonical\n');
    trust(p, sha256(p), 'archon');
    // A stale legacy entry must not be able to veto a current approval.
    trust('/some/other/.envrc', 'deadbeef', 'aura-frog');
    expect(runFull().stdout).toContain('MARK:canonical');
  });

  it('does not resurrect a revoked approval from the legacy file', () => {
    // Canonical file exists and omits this path — that IS the revocation. Falling
    // back here would undo it, which is why the fallback is "new file absent",
    // not "path not found in the new file".
    const p = writeEnvrc('export ARCHON_TEST_VAR=revoked\n');
    trust('/some/other/.envrc', 'deadbeef', 'archon');
    trust(p, sha256(p), 'aura-frog');
    expect(runFull().stdout).toContain('MARK:<unset>');
  });
});

describe('envrc-guarded-source — writability check', () => {
  it.each([
    ['group-writable', 0o664],
    ['world-writable', 0o646],
    ['both', 0o666],
  ])('refuses a %s .envrc even when the hash matches', (_label, mode) => {
    const p = writeEnvrc('export ARCHON_TEST_VAR=trusted\n', mode);
    trust(p, sha256(p));
    const { stdout, stderr } = runFull();
    expect(stdout).toContain('MARK:<unset>');
    expect(stderr).toMatch(/group\/world-writable/);
  });

  it('accepts an owner-only-writable .envrc', () => {
    const p = writeEnvrc('export ARCHON_TEST_VAR=trusted\n', 0o600);
    trust(p, sha256(p));
    expect(runFull().stdout).toContain('MARK:trusted');
  });
});

describe('envrc-guarded-source — snapshot (TOCTOU)', () => {
  it('leaves no temp copy behind after a successful source', () => {
    const p = writeEnvrc('export ARCHON_TEST_VAR=trusted\n');
    trust(p, sha256(p));
    runFull();
    expect(fs.readdirSync(path.join(dir, 'tmp')).filter(f => f.startsWith('af-envrc.'))).toEqual([]);
  });

  it('sources the private copy, not the live path', () => {
    // If the gate sourced $PWD/.envrc directly, BASH_SOURCE would end in
    // "/.envrc". It sources the mode-600 snapshot instead, so it does not.
    const p = writeEnvrc('export ARCHON_TEST_VAR="$(basename "$BASH_SOURCE")"\n');
    trust(p, sha256(p));
    const { stdout } = runFull();
    expect(stdout).toMatch(/MARK:archon-envrc\./);
  });
});

describe('envrc-guarded-source — ARCHON_ENVRC_UNSAFE_AUTO_SOURCE', () => {
  it('bypasses the gate but announces that it did', () => {
    writeEnvrc('export ARCHON_TEST_VAR=unverified\n');
    const { stdout, stderr } = runFull({ ARCHON_ENVRC_UNSAFE_AUTO_SOURCE: 'true' });
    expect(stdout).toContain('MARK:unverified');
    expect(stderr).toMatch(/SECURITY: envrc trust gate DISABLED via ARCHON_ENVRC_UNSAFE_AUTO_SOURCE/);
  });

  it('warns once per shell, not once per source', () => {
    writeEnvrc('export ARCHON_TEST_VAR=unverified\n');
    const res = require('child_process').spawnSync(
      'bash',
      ['-c', `. "${SCRIPT}"; . "${SCRIPT}"; . "${SCRIPT}"`],
      {
        cwd: dir,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH, HOME: home, TMPDIR: path.join(dir, 'tmp'),
          ARCHON_ENVRC_UNSAFE_AUTO_SOURCE: 'true',
        },
      },
    );
    expect(res.stderr.match(/gate DISABLED/g)).toHaveLength(1);
  });

  it('is inert for any value other than the literal "true"', () => {
    writeEnvrc('export ARCHON_TEST_VAR=unverified\n');
    const { stdout, stderr } = runFull({ ARCHON_ENVRC_UNSAFE_AUTO_SOURCE: '1' });
    expect(stdout).toContain('MARK:<unset>');
    expect(stderr).not.toMatch(/gate DISABLED/);
  });
});

// `run` is the simpler helper; keep one use so it is not dead code.
describe('envrc-guarded-source — exit behaviour', () => {
  it('never fails the sourcing shell', () => {
    writeEnvrc('export ARCHON_TEST_VAR=x\n');
    expect(() => run()).not.toThrow();
  });
});
