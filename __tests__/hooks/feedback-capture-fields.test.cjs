/**
 * FEAT-007 / STORY-0010 — feedback-capture field-name fix.
 * Read the PostToolUse contract names (tool_name / tool_input / tool_response)
 * instead of tool / input / output, which are never present — the old code
 * left `tool` undefined so the hook exited on every invocation.
 */

const { extractToolFields } = require('../../archon-os/hooks/feedback-capture.cjs');

describe('feedback-capture.extractToolFields', () => {
  it('reads the real PostToolUse contract fields', () => {
    const out = extractToolFields({
      tool_name: 'Write',
      tool_input: { file_path: '/x.js' },
      tool_response: { ok: true },
      session_id: 's1',
    });
    expect(out).toEqual({ tool: 'Write', input: { file_path: '/x.js' }, output: { ok: true }, sessionId: 's1' });
  });

  it('a Write payload is recognized as a file op (was always undefined before)', () => {
    expect(['Edit', 'Write'].includes(extractToolFields({ tool_name: 'Write' }).tool)).toBe(true);
  });

  it('falls back to legacy field names', () => {
    expect(extractToolFields({ tool: 'Edit', input: { path: '/y' } }))
      .toMatchObject({ tool: 'Edit', input: { path: '/y' } });
  });

  it('is null-safe', () => {
    expect(extractToolFields(null)).toEqual({ tool: undefined, input: undefined, output: undefined, sessionId: undefined });
  });
});
