/**
 * FEAT-007 / STORY-0010 — session identity unification.
 * session-start.cjs keyed the session state file by data.session_id (a UUID
 * from stdin) while every reader hook keys by process.ppid → readers never
 * found the writer's file (phase reminders, TDD gating, approval checks all
 * read empty state). Fixed via a shared resolveSessionId() (AF_SESSION_ID → ppid).
 */

const path = require('path');
const cfg = require('../../archon-os/hooks/lib/af-config-utils.cjs');
const sessionState = require('../../archon-os/hooks/lib/session-state.cjs');

describe('resolveSessionId (writer key) matches the reader key', () => {
  it('with AF_SESSION_ID unset, resolves to process.ppid', () => {
    const prev = process.env.AF_SESSION_ID;
    delete process.env.AF_SESSION_ID;
    try {
      expect(cfg.resolveSessionId()).toBe(process.ppid.toString());
    } finally {
      if (prev !== undefined) process.env.AF_SESSION_ID = prev;
    }
  });

  it('the writer session-file path equals the reader (session-state) path', () => {
    const prev = process.env.AF_SESSION_ID;
    delete process.env.AF_SESSION_ID;
    try {
      // Writer computes: getSessionTempPath(resolveSessionId())
      const writerPath = cfg.getSessionTempPath(cfg.resolveSessionId());
      // Reader hub computes: getSessionTempPath(process.ppid) via getSessionFile()
      const readerPath = sessionState.getSessionFile();
      expect(writerPath).toBe(readerPath);
    } finally {
      if (prev !== undefined) process.env.AF_SESSION_ID = prev;
    }
  });

  it('AF_SESSION_ID overrides ppid when set', () => {
    const prev = process.env.AF_SESSION_ID;
    process.env.AF_SESSION_ID = 'pinned-123';
    try {
      expect(cfg.resolveSessionId()).toBe('pinned-123');
    } finally {
      if (prev === undefined) delete process.env.AF_SESSION_ID;
      else process.env.AF_SESSION_ID = prev;
    }
  });

  it('does NOT key by a stdin session_id UUID (the old desync source)', () => {
    // resolveSessionId takes no stdin — proves the writer can no longer prefer a
    // UUID that readers never receive.
    expect(cfg.resolveSessionId.length).toBe(0);
    const prev = process.env.AF_SESSION_ID;
    delete process.env.AF_SESSION_ID;
    try {
      expect(cfg.resolveSessionId()).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i); // not a UUID
    } finally {
      if (prev !== undefined) process.env.AF_SESSION_ID = prev;
    }
  });
});
