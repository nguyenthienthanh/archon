'use strict';

/**
 * tool-context.cjs — pure readers for the PreToolUse/PostToolUse stdin payload.
 * STORY-0010: the three telemetry hooks read tool name / command / exit code /
 * duration from these instead of the CLAUDE_TOOL_* env vars the API never set.
 *
 * The critical contract: each reader returns null (never a default) when its
 * field is absent, so a real exit 0 is never confused with "missing" and callers
 * can fall back to the legacy env var without a regression.
 */

const {
  readToolName,
  readExitCode,
  readCommand,
  readArgs,
  readDurationMs,
} = require('../tool-context.cjs');

describe('readToolName', () => {
  it('returns the tool_name when present', () => {
    expect(readToolName({ tool_name: 'Bash' })).toBe('Bash');
  });
  it('accepts the legacy `tool` alias when tool_name is absent', () => {
    expect(readToolName({ tool: 'Read' })).toBe('Read');
    expect(readToolName({ tool_name: 'Bash', tool: 'Read' })).toBe('Bash'); // tool_name wins
  });
  it('returns null when absent, empty, non-string, or input is nullish', () => {
    expect(readToolName({})).toBeNull();
    expect(readToolName({ tool_name: '' })).toBeNull();
    expect(readToolName({ tool_name: 42 })).toBeNull();
    expect(readToolName(null)).toBeNull();
    expect(readToolName(undefined)).toBeNull();
  });
});

describe('readExitCode', () => {
  it('reads the event-specific tool_response.exit_code', () => {
    expect(readExitCode({ tool_response: { exit_code: 1 } })).toBe(1);
  });
  it('preserves a real exit code of 0 (not treated as absent)', () => {
    expect(readExitCode({ tool_response: { exit_code: 0 } })).toBe(0);
    expect(readExitCode({ exit_code: 0 })).toBe(0);
  });
  it('falls back to the top-level exit_code when tool_response lacks one', () => {
    expect(readExitCode({ exit_code: 127 })).toBe(127);
    expect(readExitCode({ tool_response: {}, exit_code: 2 })).toBe(2);
  });
  it('prefers tool_response.exit_code over the top-level duplicate', () => {
    expect(readExitCode({ tool_response: { exit_code: 3 }, exit_code: 9 })).toBe(3);
  });
  it('returns null when no numeric exit code exists anywhere', () => {
    expect(readExitCode({})).toBeNull();
    expect(readExitCode({ tool_response: { exit_code: '1' } })).toBeNull();
    expect(readExitCode({ exit_code: null })).toBeNull();
    expect(readExitCode(null)).toBeNull();
  });
});

describe('readCommand', () => {
  it('reads the Bash command from tool_input', () => {
    expect(readCommand({ tool_input: { command: 'npm test' } })).toBe('npm test');
  });
  it('returns null when tool_input has no command, is absent, or command is non-string', () => {
    expect(readCommand({ tool_input: { file_path: '/x' } })).toBeNull();
    expect(readCommand({ tool_input: { command: 12 } })).toBeNull();
    expect(readCommand({})).toBeNull();
    expect(readCommand(null)).toBeNull();
  });
});

describe('readArgs', () => {
  it('serialises the full tool_input object', () => {
    const out = readArgs({ tool_input: { file_path: '/a', limit: 5 } });
    expect(JSON.parse(out)).toEqual({ file_path: '/a', limit: 5 });
  });
  it('round-trips a Read file_path so the tracer can extract it', () => {
    // tool-call-tracer JSON.parses argsRaw to pull .file_path — this must survive.
    const out = readArgs({ tool_input: { file_path: '/repo/x.js' } });
    expect(JSON.parse(out).file_path).toBe('/repo/x.js');
  });
  it('returns null when tool_input is absent or not an object', () => {
    expect(readArgs({})).toBeNull();
    expect(readArgs({ tool_input: 'nope' })).toBeNull();
    expect(readArgs(null)).toBeNull();
  });
});

describe('readDurationMs', () => {
  it('converts the documented seconds float to milliseconds', () => {
    expect(readDurationMs({ duration: 12.5 })).toBe(12500);
    expect(readDurationMs({ duration: 0.42 })).toBe(420);
  });
  it('rounds to the nearest millisecond', () => {
    expect(readDurationMs({ duration: 0.0004 })).toBe(0); // 0.4ms → 0
    expect(readDurationMs({ duration: 0.0006 })).toBe(1); // 0.6ms → 1
  });
  it('treats a real 0 as 0, not absent', () => {
    expect(readDurationMs({ duration: 0 })).toBe(0);
  });
  it('returns null when duration is absent or non-finite', () => {
    expect(readDurationMs({})).toBeNull();
    expect(readDurationMs({ duration: '1.5' })).toBeNull();
    expect(readDurationMs({ duration: Infinity })).toBeNull();
    expect(readDurationMs({ duration: NaN })).toBeNull();
    expect(readDurationMs(null)).toBeNull();
  });
});
