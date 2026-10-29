/**
 * Tests for aura-frog/hooks/task-track-model.cjs and task-clear-model.cjs.
 *
 * Pattern follows scout-block.test.cjs — pure functions are exported from the
 * hook modules and exercised directly. The hook's CLI entry point is guarded
 * by `if (require.main === module)` so requiring the module has no side
 * effects (no stdin read, no file writes).
 *
 * State file under test is namespaced into a per-test tmp dir; nothing
 * touches the real .aura-frog/runtime/ tree.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const track = require('../../aura-frog/hooks/task-track-model.cjs');
const clear = require('../../aura-frog/hooks/task-clear-model.cjs');

const {
  mapModelDisplay,
  parseModelFromFrontmatter,
  normalizeSubagentType,
  resolveAgentFile,
  pushStackEntry,
  buildStackEntry,
  processPreToolUse,
} = track;

const {
  popStackEntry,
  processPostToolUse,
} = clear;

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'af-model-stack-'));
}

function writeAgent(dir, slug, frontmatter) {
  const agentsDir = path.join(dir, 'aura-frog', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  const file = path.join(agentsDir, `${slug}.md`);
  fs.writeFileSync(file, frontmatter);
  return file;
}

describe('task-track-model — pure helpers', () => {
  describe('mapModelDisplay', () => {
    it('maps claude-opus-4-7 to "Opus 4.7"', () => {
      expect(mapModelDisplay('claude-opus-4-7')).toBe('Opus 4.7');
    });
    it('maps claude-opus-4-7[1m] (with bracket suffix) to "Opus 4.7"', () => {
      expect(mapModelDisplay('claude-opus-4-7[1m]')).toBe('Opus 4.7');
    });
    it('maps claude-sonnet-4-6 to "Sonnet 4.6"', () => {
      expect(mapModelDisplay('claude-sonnet-4-6')).toBe('Sonnet 4.6');
    });
    it('maps claude-haiku-4-5-20251001 (with date suffix) to "Haiku 4.5"', () => {
      expect(mapModelDisplay('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
    });
    it('uppercases family when version is absent', () => {
      expect(mapModelDisplay('opus')).toBe('Opus');
    });
    it('returns "(inherit)" for empty or "inherit"', () => {
      expect(mapModelDisplay('')).toBe('(inherit)');
      expect(mapModelDisplay('inherit')).toBe('(inherit)');
      expect(mapModelDisplay(null)).toBe('(inherit)');
      expect(mapModelDisplay(undefined)).toBe('(inherit)');
    });
    it('returns raw value for unknown families', () => {
      expect(mapModelDisplay('gpt-4-turbo')).toBe('gpt-4-turbo');
    });
    it('is case-insensitive on family name', () => {
      expect(mapModelDisplay('claude-OPUS-4-7')).toBe('Opus 4.7');
    });
  });

  describe('parseModelFromFrontmatter', () => {
    it('extracts model with space after colon', () => {
      const fm = '---\nname: foo\nmodel: claude-sonnet-4-6\n---\nbody';
      expect(parseModelFromFrontmatter(fm)).toBe('claude-sonnet-4-6');
    });
    it('extracts model with no space after colon', () => {
      const fm = '---\nname: foo\nmodel:claude-sonnet-4-6\n---\nbody';
      expect(parseModelFromFrontmatter(fm)).toBe('claude-sonnet-4-6');
    });
    it('extracts model with quoted value', () => {
      const fm = '---\nname: foo\nmodel: "claude-opus-4-7"\n---\nbody';
      expect(parseModelFromFrontmatter(fm)).toBe('claude-opus-4-7');
    });
    it('returns "inherit" when model field is missing', () => {
      const fm = '---\nname: foo\ndescription: x\n---\nbody';
      expect(parseModelFromFrontmatter(fm)).toBe('inherit');
    });
    it('returns "inherit" when value is the literal "inherit"', () => {
      const fm = '---\nname: foo\nmodel: inherit\n---\nbody';
      expect(parseModelFromFrontmatter(fm)).toBe('inherit');
    });
    it('returns "inherit" for empty input', () => {
      expect(parseModelFromFrontmatter('')).toBe('inherit');
      expect(parseModelFromFrontmatter(null)).toBe('inherit');
    });
    it('only reads the first frontmatter block (not body lines containing model:)', () => {
      const fm = '---\nname: foo\n---\nbody text mentioning model: fake-model';
      expect(parseModelFromFrontmatter(fm)).toBe('inherit');
    });
  });

  describe('normalizeSubagentType', () => {
    it('strips plugin prefix "archon-os:"', () => {
      expect(normalizeSubagentType('archon-os:code-reviewer')).toBe('code-reviewer');
    });
    it('strips arbitrary plugin prefix', () => {
      expect(normalizeSubagentType('myplugin:agent-x')).toBe('agent-x');
    });
    it('returns bare name unchanged', () => {
      expect(normalizeSubagentType('architect')).toBe('architect');
    });
    it('returns null for empty / falsy input', () => {
      expect(normalizeSubagentType('')).toBe(null);
      expect(normalizeSubagentType(null)).toBe(null);
      expect(normalizeSubagentType(undefined)).toBe(null);
    });
  });

  describe('resolveAgentFile', () => {
    let tmpRoot;
    beforeEach(() => { tmpRoot = mkTmp(); });
    afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

    it('finds an agent under aura-frog/agents/', () => {
      const file = writeAgent(tmpRoot, 'my-agent', '---\nmodel: claude-sonnet-4-6\n---\n');
      expect(resolveAgentFile('my-agent', tmpRoot)).toBe(file);
    });

    it('falls back to .claude/agents/ when not under aura-frog/agents/', () => {
      const projAgents = path.join(tmpRoot, '.claude', 'agents');
      fs.mkdirSync(projAgents, { recursive: true });
      const file = path.join(projAgents, 'local-agent.md');
      fs.writeFileSync(file, '---\nmodel: inherit\n---\n');
      expect(resolveAgentFile('local-agent', tmpRoot)).toBe(file);
    });

    it('returns null for built-in agents (Explore, general-purpose, Plan)', () => {
      expect(resolveAgentFile('Explore', tmpRoot)).toBe(null);
      expect(resolveAgentFile('general-purpose', tmpRoot)).toBe(null);
      expect(resolveAgentFile('Plan', tmpRoot)).toBe(null);
    });

    it('returns null when neither file exists', () => {
      expect(resolveAgentFile('ghost-agent', tmpRoot)).toBe(null);
    });
  });

  describe('buildStackEntry', () => {
    it('builds a complete entry with mapped display', () => {
      const e = buildStackEntry({
        subagentType: 'archon-os:code-reviewer',
        agentFile: '/path/aura-frog/agents/code-reviewer.md',
        model: 'claude-sonnet-4-6',
        sessionId: 'sess-123',
      });
      expect(e.phase).toBe('code-reviewer');
      expect(e.agent_file).toBe('/path/aura-frog/agents/code-reviewer.md');
      expect(e.model).toBe('claude-sonnet-4-6');
      expect(e.model_display).toBe('Sonnet 4.6');
      expect(e.session_id).toBe('sess-123');
      expect(typeof e.started_at).toBe('string');
      expect(e.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('null session id when absent', () => {
      const e = buildStackEntry({ subagentType: 'arch', agentFile: null, model: 'inherit' });
      expect(e.session_id).toBe(null);
      expect(e.model_display).toBe('(inherit)');
    });
  });

  describe('pushStackEntry / popStackEntry', () => {
    let tmpRoot, stackFile;
    beforeEach(() => {
      tmpRoot = mkTmp();
      stackFile = path.join(tmpRoot, '.aura-frog', 'runtime', 'model-stack.jsonl');
    });
    afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

    it('creates parent dir and appends a JSONL line', () => {
      pushStackEntry(stackFile, { phase: 'a', model_display: 'Opus 4.7' });
      const body = fs.readFileSync(stackFile, 'utf8');
      expect(body.trim().split('\n')).toHaveLength(1);
      expect(JSON.parse(body.trim())).toEqual({ phase: 'a', model_display: 'Opus 4.7' });
    });

    it('appends a second line without rewriting the first', () => {
      pushStackEntry(stackFile, { phase: 'a' });
      pushStackEntry(stackFile, { phase: 'b' });
      const lines = fs.readFileSync(stackFile, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).phase).toBe('a');
      expect(JSON.parse(lines[1]).phase).toBe('b');
    });

    it('pops the last line, leaving earlier entries', () => {
      pushStackEntry(stackFile, { phase: 'a' });
      pushStackEntry(stackFile, { phase: 'b' });
      const popped = popStackEntry(stackFile);
      expect(popped).toBe(true);
      const lines = fs.readFileSync(stackFile, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]).phase).toBe('a');
    });

    it('removes the file when popping the last entry', () => {
      pushStackEntry(stackFile, { phase: 'a' });
      const popped = popStackEntry(stackFile);
      expect(popped).toBe(true);
      expect(fs.existsSync(stackFile)).toBe(false);
    });

    it('pop on missing file is a no-op returning false', () => {
      expect(popStackEntry(stackFile)).toBe(false);
    });

    it('pop on empty file removes it and returns false', () => {
      fs.mkdirSync(path.dirname(stackFile), { recursive: true });
      fs.writeFileSync(stackFile, '');
      expect(popStackEntry(stackFile)).toBe(false);
      expect(fs.existsSync(stackFile)).toBe(false);
    });
  });
});

describe('task-track-model — processPreToolUse end-to-end', () => {
  let tmpRoot, stackFile;
  beforeEach(() => {
    tmpRoot = mkTmp();
    stackFile = path.join(tmpRoot, '.aura-frog', 'runtime', 'model-stack.jsonl');
  });
  afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

  it('no-op for non-Task tools', () => {
    const result = processPreToolUse(
      { tool_name: 'Read', tool_input: { file_path: '/foo' } },
      { projectRoot: tmpRoot, stackFile }
    );
    expect(result.action).toBe('skip');
    expect(fs.existsSync(stackFile)).toBe(false);
  });

  it('no-op for Task without subagent_type', () => {
    const result = processPreToolUse(
      { tool_name: 'Task', tool_input: { prompt: 'do thing' } },
      { projectRoot: tmpRoot, stackFile }
    );
    expect(result.action).toBe('skip');
    expect(fs.existsSync(stackFile)).toBe(false);
  });

  it('pushes an entry for Task with valid agent (sonnet)', () => {
    writeAgent(tmpRoot, 'code-reviewer', '---\nname: code-reviewer\nmodel: claude-sonnet-4-6\n---\n');
    const result = processPreToolUse(
      {
        tool_name: 'Task',
        tool_input: { subagent_type: 'archon-os:code-reviewer', prompt: 'x' },
        session_id: 'sess-abc',
      },
      { projectRoot: tmpRoot, stackFile }
    );
    expect(result.action).toBe('push');
    const lines = fs.readFileSync(stackFile, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.phase).toBe('code-reviewer');
    expect(entry.model).toBe('claude-sonnet-4-6');
    expect(entry.model_display).toBe('Sonnet 4.6');
    expect(entry.session_id).toBe('sess-abc');
  });

  it('still pushes (with inherit) when agent file is missing', () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = processPreToolUse(
      { tool_name: 'Task', tool_input: { subagent_type: 'ghost-agent' } },
      { projectRoot: tmpRoot, stackFile }
    );
    // Per spec: missing agent → log to stderr, exit 0, no state file.
    expect(result.action).toBe('skip');
    expect(fs.existsSync(stackFile)).toBe(false);
    expect(stderrSpy).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('falls back to "(inherit)" display for malformed frontmatter', () => {
    writeAgent(tmpRoot, 'broken', 'no frontmatter at all\nnot YAML\n');
    const result = processPreToolUse(
      { tool_name: 'Task', tool_input: { subagent_type: 'broken' } },
      { projectRoot: tmpRoot, stackFile }
    );
    expect(result.action).toBe('push');
    const entry = JSON.parse(fs.readFileSync(stackFile, 'utf8').trim());
    expect(entry.model_display).toBe('(inherit)');
  });

  it('handles nested Task — stack grows to 2', () => {
    writeAgent(tmpRoot, 'arch', '---\nmodel: claude-opus-4-7\n---\n');
    writeAgent(tmpRoot, 'review', '---\nmodel: claude-haiku-4-5\n---\n');
    processPreToolUse(
      { tool_name: 'Task', tool_input: { subagent_type: 'arch' } },
      { projectRoot: tmpRoot, stackFile }
    );
    processPreToolUse(
      { tool_name: 'Task', tool_input: { subagent_type: 'review' } },
      { projectRoot: tmpRoot, stackFile }
    );
    const lines = fs.readFileSync(stackFile, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).phase).toBe('arch');
    expect(JSON.parse(lines[0]).model_display).toBe('Opus 4.7');
    expect(JSON.parse(lines[1]).phase).toBe('review');
    expect(JSON.parse(lines[1]).model_display).toBe('Haiku 4.5');
  });
});

describe('task-clear-model — processPostToolUse end-to-end', () => {
  let tmpRoot, stackFile;
  beforeEach(() => {
    tmpRoot = mkTmp();
    stackFile = path.join(tmpRoot, '.aura-frog', 'runtime', 'model-stack.jsonl');
  });
  afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

  it('no-op for non-Task tools', () => {
    fs.mkdirSync(path.dirname(stackFile), { recursive: true });
    fs.writeFileSync(stackFile, '{"phase":"untouched"}\n');
    const result = processPostToolUse(
      { tool_name: 'Read' },
      { stackFile }
    );
    expect(result.action).toBe('skip');
    expect(fs.readFileSync(stackFile, 'utf8')).toBe('{"phase":"untouched"}\n');
  });

  it('no-op when stack file does not exist', () => {
    const result = processPostToolUse(
      { tool_name: 'Task' },
      { stackFile }
    );
    expect(result.action).toBe('skip');
  });

  it('reduces a 2-entry stack to 1', () => {
    fs.mkdirSync(path.dirname(stackFile), { recursive: true });
    fs.writeFileSync(stackFile, '{"phase":"a"}\n{"phase":"b"}\n');
    const result = processPostToolUse(
      { tool_name: 'Task' },
      { stackFile }
    );
    expect(result.action).toBe('pop');
    const body = fs.readFileSync(stackFile, 'utf8');
    expect(body.trim()).toBe('{"phase":"a"}');
  });

  it('removes the file when popping reduces stack to 0', () => {
    fs.mkdirSync(path.dirname(stackFile), { recursive: true });
    fs.writeFileSync(stackFile, '{"phase":"a"}\n');
    const result = processPostToolUse(
      { tool_name: 'Task' },
      { stackFile }
    );
    expect(result.action).toBe('pop');
    expect(fs.existsSync(stackFile)).toBe(false);
  });
});
