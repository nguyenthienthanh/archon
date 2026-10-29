/**
 * STORY-0022 — audit-refs.sh dead-file self-test.
 * The old dead-link regex truncated `rules/core/x.md` to `rules/core` (a dir
 * that exists) and reported it alive, so a deleted/moved file was never caught.
 * The new "Dead file references" check catches explicit-extension refs. This
 * runs the REAL script against a synthetic tree to prove it now fails on a dead
 * ref and passes on a live one — guarding the gate itself from regressing.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REAL_SCRIPT = path.join(process.cwd(), 'scripts', 'audit', 'audit-refs.sh');

// Build a minimal repo: a copy of audit-refs.sh + an archon-os/ tree with no
// rules/ or skills/ (so only the dead-file check can fail), plus a doc ref.
function buildFixture(refTarget, createTarget) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-'));
  const auditDir = path.join(root, 'scripts', 'audit');
  fs.mkdirSync(auditDir, { recursive: true });
  fs.copyFileSync(REAL_SCRIPT, path.join(auditDir, 'audit-refs.sh'));
  const af = path.join(root, 'archon-os');
  fs.mkdirSync(path.join(af, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(af, 'docs', 'note.md'), `See \`${refTarget}\` for details.\n`);
  if (createTarget) {
    const abs = path.join(af, refTarget);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '# real\n');
  }
  return { root, script: path.join(auditDir, 'audit-refs.sh') };
}

function run(script) {
  return spawnSync('bash', [script], { encoding: 'utf8' });
}

describe('audit-refs.sh dead-file check', () => {
  it('FAILS on a ref to a missing file with an extension', () => {
    const { root, script } = buildFixture('rules/core/ghost.md', false);
    const r = run(script);
    fs.rmSync(root, { recursive: true, force: true });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/DEAD FILE: rules\/core\/ghost\.md/);
  });

  it('PASSES when the referenced file exists', () => {
    const { root, script } = buildFixture('rules/core/real.md', true);
    const r = run(script);
    fs.rmSync(root, { recursive: true, force: true });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Reference integrity clean/);
  });

  it('SKIPS an allowlisted intentional-missing ref', () => {
    const { root, script } = buildFixture('scripts/reproduce-bug.sh', false);
    const r = run(script);
    fs.rmSync(root, { recursive: true, force: true });
    expect(r.status).toBe(0); // reproduce-bug.sh is a documented bisect example
  });

  it('SKIPS a doc template placeholder', () => {
    const { root, script } = buildFixture('docs/adr/ADR-NNN-description.md', false);
    const r = run(script);
    fs.rmSync(root, { recursive: true, force: true });
    expect(r.status).toBe(0);
  });
});
