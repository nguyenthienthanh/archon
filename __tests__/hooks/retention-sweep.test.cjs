/**
 * session-start — retention sweep coverage for the unbounded-growth targets.
 *
 * Before this, sweepRetention() pruned only mcp-audit.jsonl, the LEGACY
 * plans/traces/ dir, and metrics/sessions. Three stores grew forever:
 *   - .claude/plans/history.jsonl + conflicts.jsonl (six hooks append, none prune)
 *   - co-located {taskFolder}/trace.jsonl (v3.7.3+ tracer default)
 *   - .claude/logs/runs/<id>/ (one dir per workflow)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  sweepRetention,
  findCoLocatedTraces,
  pruneStaleRunDirs,
  pruneJsonlByTimestamp,
} = require('../../archon-os/hooks/session-start.cjs');

const DAY = 24 * 3600 * 1000;
const OLD_TS = new Date(Date.now() - 60 * DAY).toISOString();
const NEW_TS = new Date().toISOString();

let root;
const savedEnv = {};

const mk = (...parts) => {
  const p = path.join(root, ...parts);
  fs.mkdirSync(p, { recursive: true });
  return p;
};

// Backdate mtime so the "recently written" fast path doesn't skip the prune.
const backdate = (p, days = 60) => {
  const t = new Date(Date.now() - days * DAY);
  fs.utimesSync(p, t, t);
};

const writeJsonl = (file, lines, { age = 60 } = {}) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n') + '\n');
  backdate(file, age);
  return file;
};

const readLines = (p) =>
  fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean) : null;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sweep-'));
  for (const k of ['AF_PROJECT_ROOT', 'AF_PLANS_DIR', 'AF_AUDIT_RETENTION_DAYS']) savedEnv[k] = process.env[k];
  process.env.AF_PROJECT_ROOT = root;
  process.env.AF_PLANS_DIR = path.join(root, '.claude', 'plans');
  delete process.env.AF_AUDIT_RETENTION_DAYS; // exercise the 30-day default
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('sweepRetention — legacy workflows root', () => {
  // team-bridge's resolveWorkflowDir() falls back to .claude/logs/workflows, and
  // a workflow that landed there was never swept — carrying its unrotated
  // teams/phase-*/team-log.jsonl and per-agent logs with it, forever.
  it('prunes stale dirs under .claude/logs/workflows, not just runs', () => {
    const workflows = path.join(root, '.claude', 'logs', 'workflows');
    const stale = path.join(workflows, 'wf-old', 'teams', 'phase-3-build');
    fs.mkdirSync(stale, { recursive: true });
    fs.writeFileSync(path.join(stale, 'team-log.jsonl'), `{"ts":"${OLD_TS}"}\n`);
    backdate(path.join(workflows, 'wf-old'), 60);

    sweepRetention();

    expect(fs.existsSync(path.join(workflows, 'wf-old'))).toBe(false);
  });

  it('keeps a recent workflow dir and its team logs', () => {
    const workflows = path.join(root, '.claude', 'logs', 'workflows');
    const fresh = path.join(workflows, 'wf-new', 'teams', 'phase-3-build');
    fs.mkdirSync(fresh, { recursive: true });
    const log = path.join(fresh, 'team-log.jsonl');
    fs.writeFileSync(log, `{"ts":"${NEW_TS}"}\n`);

    sweepRetention();

    expect(fs.existsSync(log)).toBe(true);
  });
});

