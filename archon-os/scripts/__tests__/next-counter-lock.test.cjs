/**
 * P0-4 (TASK-00038) — _lib.sh next_counter concurrency lock.
 *
 * The read-modify-write (grep → sed → mv) had no lock and used a $$-suffixed
 * tmp that collides across subshells. The audit reproduced 5 concurrent calls
 * yielding counter 6 instead of 10 (duplicate IDs). Fix: a portable
 * with_lock() mkdir-spinlock wrapping an atomic mktemp write, plus a non-zero
 * return when the counter key is absent (instead of minting "1" forever).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LIB = path.join(process.cwd(), 'archon-os', 'scripts', 'plans', '_lib.sh');

function mkPlans(counters) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-'));
  fs.writeFileSync(
    path.join(dir, '.counters.json'),
    JSON.stringify({ schema_version: 1, updated_at: '2026-01-01T00:00:00Z', counters }, null, 2),
  );
  return dir;
}

describe('next_counter — concurrency + missing-key (P0-4)', () => {
  it('N truly-concurrent calls yield exactly N distinct sequential IDs', () => {
    const plans = mkPlans({ TASK: 0 });
    const N = 10;
    // Launch N background subshells from a SINGLE bash so they race in parallel,
    // then `wait`. spawnSync alone would serialize the processes.
    const prog = `for i in $(seq 1 ${N}); do ( source "${LIB}"; next_counter "${plans}" TASK ) & done; wait`;
    // Bounded lock timeout + hard spawnSync kill: spawnSync is synchronous, so
    // jest's per-test timeout CANNOT interrupt it (same hazard documented in
    // __tests__/scripts/plans.test.cjs). Without these bounds, CPU contention
    // during a full parallel run could block the worker for minutes (10 racing
    // subshells x AF_LOCK_TIMEOUT_SEC). 30s per lock acquisition is still far
    // above the sub-second happy path; the property under test is atomicity
    // (no dupes / no drops), not latency.
    const p = spawnSync('bash', ['-c', prog], {
      encoding: 'utf8',
      env: { ...process.env, AF_LOCK_TIMEOUT_SEC: '30' },
      timeout: 30000,
      killSignal: 'SIGKILL',
    });
    const nums = (p.stdout || '')
      .split('\n').map(s => s.trim()).filter(Boolean)
      .map(Number).filter(n => !Number.isNaN(n)).sort((a, b) => a - b);
    try { fs.rmSync(plans, { recursive: true, force: true }); } catch {}
    expect(new Set(nums).size).toBe(N);
    expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  });

  it('returns non-zero when the counter key is missing', () => {
    const plans = mkPlans({ TASK: 5 });
    const p = spawnSync('bash', ['-c', `source "${LIB}"; next_counter "${plans}" NOPE`],
      { encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL' });
    try { fs.rmSync(plans, { recursive: true, force: true }); } catch {}
    expect(p.status).not.toBe(0);
  });

  it('exposes with_lock() as a reusable helper', () => {
    const p = spawnSync('bash', ['-c', `source "${LIB}"; type with_lock >/dev/null 2>&1 && echo OK`],
      { encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL' });
    expect((p.stdout || '').trim()).toBe('OK');
  });
});
