/**
 * FEAT-011 / STORY-0027 — model/effort statusline tracking.
 * task-track-model now: prefers tool_input.model over frontmatter, parses
 * effort: from frontmatter + tool_input, and tracks built-in agents when the
 * call carries an explicit override.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const m = require('../../archon-os/hooks/task-track-model.cjs');

describe('parseEffortFromFrontmatter', () => {
  it('reads a valid effort tier', () => {
    expect(m.parseEffortFromFrontmatter('---\nname: x\neffort: high\n---\n')).toBe('high');
    expect(m.parseEffortFromFrontmatter('---\nreasoning_effort: max\n---\n')).toBe('max');
  });
  it('returns null for absent or invalid effort', () => {
    expect(m.parseEffortFromFrontmatter('---\nname: x\n---\n')).toBeNull();
    expect(m.parseEffortFromFrontmatter('---\neffort: turbo\n---\n')).toBeNull();
    expect(m.parseEffortFromFrontmatter('')).toBeNull();
  });
});

describe('processPreToolUse — model/effort resolution', () => {
  function mkAgent(model, effort) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-'));
    const dir = path.join(root, 'archon-os', 'agents');
    fs.mkdirSync(dir, { recursive: true });
    const fm = ['---', 'name: architect', model ? `model: ${model}` : '', effort ? `effort: ${effort}` : '', '---', ''].filter(Boolean).join('\n');
    fs.writeFileSync(path.join(dir, 'architect.md'), fm);
    return root;
  }
  function run(root, toolInput) {
    const stackFile = path.join(root, 'stack.jsonl');
    return m.processPreToolUse({ tool_name: 'Task', tool_input: toolInput }, { projectRoot: root, stackFile });
  }

  it('uses frontmatter model + effort when no override', () => {
    const root = mkAgent('claude-sonnet-4-5', 'high');
    const r = run(root, { subagent_type: 'architect' });
    fs.rmSync(root, { recursive: true, force: true });
    expect(r.action).toBe('push');
    expect(r.entry.model).toBe('claude-sonnet-4-5');
    expect(r.entry.effort).toBe('high');
  });

  it('tool_input.model + effort OVERRIDE frontmatter', () => {
    const root = mkAgent('claude-sonnet-4-5', 'high');
    const r = run(root, { subagent_type: 'architect', model: 'claude-opus-4-8', effort: 'max' });
    fs.rmSync(root, { recursive: true, force: true });
    expect(r.entry.model).toBe('claude-opus-4-8');
    expect(r.entry.effort).toBe('max');
  });

  it('tracks a built-in agent WHEN the call carries an override', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-'));
    const r = run(root, { subagent_type: 'general-purpose', model: 'claude-haiku-4-5', effort: 'low' });
    fs.rmSync(root, { recursive: true, force: true });
    expect(r.action).toBe('push');
    expect(r.entry.model).toBe('claude-haiku-4-5');
    expect(r.entry.effort).toBe('low');
  });

  it('skips a built-in agent with no override (nothing to display)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-'));
    const r = run(root, { subagent_type: 'general-purpose' });
    fs.rmSync(root, { recursive: true, force: true });
    expect(r.action).toBe('skip');
  });
});
