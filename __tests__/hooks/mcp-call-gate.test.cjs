/**
 * Tests for archon-os/hooks/mcp-call-gate.cjs
 * Pure-function tests via require()-from-source (module is require-safe:
 * the imperative gate body only runs under `require.main === module`).
 *
 * Covers the CRITICAL P0-1 fix (TASK-00035):
 *   1. Tool name is resolved from the stdin hook payload, NOT the
 *      process.env.CLAUDE_TOOL_NAME env var the hook API never sets.
 *   2. The per-session rate counter resets on a window boundary instead of
 *      accumulating forever (otherwise a legit session hard-blocks after 200).
 */

const {
  parseMcpToolName,
  resolveToolName,
  resolveAgent,
  normalizeCounters,
  computeUsage,
  SESSION_WINDOW_MS,
  DEFAULT_LIMITS,
} = require('../../archon-os/hooks/mcp-call-gate.cjs');

describe('mcp-call-gate — tool name resolution (P0-1 core)', () => {
  it('resolves the tool name from the stdin payload object', () => {
    expect(resolveToolName({ tool_name: 'mcp__figma__get_file' })).toBe('mcp__figma__get_file');
  });

  it('returns empty string when the payload carries no tool_name', () => {
    // The old hole: env-only read yielded '' → the gate short-circuited to
    // exit 0 and never enforced. The fix reads stdin; a payload with no
    // tool_name is a genuine no-op (non-tool event), not a disabled gate.
    expect(resolveToolName({})).toBe('');
    expect(resolveToolName(null)).toBe('');
  });

  it('does NOT read process.env.CLAUDE_TOOL_NAME', () => {
    const prev = process.env.CLAUDE_TOOL_NAME;
    process.env.CLAUDE_TOOL_NAME = 'mcp__evil__spoof';
    try {
      // Even with the env var set, resolution comes from the passed payload.
      expect(resolveToolName({ tool_name: 'mcp__figma__get_file' })).toBe('mcp__figma__get_file');
      expect(resolveToolName({})).toBe('');
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_TOOL_NAME;
      else process.env.CLAUDE_TOOL_NAME = prev;
    }
  });
});

describe('mcp-call-gate — agent resolution', () => {
  it('reads agent_name from the payload', () => {
    expect(resolveAgent({ agent_name: 'frontend' })).toBe('frontend');
  });
  it('returns null when absent (caller defaults to main / allow-all)', () => {
    expect(resolveAgent({})).toBeNull();
    expect(resolveAgent(null)).toBeNull();
  });
});

describe('mcp-call-gate — parseMcpToolName', () => {
  it('parses bare server form', () => {
    expect(parseMcpToolName('mcp__figma__get_file')).toEqual({ server: 'figma', method: 'get_file' });
  });
  it('parses plugin-prefixed form', () => {
    expect(parseMcpToolName('mcp__plugin_archon-os_slack__post_message'))
      .toEqual({ server: 'slack', method: 'post_message' });
  });
  it('returns null for non-mcp / malformed', () => {
    expect(parseMcpToolName('mcp__nosep')).toBeNull();
  });
});

describe('mcp-call-gate — windowed counter reset (P0-1 masked bug)', () => {
  const now = 1_000_000_000_000;

  it('keeps counters within the active window', () => {
    const raw = { session_start: now - 1000, per_server: { figma: { session: 50, last_minute: [] } } };
    const c = normalizeCounters(raw, now, SESSION_WINDOW_MS);
    expect(c.per_server.figma.session).toBe(50);
    expect(c.session_start).toBe(now - 1000);
  });

  it('resets counters once the window has elapsed', () => {
    // 200 accumulated calls from a stale window must NOT hard-block the
    // next session — the fresh window starts the count from zero.
    const stale = { session_start: now - SESSION_WINDOW_MS - 1, per_server: { figma: { session: 200, last_minute: [] } } };
    const c = normalizeCounters(stale, now, SESSION_WINDOW_MS);
    expect(c.per_server).toEqual({});
    expect(c.session_start).toBe(now);
  });

  it('resets when the file is malformed / missing session_start', () => {
    expect(normalizeCounters({}, now, SESSION_WINDOW_MS).session_start).toBe(now);
    expect(normalizeCounters(null, now, SESSION_WINDOW_MS).per_server).toEqual({});
  });

  it('the 201st call in a fresh window is allowed (usage < hard block)', () => {
    // After a window reset, session count is 1 → well under the cap.
    const c = normalizeCounters(
      { session_start: now - SESSION_WINDOW_MS - 1, per_server: { figma: { session: 200, last_minute: [] } } },
      now, SESSION_WINDOW_MS,
    );
    c.per_server.figma = { session: 1, last_minute: [now] };
    const { usage } = computeUsage(c.per_server.figma, DEFAULT_LIMITS);
    expect(usage).toBeLessThan(1.0);
  });
});

describe('mcp-call-gate — computeUsage', () => {
  it('flags hard block at the session cap', () => {
    const { usage } = computeUsage({ session: 200, last_minute: [] }, DEFAULT_LIMITS);
    expect(usage).toBeGreaterThanOrEqual(1.0);
  });
  it('takes the max of minute vs session pressure', () => {
    const minute = Array.from({ length: 30 }, (_, i) => i);
    const { usage } = computeUsage({ session: 1, last_minute: minute }, DEFAULT_LIMITS);
    expect(usage).toBeGreaterThanOrEqual(1.0);
  });
});
