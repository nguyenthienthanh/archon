/**
 * P0-3 (TASK-00037) — check-path-safety.sh traversal + sibling-prefix fix.
 *
 * Two holes the audit verified:
 *   1. The candidate path was NOT canonicalized, so `..` segments dodged the
 *      two-`../` traversal regex.
 *   2. The allow-check compared against `"$REPO_ROOT"*` (no trailing slash),
 *      whitelisting siblings like `${REPO_ROOT}-evil`.
 *
 * Tests run the script with HOME overridden to a fixture subdir so the broad
 * `$HOME/*` sandbox does not mask the repo-prefix logic, and with the fixture
 * placed OUTSIDE /tmp + /var/tmp (under the project dir) so those hardcoded
 * sandboxes don't mask it either.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(process.cwd(), 'archon-os', 'scripts', 'preflight', 'check-path-safety.sh');

let base, repo, fakeHome;

function run(target) {
  return spawnSync('bash', [SCRIPT, target], {
    cwd: repo,
    env: { ...process.env, HOME: fakeHome },
    encoding: 'utf8',
  });
}

beforeAll(() => {
  base = fs.mkdtempSync(path.join(process.cwd(), '.pathsafety-'));
  repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(path.join(base, 'repo-evil'), { recursive: true });
  fakeHome = path.join(base, 'nohome');
  fs.mkdirSync(fakeHome);
});

afterAll(() => {
  try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
});

describe('check-path-safety — P0-3', () => {
  it('rejects a sibling dir sharing the repo prefix', () => {
    // ${base}/repo-evil/secret.txt string-prefix-matches ${base}/repo today → exit 0 (hole).
    const r = run(path.join(base, 'repo-evil', 'secret.txt'));
    expect(r.status).not.toBe(0);
  });

  it('rejects a single-level ../ that canonically escapes the repo', () => {
    const r = run('src/../../repo-evil/secret.txt');
    expect(r.status).not.toBe(0);
  });

  it('allows a legitimate in-repo path (no fail-open regression)', () => {
    const r = run(path.join(repo, 'src', 'a.txt'));
    expect(r.status).toBe(0);
  });

  it('allows a legitimate relative in-repo path', () => {
    const r = run('src/a.txt');
    expect(r.status).toBe(0);
  });

  it('still blocks absolute system paths', () => {
    const r = run('/etc/passwd');
    expect(r.status).toBe(2);
  });
});

describe('check-path-safety — credential dirs under $HOME', () => {
  // These live inside $HOME, and $HOME/* was a whitelisted sandbox — so the
  // most sensitive directory on the machine was the one the check approved.
  // The pre-canonicalization `~/.ssh/*` pattern caught only the already-
  // absolute, already-resolved spelling; every relative or `..` route past it
  // then landed in the $HOME sandbox and exited 0.
  const cred = (rel) => path.join(fakeHome, rel);

  it.each([
    '.ssh/id_rsa',
    '.ssh/config',
    '.aws/credentials',
    '.aws/config',
    '.gnupg/secring.gpg',
    '.config/gcloud/credentials.db',
    'Library/LaunchAgents/com.evil.plist',
  ])('blocks $HOME/%s by absolute path', (rel) => {
    expect(run(cred(rel)).status).toBe(2);
  });

  it.each([
    '.ssh',
    '.aws',
    '.gnupg',
  ])('blocks the $HOME/%s directory itself', (rel) => {
    expect(run(cred(rel)).status).toBe(2);
  });

  it('blocks a relative route into $HOME/.ssh that canonicalizes there', () => {
    // Run from inside the repo fixture; walk out and across into the fake home.
    const rel = path.relative(repo, cred('.ssh/id_rsa'));
    expect(rel).toMatch(/\.\./); // it really is a traversal
    expect(run(rel).status).toBe(2);
  });

  it('still allows an ordinary file elsewhere in $HOME', () => {
    expect(run(path.join(fakeHome, 'notes.txt')).status).toBe(0);
  });

  it('does not block a repo-local path that merely mentions .ssh', () => {
    expect(run(path.join(repo, 'src', 'ssh-docs.md')).status).toBe(0);
  });
});

describe('check-path-safety — --from-tool-args', () => {
  const withArgs = (json, env = {}) => spawnSync('bash', [SCRIPT, '--from-tool-args'], {
    cwd: repo,
    input: json,
    env: { ...process.env, HOME: fakeHome, ...env },
    encoding: 'utf8',
  });

  it('reads file_path out of the tool args', () => {
    expect(withArgs(JSON.stringify({ file_path: '/etc/passwd' })).status).toBe(2);
    expect(withArgs(JSON.stringify({ file_path: 'src/a.txt' })).status).toBe(0);
  });

  // A PATH holding only the few tools the fallback itself needs — so jq is
  // genuinely absent while sed/head still work.
  let noJqPath;
  beforeAll(() => {
    noJqPath = path.join(base, 'nojq-bin');
    fs.mkdirSync(noJqPath, { recursive: true });
    // bash/sh included so spawnSync can still resolve the interpreter itself
    // once PATH is narrowed to this directory.
    for (const tool of ['bash', 'sh', 'sed', 'head', 'cat']) {
      const real = spawnSync('/bin/sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).stdout.trim();
      if (real) fs.symlinkSync(real, path.join(noJqPath, tool));
    }
    // Guard the guard: if jq were reachable here the two tests below would pass
    // for the wrong reason.
    expect(spawnSync('/bin/sh', ['-c', 'command -v jq'], {
      encoding: 'utf8', env: { PATH: noJqPath },
    }).stdout.trim()).toBe('');
  });

  it('degrades loudly instead of passing silently when jq is missing', () => {
    // The fallback must still find the path AND say that it is a fallback — a
    // path check that quietly returns 0 reads as a clean bill of health.
    const noJq = withArgs(JSON.stringify({ file_path: '/etc/passwd' }), { PATH: noJqPath });
    expect(noJq.stderr).toMatch(/jq not found/);
    expect(noJq.status).toBe(2);
  });

  it('warns rather than passing when no path can be read at all', () => {
    const r = withArgs('{"unrelated":1}', { PATH: noJqPath });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not read a path/);
  });
});
