/**
 * STORY-0023 — link-run.sh RUN_ID regex safety.
 * RUN_ID was interpolated raw into grep -E / awk regexes, so a run id
 * containing a `.` (or other ERE metachar) could match/replace the WRONG
 * `## Runs` row. Fixed by _re_escape before matching + mktemp (no `.tmp.$$`).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LINK_RUN = path.join(process.cwd(), 'archon-os', 'scripts', 'plans', 'link-run.sh');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-'));
  const plans = path.join(root, 'plans');
  const feat = path.join(plans, 'features', 'FEAT-T');
  fs.mkdirSync(feat, { recursive: true });
  fs.writeFileSync(path.join(plans, '.counters.json'), JSON.stringify({ counters: { FEAT: 1 } }));
  fs.writeFileSync(path.join(plans, 'history.jsonl'), '');
  // A pre-existing row whose id "axb-260101" the metachar id "a.b-260101" would
  // wrongly match under an unescaped regex (`.` = any char).
  fs.writeFileSync(path.join(feat, 'feature.md'), [
    '---', 'id: FEAT-T', 'tier: 2', 'parent: INIT-001', 'intent: "t"', 'status: planned', '---', '',
    '## Runs', '', '| Run | Status | Started | Anchor |', '|---|---|---|---|',
    '| axb-260101 | in_progress | 2026-01-01T00:00:00Z | — |', '',
  ].join('\n'));
  const runs = path.join(root, 'runs');
  fs.mkdirSync(path.join(runs, 'a.b-260101'), { recursive: true });
  fs.writeFileSync(path.join(runs, 'a.b-260101', 'run-state.json'), JSON.stringify({ run_id: 'a.b-260101' }));
  return { root, plans, runs, featFile: path.join(feat, 'feature.md') };
}

describe('link-run.sh — RUN_ID regex safety (STORY-0023)', () => {
  it('a metachar run id does NOT replace a similarly-named row', () => {
    const { root, plans, runs, featFile } = setup();
    const r = spawnSync('bash', [LINK_RUN, 'link', 'a.b-260101', 'FEAT-T', '--status', 'in_progress'],
      { encoding: 'utf8', env: { ...process.env, ARCHON_PLANS_DIR: plans, RUNS_DIR: runs } });
    const md = fs.readFileSync(featFile, 'utf8');
    const leftover = fs.readdirSync(path.dirname(featFile)).filter(f => f.includes('.tmp.'));
    fs.rmSync(root, { recursive: true, force: true });
    expect(r.status).toBe(0);
    expect(md).toMatch(/\| axb-260101 \| in_progress \|/);   // original row intact
    expect(md).toMatch(/\| a\.b-260101 \| in_progress \|/);  // new row appended
    expect(leftover).toEqual([]);                            // no .tmp.$$ litter
  });
});
