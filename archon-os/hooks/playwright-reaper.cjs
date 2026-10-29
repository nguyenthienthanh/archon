#!/usr/bin/env node
/**
 * Aura Frog — Orphan Reaper (playwright + chrome-devtools + jest-worker)
 *
 * Fires: SessionStart
 * Purpose: Kill ORPHANED heavyweight processes left behind by ungraceful exits.
 *          Three known leak sources:
 *            - @playwright/mcp launches a (headless) Chrome; if the server dies
 *              without browser_close, that Chrome is reparented to launchd
 *              (ppid 1) and runs for days, silently loading the machine.
 *            - chrome-devtools-mcp launches a REAL Chrome the same way, and
 *              leaks the same way (server + watchdog + browser).
 *            - jest-worker children hold a full module graph (200-500MB each);
 *              a killed test runner strands them on launchd.
 *          This janitor reaps exactly those.
 *
 * Safety — a process is reaped ONLY when BOTH hold:
 *   1. its command matches a REAP pattern — a playwright-launched process (the
 *      `playwright_chromiumdev_profile` temp user-data-dir, an ms-playwright
 *      browser, a playwright-mcp server), a chrome-devtools-mcp process (server,
 *      telemetry watchdog, or a Chrome whose --user-data-dir is the mcp profile —
 *      all carry the literal `chrome-devtools-mcp` in argv), or a jest-worker
 *      child; AND
 *   2. it is orphaned (ppid === 1) — its launching session/server is dead, so no
 *      live session owns it.
 *
 * Why each guard is load-bearing (they are NOT redundant):
 *   - ppid === 1 protects LIVE work. A browser owned by a running session has its
 *     server as parent, and a RUNNING jest suite's workers have the jest runner as
 *     parent (measured: workers at ppid 62389/68235 while `npm test` ran) — so a
 *     running suite can never be reaped. Only a worker whose runner already died
 *     gets reparented to 1, and that one is genuinely garbage.
 *   - The PATTERN protects the user's own apps — and it, not ppid, is what saves
 *     the user's ordinary Chrome: on macOS the top-level `Google Chrome` process
 *     is itself ppid 1 (measured: pid 8964). It survives only because its argv is
 *     the bare binary with the default profile and matches nothing here. Keep the
 *     patterns anchored to mcp/playwright/jest-specific strings; never widen them
 *     to a bare browser name.
 *
 * Disable: AF_PLAYWRIGHT_REAPER_DISABLED=true
 *
 * Exit codes:
 *   0 — always (best-effort janitor, never blocks a session start)
 *
 * @version 1.1.0
 */

'use strict';

const { execSync } = require('child_process');
const { TIMEOUT_DEFAULT_MS, MAX_BUFFER_LARGE, warnExecLimit } = require('./lib/af-exec.cjs');

// Matches ONLY playwright-launched processes: the temp profile a playwright
// Chrome runs under, the bundled ms-playwright browser path, or the MCP server.
// Deliberately does NOT match a user's ordinary Chrome (default profile).
const PLAYWRIGHT_PATTERN = /playwright_chromiumdev_profile|ms-playwright|playwright-mcp|@playwright\/mcp/i;

// chrome-devtools-mcp: the npx wrapper, the server binary, its telemetry watchdog
// (…/chrome-devtools-mcp/build/src/telemetry/watchdog/main.js) and the Chrome it
// launches (--user-data-dir=…/chrome-devtools-mcp/…) all carry this literal.
// A user's ordinary Chrome never does.
const CHROME_DEVTOOLS_PATTERN = /chrome-devtools-mcp/i;

// jest-worker children: `node …/jest-worker/build/workers/processChild.js`.
// Anchored to the jest-worker package path / that exact worker entrypoint so an
// unrelated `processChild.js` in someone's app is not swept up.
const JEST_WORKER_PATTERN = /jest-worker[/\\]|[/\\]workers[/\\]processChild\.js/i;

// The union actually used for reaping.
const REAP_PATTERN = new RegExp(
  [PLAYWRIGHT_PATTERN, CHROME_DEVTOOLS_PATTERN, JEST_WORKER_PATTERN].map(r => r.source).join('|'),
  'i',
);

// Pure: parse `ps -Ao pid,ppid,command` output into {pid, ppid, command} records.
// The header line and any non-matching lines are dropped.
function parsePsLines(output) {
  const recs = [];
  for (const raw of String(output || '').split('\n')) {
    const m = raw.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (m) recs.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] });
  }
  return recs;
}

// Pure: the pids safe to reap — orphaned (ppid === 1) AND matching a reap
// pattern, excluding this process. Returns [] when nothing qualifies.
function selectOrphans(procs, { selfPid } = {}) {
  return (procs || [])
    .filter(p => p && p.ppid === 1 && p.pid !== selfPid && REAP_PATTERN.test(p.command))
    .map(p => p.pid);
}

function listProcs() {
  // The full process table with argv is big — a couple of Chrome instances
  // alone carry kilobytes of flags each, so Node's 1MB default maxBuffer is a
  // real risk. Reaping nothing is the safe failure, but it must be said out
  // loud: a ps that times out or overflows the buffer otherwise looks
  // identical to "no orphans found", silently disabling the reaper on exactly
  // the busy machines that need it most.
  try {
    return parsePsLines(execSync('ps -Ao pid,ppid,command', {
      encoding: 'utf8',
      timeout: TIMEOUT_DEFAULT_MS,
      killSignal: 'SIGKILL',
      maxBuffer: MAX_BUFFER_LARGE
    }));
  } catch (e) {
    warnExecLimit('playwright-reaper ps', e);
    return [];
  }
}

function reap(pids) {
  const killed = [];
  for (const pid of pids) {
    // SIGKILL: these are confirmed orphans (dead parent) — no graceful shutdown
    // to wait on, and it avoids blocking the session start on a stubborn Chrome.
    try { process.kill(pid, 'SIGKILL'); killed.push(pid); } catch { /* already gone */ }
  }
  return killed;
}

function main() {
  if (process.env.AF_PLAYWRIGHT_REAPER_DISABLED === 'true') return;
  const orphans = selectOrphans(listProcs(), { selfPid: process.pid });
  if (orphans.length === 0) return;
  const killed = reap(orphans);
  if (killed.length > 0) {
    process.stderr.write(
      `[playwright-reaper] reaped ${killed.length} orphaned process(es): ${killed.join(', ')}\n`,
    );
  }
}

// Run as a hook; stay importable for tests. FEAT-007 / issue #5 pattern.
if (require.main === module) {
  main();
} else {
  module.exports = {
    parsePsLines,
    selectOrphans,
    PLAYWRIGHT_PATTERN,
    CHROME_DEVTOOLS_PATTERN,
    JEST_WORKER_PATTERN,
    REAP_PATTERN,
  };
}
