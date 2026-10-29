/**
 * FEAT-B — Session memory: turn index + handoff preservation.
 *
 * Each describe block names the acceptance criterion it holds. The failures these
 * tests describe are all the same shape: the hook runs, a file is written, and
 * nothing that would let a cold session resume survives in it.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TURN_INDEX = path.join(ROOT, 'hooks', 'lib', 'turn-index.cjs');
const HANDOFF = path.join(ROOT, 'hooks', 'compact-handoff.cjs');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `af-${prefix}-`));
}

/** One transcript turn: the user record plus the assistant work behind it. */
function turnLines({ n, prompt, files = [], cmds = [], branch = 'main', ts }) {
  const uuid = `uuid-${String(n).padStart(4, '0')}`;
  const lines = [JSON.stringify({
    type: 'user', uuid, parentUuid: null, timestamp: ts, cwd: '/p', gitBranch: branch,
    message: { role: 'user', content: prompt },
  })];
  const content = [{ type: 'text', text: `working on turn ${n}` }];
  for (const f of files) {
    content.push({ type: 'tool_use', name: 'Read', input: { file_path: f } });
  }
  for (const c of cmds) {
    content.push({ type: 'tool_use', name: 'Bash', input: { command: c } });
  }
  lines.push(JSON.stringify({
    type: 'assistant', uuid: `${uuid}-a`, parentUuid: uuid, timestamp: ts, gitBranch: branch,
    message: { role: 'assistant', content },
  }));
  return lines;
}

