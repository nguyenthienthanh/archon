/**
 * STORY-0023 — phase-transition.sh atomic state write.
 * The 7 jq writes used a fixed `temp.json` in the CWD (concurrent sessions
 * clobber each other; litters the repo root). Replaced with a per-invocation
 * mktemp helper `_atomic_state_write`. This test extracts the real helper from
 * the script (via sed) and exercises it — the script itself runs an
 * interactive `main "$@"`, so the function is tested in isolation.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(process.cwd(), 'archon-os', 'scripts', 'workflow', 'phase-transition.sh');

// Extract just the _atomic_state_write function body from the real script, so
// the test tracks the shipped implementation rather than a copy.
function runWithHelper(bodyAfterHelper) {
  const prog = `
    set -euo pipefail
    eval "$(sed -n '/^_atomic_state_write()/,/^}/p' "${SCRIPT}")"
    ${bodyAfterHelper}
  `;
  return spawnSync('bash', ['-c', prog], { encoding: 'utf8' });
}

describe('phase-transition.sh _atomic_state_write', () => {
  it('atomically replaces the target and leaves no temp.json in the CWD', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-'));
    const target = path.join(dir, 'state.json');
    fs.writeFileSync(target, '{"old":true}');
    const r = runWithHelper(`
      cd "${dir}"
      echo '{"new":1}' | _atomic_state_write "${target}"
      echo "CWD_TEMP=$(ls temp.json 2>/dev/null || echo none)"
    `);
    const content = fs.readFileSync(target, 'utf8');
    const leftover = fs.readdirSync(dir).filter(f => f.startsWith('state.json.') || f === 'temp.json');
    fs.rmSync(dir, { recursive: true, force: true });
    expect(r.status).toBe(0);
    expect(JSON.parse(content)).toEqual({ new: 1 });
    expect(r.stdout).toMatch(/CWD_TEMP=none/);
    expect(leftover).toEqual([]); // no leftover mktemp files
  });

  it('refuses to write an empty result (preserves prior state)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-'));
    const target = path.join(dir, 'state.json');
    fs.writeFileSync(target, '{"keep":true}');
    const r = runWithHelper(`
      set +e
      printf '' | _atomic_state_write "${target}"
      echo "RC=$?"
    `);
    const content = fs.readFileSync(target, 'utf8');
    fs.rmSync(dir, { recursive: true, force: true });
    expect(r.stdout).toMatch(/RC=1/);
    expect(JSON.parse(content)).toEqual({ keep: true });
  });
});
