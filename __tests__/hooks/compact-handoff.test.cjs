/**
 * Tests for aura-frog/hooks/compact-handoff.cjs
 *
 * Pure helpers are called in-process. Anything that writes runs the hook as a
 * subprocess with AF_PROJECT_ROOT pointed at a tmp dir, so the working repo's
 * .claude/ is never touched.
 */

const {
  generateResumeContext,
} = require('../../aura-frog/hooks/compact-handoff.cjs');

const HANDOFF = {
  workflow: {
    workflow_id: 'AUTH-123',
    current_phase: 2,
    current_sub_phase: 'b',
    task: { description: 'Implement JWT login' },
    agents: { primary: 'frontend' },
  },
  context: { project_name: 'my-api', framework: 'nextjs', branch: 'feature/auth' },
};

describe('compact-handoff', () => {
  describe('generateResumeContext', () => {
    it('renders the workflow id, task, phase and agent', () => {
      const out = generateResumeContext(HANDOFF);
      expect(out).toContain('AUTH-123');
      expect(out).toContain('Implement JWT login');
      expect(out).toContain('2b');
      expect(out).toContain('frontend');
    });

    it('renders the project context', () => {
      const out = generateResumeContext(HANDOFF);
      expect(out).toContain('my-api');
      expect(out).toContain('nextjs');
    });

    it('falls back when the task description is missing', () => {
      const out = generateResumeContext({ workflow: { workflow_id: 'X', current_phase: 1 } });
      expect(out).toContain('In progress');
    });

    it('falls back to general-purpose when no agent is named', () => {
      const out = generateResumeContext({ workflow: { workflow_id: 'X', current_phase: 1 } });
      expect(out).toContain('general-purpose');
    });

    it('returns a string and does not throw on an empty handoff', () => {
      expect(() => generateResumeContext({})).not.toThrow();
      expect(typeof generateResumeContext({})).toBe('string');
    });
  });

  describe('generateResumeContext — how to continue', () => {
    it('without a run, points at the note/prompts instead of a workflow state', () => {
      const out = generateResumeContext({ name: 'x', resume_hint: '/run resume x', note: 'do y' });
      expect(out).not.toContain('workflow state');
      expect(out).toContain('Continue from the handoff note');
    });
  });

  describe('slugify', () => {
    const { slugify } = require('../../aura-frog/hooks/compact-handoff.cjs');
    it('strips Vietnamese diacritics and punctuation', () => {
      expect(slugify('Làm Truyện')).toBe('lam-truyen');
      expect(slugify('Đèn Ông Sao — Dán Dở!')).toBe('den-ong-sao-dan-do');
      expect(slugify('   ')).toBe('');
    });
  });

  describe('sessionTitle', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { sessionTitle } = require('../../aura-frog/hooks/compact-handoff.cjs');
    it('prefers the latest custom-title, then ai-title, else null', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-title-'));
      const f = path.join(dir, 't.jsonl');
      const w = (es) => fs.writeFileSync(f, es.map((e) => JSON.stringify(e)).join('\n'));
      w([{ type: 'ai-title', aiTitle: 'Auto' }, { type: 'custom-title', customTitle: 'Old' }, { type: 'custom-title', customTitle: 'New' }]);
      expect(sessionTitle(f)).toBe('New');
      w([{ type: 'ai-title', aiTitle: 'Auto' }]);
      expect(sessionTitle(f)).toBe('Auto');
      w([{ type: 'user', message: { content: 'x' } }]);
      expect(sessionTitle(f)).toBeNull();
      expect(sessionTitle(path.join(dir, 'missing'))).toBeNull();
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('shouldSaveOnStop', () => {
    const { shouldSaveOnStop } = require('../../aura-frog/hooks/compact-handoff.cjs');

    it('saves at or above the threshold', () => {
      expect(shouldSaveOnStop({ usage: 70, threshold: 70 })).toBe(true);
      expect(shouldSaveOnStop({ usage: 69.9, threshold: 70, hasOpenWork: true })).toBe(false);
    });

    it('falls back to open work when usage is unknown', () => {
      expect(shouldSaveOnStop({ usage: null, hasOpenWork: true })).toBe(true);
      expect(shouldSaveOnStop({ usage: null, hasOpenWork: false })).toBe(false);
    });
  });

  describe('run-state based save → resume (tmp project root)', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { spawnSync } = require('child_process');
    const HOOK = path.join(__dirname, '..', '..', 'aura-frog', 'hooks', 'compact-handoff.cjs');

    let root;
    let savedEnv;

    function writeRun(id, status, extra = {}) {
      const dir = path.join(root, '.claude', 'logs', 'runs', id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify({
        run_id: id, status, task: `task ${id}`, current_phase: 3, active_agent: 'tester', ...extra,
      }));
    }

    function writeTranscript(entries) {
      const file = path.join(root, 'transcript.jsonl');
      fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n'));
      return file;
    }

    function run(args, input, env = {}) {
      return spawnSync('node', [HOOK, ...args], {
        input: JSON.stringify(input),
        encoding: 'utf8',
        env: { ...process.env, AF_PROJECT_ROOT: root, ...env },
      });
    }

    beforeEach(() => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-handoff-'));
      savedEnv = { ...process.env };
      process.env.AF_PROJECT_ROOT = root;
      for (const k of ['AF_WORKFLOW_ID', 'AF_CURRENT_PHASE', 'PROJECT_NAME', 'AF_PROJECT_NAME', 'AF_CLAUDE_SESSION_ID', 'AF_TRANSCRIPT_PATH', 'CLAUDE_ENV_FILE']) delete process.env[k];
    });

    afterEach(() => {
      process.env = savedEnv;
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('findActiveRun ignores completed runs', () => {
      const { findActiveRun } = require('../../aura-frog/hooks/compact-handoff.cjs');
      writeRun('done-run', 'completed');
      expect(findActiveRun()).toBeNull();
      writeRun('live-run', 'in_progress', { next_action: 'write RED tests' });
      const r = findActiveRun();
      expect(r.run_id).toBe('live-run');
      expect(r.next_action).toBe('write RED tests');
      expect(r.state_file).toBe(path.join('.claude', 'logs', 'runs', 'live-run', 'run-state.json'));
    });

    it('recentUserPrompts keeps real prompts and skips tool results + injected tags', () => {
      const { recentUserPrompts } = require('../../aura-frog/hooks/compact-handoff.cjs');
      const file = writeTranscript([
        { type: 'user', message: { content: 'first ask' } },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } },
        { type: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] } },
        { type: 'user', message: { content: '<command-name>/model</command-name>' } },
        { type: 'user', message: { content: [{ type: 'text', text: 'second ask' }] } },
      ]);
      expect(recentUserPrompts(file)).toEqual(['first ask', 'second ask']);
      expect(recentUserPrompts(path.join(root, 'missing.jsonl'))).toEqual([]);
    });

    it('recentUserPrompts widens the window when the last prompt is behind lots of tool output', () => {
      const { recentUserPrompts } = require('../../aura-frog/hooks/compact-handoff.cjs');
      const noise = { type: 'assistant', message: { content: [{ type: 'text', text: 'x'.repeat(1000) }] } };
      const file = writeTranscript([
        { type: 'user', message: { content: 'the real ask' } },
        ...Array.from({ length: 50 }, () => noise),
      ]);
      expect(recentUserPrompts(file, 3, [1024])).toEqual([]);
      expect(recentUserPrompts(file, 3, [1024, 1024 * 1024])).toEqual(['the real ask']);
    });

    it('recentUserPrompts keeps slash-command prompts that carry args', () => {
      const { recentUserPrompts } = require('../../aura-frog/hooks/compact-handoff.cjs');
      const file = writeTranscript([
        { type: 'user', message: { content: '<command-message>archon-os:run</command-message>\n<command-name>/archon-os:run</command-name>\n<command-args>fix handoff naming</command-args>' } },
        { type: 'user', message: { content: '<command-name>/clear</command-name>\n<command-args></command-args>' } },
      ]);
      expect(recentUserPrompts(file)).toEqual(['/archon-os:run fix handoff naming']);
    });

    const handoffsDir = () => path.join(root, '.claude', 'handoffs');
    const readSaved = (name) => JSON.parse(fs.readFileSync(path.join(handoffsDir(), `${name}.json`), 'utf8'));

    it('PreCompact saves a handoff named after the session, SessionStart(compact) of the same session injects + consumes it', () => {
      writeRun('fix-0913', 'in_progress');
      const transcript = writeTranscript([
        { type: 'custom-title', customTitle: 'Làm Truyện', sessionId: 'sess-aaaa1111' },
        { type: 'user', message: { content: 'fix the resume' } },
      ]);

      expect(run(['--pre-compact'], { trigger: 'auto', session_id: 'sess-aaaa1111', transcript_path: transcript }).status).toBe(0);
      const saved = readSaved('lam-truyen');
      expect(saved.name).toBe('lam-truyen');
      expect(saved.title).toBe('Làm Truyện');
      expect(saved.session_id).toBe('sess-aaaa1111');
      expect(saved.run.run_id).toBe('fix-0913');
      expect(saved.reason).toBe('compact-auto');
      expect(saved.recent_prompts).toEqual(['fix the resume']);
      expect(fs.existsSync(path.join(handoffsDir(), 'lam-truyen.md'))).toBe(true);
      expect(fs.existsSync(path.join(root, '.claude', 'cache', 'compact-handoff.json'))).toBe(false);

      const r = run(['--resume'], { source: 'compact', session_id: 'sess-aaaa1111' });
      const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
      expect(ctx).toContain('fix-0913');
      expect(ctx).toContain('run-state.json');
      expect(ctx).toContain('fix the resume');
      expect(ctx).toContain('Làm Truyện');
      expect(fs.existsSync(path.join(handoffsDir(), 'lam-truyen.json'))).toBe(false);
    });

    it('falls back to ai-title, then to session-<id8>', () => {
      const t1 = writeTranscript([{ type: 'ai-title', aiTitle: 'Websearch fallback fetch' }]);
      run(['--pre-compact'], { trigger: 'manual', session_id: 'sess-bbbb2222', transcript_path: t1 });
      expect(readSaved('websearch-fallback-fetch').session_id).toBe('sess-bbbb2222');

      fs.writeFileSync(path.join(root, 'empty.jsonl'), JSON.stringify({ type: 'user', message: { content: 'hi' } }));
      run(['--pre-compact'], { trigger: 'manual', session_id: 'cccc3333-dead-beef', transcript_path: path.join(root, 'empty.jsonl') });
      expect(readSaved('session-cccc3333').session_id).toBe('cccc3333-dead-beef');
    });

    it('two sessions in the same project keep separate handoffs; each resumes its own', () => {
      const ta = writeTranscript([{ type: 'custom-title', customTitle: 'Alpha' }, { type: 'user', message: { content: 'alpha work' } }]);
      run(['--pre-compact'], { trigger: 'auto', session_id: 'sess-a', transcript_path: ta });
      const tb = path.join(root, 'b.jsonl');
      fs.writeFileSync(tb, [{ type: 'custom-title', customTitle: 'Beta' }, { type: 'user', message: { content: 'beta work' } }]
        .map((e) => JSON.stringify(e)).join('\n'));
      run(['--pre-compact'], { trigger: 'auto', session_id: 'sess-b', transcript_path: tb });

      const ctx = JSON.parse(run(['--resume'], { source: 'compact', session_id: 'sess-b' }).stdout).hookSpecificOutput.additionalContext;
      expect(ctx).toContain('beta work');
      expect(ctx).not.toContain('alpha work');
      expect(fs.existsSync(path.join(handoffsDir(), 'alpha.json'))).toBe(true);
    });

    it('same title from a different session does not overwrite: suffixes the short id', () => {
      const t = writeTranscript([{ type: 'custom-title', customTitle: 'Alpha' }]);
      run(['--pre-compact'], { trigger: 'auto', session_id: 'aaaa0000-1', transcript_path: t });
      run(['--pre-compact'], { trigger: 'auto', session_id: 'bbbb0000-2', transcript_path: t });
      expect(readSaved('alpha').session_id).toBe('aaaa0000-1');
      expect(readSaved('alpha-bbbb0000').session_id).toBe('bbbb0000-2');
    });

    it('SessionStart(startup) of a NEW session lists named handoffs instead of injecting another session', () => {
      const t = writeTranscript([{ type: 'custom-title', customTitle: 'Alpha' }, { type: 'user', message: { content: 'alpha secret work' } }]);
      run(['--pre-compact'], { trigger: 'auto', session_id: 'sess-a', transcript_path: t });

      const ctx = JSON.parse(run(['--resume'], { source: 'startup', session_id: 'sess-new' }).stdout).hookSpecificOutput.additionalContext;
      expect(ctx).toContain('alpha');
      expect(ctx).toContain('/run resume alpha');
      expect(ctx).not.toContain('alpha secret work');
      expect(fs.existsSync(path.join(handoffsDir(), 'alpha.json'))).toBe(true);
    });

    it('SessionStart(clear) does not inject', () => {
      writeRun('fix-0913', 'in_progress');
      run(['--pre-compact'], { trigger: 'manual', session_id: 's1' });
      expect(run(['--resume'], { source: 'clear', session_id: 's1' }).stdout).toBe('');
    });

    it('SessionStart exports the session id + transcript path to CLAUDE_ENV_FILE', () => {
      const envFile = path.join(root, 'env.sh');
      run(['--resume'], { source: 'startup', session_id: 'sess-env', transcript_path: '/x/t.jsonl' }, { CLAUDE_ENV_FILE: envFile });
      const env = fs.readFileSync(envFile, 'utf8');
      expect(env).toContain("AF_CLAUDE_SESSION_ID='sess-env'");
      expect(env).toContain("AF_TRANSCRIPT_PATH='/x/t.jsonl'");
    });

    it('follows the project plan: plan tree resolved from the project root (not cwd) + plan docs', () => {
      fs.mkdirSync(path.join(root, '.git'));
      const plans = path.join(root, '.claude', 'plans');
      fs.mkdirSync(plans, { recursive: true });
      fs.writeFileSync(path.join(plans, 'active.json'), JSON.stringify({ active: { feature: 'FEAT-A', story: 'STORY-1', task: 'TASK-9' } }));
      fs.writeFileSync(path.join(root, 'ROADMAP.md'), '# roadmap');
      fs.mkdirSync(path.join(root, 'docs'));
      fs.writeFileSync(path.join(root, 'docs', 'audio-plan.md'), '# plan');
      fs.writeFileSync(path.join(root, 'README.md'), '# readme');
      const sub = path.join(root, 'src', 'deep');
      fs.mkdirSync(sub, { recursive: true });

      spawnSync('node', [HOOK, '--pre-compact'], {
        cwd: sub, encoding: 'utf8',
        input: JSON.stringify({ trigger: 'auto', session_id: 'sess-plan0000' }),
        env: { ...process.env, AF_PROJECT_ROOT: root },
      });
      const saved = readSaved('session-sess-pla');
      expect(saved.plan).toEqual({ feature: 'FEAT-A', story: 'STORY-1', task: 'TASK-9' });
      expect(saved.project.kind).toBe('code');
      expect(saved.project.plan_docs).toEqual(expect.arrayContaining(['ROADMAP.md', path.join('docs', 'audio-plan.md')]));
      expect(saved.project.plan_docs).not.toContain('README.md');

      const ctx = JSON.parse(run(['--resume'], { source: 'compact', session_id: 'sess-plan0000' }).stdout).hookSpecificOutput.additionalContext;
      expect(ctx).toContain('FEAT-A → STORY-1 → TASK-9');
      expect(ctx).toContain('ROADMAP.md');
      expect(ctx).toMatch(/project'?s plan/i);
    });

    it('non-code project: never creates run/plan logs', () => {
      // no .git, no manifest
      run(['--pre-compact'], { trigger: 'auto', session_id: 'sess-doc' }, { AF_WORKFLOW_ID: 'WF-1', AF_CURRENT_PHASE: '2' });
      expect(fs.existsSync(path.join(root, '.claude', 'logs'))).toBe(false);
      expect(fs.existsSync(path.join(root, '.claude', 'plans'))).toBe(false);
      const saved = readSaved('session-sess-doc');
      expect(saved.project.kind).toBe('non-code');
      expect(saved.workflow).toBeNull();
    });

    it('code project keeps the legacy workflow pause marker', () => {
      fs.writeFileSync(path.join(root, 'package.json'), '{}');
      run(['--pre-compact'], { trigger: 'auto', session_id: 'sess-code' }, { AF_WORKFLOW_ID: 'WF-1', AF_CURRENT_PHASE: '2' });
      expect(fs.existsSync(path.join(root, '.claude', 'logs', 'workflows', 'WF-1', 'workflow-state.json'))).toBe(true);
    });

    it('manual --save uses the exported session env, keeps a note, survives resume; --show prints it', () => {
      const t = writeTranscript([{ type: 'custom-title', customTitle: 'Beta' }, { type: 'user', message: { content: 'beta work' } }]);
      const env = { AF_CLAUDE_SESSION_ID: 'sess-b', AF_TRANSCRIPT_PATH: t };
      const r = run(['--save', '--note', 'Next: wire the cron'], {}, env);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain(path.join('.claude', 'handoffs', 'beta.md'));
      const saved = readSaved('beta');
      expect(saved.kind).toBe('manual');
      expect(saved.note).toBe('Next: wire the cron');

      const ctx = JSON.parse(run(['--resume'], { source: 'compact', session_id: 'sess-b' }).stdout).hookSpecificOutput.additionalContext;
      expect(ctx).toContain('Next: wire the cron');
      expect(fs.existsSync(path.join(handoffsDir(), 'beta.json'))).toBe(true);

      const show = run(['--show', 'beta'], {});
      expect(show.stdout).toContain('Next: wire the cron');
      expect(run(['--show', 'Beta'], {}).stdout).toContain('Next: wire the cron');
    });

    it('Stop saves only when statusline usage crosses the threshold', () => {
      writeRun('fix-0913', 'in_progress');
      const cache = path.join(root, '.claude', 'cache');
      fs.mkdirSync(cache, { recursive: true });
      const usageFile = path.join(cache, 'context-usage.json');
      const now = Math.floor(Date.now() / 1000);

      fs.writeFileSync(usageFile, JSON.stringify({ used_percentage: 40, ts: now }));
      run([], { session_id: 'sess-stop0000' });
      expect(fs.existsSync(path.join(handoffsDir(), 'session-sess-sto.json'))).toBe(false);

      fs.writeFileSync(usageFile, JSON.stringify({ used_percentage: 82, ts: now }));
      run([], { session_id: 'sess-stop0000' });
      expect(readSaved('session-sess-sto').reason).toBe('stop-threshold');
    });

    it('AF_COMPACT_HANDOFF_DISABLED=true writes nothing', () => {
      writeRun('fix-0913', 'in_progress');
      run(['--pre-compact'], { trigger: 'auto', session_id: 's1' }, { AF_COMPACT_HANDOFF_DISABLED: 'true' });
      expect(fs.existsSync(handoffsDir())).toBe(false);
    });
  });
});
