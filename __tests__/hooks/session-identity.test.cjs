/**
 * FEAT-007 / STORY-0010 — session identity unification.
 * session-start.cjs keyed the session state file by data.session_id (a UUID
 * from stdin) while every reader hook keys by process.ppid → readers never
 * found the writer's file (phase reminders, TDD gating, approval checks all
 * read empty state). Fixed via a shared resolveSessionId() (ARCHON_SESSION_ID → ppid).
 */

const path = require('path');
const cfg = require('../../archon-os/hooks/lib/config-utils.cjs');
const sessionState = require('../../archon-os/hooks/lib/session-state.cjs');

describe('resolveSessionId (writer key) matches the reader key', () => {
  it('with ARCHON_SESSION_ID unset, resolves to process.ppid', () => {
    const prev = process.env.ARCHON_SESSION_ID;
    delete process.env.ARCHON_SESSION_ID;
    try {
      expect(cfg.resolveSessionId()).toBe(process.ppid.toString());
    } finally {
      if (prev !== undefined) process.env.ARCHON_SESSION_ID = prev;
    }
  });

  it('the writer session-file path equals the reader (session-state) path', () => {
    const prev = process.env.ARCHON_SESSION_ID;
    delete process.env.ARCHON_SESSION_ID;
    try {
      // Writer computes: getSessionTempPath(resolveSessionId())
      const writerPath = cfg.getSessionTempPath(cfg.resolveSessionId());
      // Reader hub computes: getSessionTempPath(process.ppid) via getSessionFile()
      const readerPath = sessionState.getSessionFile();
      expect(writerPath).toBe(readerPath);
    } finally {
      if (prev !== undefined) process.env.ARCHON_SESSION_ID = prev;
    }
  });

  it('ARCHON_SESSION_ID overrides ppid when set', () => {
    const prev = process.env.ARCHON_SESSION_ID;
    process.env.ARCHON_SESSION_ID = 'pinned-123';
    try {
      expect(cfg.resolveSessionId()).toBe('pinned-123');
    } finally {
      if (prev === undefined) delete process.env.ARCHON_SESSION_ID;
      else process.env.ARCHON_SESSION_ID = prev;
    }
  });

  it('does NOT key by a stdin session_id UUID (the old desync source)', () => {
    // resolveSessionId takes no stdin — proves the writer can no longer prefer a
    // UUID that readers never receive.
    expect(cfg.resolveSessionId.length).toBe(0);
    const prev = process.env.ARCHON_SESSION_ID;
    delete process.env.ARCHON_SESSION_ID;
    try {
      expect(cfg.resolveSessionId()).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i); // not a UUID
    } finally {
      if (prev !== undefined) process.env.ARCHON_SESSION_ID = prev;
    }
  });
});

/**
 * v4 renamed the temp state file's prefix af-session- -> archon-session-. The
 * session key is process.ppid, which does NOT change when the plugin upgrades
 * under a live session — so resolving only to the new name would hand that
 * session empty state and lose its phase and approvals mid-run.
 */
describe('getSessionTempPath — v4 prefix rename', () => {
  const fs = require('fs');
  const os = require('os');

  const canonical = id => path.join(os.tmpdir(), `${cfg.SESSION_STATE_PREFIX}${id}.json`);
  const legacy = id => path.join(os.tmpdir(), `${cfg.LEGACY_SESSION_STATE_PREFIX}${id}.json`);

  // A ppid-shaped id unlikely to collide with a real session on this machine.
  let id;
  beforeEach(() => { id = `test-${process.pid}-${Math.random().toString(36).slice(2)}`; });
  afterEach(() => {
    fs.rmSync(canonical(id), { force: true });
    fs.rmSync(legacy(id), { force: true });
  });

  it('exposes both prefixes, so the sweeper and tests share one definition', () => {
    expect(cfg.SESSION_STATE_PREFIX).toBe('archon-session-');
    expect(cfg.LEGACY_SESSION_STATE_PREFIX).toBe('af-session-');
  });

  it('resolves to the canonical name when neither file exists', () => {
    expect(cfg.getSessionTempPath(id)).toBe(canonical(id));
  });

  it('resolves to the canonical name when that is the file on disk', () => {
    fs.writeFileSync(canonical(id), '{}');
    expect(cfg.getSessionTempPath(id)).toBe(canonical(id));
  });

  it('resolves to the legacy name while that is the only file on disk', () => {
    fs.writeFileSync(legacy(id), '{}');
    expect(cfg.getSessionTempPath(id)).toBe(legacy(id));
  });

  it('prefers the canonical name when both exist', () => {
    fs.writeFileSync(canonical(id), '{}');
    fs.writeFileSync(legacy(id), '{}');
    expect(cfg.getSessionTempPath(id)).toBe(canonical(id));
  });
});
