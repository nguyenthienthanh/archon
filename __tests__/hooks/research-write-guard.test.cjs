/**
 * Tests for archon-os/hooks/research-write-guard.cjs
 *
 * The guard makes /archon-os:research plan-only: while THIS session owns an
 * unexpired marker at <cwd>/.claude/research/.active, file-writing tools may
 * only touch paths under <cwd>/.claude/research/.
 *
 * Both ends are tested on purpose (no-dead-code-no-crossed-jobs §2): a guard
 * that always blocks is as broken as one that never does.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { decide, MARKER_REL, WRITE_TOOLS } = require('../../archon-os/hooks/research-write-guard.cjs');

const HOOK = path.join(__dirname, '../../archon-os/hooks/research-write-guard.cjs');
const SID = 'sess-owner-1111';
const NOW = Date.parse('2026-11-05T12:00:00Z');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-guard-'));
  fs.mkdirSync(path.join(dir, '.claude', 'research'), { recursive: true });
  return dir;
}

function writeMarker(dir, marker) {
  fs.writeFileSync(path.join(dir, MARKER_REL), typeof marker === 'string' ? marker : JSON.stringify(marker));
}

const live = (extra = {}) => ({
  session_id: SID,
  slug: 'demo',
  expires_at: new Date(NOW + 3600e3).toISOString(),
  ...extra,
});

const payload = (dir, tool, file, sid = SID) => ({
  session_id: sid,
  cwd: dir,
  tool_name: tool,
  tool_input: tool === 'NotebookEdit' ? { notebook_path: file } : { file_path: file },
});

describe('research-write-guard', () => {
  let dir;
  beforeEach(() => { dir = tmpProject(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  describe('allows (guard must stay silent)', () => {
    it('no marker → allow', () => {
      expect(decide(payload(dir, 'Write', path.join(dir, 'src/a.js')), { now: NOW }).block).toBe(false);
    });

    it('non-write tool → allow even with a live marker', () => {
      writeMarker(dir, live());
      expect(decide({ ...payload(dir, 'Read', path.join(dir, 'src/a.js')) }, { now: NOW }).block).toBe(false);
      expect(decide({ ...payload(dir, 'Bash', ''), tool_input: { command: 'ls' } }, { now: NOW }).block).toBe(false);
    });

    it('write inside .claude/research/ → allow', () => {
      writeMarker(dir, live());
      const p = payload(dir, 'Write', path.join(dir, '.claude/research/demo/plan.md'));
      expect(decide(p, { now: NOW }).block).toBe(false);
    });

    it('relative path inside research dir → allow', () => {
      writeMarker(dir, live());
      expect(decide(payload(dir, 'Edit', '.claude/research/demo/brief.md'), { now: NOW }).block).toBe(false);
    });

    it('marker owned by another session → allow', () => {
      writeMarker(dir, live({ session_id: 'someone-else' }));
      expect(decide(payload(dir, 'Write', path.join(dir, 'src/a.js')), { now: NOW }).block).toBe(false);
    });

    it('expired marker → allow', () => {
      writeMarker(dir, live({ expires_at: new Date(NOW - 1000).toISOString() }));
      expect(decide(payload(dir, 'Write', path.join(dir, 'src/a.js')), { now: NOW }).block).toBe(false);
    });

    it('marker without session_id (env var was unset) → fail open', () => {
      writeMarker(dir, live({ session_id: '' }));
      expect(decide(payload(dir, 'Write', path.join(dir, 'src/a.js')), { now: NOW }).block).toBe(false);
    });

    it('unparseable marker → fail open', () => {
      writeMarker(dir, '{not json');
      expect(decide(payload(dir, 'Write', path.join(dir, 'src/a.js')), { now: NOW }).block).toBe(false);
    });

    it('AF_RESEARCH_GUARD_DISABLED=1 → allow', () => {
      writeMarker(dir, live());
      const p = payload(dir, 'Write', path.join(dir, 'src/a.js'));
      expect(decide(p, { now: NOW, env: { AF_RESEARCH_GUARD_DISABLED: '1' } }).block).toBe(false);
    });
  });

  describe('blocks (owner session, live marker, outside research dir)', () => {
    it.each(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])('%s outside → block', (tool) => {
      writeMarker(dir, live());
      const r = decide(payload(dir, tool, path.join(dir, 'src/a.js')), { now: NOW });
      expect(r.block).toBe(true);
      expect(r.reason).toMatch(/plan-only/);
      expect(r.reason).toMatch(/demo/);
    });

    it('path traversal out of the research dir → block', () => {
      writeMarker(dir, live());
      const p = payload(dir, 'Write', path.join(dir, '.claude/research/../../src/a.js'));
      expect(decide(p, { now: NOW }).block).toBe(true);
    });

    it('sibling dir sharing the prefix (.claude/research-x) → block', () => {
      writeMarker(dir, live());
      const p = payload(dir, 'Write', path.join(dir, '.claude/research-x/a.md'));
      expect(decide(p, { now: NOW }).block).toBe(true);
    });

    it('rewriting the marker itself → block (would disarm the guard)', () => {
      writeMarker(dir, live());
      expect(decide(payload(dir, 'Write', path.join(dir, MARKER_REL)), { now: NOW }).block).toBe(true);
      expect(decide(payload(dir, 'Edit', MARKER_REL), { now: NOW }).block).toBe(true);
    });

    it('cwd is a sub-directory of the project → marker still found → block', () => {
      writeMarker(dir, live());
      const sub = path.join(dir, 'packages', 'app');
      fs.mkdirSync(sub, { recursive: true });
      const p = { ...payload(sub, 'Write', 'src/a.js') };
      expect(decide(p, { now: NOW }).block).toBe(true);
    });

    it('symlink inside research/ pointing out → block', () => {
      writeMarker(dir, live());
      fs.mkdirSync(path.join(dir, 'src'));
      fs.symlinkSync(path.join(dir, 'src'), path.join(dir, '.claude/research/escape'));
      const p = payload(dir, 'Write', path.join(dir, '.claude/research/escape/a.js'));
      expect(decide(p, { now: NOW }).block).toBe(true);
    });
  });

  describe('path spelling does not false-block', () => {
    it('target given through the realpath of a symlinked cwd → allow', () => {
      writeMarker(dir, live());
      const real = fs.realpathSync(dir); // macOS: /var/... → /private/var/...
      const p = payload(dir, 'Write', path.join(real, '.claude/research/demo/plan.md'));
      expect(decide(p, { now: NOW }).block).toBe(false);
    });

    it('new nested file under research/ that does not exist yet → allow', () => {
      writeMarker(dir, live());
      const p = payload(dir, 'Write', path.join(dir, '.claude/research/new/deep/plan.md'));
      expect(decide(p, { now: NOW }).block).toBe(false);
    });
  });

  it('WRITE_TOOLS covers every file-writing tool', () => {
    expect([...WRITE_TOOLS].sort()).toEqual(['Edit', 'MultiEdit', 'NotebookEdit', 'Write']);
  });

  describe('as a process (exit codes Claude Code reads)', () => {
    const run = (p) => spawnSync('node', [HOOK], {
      input: JSON.stringify(p),
      env: { ...process.env, AF_RESEARCH_GUARD_DISABLED: '' },
      encoding: 'utf8',
    });

    it('exit 0 with no marker', () => {
      expect(run(payload(dir, 'Write', path.join(dir, 'src/a.js'))).status).toBe(0);
    });

    it('exit 2 + stderr reason when blocking', () => {
      writeMarker(dir, { ...live(), expires_at: new Date(Date.now() + 3600e3).toISOString() });
      const r = run(payload(dir, 'Write', path.join(dir, 'src/a.js')));
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/plan-only/);
    });

    it('exit 0 on garbage stdin (never wedges a tool call)', () => {
      const r = spawnSync('node', [HOOK], { input: 'not json', encoding: 'utf8' });
      expect(r.status).toBe(0);
    });
  });

  it('blocks through dispatch.cjs too (the way hooks.json runs it)', () => {
    writeMarker(dir, { ...live(), expires_at: new Date(Date.now() + 3600e3).toISOString() });
    const DISPATCH = path.join(__dirname, '../../archon-os/hooks/dispatch.cjs');
    const r = spawnSync('node', [DISPATCH, 'research-write-guard'], {
      input: JSON.stringify(payload(dir, 'Write', path.join(dir, 'src/a.js'))),
      env: { ...process.env, AF_RESEARCH_GUARD_DISABLED: '' },
      encoding: 'utf8',
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/plan-only/);
  });

  it('is registered in the PreToolUse dispatch chain, not as a second gate', () => {
    const hooks = require('../../archon-os/hooks/hooks.json').hooks.PreToolUse;
    const cmds = hooks.flatMap((e) => e.hooks.map((h) => h.command));
    const dispatchWithGuard = cmds.filter((c) => c.includes('dispatch.cjs') && /\bresearch-write-guard\b/.test(c));
    expect(dispatchWithGuard).toHaveLength(1);
    expect(cmds.filter((c) => c.includes('research-write-guard.cjs'))).toHaveLength(0);
    const entry = hooks.find((e) => e.hooks.some((h) => /\bresearch-write-guard\b/.test(h.command)));
    const routed = entry.matcher.split('|');
    for (const t of WRITE_TOOLS) expect(routed).toContain(t);
  });
});
