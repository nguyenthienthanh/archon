/**
 * Tests for archon-os/hooks/prompt-reminder.cjs
 * Pure-function tests via require()-from-source (no re-declaration).
 */

jest.mock('../../archon-os/hooks/lib/af-config-utils.cjs', () => ({
  readSessionState: jest.fn(() => ({})),
}));

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  needsTddReminder,
  needsApprovalReminder,
} = require('../../archon-os/hooks/prompt-reminder.cjs');

const HOOK = path.join(__dirname, '..', '..', 'archon-os', 'hooks', 'prompt-reminder.cjs');

describe('prompt-reminder', () => {
  describe('needsTddReminder', () => {
    ['implement user login', 'create component', 'add validation', 'build dashboard',
     'fix the bug', 'write a function', 'refactor component', 'design api'].forEach(p => {
      it(`triggers on "${p}"`, () => expect(needsTddReminder(p)).toBe(true));
    });

    it('is case-insensitive', () => {
      expect(needsTddReminder('IMPLEMENT login')).toBe(true);
      expect(needsTddReminder('Build something')).toBe(true);
    });

    it('does NOT trigger without code keywords', () => {
      expect(needsTddReminder('what time is it')).toBe(false);
      expect(needsTddReminder('explain the design pattern')).toBe(false);
    });

    it('handles empty/null input safely', () => {
      expect(needsTddReminder('')).toBe(false);
      expect(needsTddReminder(undefined)).toBe(false);
      expect(needsTddReminder(null)).toBe(false);
    });
  });

  describe('needsApprovalReminder', () => {
    it('triggers on phase 1', () => expect(needsApprovalReminder({ phase: '1' })).toBe(true));
    it('triggers on phase 3', () => expect(needsApprovalReminder({ phase: '3' })).toBe(true));
    it('does NOT trigger on phase 2', () => expect(needsApprovalReminder({ phase: '2' })).toBe(false));
    it('does NOT trigger on phase 4', () => expect(needsApprovalReminder({ phase: '4' })).toBe(false));
    it('does NOT trigger on phase 5', () => expect(needsApprovalReminder({ phase: '5' })).toBe(false));
    it('does NOT trigger when phase missing', () => expect(needsApprovalReminder({})).toBeFalsy());
  });

  // Regression: Claude Code delivers the prompt as JSON on stdin, NOT via
  // CLAUDE_USER_PROMPT. Reading the env var alone left the prompt empty in
  // production, so the TDD reminder never fired. Spawn the hook the way the
  // runtime does and assert the reminder reaches stderr.
  describe('end-to-end (stdin JSON — production path)', () => {
    function runHook(prompt) {
      return spawnSync('node', [HOOK], {
        input: JSON.stringify({ prompt }),
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_USER_PROMPT: '' },
        timeout: 10000,
        killSignal: 'SIGKILL',
      });
    }

    it('emits the TDD reminder for a code prompt read from stdin', () => {
      const r = runHook('implement user login feature');
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('TDD');
    });

    it('stays silent for a non-code prompt read from stdin', () => {
      const r = runHook('what time is it');
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain('TDD');
    });
  });
});
