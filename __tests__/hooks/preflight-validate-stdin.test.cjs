/**
 * FEAT-007 / STORY-0009 — pre-flight-validate reads tool context from stdin.
 * It read process.env.CLAUDE_TOOL_NAME (never set) and exited before running →
 * the BLOCKING pre-flight safety gate validated nothing. Now reads stdin and
 * bridges the tool context to the env vars run-all.sh consumes.
 */

const { buildChildEnv, jqAvailable } = require('../../archon-os/hooks/pre-flight-validate.cjs');

describe('pre-flight-validate.buildChildEnv', () => {
  it('bridges a Write tool_input to the env run-all.sh reads', () => {
    const env = buildChildEnv({ tool_name: 'Write', tool_input: { file_path: '/a.js', content: 'x' } }, { PATH: '/bin' });
    expect(env.CLAUDE_TOOL_NAME).toBe('Write');
    expect(env.CLAUDE_FILE_PATHS).toBe('/a.js');
    expect(JSON.parse(env.CLAUDE_TOOL_INPUT)).toEqual({ file_path: '/a.js', content: 'x' });
    expect(env.PATH).toBe('/bin'); // base env preserved
  });

  it('bridges a Bash command', () => {
    const env = buildChildEnv({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }, {});
    expect(env.CLAUDE_TOOL_NAME).toBe('Bash');
    expect(env.CLAUDE_TOOL_COMMAND).toBe('rm -rf /');
  });

  it('leaves the base env untouched when there is no tool context', () => {
    const env = buildChildEnv({}, { HOME: '/h' });
    expect(env.HOME).toBe('/h');
    expect(env.CLAUDE_TOOL_NAME).toBeUndefined();
    expect(env.CLAUDE_TOOL_INPUT).toBeUndefined();
  });

  it('is null-safe', () => {
    expect(buildChildEnv(null, { X: '1' })).toEqual({ X: '1' });
  });
});

/**
 * BUGFIX — the Tier-1 shell linters parse the tool payload with `jq`. On a
 * machine WITHOUT jq, validate-tool-input.sh read empty fields and FALSELY
 * reported "missing command/file_path" (exit 2), blocking every tool call and
 * bricking the session. The hook now fails open when jq is absent.
 */
describe('pre-flight-validate.jqAvailable (fail-open on missing jq)', () => {
  it('is exported and returns a boolean (never throws)', () => {
    expect(typeof jqAvailable).toBe('function');
    expect(typeof jqAvailable()).toBe('boolean');
  });
});

/**
 * The hooks.json matcher is Bash|Read|Write|Edit|Glob|Grep, but neither
 * run-all.sh nor validate-tool-input.sh has a case for Glob or Grep — the whole
 * bash tree spawned, matched nothing, and exited 0 on every search.
 */
describe('pre-flight-validate — tools with no applicable check', () => {
  const { NO_CHECKS_APPLY } = require('../../archon-os/hooks/pre-flight-validate.cjs');

  it('lists exactly the read-only search tools', () => {
    expect([...NO_CHECKS_APPLY].sort()).toEqual(['Glob', 'Grep']);
  });

  it('does not list the tools run-all.sh actually dispatches on', () => {
    for (const tool of ['Bash', 'Read', 'Write', 'Edit']) {
      expect(NO_CHECKS_APPLY.has(tool)).toBe(false);
    }
  });
});
