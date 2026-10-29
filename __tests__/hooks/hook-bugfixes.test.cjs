/**
 * FEAT-007 / STORY-0029 — contained hook bug-cleanup batch (audit findings).
 *   1. session-state.cjs clearSession() used fs without requiring it →
 *      ReferenceError swallowed → returned false having cleared nothing.
 *   2. task-track-model.cjs resolveAgentFile never searched
 *      CLAUDE_PLUGIN_ROOT/agents → model stack dead for every installed user.
 *   3. post-compact.cjs looked for state at .claude/… but compact-handoff.cjs
 *      writes to .claude/cache/… → verification never found the files.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const sessionState = require('../../archon-os/hooks/lib/session-state.cjs');
const taskTrack = require('../../archon-os/hooks/task-track-model.cjs');
const POST_COMPACT = path.join(process.cwd(), 'archon-os', 'hooks', 'post-compact.cjs');

describe('session-state.clearSession (fs import fix)', () => {
  it('returns true when no session file exists (fs.existsSync works, not ReferenceError)', () => {
    const f = sessionState.getSessionFile();
    if (fs.existsSync(f)) fs.unlinkSync(f);
    expect(sessionState.clearSession()).toBe(true);
  });

  it('actually removes an existing session file', () => {
    const f = sessionState.getSessionFile();
    fs.writeFileSync(f, '{"x":1}');
    expect(sessionState.clearSession()).toBe(true);
    expect(fs.existsSync(f)).toBe(false);
  });
});

describe('task-track-model.resolveAgentFile (CLAUDE_PLUGIN_ROOT fix)', () => {
  it('finds the agent under CLAUDE_PLUGIN_ROOT/agents (installed-plugin layout)', () => {
    const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plug-'));
    fs.mkdirSync(path.join(pluginRoot, 'agents'), { recursive: true });
    const agentFile = path.join(pluginRoot, 'agents', 'architect.md');
    fs.writeFileSync(agentFile, '---\nname: architect\n---\n');
    const prev = process.env.CLAUDE_PLUGIN_ROOT;
    process.env.CLAUDE_PLUGIN_ROOT = pluginRoot;
    try {
      // projectRoot has no archon-os/agents — only the plugin root does.
      const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
      expect(taskTrack.resolveAgentFile('architect', projectRoot)).toBe(agentFile);
      fs.rmSync(projectRoot, { recursive: true, force: true });
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
      else process.env.CLAUDE_PLUGIN_ROOT = prev;
      fs.rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it('still finds the agent under <projectRoot>/archon-os/agents (dev-repo layout)', () => {
    const prev = process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    try {
      const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
      const dir = path.join(projectRoot, 'archon-os', 'agents');
      fs.mkdirSync(dir, { recursive: true });
      const agentFile = path.join(dir, 'frontend.md');
      fs.writeFileSync(agentFile, '---\nname: frontend\n---\n');
      expect(taskTrack.resolveAgentFile('frontend', projectRoot)).toBe(agentFile);
      fs.rmSync(projectRoot, { recursive: true, force: true });
    } finally {
      if (prev !== undefined) process.env.CLAUDE_PLUGIN_ROOT = prev;
    }
  });
});

describe('post-compact.cjs state path (.claude/cache) fix', () => {
  it('reads state from .claude/cache and flags corrupted JSON (exit 2)', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'));
    fs.mkdirSync(path.join(cwd, '.claude', 'cache'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.claude', 'cache', 'workflow-state.json'), '{ this is not json');
    const r = spawnSync('node', [POST_COMPACT], { cwd, input: '{}', encoding: 'utf8' });
    fs.rmSync(cwd, { recursive: true, force: true });
    // Before the fix it looked at .claude/workflow-state.json (absent) → exit 0.
    expect(r.status).toBe(2);
  });
});