describe('sweepRetention — plan history + conflicts', () => {
  it('prunes expired entries from history.jsonl and conflicts.jsonl', () => {
    const history = writeJsonl(path.join(root, '.claude', 'plans', 'history.jsonl'), [
      JSON.stringify({ ts: OLD_TS, event: 'execution_completed', node: 'T-old' }),
      JSON.stringify({ ts: NEW_TS, event: 'execution_completed', node: 'T-new' }),
    ]);
    const conflicts = writeJsonl(path.join(root, '.claude', 'plans', 'conflicts.jsonl'), [
      JSON.stringify({ ts: OLD_TS, conflict_id: 'C-old' }),
      JSON.stringify({ ts: NEW_TS, conflict_id: 'C-new' }),
    ]);

    sweepRetention();

    expect(readLines(history)).toEqual([JSON.stringify({ ts: NEW_TS, event: 'execution_completed', node: 'T-new' })]);
    expect(readLines(conflicts)).toEqual([JSON.stringify({ ts: NEW_TS, conflict_id: 'C-new' })]);
  });

  it('removes history.jsonl entirely when every entry has expired', () => {
    const history = writeJsonl(path.join(root, '.claude', 'plans', 'history.jsonl'), [
      JSON.stringify({ ts: OLD_TS, event: 'a' }),
      JSON.stringify({ ts: OLD_TS, event: 'b' }),
    ]);
    sweepRetention();
    expect(fs.existsSync(history)).toBe(false);
  });

  it('keeps everything when AF_AUDIT_RETENTION_DAYS=0', () => {
    process.env.AF_AUDIT_RETENTION_DAYS = '0';
    const history = writeJsonl(path.join(root, '.claude', 'plans', 'history.jsonl'), [
      JSON.stringify({ ts: OLD_TS, event: 'a' }),
    ]);
    sweepRetention();
    expect(readLines(history)).toHaveLength(1);
  });

  it('honours a custom AF_AUDIT_RETENTION_DAYS window', () => {
    process.env.AF_AUDIT_RETENTION_DAYS = '90';
    const history = writeJsonl(path.join(root, '.claude', 'plans', 'history.jsonl'), [
      JSON.stringify({ ts: OLD_TS, event: 'a' }), // 60 days old — inside a 90-day window
    ]);
    sweepRetention();
    expect(readLines(history)).toHaveLength(1);
  });

  it('is a silent no-op when no plan store exists', () => {
    expect(() => sweepRetention()).not.toThrow();
  });
});

describe('sweepRetention — co-located trace.jsonl', () => {
  const taskTrace = () =>
    path.join(root, '.claude', 'plans', 'features', 'FEAT-001', 'stories', 'STORY-01', 'tasks', 'TASK-1', 'trace.jsonl');

  it('finds and prunes traces nested inside the feature tree', () => {
    const trace = writeJsonl(taskTrace(), [
      JSON.stringify({ ts: OLD_TS, event: 'tool_call' }),
      JSON.stringify({ ts: NEW_TS, event: 'tool_call' }),
    ]);

    sweepRetention();

    expect(readLines(trace)).toEqual([JSON.stringify({ ts: NEW_TS, event: 'tool_call' })]);
  });

  it('still prunes the legacy traces/ dir', () => {
    const legacy = writeJsonl(path.join(root, '.claude', 'plans', 'traces', 'TASK-9.jsonl'), [
      JSON.stringify({ ts: OLD_TS, event: 'tool_call' }),
    ]);
    sweepRetention();
    expect(fs.existsSync(legacy)).toBe(false);
  });
});

describe('findCoLocatedTraces', () => {
  it('returns [] for a missing root', () => {
    expect(findCoLocatedTraces(path.join(root, 'nope'))).toEqual([]);
  });

  it('picks up only files named trace.jsonl', () => {
    const dir = mk('features', 'FEAT-001', 'tasks', 'T1');
    fs.writeFileSync(path.join(dir, 'trace.jsonl'), '');
    fs.writeFileSync(path.join(dir, 'notes.jsonl'), '');
    fs.writeFileSync(path.join(dir, '.trace.count'), '1');

    const found = findCoLocatedTraces(path.join(root, 'features'));
    expect(found.map(f => path.basename(f))).toEqual(['trace.jsonl']);
    expect(path.isAbsolute(found[0])).toBe(true);
  });

  it('respects the depth limit', () => {
    const deep = mk('features', 'a', 'b', 'c', 'd', 'e', 'f', 'g');
    fs.writeFileSync(path.join(deep, 'trace.jsonl'), '');
    expect(findCoLocatedTraces(path.join(root, 'features'), 2)).toEqual([]);
    expect(findCoLocatedTraces(path.join(root, 'features'), 8)).toHaveLength(1);
  });
});

