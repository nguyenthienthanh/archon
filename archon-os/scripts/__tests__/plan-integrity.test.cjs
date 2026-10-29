/**
 * STORY-0023 (partial) — plan-tree integrity fixes.
 *   1. resolve-node.sh --active/--feature/--story with a null field must exit 2
 *      ("no match"), not 1 — set -e + pipefail aborted on the empty grep before
 *      the documented exit-2 check ran.
 *   2. validate-plan-tree.sh INVARIANT 7 must detect a cycle of ANY length
 *      (the old check only caught self-loops + 2-cycles; A→B→C→A passed clean).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RESOLVE = path.join(process.cwd(), 'archon-os', 'scripts', 'plans', 'resolve-node.sh');
const VALIDATE = path.join(process.cwd(), 'archon-os', 'scripts', 'plans', 'validate-plan-tree.sh');

function mkPlans() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pi-'));
}
function writeActive(dir, active) {
  fs.writeFileSync(path.join(dir, 'active.json'),
    JSON.stringify({ schema_version: 1, active, ready_queue: [], blocked: [], frozen: [] }, null, 2));
}
function task(dir, id, deps) {
  const d = path.join(dir, 'features', 'FEAT-X', 'stories', 'STORY-X', 'tasks', id);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'task.md'),
    ['---', `id: ${id}`, 'tier: 4', 'parent: STORY-X', `status: planned`,
     `depends_on: [${deps.join(', ')}]`, '---', ''].join('\n'));
}

describe('resolve-node — null active field exits 2, not 1 (P0/STORY-0023)', () => {
  it('--active with "task": null → exit 2', () => {
    const dir = mkPlans();
    writeActive(dir, { task: null, feature: 'FEAT-X', story: 'STORY-X' });
    const r = spawnSync('bash', [RESOLVE, '--active', dir], { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    expect(r.status).toBe(2);
  });

  it('--story with "story": null → exit 2', () => {
    const dir = mkPlans();
    writeActive(dir, { task: null, feature: 'FEAT-X', story: null });
    const r = spawnSync('bash', [RESOLVE, '--story', dir], { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    expect(r.status).toBe(2);
  });
});

describe('validate-plan-tree — INVARIANT 7 detects cycles of any length', () => {
  it('flags a 3-node cycle A→B→C→A', () => {
    const dir = mkPlans();
    fs.writeFileSync(path.join(dir, '.counters.json'), JSON.stringify({ counters: { TASK: 3 } }));
    task(dir, 'TASK-00001', ['TASK-00002']);
    task(dir, 'TASK-00002', ['TASK-00003']);
    task(dir, 'TASK-00003', ['TASK-00001']);
    const r = spawnSync('bash', [VALIDATE, dir], { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/cycle detected/i);
  });

  it('does NOT flag a cycle for an acyclic chain A→B→C', () => {
    const dir = mkPlans();
    fs.writeFileSync(path.join(dir, '.counters.json'), JSON.stringify({ counters: { TASK: 3 } }));
    task(dir, 'TASK-00001', ['TASK-00002']);
    task(dir, 'TASK-00002', ['TASK-00003']);
    task(dir, 'TASK-00003', []);
    const r = spawnSync('bash', [VALIDATE, dir], { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    expect(r.stdout + r.stderr).not.toMatch(/cycle detected/i);
  });
});
