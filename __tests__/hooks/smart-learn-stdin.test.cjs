/**
 * FEAT-007 / STORY-0009+0010 — smart-learn reads tool context from stdin.
 * main() read CLAUDE_TOOL_NAME / _INPUT / _RESULT env vars (never set) →
 * toolName undefined → hook exited before learning. resolveToolContext reads
 * the stdin payload; the per-tool code/command field is extracted at call sites.
 */

const { resolveToolContext } = require('../../archon-os/hooks/smart-learn.cjs');

describe('smart-learn.resolveToolContext', () => {
  it('reads tool_name, tool_input, tool_response from stdin', () => {
    const c = resolveToolContext({ tool_name: 'Write', tool_input: { file_path: '/a.js', content: 'const x=1;' }, tool_response: 'ok' });
    expect(c.toolName).toBe('Write');
    expect(c.ti).toEqual({ file_path: '/a.js', content: 'const x=1;' });
    expect(c.toolResult).toBe('ok');
  });

  it('stringifies an object tool_response for error scanning', () => {
    const c = resolveToolContext({ tool_name: 'Bash', tool_response: { error: 'boom' } });
    expect(c.toolResult).toContain('boom');
  });

  it('falls back to env vars', () => {
    const prevN = process.env.CLAUDE_TOOL_NAME, prevR = process.env.CLAUDE_TOOL_RESULT;
    process.env.CLAUDE_TOOL_NAME = 'Edit';
    process.env.CLAUDE_TOOL_RESULT = 'legacy';
    try {
      const c = resolveToolContext({});
      expect(c.toolName).toBe('Edit');
      expect(c.toolResult).toBe('legacy');
      expect(c.ti).toEqual({});
    } finally {
      if (prevN === undefined) delete process.env.CLAUDE_TOOL_NAME; else process.env.CLAUDE_TOOL_NAME = prevN;
      if (prevR === undefined) delete process.env.CLAUDE_TOOL_RESULT; else process.env.CLAUDE_TOOL_RESULT = prevR;
    }
  });

  it('is null-safe', () => {
    expect(resolveToolContext(null).ti).toEqual({});
  });
});