describe('pruneStaleRunDirs', () => {
  const cutoff = () => Date.now() - 30 * DAY;

  it('removes run dirs older than the cutoff and keeps recent ones', () => {
    const runs = mk('.claude', 'logs', 'runs');
    const stale = path.join(runs, 'run-old');
    const fresh = path.join(runs, 'run-new');
    fs.mkdirSync(stale); fs.writeFileSync(path.join(stale, 'workflow-state.json'), '{}');
    fs.mkdirSync(fresh); fs.writeFileSync(path.join(fresh, 'workflow-state.json'), '{}');
    backdate(stale, 60);

    pruneStaleRunDirs(runs, cutoff());

    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('never removes the run named by active-workflow.txt', () => {
    const runs = mk('.claude', 'logs', 'runs');
    const active = path.join(runs, 'run-active');
    fs.mkdirSync(active);
    fs.writeFileSync(path.join(runs, 'active-workflow.txt'), 'run-active\n');
    backdate(active, 90);

    pruneStaleRunDirs(runs, cutoff());

    expect(fs.existsSync(active)).toBe(true);
  });

  it('leaves loose files alone', () => {
    const runs = mk('.claude', 'logs', 'runs');
    const pointer = path.join(runs, 'active-workflow.txt');
    fs.writeFileSync(pointer, 'nothing');
    backdate(pointer, 90);

    pruneStaleRunDirs(runs, cutoff());

    expect(fs.existsSync(pointer)).toBe(true);
  });

  it('is a silent no-op for a missing runs dir', () => {
    expect(() => pruneStaleRunDirs(path.join(root, 'nope'), cutoff())).not.toThrow();
  });

  it('is reached by sweepRetention', () => {
    const runs = mk('.claude', 'logs', 'runs');
    const stale = path.join(runs, 'run-ancient');
    fs.mkdirSync(stale);
    backdate(stale, 90);

    sweepRetention();

    expect(fs.existsSync(stale)).toBe(false);
  });
});

describe('pruneJsonlByTimestamp — streaming rewrite', () => {
  it('prunes a multi-MB file without loading it whole', () => {
    // ~4 MB of expired records + one survivor. The old implementation read the
    // entire file into a string and split it; this asserts the result is still
    // byte-exact after the chunked rewrite.
    const file = path.join(root, 'big.jsonl');
    const pad = 'x'.repeat(4000);
    const lines = [];
    for (let i = 0; i < 1000; i++) lines.push(JSON.stringify({ ts: OLD_TS, i, pad }));
    const survivor = JSON.stringify({ ts: NEW_TS, i: 'keep', pad });
    lines.push(survivor);
    writeJsonl(file, lines);
    expect(fs.statSync(file).size).toBeGreaterThan(3 * 1024 * 1024);

    pruneJsonlByTimestamp(file, Date.now() - 30 * DAY);

    expect(readLines(file)).toEqual([survivor]);
  });

  it('preserves malformed lines and records with no timestamp', () => {
    const file = writeJsonl(path.join(root, 'mixed.jsonl'), [
      'not json at all',
      JSON.stringify({ no_ts: true }),
      JSON.stringify({ ts: OLD_TS, drop: true }),
    ]);

    pruneJsonlByTimestamp(file, Date.now() - 30 * DAY);

    expect(readLines(file)).toEqual(['not json at all', JSON.stringify({ no_ts: true })]);
  });

  it('handles records split across the chunk boundary intact', () => {
    // Lines longer than the 64 KB read chunk exercise the carry buffer.
    const long = 'y'.repeat(200 * 1024);
    const survivor = JSON.stringify({ ts: NEW_TS, long });
    const file = writeJsonl(path.join(root, 'long.jsonl'), [
      JSON.stringify({ ts: OLD_TS, long }),
      survivor,
    ]);

    pruneJsonlByTimestamp(file, Date.now() - 30 * DAY);

    expect(readLines(file)).toEqual([survivor]);
  });

  it('leaves the file byte-identical when nothing expired, and drops no tmp file', () => {
    const file = writeJsonl(path.join(root, 'fresh.jsonl'), [
      JSON.stringify({ ts: NEW_TS, a: 1 }),
      JSON.stringify({ ts: NEW_TS, a: 2 }),
    ]);
    const before = fs.readFileSync(file);

    pruneJsonlByTimestamp(file, Date.now() - 30 * DAY);

    expect(fs.readFileSync(file).equals(before)).toBe(true);
    expect(fs.readdirSync(root).filter(f => f.includes('.tmp-'))).toEqual([]);
  });
});

/**
 * Session state files in the OS temp dir had no cleanup at all — nothing ever
 * removed af-session-<id>.json. That is a correctness bug before a disk one:
 * the id is process.ppid, which the OS recycles, so a file left by a session
 * that ended last week gets read as live state by whatever new Claude Code
 * process lands on that pid.
 */
describe('session-start — stale session state sweep', () => {
  const {
    sweepStaleSessionState,
  } = require('../../archon-os/hooks/session-start.cjs');
  const {
    SESSION_STATE_MAX_AGE_MS,
    readSessionState,
    writeSessionState,
    getSessionTempPath,
  } = require('../../archon-os/hooks/lib/af-config-utils.cjs');

  let tmp;
  const NOW = Date.now();

  const put = (name, ageMs) => {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, JSON.stringify({ active_plan: 'FEAT-A' }));
    const t = (NOW - ageMs) / 1000;
    fs.utimesSync(p, t, t);
    return p;
  };

  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sessweep-')); });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('removes session state older than the 24h window', () => {
    put('af-session-12345.json', 3 * DAY);
    expect(sweepStaleSessionState(NOW, tmp)).toBe(1);
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it('keeps state from a session that is still writing', () => {
    put('af-session-12345.json', 60 * 1000);
    expect(sweepStaleSessionState(NOW, tmp)).toBe(0);
    expect(fs.readdirSync(tmp)).toEqual(['af-session-12345.json']);
  });

  it('also collects the .<rand> sidecars a crashed write leaves behind', () => {
    put('af-session-12345.json.k3n9x', 3 * DAY);
    expect(sweepStaleSessionState(NOW, tmp)).toBe(1);
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it('touches nothing else in the shared temp dir', () => {
    put('some-other-tool.json', 90 * DAY);
    put('session-12345.json', 90 * DAY);
    expect(sweepStaleSessionState(NOW, tmp)).toBe(0);
    expect(fs.readdirSync(tmp).sort()).toEqual(['session-12345.json', 'some-other-tool.json']);
  });

  it('is silent on a missing directory', () => {
    expect(sweepStaleSessionState(NOW, path.join(tmp, 'nope'))).toBe(0);
  });

  it('readSessionState refuses a stale file even before the sweep reaches it', () => {
    const saved = process.env.TMPDIR;
    process.env.TMPDIR = tmp;
    try {
      expect(writeSessionState('99999', { active_plan: 'FEAT-A' })).toBe(true);
      expect(readSessionState('99999')).toEqual({ active_plan: 'FEAT-A' });

      // Age it past the window without touching anything else.
      const p = getSessionTempPath('99999');
      const t = (NOW - SESSION_STATE_MAX_AGE_MS - 60_000) / 1000;
      fs.utimesSync(p, t, t);

      expect(readSessionState('99999')).toBeNull();
    } finally {
      if (saved === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = saved;
    }
  });

  it('readSessionState is still null-safe for a missing file and no id', () => {
    expect(readSessionState('does-not-exist-12345')).toBeNull();
    expect(readSessionState(null)).toBeNull();
  });
});
