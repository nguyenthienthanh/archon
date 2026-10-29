/**
 * Tests for the pure logic of post-compact and pre-execute-load-plan-context,
 * made importable by FEAT-007 / issue #5.
 */

const { validateStateFile, collectWarnings, STATE_PATHS } =
  require('../../archon-os/hooks/post-compact.cjs');
const { composeContextLines } =
  require('../../archon-os/hooks/pre-execute-load-plan-context.cjs');

describe('post-compact — validateStateFile', () => {
  // The field names below are the ones the writers actually emit: the workflow
  // state compact-handoff.cjs reads/synthesises carries current_phase +
  // agents.primary, and saveHandoff() writes workflow + context.
  it('flags a workflow-state file missing current_phase and agents.primary', () => {
    const w = validateStateFile('.claude/cache/workflow-state.json', {});
    expect(w).toEqual([
      '.claude/cache/workflow-state.json: missing current_phase',
      '.claude/cache/workflow-state.json: missing agents.primary',
    ]);
  });

  it('passes a complete workflow-state file', () => {
    expect(validateStateFile(
      '.claude/cache/workflow-state.json',
      { current_phase: 2, agents: { primary: 'frontend' } },
    )).toEqual([]);
  });

  it('flags a compact-handoff with neither workflow nor context', () => {
    const w = validateStateFile('.claude/cache/compact-handoff.json', {});
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('handoff may be empty');
    // A run-state-only handoff (v2 schema) is valid on its own.
    expect(validateStateFile('.claude/cache/compact-handoff.json', { run: { run_id: 'r1' } })).toEqual([]);
  });

  it('passes a compact-handoff that has either workflow or context', () => {
    expect(validateStateFile('compact-handoff.json', { workflow: { workflow_id: 'w1' } })).toEqual([]);
    expect(validateStateFile('compact-handoff.json', { context: { project_name: 'p' } })).toEqual([]);
  });

  it('says nothing about an unrelated path', () => {
    expect(validateStateFile('some/other.json', {})).toEqual([]);
  });

  it('exposes the state paths it checks; handoffs are per session', () => {
    expect(STATE_PATHS).toContain('.claude/cache/workflow-state.json');
    expect(STATE_PATHS).not.toContain('.claude/cache/compact-handoff.json');
    expect(validateStateFile('.claude/handoffs/lam-truyen.json', {})).toHaveLength(1);
    expect(validateStateFile('.claude/handoffs/lam-truyen.json', { project: { kind: 'non-code' } })).toEqual([]);
  });

  it('collectWarnings returns an array without throwing for missing files', () => {
    expect(Array.isArray(collectWarnings(['does/not/exist.json']))).toBe(true);
  });
});

describe('post-compact — accepts what compact-handoff actually writes', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  let root;
  let savedEnv;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-postcompact-'));
    // Legacy workflow state is only written for code projects.
    fs.mkdirSync(path.join(root, '.git'));
    savedEnv = { ...process.env };
    // compact-handoff resolves its file paths at module load, so the root has to
    // be in place before the fresh require below.
    process.env.AF_PROJECT_ROOT = root;
    delete process.env.AF_CLAUDE_SESSION_ID;
    delete process.env.AF_TRANSCRIPT_PATH;
    process.env.AF_WORKFLOW_ID = 'wf-test-1';
    process.env.AF_CURRENT_PHASE = '3';
    process.env.AF_CURRENT_AGENT = 'frontend';
    process.env.AF_TASK_DESCRIPTION = 'ship the thing';
  });

  afterEach(() => {
    process.env = savedEnv;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('collectWarnings is silent on a handoff written by saveHandoff()', () => {
    let saveHandoff;
    jest.isolateModules(() => {
      ({ saveHandoff } = require('../../archon-os/hooks/compact-handoff.cjs'));
    });
    expect(saveHandoff()).not.toBe(false);

    const handoffFile = path.join(root, '.claude', 'handoffs', 'session-unknown.json');
    expect(fs.existsSync(handoffFile)).toBe(true);
    // Absolute paths still match the `rel.includes(...)` dispatch in
    // validateStateFile, so the real file goes through the real check.
    expect(collectWarnings([handoffFile])).toEqual([]);
  });

  it('collectWarnings is silent on the paused workflow-state saveHandoff() writes', () => {
    let saveHandoff;
    jest.isolateModules(() => {
      ({ saveHandoff } = require('../../archon-os/hooks/compact-handoff.cjs'));
    });
    saveHandoff();

    const stateFile = path.join(root, '.claude', 'logs', 'workflows', 'wf-test-1', 'workflow-state.json');
    expect(fs.existsSync(stateFile)).toBe(true);
    expect(collectWarnings([stateFile])).toEqual([]);
  });
});

describe('pre-execute-load-plan-context — composeContextLines', () => {
  it('renders every active field in display order', () => {
    const lines = composeContextLines({
      active: { mission: 'M', initiative: 'I', feature: 'F', story: 'S', task: 'T' },
      context_anchors: { current_phase: 'P2_RED' },
    });
    expect(lines).toEqual([
      'Mission: M', 'Initiative: I', 'Feature: F', 'Story: S', 'Task: T', 'Phase: P2_RED',
    ]);
  });

  it('omits fields that are absent', () => {
    expect(composeContextLines({ active: { task: 'T' } })).toEqual(['Task: T']);
  });

  it('summarises frozen nodes by count', () => {
    const lines = composeContextLines({
      active: {},
      frozen: ['a', 'b'],
    });
    expect(lines).toContain('Frozen: 2 node(s) — see /archon-os:plan-conflicts');
  });

  it('ignores an empty frozen array and the vestigial ready_queue field', () => {
    expect(composeContextLines({ active: {}, frozen: [], ready_queue: [] })).toEqual([]);
    // ready_queue is unmaintained (next-task.sh rescans task files) — never rendered.
    expect(composeContextLines({ active: {}, ready_queue: ['x', 'y'] })).toEqual([]);
  });

  it('is empty for an empty or malformed active object', () => {
    expect(composeContextLines({})).toEqual([]);
    expect(composeContextLines(null)).toEqual([]);
    expect(composeContextLines({ active: null })).toEqual([]);
  });
});

const { composeBanner } = require('../../archon-os/hooks/session-start-restore-active.cjs');

describe('session-start-restore-active — composeBanner', () => {
  it('shows a feature with its story and task', () => {
    expect(composeBanner({ active: { feature: 'FEAT-A', story: 'S1', task: 'T1' } }))
      .toEqual(['🐸 Active plan: FEAT-A', 'Story: S1', 'Task: T1']);
  });

  it('prefers feature over initiative and mission', () => {
    expect(composeBanner({ active: { feature: 'F', initiative: 'I', mission: 'M' } }))
      .toEqual(['🐸 Active plan: F']);
  });

  it('falls back to initiative when there is no feature', () => {
    expect(composeBanner({ active: { initiative: 'INIT-1', mission: 'M' } }))
      .toEqual(['🐸 Active plan: INIT-1']);
  });

  it('falls back to mission when there is neither feature nor initiative', () => {
    expect(composeBanner({ active: { mission: 'Ship it' } })).toEqual(['🐸 Active mission: Ship it']);
  });

  it('is empty for no active anchor or a malformed object', () => {
    expect(composeBanner({ active: {} })).toEqual([]);
    expect(composeBanner({})).toEqual([]);
    expect(composeBanner(null)).toEqual([]);
  });
});
