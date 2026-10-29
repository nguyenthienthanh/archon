/**
 * FEAT-007 / STORY-0009 — json-toon-projector reads tool args from stdin.
 * getToolArgs read process.env.CLAUDE_TOOL_ARGS (never set) → the projector
 * saw empty args and never projected anything. Now reads tool_input.
 */

const { getToolArgs } = require('../../archon-os/hooks/json-toon-projector.cjs');

describe('json-toon-projector.getToolArgs', () => {
  it('returns the stdin tool_input object', () => {
    expect(getToolArgs({ tool_input: { file_path: '/big.json' } })).toEqual({ file_path: '/big.json' });
  });

  it('falls back to CLAUDE_TOOL_ARGS env when tool_input absent', () => {
    const prev = process.env.CLAUDE_TOOL_ARGS;
    process.env.CLAUDE_TOOL_ARGS = JSON.stringify({ path: '/legacy.json' });
    try { expect(getToolArgs({})).toEqual({ path: '/legacy.json' }); }
    finally { if (prev === undefined) delete process.env.CLAUDE_TOOL_ARGS; else process.env.CLAUDE_TOOL_ARGS = prev; }
  });

  it('returns {} for no source', () => {
    const prev = process.env.CLAUDE_TOOL_ARGS;
    delete process.env.CLAUDE_TOOL_ARGS;
    try { expect(getToolArgs({})).toEqual({}); }
    finally { if (prev !== undefined) process.env.CLAUDE_TOOL_ARGS = prev; }
  });
});
