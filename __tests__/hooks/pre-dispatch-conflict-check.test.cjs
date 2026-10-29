/**
 * Tests for archon-os/hooks/pre-dispatch-conflict-check.cjs
 *
 * The whole detection pipeline used to run at module scope with process.exit()
 * on require. It was restructured into a main() (FEAT-007 / issue #5), exposing
 * the pure decision/record helpers. main / nextConflictId (mints ids, runs bash,
 * appends files) stay unexported.
 *
 * findSiblings is exported and reads the filesystem, but resolvePlansDir() froze
 * PLANS_DIR at module load, so it can only be exercised read-only against the
 * real tree — asserted to degrade safely, never for a specific value.
 */

const {
  isPendingStatus,
  buildConflictRecord,
  findSiblings,
} = require('../../archon-os/hooks/pre-dispatch-conflict-check.cjs');

describe('pre-dispatch-conflict-check — isPendingStatus', () => {
  it.each(['planned', 'blocked', 'blocked-on-confirm'])('%s is pending', (s) => {
    expect(isPendingStatus(s)).toBe(true);
  });
  it.each(['done', 'in_progress', 'frozen', 'unknown', ''])('%s is not pending', (s) => {
    expect(isPendingStatus(s)).toBe(false);
  });
});

describe('pre-dispatch-conflict-check — buildConflictRecord', () => {
  const base = {
    taskId: 'TASK-1',
    conflictId: 'CONFLICT-00007',
    ts: '2026-01-01T00:00:00.000Z',
  };

  it('records the proposed task plus every pending-confirm participant', () => {
    const rec = buildConflictRecord({
      ...base,
      detectedLayer: 'L1',
      conflictPayload: { with: ['TASK-2', 'TASK-3'], files: ['a.ts'], confidence: 1 },
    });
    expect(rec.participants).toEqual([
      { task: 'TASK-1', role: 'proposed' },
      { task: 'TASK-2', role: 'pending-confirm' },
      { task: 'TASK-3', role: 'pending-confirm' },
    ]);
  });

  it('maps L1 to file_overlap and L2 to function_overlap', () => {
    expect(buildConflictRecord({ ...base, detectedLayer: 'L1', conflictPayload: {} }).type)
      .toBe('file_overlap');
    expect(buildConflictRecord({ ...base, detectedLayer: 'L2', conflictPayload: {} }).type)
      .toBe('function_overlap');
  });

  it('carries files/functions through, defaulting absent ones to null', () => {
    const rec = buildConflictRecord({
      ...base, detectedLayer: 'L2',
      conflictPayload: { files: ['a.ts'], functions: ['foo'] },
    });
    expect(rec.overlap).toEqual({ files: ['a.ts'], functions: ['foo'], schema_elements: null });
  });

  it('defaults missing overlap + confidence sensibly', () => {
    const rec = buildConflictRecord({ ...base, detectedLayer: 'L1', conflictPayload: {} });
    expect(rec.overlap).toEqual({ files: null, functions: null, schema_elements: null });
    expect(rec.confidence).toBe(1.0);
    expect(rec.participants).toEqual([{ task: 'TASK-1', role: 'proposed' }]);
  });

  it('preserves the passed id and timestamp and leaves resolution unset', () => {
    const rec = buildConflictRecord({ ...base, detectedLayer: 'L1', conflictPayload: { confidence: 0.8 } });
    expect(rec.conflict_id).toBe('CONFLICT-00007');
    expect(rec.detected_at).toBe('2026-01-01T00:00:00.000Z');
    expect(rec.detected_by).toBe('pre-dispatch-conflict-check.cjs');
    expect(rec.confidence).toBe(0.8);
    expect(rec.arbitration).toBeNull();
    expect(rec.resolution).toBeNull();
    expect(rec.resolved_at).toBeNull();
    expect(rec.actions_taken).toEqual([]);
  });
});

describe('pre-dispatch-conflict-check — findSiblings', () => {
  it('returns an array without throwing for an unknown story', () => {
    let out;
    expect(() => { out = findSiblings('TASK-X', 'STORY-DOES-NOT-EXIST'); }).not.toThrow();
    expect(Array.isArray(out)).toBe(true);
  });
});
