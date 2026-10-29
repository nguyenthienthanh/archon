/**
 * STORY-0023 — run-all.sh --files parsing.
 * `shift` inside `for arg in "$@"` did not advance the loop, so
 * `run-all.sh --quiet --files a.md` captured FILES="--files a.md" and tried to
 * lint a file literally named "--files". The while/shift rewrite consumes only
 * the real file tokens, regardless of flag order.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RUN_ALL = path.join(process.cwd(), 'archon-os', 'scripts', 'preflight', 'run-all.sh');

function mkFile(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-'));
  const p = path.join(dir, 'a.md');
  fs.writeFileSync(p, body);
  return { dir, p };
}
function run(args) {
  return spawnSync('bash', [RUN_ALL, ...args], { encoding: 'utf8' });
}

const VALID = '---\nname: x\ndescription: y\n---\n# body\n';

describe('run-all.sh --files parsing (flag order independent)', () => {
  it('--quiet BEFORE --files validates the real file, not a file named "--files"', () => {
    const { dir, p } = mkFile(VALID);
    const r = run(['--quiet', '--files', p]);
    fs.rmSync(dir, { recursive: true, force: true });
    // Old bug: FILES="--files <p>" → tried to open "--files" → exit 2 + noise.
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).not.toMatch(/--files/);
  });

  it('--files with two files after --quiet processes both', () => {
    const { dir, p } = mkFile(VALID);
    const p2 = path.join(dir, 'b.md');
    fs.writeFileSync(p2, VALID);
    const r = run(['--quiet', '--files', p, p2]);
    fs.rmSync(dir, { recursive: true, force: true });
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).not.toMatch(/--files/);
  });
});
