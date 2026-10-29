/**
 * Tests for archon-os/hooks/task-completed.cjs — the two pure completion-gate
 * predicates, made importable by FEAT-007 / issue #5. parseTaskInput (reads
 * stdin) and main (process I/O) stay unexported.
 */

const { checkTddViolation, checkApprovalPending } =
  require('../../archon-os/hooks/task-completed.cjs');

describe('task-completed — checkTddViolation', () => {
  it.each(['5a', '5b', '5c'])(
    'in TDD phase %s, a task with no test reference is a violation', (phase) => {
      expect(checkTddViolation(phase, { description: 'add a button' })).toBe(true);
    });

  it.each([
    'ran the tests', 'added a spec', 'assert coverage', 'expect() calls updated',
  ])('a description mentioning test language passes: %s', (desc) => {
    expect(checkTddViolation('5a', { description: desc })).toBe(false);
  });

  it('reads the subject when there is no description', () => {
    expect(checkTddViolation('5a', { subject: 'just a button' })).toBe(true);
    expect(checkTddViolation('5a', { subject: 'coverage added' })).toBe(false);
  });

  it('is never a violation outside a TDD phase', () => {
    expect(checkTddViolation('3', { description: 'no tests' })).toBe(false);
    expect(checkTddViolation(null, { description: 'no tests' })).toBe(false);
    expect(checkTddViolation(undefined, {})).toBe(false);
  });

  it('matches test language case-insensitively', () => {
    expect(checkTddViolation('5a', { description: 'Added TEST coverage' })).toBe(false);
  });

  it('does not throw on missing task data', () => {
    expect(() => checkTddViolation('5a', null)).not.toThrow();
    expect(checkTddViolation('5a', {})).toBe(true); // no description → no reference → violation
  });
});

describe('task-completed — checkApprovalPending', () => {
  it.each(['2', '5b'])('phase %s is blocked while its approval is pending', (phase) => {
    const state = { approvalStatus: { [`phase${phase}`]: 'pending' } };
    expect(checkApprovalPending(phase, state)).toBe(true);
  });

  it('is not blocked once approval is granted', () => {
    expect(checkApprovalPending('2', { approvalStatus: { phase2: 'approved' } })).toBe(false);
  });

  it('is not blocked in a non-gate phase', () => {
    expect(checkApprovalPending('3', { approvalStatus: { phase3: 'pending' } })).toBe(false);
    expect(checkApprovalPending(null, {})).toBe(false);
  });

  it('is not blocked when there is no approval status recorded', () => {
    expect(checkApprovalPending('2', {})).toBe(false);
    expect(checkApprovalPending('2', null)).toBe(false);
  });
});
