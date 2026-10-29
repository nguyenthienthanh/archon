/**
 * P0-2 (TASK-00036) — workflow-edit-learn.cjs command-injection fix.
 *
 * The vulnerable path built a shell command string:
 *   execSync(`git show HEAD:${filePath}`)
 * with filePath scanned from repo directories. A filename containing shell
 * metacharacters executed arbitrary code at SessionStart. The fix routes the
 * git call through execFileSync (argv array — no shell), exposed as
 * gitShowHead() for testing.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const mod = require('../../archon-os/hooks/workflow-edit-learn.cjs');

describe('workflow-edit-learn — gitShowHead injection safety (P0-2)', () => {
  it('exports gitShowHead', () => {
    expect(typeof mod.gitShowHead).toBe('function');
  });

  it('does NOT execute shell metacharacters embedded in the path', () => {
    const sentinel = path.join(os.tmpdir(), `wel-pwned-${process.pid}-${Math.random().toString(36).slice(2)}`);
    try { fs.rmSync(sentinel, { force: true }); } catch {}
    // Under a shell (the old execSync), the $(...) substitution would run
    // `touch <sentinel>`. Through execFileSync it is a literal argv element.
    const evil = `nope$(touch ${sentinel}).md`;
    const out = mod.gitShowHead(evil, process.cwd());
    expect(fs.existsSync(sentinel)).toBe(false); // no shell → nothing executed
    expect(out).toBe('');                         // bad revision → empty string
    try { fs.rmSync(sentinel, { force: true }); } catch {}
  });

  it('returns file contents for a legitimate tracked path', () => {
    const out = mod.gitShowHead('package.json', process.cwd());
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('"name"');
  });

  it('returns empty string (not a throw) for an untracked path', () => {
    expect(mod.gitShowHead('does/not/exist/anywhere.xyz', process.cwd())).toBe('');
  });
});