function writeTranscript(dir, turns) {
  const file = path.join(dir, 'session-abc.jsonl');
  const lines = [];
  turns.forEach((t, i) => lines.push(...turnLines({ n: i + 1, ts: `2026-10-29T0${i % 10}:00:00Z`, ...t })));
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

describe('turn-index module exists and is loadable', () => {
  it('ships at hooks/lib/turn-index.cjs', () => {
    expect(fs.existsSync(TURN_INDEX)).toBe(true);
  });

  it('exports the full surface the hooks need', () => {
    const mod = require(TURN_INDEX);
    for (const fn of ['projectSlug', 'discoverTranscript', 'buildTurnIndex',
      'formatTurnIndex', 'writeTurnIndex', 'readTurnIndex']) {
      expect(typeof mod[fn]).toBe('function');
    }
    expect(typeof mod.TURN_INDEX_MAX_CHARS).toBe('number');
  });
});

describe('AC3 — transcript discovery (the root cause of recent_prompts: [])', () => {
  it('derives the project slug the way Claude Code does', () => {
    const { projectSlug } = require(TURN_INDEX);
    expect(projectSlug('/Users/nguyenthanh/Projects/Personal/aura-frog'))
      .toBe('-Users-nguyenthanh-Projects-Personal-aura-frog');
  });

  it('finds the newest transcript for a cwd when the hook input carries none', () => {
    const home = tmpdir('home');
    const { projectSlug, discoverTranscript } = require(TURN_INDEX);
    const cwd = '/Users/x/Projects/demo';
    const dir = path.join(home, '.claude', 'projects', projectSlug(cwd));
    fs.mkdirSync(dir, { recursive: true });
    const older = path.join(dir, 'older.jsonl');
    const newer = path.join(dir, 'newer.jsonl');
    fs.writeFileSync(older, '{}\n');
    fs.writeFileSync(newer, '{}\n');
    fs.utimesSync(older, new Date('2020-01-01'), new Date('2020-01-01'));
    expect(discoverTranscript({ cwd, home })).toBe(newer);
  });

  it('returns null rather than throwing when the project has no transcript dir', () => {
    const { discoverTranscript } = require(TURN_INDEX);
    expect(discoverTranscript({ cwd: '/nope/nowhere', home: tmpdir('empty') })).toBeNull();
  });
});

describe('AC3 — the turn index is built from the transcript', () => {
  it('yields one entry per real user prompt, with a pointer uuid', () => {
    const dir = tmpdir('t');
    const file = writeTranscript(dir, [
      { prompt: 'fix the login button', files: ['src/login.ts'], cmds: ['npx jest'] },
      { prompt: 'now add a test', files: ['src/login.spec.ts'] },
    ]);
    const { buildTurnIndex } = require(TURN_INDEX);
    const turns = buildTurnIndex(file);
    expect(turns).toHaveLength(2);
    expect(turns[0].n).toBe(1);
    expect(turns[0].headline).toContain('fix the login button');
    expect(turns[0].files).toContain('src/login.ts');
    expect(turns[0].cmds).toContain('npx');
    expect(turns[0].uuid).toBe('uuid-0001');
    expect(turns[0].branch).toBe('main');
  });

  it('skips tool results and injected meta records', () => {
    const dir = tmpdir('t');
    const file = path.join(dir, 's.jsonl');
    fs.writeFileSync(file, [
      JSON.stringify({ type: 'user', uuid: 'u1', timestamp: 'T', isMeta: true, message: { content: 'injected' } }),
      JSON.stringify({ type: 'user', uuid: 'u2', timestamp: 'T', message: { content: [{ type: 'tool_result', content: 'out' }] } }),
      JSON.stringify({ type: 'user', uuid: 'u3', timestamp: 'T', message: { content: 'a real prompt' } }),
    ].join('\n'));
    const { buildTurnIndex } = require(TURN_INDEX);
    const turns = buildTurnIndex(file);
    expect(turns).toHaveLength(1);
    expect(turns[0].headline).toContain('a real prompt');
  });

  it('keeps a slash command that carries arguments — often the key request', () => {
    const dir = tmpdir('t');
    const file = path.join(dir, 's.jsonl');
    fs.writeFileSync(file, JSON.stringify({
      type: 'user', uuid: 'u1', timestamp: 'T',
      message: { content: '<command-name>/archon-os:run</command-name><command-args>ok làm hết đi</command-args>' },
    }));
    const { buildTurnIndex } = require(TURN_INDEX);
    expect(buildTurnIndex(file)[0].headline).toContain('ok làm hết đi');
  });
});

describe('AC3 — the index stays under the injection cap and degrades by tiering', () => {
  it('caps at 10000 characters, the documented SessionStart limit', () => {
    expect(require(TURN_INDEX).TURN_INDEX_MAX_CHARS).toBe(10000);
  });

  it('fits 73 turns whole — the measured real-session size', () => {
    const turns = Array.from({ length: 73 }, (_, i) => ({
      n: i + 1, ts: '2026-10-29T08:00:00Z', headline: `turn ${i} doing something of ordinary length here`,
      files: ['a/b/c.ts'], cmds: ['npx'], branch: 'main', uuid: `uuid-${i}`,
    }));
    const { formatTurnIndex, TURN_INDEX_MAX_CHARS } = require(TURN_INDEX);
    const out = formatTurnIndex(turns);
    expect(out.length).toBeLessThanOrEqual(TURN_INDEX_MAX_CHARS);
    expect(out).toContain('#73');
    expect(out).toContain('#1 ');
  });

  it('on overflow it SAYS what it dropped instead of truncating silently', () => {
    const turns = Array.from({ length: 400 }, (_, i) => ({
      n: i + 1, ts: '2026-10-29T08:00:00Z',
      headline: `turn ${i} ${'x'.repeat(60)}`,
      files: ['a/b/c.ts'], cmds: ['npx'], branch: 'main', uuid: `uuid-${i}`,
    }));
    const { formatTurnIndex, TURN_INDEX_MAX_CHARS } = require(TURN_INDEX);
    const out = formatTurnIndex(turns);
    expect(out.length).toBeLessThanOrEqual(TURN_INDEX_MAX_CHARS);
    expect(out).toContain('#400');
    expect(out).toMatch(/compressed|earlier turns/i);
    expect(out).toMatch(/#1\b/);
  });

  it('never emits a line that would break the one-turn-per-line contract', () => {
    const turns = [{
      n: 1, ts: '2026-10-29T08:00:00Z', headline: 'multi\nline\nprompt',
      files: [], cmds: [], branch: 'main', uuid: 'u1',
    }];
    const body = require(TURN_INDEX).formatTurnIndex(turns)
      .split('\n').filter((l) => l.startsWith('#'));
    expect(body).toHaveLength(1);
  });
});

describe('AC4 — the index is a rebuildable cache, not a second source of truth', () => {
  it('regenerates byte-identically after the file is deleted', () => {
    const dir = tmpdir('t');
    const file = writeTranscript(dir, [{ prompt: 'one' }, { prompt: 'two' }, { prompt: 'three' }]);
    const out = path.join(dir, 'turn-index.tsv');
    const { buildTurnIndex, writeTurnIndex } = require(TURN_INDEX);

    writeTurnIndex(out, buildTurnIndex(file));
    const first = fs.readFileSync(out, 'utf-8');
    fs.unlinkSync(out);
    expect(fs.existsSync(out)).toBe(false);

    writeTurnIndex(out, buildTurnIndex(file));
    expect(fs.readFileSync(out, 'utf-8')).toBe(first);
  });

  it('round-trips through the file so a reader never has to re-parse the transcript', () => {
    const dir = tmpdir('t');
    const file = writeTranscript(dir, [{ prompt: 'alpha', files: ['x.ts'], cmds: ['git status'] }]);
    const out = path.join(dir, 'turn-index.tsv');
    const { buildTurnIndex, writeTurnIndex, readTurnIndex } = require(TURN_INDEX);
    const built = buildTurnIndex(file);
    writeTurnIndex(out, built);
    const read = readTurnIndex(out);
    expect(read).toHaveLength(1);
    expect(read[0].uuid).toBe(built[0].uuid);
    expect(read[0].headline).toBe(built[0].headline);
    expect(read[0].files).toEqual(built[0].files);
  });

  it('a rebuild replaces the file wholesale — stale rows cannot accumulate', () => {
    const dir = tmpdir('t');
    const out = path.join(dir, 'turn-index.tsv');
    const { writeTurnIndex, readTurnIndex } = require(TURN_INDEX);
    const mk = (n) => Array.from({ length: n }, (_, i) => ({
      n: i + 1, ts: 'T', headline: `h${i}`, files: [], cmds: [], branch: 'main', uuid: `u${i}`,
    }));
    writeTurnIndex(out, mk(5));
    writeTurnIndex(out, mk(2));
    expect(readTurnIndex(out)).toHaveLength(2);
  });
});

describe('AC1 — the handoff preserves enough for a cold resume', () => {
  const hooks = require(HANDOFF);

  it('exports a transcript resolver so the handoff never silently has none', () => {
    expect(typeof hooks.resolveTranscript).toBe('function');
  });

  it('falls back to discovery when the hook input carries no transcript_path', () => {
    const home = tmpdir('home');
    const { projectSlug } = require(TURN_INDEX);
    const cwd = '/Users/x/Projects/demo2';
    const dir = path.join(home, '.claude', 'projects', projectSlug(cwd));
    fs.mkdirSync(dir, { recursive: true });
    const t = path.join(dir, 's.jsonl');
    fs.writeFileSync(t, '{}\n');
    expect(hooks.resolveTranscript({}, { cwd, home, env: {} })).toBe(t);
  });

  it('prefers an explicit transcript_path over discovery', () => {
    expect(hooks.resolveTranscript({ transcript_path: '/explicit/a.jsonl' }, { env: {} }))
      .toBe('/explicit/a.jsonl');
  });

  it('context is never an empty object on a real project', () => {
    // The shipped bug: getSessionContext() read only env vars, every one was
    // undefined, and JSON.stringify dropped them — `context: {}` on disk.
    const ctx = hooks.getSessionContext({ root: ROOT, env: {} });
    expect(Object.keys(ctx).length).toBeGreaterThan(0);
    expect(ctx.git_branch).toBeTruthy();
    expect(ctx.project_name).toBeTruthy();
  });

  it('prompts are kept against a stated budget, not an ad-hoc per-prompt cap', () => {
    expect(typeof hooks.PROMPT_BUDGET_CHARS).toBe('number');
    expect(hooks.PROMPT_BUDGET_CHARS).toBeGreaterThan(300);
  });

  it('spends the whole prompt budget rather than clipping every prompt at 300', () => {
    const dir = tmpdir('t');
    const file = path.join(dir, 's.jsonl');
    const long = 'A'.repeat(1200);
    fs.writeFileSync(file, JSON.stringify({
      type: 'user', uuid: 'u1', timestamp: 'T', message: { content: long },
    }));
    const kept = hooks.recentUserPrompts(file, 1);
    // The old code clipped at 300 + '…'. A budget of 4000 must keep this whole.
    expect(kept[0].length).toBe(1200);
  });
});

describe('AC2 — a cold session can reconstruct the task from the handoff alone', () => {
  const hooks = require(HANDOFF);

  it('the resume context names the task, the branch and where to look', () => {
    const handoff = {
      name: 'demo', title: 'Demo session', session_id: 'sid',
      saved_at: new Date().toISOString(), reason: 'compact',
      project: { kind: 'code', plan_docs: ['docs/ROADMAP.md'] },
      plan: { mission: 'MISSION', initiative: 'INIT-1', feature: 'FEAT-B' },
      context: { git_branch: 'feat/session-memory', project_name: 'aura-frog' },
      recent_prompts: ['implement the turn index'],
      modified_files: ['archon-os/hooks/lib/turn-index.cjs'],
      turn_index: ['#1 │ 08:00 │ implement the turn index │ turn-index.cjs │ npx │ feat/session-memory │ uuid-0001'],
      resume_hint: '/run resume demo',
    };
    const out = hooks.generateResumeContext(handoff);
    expect(out).toContain('implement the turn index');
    expect(out).toContain('FEAT-B');
    expect(out).toContain('docs/ROADMAP.md');
    expect(out).toContain('turn-index.cjs');
  });

  it('a handoff with a turn index surfaces it for the cold session', () => {
    const out = hooks.generateResumeContext({
      name: 'x', saved_at: new Date().toISOString(),
      turn_index: ['#9 │ 09:00 │ the thing I was doing │ a.ts │ npx │ main │ uuid-9'],
      recent_prompts: [], project: { kind: 'code', plan_docs: [] },
    });
    expect(out).toContain('the thing I was doing');
  });

  it('buildHandoff carries the turn index when a transcript is reachable', () => {
    const dir = tmpdir('t');
    const file = writeTranscript(dir, [{ prompt: 'the task at hand' }]);
    const h = hooks.buildHandoff({ input: { transcript_path: file, session_id: 'sid' } });
    expect(Array.isArray(h.turn_index)).toBe(true);
    expect(h.turn_index.join('\n')).toContain('the task at hand');
    expect(h.recent_prompts.join('\n')).toContain('the task at hand');
  });
});

describe('AC5 — no embeddings, no vector store, no third-party key', () => {
  it('the turn index reaches for nothing off-machine', () => {
    const src = fs.readFileSync(TURN_INDEX, 'utf-8');
    for (const banned of ['voyage', 'openai', 'embedding', 'node:sqlite', 'pinecone', 'chroma']) {
      expect(src.toLowerCase()).not.toContain(banned);
    }
  });

  it('it requires only node builtins and repo-local libs', () => {
    const src = fs.readFileSync(TURN_INDEX, 'utf-8');
    const reqs = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    for (const r of reqs) {
      expect(r.startsWith('node:') || r.startsWith('.') || ['fs', 'path', 'os'].includes(r)).toBe(true);
    }
  });
});

describe('AC3 — the index is refreshed at Stop and injected at SessionStart', () => {
  const hooks = require(HANDOFF);

  it('refreshTurnIndex writes the index file from the transcript', () => {
    const dir = tmpdir('t');
    const file = writeTranscript(dir, [{ prompt: 'first ask' }, { prompt: 'second ask' }]);
    const p = { root: dir, turnIndexFile: path.join(dir, 'cache', 'turn-index.tsv') };
    const turns = hooks.refreshTurnIndex(p, file);
    expect(turns).toHaveLength(2);
    expect(fs.existsSync(p.turnIndexFile)).toBe(true);
    expect(require(TURN_INDEX).readTurnIndex(p.turnIndexFile)).toHaveLength(2);
  });

  it('refreshTurnIndex is a no-op, not a throw, when no transcript is reachable', () => {
    // AF_TRANSCRIPT_PATH is exported by a live session and takes precedence by
    // design, so the no-transcript case has to be asserted with it cleared.
    const dir = tmpdir('t');
    const p = { root: dir, turnIndexFile: path.join(dir, 'turn-index.tsv') };
    const saved = process.env.AF_TRANSCRIPT_PATH;
    delete process.env.AF_TRANSCRIPT_PATH;
    try {
      expect(hooks.refreshTurnIndex(p, null)).toEqual([]);
      expect(fs.existsSync(p.turnIndexFile)).toBe(false);
    } finally {
      if (saved !== undefined) process.env.AF_TRANSCRIPT_PATH = saved;
    }
  });

  it('an env-named transcript wins over discovery — a live session owns its own', () => {
    const dir = tmpdir('t');
    const file = writeTranscript(dir, [{ prompt: 'from the env' }]);
    const saved = process.env.AF_TRANSCRIPT_PATH;
    process.env.AF_TRANSCRIPT_PATH = file;
    try {
      expect(hooks.resolveTranscript({}, { cwd: '/nowhere' })).toBe(file);
    } finally {
      if (saved === undefined) delete process.env.AF_TRANSCRIPT_PATH;
      else process.env.AF_TRANSCRIPT_PATH = saved;
    }
  });

  it('appendTurnIndex adds the index to a SessionStart payload', () => {
    const dir = tmpdir('t');
    const file = writeTranscript(dir, [{ prompt: 'the earlier work' }]);
    const p = { root: dir, turnIndexFile: path.join(dir, 'turn-index.tsv') };
    hooks.refreshTurnIndex(p, file);
    const out = hooks.appendTurnIndex('# resume banner', p, { transcript_path: file });
    expect(out).toContain('# resume banner');
    expect(out).toContain('the earlier work');
  });

  it('rebuilds a missing index rather than injecting nothing', () => {
    const dir = tmpdir('t');
    const file = writeTranscript(dir, [{ prompt: 'rebuild me' }]);
    const p = { root: dir, turnIndexFile: path.join(dir, 'gone.tsv') };
    expect(fs.existsSync(p.turnIndexFile)).toBe(false);
    const out = hooks.appendTurnIndex('', p, { transcript_path: file });
    expect(out).toContain('rebuild me');
    expect(fs.existsSync(p.turnIndexFile)).toBe(true);
  });

  it('never pushes a SessionStart payload past the 10000-character cap', () => {
    const dir = tmpdir('t');
    const file = writeTranscript(dir, Array.from({ length: 300 }, (_, i) => ({
      prompt: `turn ${i} ${'y'.repeat(120)}`, files: ['some/deep/path/file.ts'], cmds: ['npx jest'],
    })));
    const p = { root: dir, turnIndexFile: path.join(dir, 'turn-index.tsv') };
    hooks.refreshTurnIndex(p, file);
    const banner = 'B'.repeat(2000);
    const out = hooks.appendTurnIndex(banner, p, { transcript_path: file });
    expect(out.length).toBeLessThanOrEqual(require(TURN_INDEX).TURN_INDEX_MAX_CHARS);
    expect(out).toMatch(/compressed|earlier turns/i);
  });

  it('does not print the index twice when the handoff already carried one', () => {
    const dir = tmpdir('t');
    const file = writeTranscript(dir, [{ prompt: 'only once' }]);
    const p = { root: dir, turnIndexFile: path.join(dir, 'turn-index.tsv') };
    hooks.refreshTurnIndex(p, file);
    const withIndex = hooks.generateResumeContext(
      hooks.buildHandoff({ input: { transcript_path: file, session_id: 's' } }),
    );
    const once = hooks.appendTurnIndex(withIndex, p, { transcript_path: file });
    expect(once).toBe(withIndex);
  });

  it('leaves the payload alone when there is no room left', () => {
    const dir = tmpdir('t');
    const file = writeTranscript(dir, [{ prompt: 'squeezed out' }]);
    const p = { root: dir, turnIndexFile: path.join(dir, 'turn-index.tsv') };
    hooks.refreshTurnIndex(p, file);
    const huge = 'H'.repeat(9900);
    expect(hooks.appendTurnIndex(huge, p, { transcript_path: file })).toBe(huge);
  });
});
