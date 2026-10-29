/**
 * FEAT-007 / STORY-0029 — js-counter atomic mint (fixes CONFLICT-id race in
 * pre-dispatch-conflict-check.cjs, which did an unlocked read-modify-write on
 * .counters.json → concurrent async dispatches minted duplicate ids).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LIB = path.join(process.cwd(), 'archon-os', 'hooks', 'lib', 'js-counter.cjs');
const { nextCounter } = require(LIB);

function mkCounters(init) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-'));
  const f = path.join(dir, '.counters.json');
  fs.writeFileSync(f, JSON.stringify({ counters: init }, null, 2));
  return { dir, f };
}

describe('js-counter.nextCounter', () => {
  it('increments sequentially in-process', () => {
    const { dir, f } = mkCounters({ CONFLICT: 0 });
    expect(nextCounter(f, 'CONFLICT')).toBe(1);
    expect(nextCounter(f, 'CONFLICT')).toBe(2);
    expect(JSON.parse(fs.readFileSync(f, 'utf8')).counters.CONFLICT).toBe(2);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('N concurrent processes yield N distinct sequential ids', () => {
    const { dir, f } = mkCounters({ CONFLICT: 0 });
    const N = 10;
    // Emit one line per process so concurrent writes don't concatenate digits.
    const one = `node -e 'process.stdout.write(String(require("${LIB}").nextCounter("${f}","CONFLICT"))+"\\n")'`;
    const prog = `for i in $(seq 1 ${N}); do ( ${one} ) & done; wait`;
    const p = spawnSync('bash', ['-c', prog], { encoding: 'utf8' });
    const nums = (p.stdout || '').split('\n').map(s => s.trim()).filter(s => /^\d+$/.test(s))
      .map(Number).sort((a, b) => a - b);
    fs.rmSync(dir, { recursive: true, force: true });
    expect(new Set(nums).size).toBe(N);
    expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  });

  it('shares the ${file}.lock convention with bash with_lock', () => {
    // Documented invariant: the JS lock dir path matches what _lib.sh uses,
    // so bash + JS minting are mutually exclusive.
    const { dir, f } = mkCounters({ CONFLICT: 0 });
    const src = fs.readFileSync(LIB, 'utf8');
    expect(src).toMatch(/\$\{countersFile\}\.lock/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
