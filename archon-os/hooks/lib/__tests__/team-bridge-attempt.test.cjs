/**
 * FEAT-007 / STORY-0029 — team-bridge handlePhaseRejection attempt persistence.
 * attempt was never written back, so a 2nd rejection re-read 1, re-archived onto
 * phase-…-attempt-1 (already present) and crashed renameSync with ENOTEMPTY.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { handlePhaseRejection } = require('../../../../archon-os/hooks/lib/team-bridge.cjs');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-'));
  const stateFile = path.join(root, 'workflow-state.json');
  fs.writeFileSync(stateFile, JSON.stringify({ teams: { t1: { attempt: 1, status: 'active' } } }, null, 2));
  const logsDir = path.join(root, 'logs');
  fs.mkdirSync(path.join(logsDir, 'teams', 'phase-p1'), { recursive: true });
  fs.writeFileSync(path.join(logsDir, 'teams', 'phase-p1', 'team-log.jsonl'), '{}\n');
  return { root, stateFile, logsDir };
}

describe('team-bridge.handlePhaseRejection', () => {
  it('persists attempt and archives to a unique dir', () => {
    const { root, stateFile, logsDir } = setup();
    const next = handlePhaseRejection(stateFile, logsDir, 't1', 'p1');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    expect(next).toBe(2);
    expect(state.teams.t1.attempt).toBe(2);                         // persisted
    expect(fs.existsSync(path.join(logsDir, 'teams', 'phase-p1-attempt-1'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('a SECOND rejection does not crash and archives to attempt-2', () => {
    const { root, stateFile, logsDir } = setup();
    handlePhaseRejection(stateFile, logsDir, 't1', 'p1');           // → attempt 2
    // A new phase-p1 dir appears for the retried attempt.
    fs.mkdirSync(path.join(logsDir, 'teams', 'phase-p1'), { recursive: true });
    fs.writeFileSync(path.join(logsDir, 'teams', 'phase-p1', 'team-log.jsonl'), '{}\n');
    const next = handlePhaseRejection(stateFile, logsDir, 't1', 'p1'); // must not throw
    expect(next).toBe(3);
    expect(fs.existsSync(path.join(logsDir, 'teams', 'phase-p1-attempt-2'))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
