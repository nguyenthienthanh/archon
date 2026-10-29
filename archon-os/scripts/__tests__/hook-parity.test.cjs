/**
 * FEAT-010 / STORY-0024 — hook-parity validator (Fires: header vs hooks.json).
 */

const { extractRegisteredEvents, extractFires, findParityIssues } =
  require('../ci/validate-hook-parity.cjs');

describe('extractFires', () => {
  it('finds the event named anywhere on the Fires line', () => {
    expect(extractFires(' * Fires: On session Stop')).toBe('Stop');
    expect(extractFires(' * Fires: PostToolUse (mcp__.*)')).toBe('PostToolUse');
    expect(extractFires(' * Fires: SessionStart (see hooks.json)')).toBe('SessionStart');
  });
  it('returns null when the header names no event', () => {
    expect(extractFires(' * Fires: Once per session (startup, resume)')).toBeNull();
    expect(extractFires('no header here')).toBeNull();
  });
});

describe('extractRegisteredEvents', () => {
  it('maps each hooks/<name>.cjs command to its event', () => {
    const json = { hooks: {
      PreToolUse: [{ hooks: [{ command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/scout-block.cjs"' }] }],
      Stop: [{ hooks: [{ command: 'node "${X}/hooks/rate-limit-check.cjs"' }] }],
    } };
    const map = extractRegisteredEvents(json);
    expect([...map['scout-block']]).toEqual(['PreToolUse']);
    expect([...map['rate-limit-check']]).toEqual(['Stop']);
  });
});

describe('findParityIssues', () => {
  it('flags a header/registration mismatch', () => {
    const registered = { foo: new Set(['SessionStart']) };
    const headers = { foo: 'PreToolUse' };
    expect(findParityIssues(registered, headers)).toHaveLength(1);
  });
  it('passes when they match', () => {
    expect(findParityIssues({ foo: new Set(['Stop']) }, { foo: 'Stop' })).toEqual([]);
  });
  it('skips hooks with no Fires header', () => {
    expect(findParityIssues({ foo: new Set(['Stop']) }, { foo: null })).toEqual([]);
  });
});
