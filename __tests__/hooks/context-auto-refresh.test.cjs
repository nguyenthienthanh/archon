'use strict';
/**
 * context-auto-refresh.test.cjs — Phase 2 RED tests for FEAT-008 / STORY-0015.
 *
 * The self-healing auto-refresh hook keeps the durable snapshot fresh without
 * the user ever manually re-scanning. It fires on a lifecycle event (Stop),
 * and decides whether to regenerate based on: snapshot freshness, a debounce
 * window (so it never thrashes on every event), and a disable switch.
 *
 * These tests pin the DECISION logic (pure, deterministic). The side-effecting
 * regeneration is exercised via the context-snapshot module's own tests.
 *
 * Test framework: Jest (see jest.config.cjs).
 */

const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

const hook = require('../../archon-os/hooks/context-auto-refresh.cjs');

function mkTmp(prefix) { return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix)); }
function rmTmp(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

describe('context-auto-refresh: API surface', () => {
  test('exports shouldRefresh, readLastRefresh, writeLastRefresh, DEBOUNCE_MS', () => {
    expect(typeof hook.shouldRefresh).toBe('function');
    expect(typeof hook.readLastRefresh).toBe('function');
    expect(typeof hook.writeLastRefresh).toBe('function');
    expect(typeof hook.DEBOUNCE_MS).toBe('number');
  });
});

describe('context-auto-refresh: shouldRefresh decision logic', () => {
  const base = { fresh: false, lastRefreshMs: 0, nowMs: 10_000_000, debounceMs: 60_000, disabled: false };

  test('does NOT refresh when disabled', () => {
    expect(hook.shouldRefresh({ ...base, disabled: true })).toBe(false);
  });

  test('does NOT refresh when the snapshot is already fresh', () => {
    expect(hook.shouldRefresh({ ...base, fresh: true })).toBe(false);
  });

  test('does NOT refresh when within the debounce window (anti-thrash)', () => {
    const nowMs = 10_000_000;
    expect(hook.shouldRefresh({ ...base, fresh: false, lastRefreshMs: nowMs - 1000, nowMs, debounceMs: 60_000 })).toBe(false);
  });

  test('DOES refresh when stale and past the debounce window', () => {
    const nowMs = 10_000_000;
    expect(hook.shouldRefresh({ ...base, fresh: false, lastRefreshMs: nowMs - 120_000, nowMs, debounceMs: 60_000 })).toBe(true);
  });

  test('DOES refresh when stale and never refreshed before (lastRefreshMs=0)', () => {
    expect(hook.shouldRefresh({ ...base, fresh: false, lastRefreshMs: 0 })).toBe(true);
  });
});

describe('context-auto-refresh: debounce timestamp persistence', () => {
  test('readLastRefresh returns 0 when the marker file is absent', () => {
    const tmp = mkTmp('ar-ts-');
    try {
      expect(hook.readLastRefresh(path.join(tmp, 'nope.json'))).toBe(0);
    } finally { rmTmp(tmp); }
  });

  test('writeLastRefresh then readLastRefresh round-trips the timestamp', () => {
    const tmp = mkTmp('ar-rt-');
    try {
      const marker = path.join(tmp, 'context-refresh.json');
      hook.writeLastRefresh(marker, 1733000000000);
      expect(hook.readLastRefresh(marker)).toBe(1733000000000);
    } finally { rmTmp(tmp); }
  });
});
