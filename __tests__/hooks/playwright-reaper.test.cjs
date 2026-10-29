'use strict';

/**
 * playwright-reaper.cjs — SessionStart janitor that kills ORPHANED playwright
 * processes (a headless Chrome whose MCP server died, reparented to launchd).
 *
 * The safety contract is the whole point: reap only when a process is BOTH
 * orphaned (ppid === 1) AND playwright-launched. A live session's browser
 * (ppid !== 1) and the user's ordinary Chrome (default profile) must survive.
 */

const {
  parsePsLines,
  selectOrphans,
  PLAYWRIGHT_PATTERN,
  CHROME_DEVTOOLS_PATTERN,
  JEST_WORKER_PATTERN,
} = require('../../archon-os/hooks/playwright-reaper.cjs');

// A real orphaned playwright Chrome argv (trimmed) — the exact shape the reaper targets.
const PW_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless '
  + '--user-data-dir=/var/folders/9c/T/playwright_chromiumdev_profile-ykjWIP --remote-debugging-pipe';
const PW_SERVER = 'node /Users/x/.npm/_npx/abc/node_modules/.bin/playwright-mcp';
// A user's ordinary Chrome — MUST never match (default profile, no playwright dir).
// NOTE: on macOS this process is itself ppid 1, so ONLY the pattern protects it.
const USER_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// chrome-devtools-mcp argv shapes, copied from a live `ps` on the dev machine.
const CDT_NPX = 'npm exec chrome-devtools-mcp@latest';
const CDT_SERVER = 'chrome-devtools-mcp';
const CDT_WATCHDOG = '/opt/homebrew/Cellar/node/26.3.0/bin/node '
  + '/Users/x/.npm/_npx/15c61037b1978c83/node_modules/chrome-devtools-mcp/build/src/telemetry/watchdog/main.js '
  + '--parent-pid=39795 --app-version=1.7.0 --os-type=2';
const CDT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome '
  + '--user-data-dir=/Users/x/.cache/chrome-devtools-mcp/chrome-profile --remote-debugging-port=0';

// jest-worker child, copied from a live `ps` while a suite was running.
const JEST_WORKER = '/opt/homebrew/Cellar/node/26.3.0/bin/node '
  + '/Users/x/Projects/aura-frog/node_modules/jest-worker/build/workers/processChild.js';

describe('parsePsLines', () => {
  it('parses pid/ppid/command rows and drops non-matching lines', () => {
    const out = [
      '  PID  PPID COMMAND',        // header → dropped
      ' 21217     1 ' + PW_CHROME,
      ' 27669 27638 ' + PW_SERVER,
      'garbage line',               // dropped
    ].join('\n');
    const recs = parsePsLines(out);
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ pid: 21217, ppid: 1 });
    expect(recs[1]).toMatchObject({ pid: 27669, ppid: 27638 });
    expect(recs[0].command).toContain('playwright_chromiumdev_profile');
  });

  it('is null-safe / empty-safe', () => {
    expect(parsePsLines('')).toEqual([]);
    expect(parsePsLines(null)).toEqual([]);
  });
});

describe('selectOrphans', () => {
  it('reaps an orphaned (ppid 1) playwright Chrome', () => {
    const procs = [{ pid: 21217, ppid: 1, command: PW_CHROME }];
    expect(selectOrphans(procs)).toEqual([21217]);
  });

  it('reaps an orphaned playwright-mcp server', () => {
    expect(selectOrphans([{ pid: 999, ppid: 1, command: PW_SERVER }])).toEqual([999]);
  });

  it('NEVER reaps a playwright browser with a live parent (ppid !== 1)', () => {
    const procs = [{ pid: 500, ppid: 27638, command: PW_CHROME }];
    expect(selectOrphans(procs)).toEqual([]);
  });

  it("NEVER reaps the user's ordinary Chrome, even when orphaned", () => {
    const procs = [{ pid: 700, ppid: 1, command: USER_CHROME }];
    expect(selectOrphans(procs)).toEqual([]);
  });

  it('excludes the reaper process itself', () => {
    const procs = [{ pid: 42, ppid: 1, command: PW_SERVER }];
    expect(selectOrphans(procs, { selfPid: 42 })).toEqual([]);
  });

  it('picks only the qualifying pids from a mixed table', () => {
    const procs = [
      { pid: 1, ppid: 0, command: '/sbin/launchd' },
      { pid: 21217, ppid: 1, command: PW_CHROME },       // reap
      { pid: 500, ppid: 27638, command: PW_CHROME },     // live parent → keep
      { pid: 700, ppid: 1, command: USER_CHROME },       // user chrome → keep
      { pid: 999, ppid: 1, command: PW_SERVER },         // reap
    ];
    expect(selectOrphans(procs).sort((a, b) => a - b)).toEqual([999, 21217].sort((a, b) => a - b));
  });

  it('is null-safe', () => {
    expect(selectOrphans(null)).toEqual([]);
    expect(selectOrphans([{ pid: 1, ppid: 1, command: null }])).toEqual([]);
  });

  describe('chrome-devtools-mcp', () => {
    it.each([
      ['npx wrapper', CDT_NPX],
      ['server binary', CDT_SERVER],
      ['telemetry watchdog', CDT_WATCHDOG],
      ['the Chrome it launched', CDT_CHROME],
    ])('reaps an orphaned %s', (_label, command) => {
      expect(selectOrphans([{ pid: 811, ppid: 1, command }])).toEqual([811]);
    });

    it('NEVER reaps a chrome-devtools process with a live parent', () => {
      expect(selectOrphans([{ pid: 811, ppid: 81031, command: CDT_SERVER }])).toEqual([]);
    });
  });

  describe('jest-worker', () => {
    it('reaps an orphaned jest-worker child', () => {
      expect(selectOrphans([{ pid: 62407, ppid: 1, command: JEST_WORKER }])).toEqual([62407]);
    });

    // The critical one: a RUNNING suite's workers are parented to the jest
    // runner, so the ppid === 1 guard alone keeps them alive.
    it('NEVER reaps a RUNNING suite\'s workers (live jest runner as parent)', () => {
      const procs = [
        { pid: 62407, ppid: 62389, command: JEST_WORKER },
        { pid: 62408, ppid: 62389, command: JEST_WORKER },
        { pid: 62409, ppid: 62389, command: JEST_WORKER },
      ];
      expect(selectOrphans(procs)).toEqual([]);
    });
  });

  it('picks only the qualifying pids from a full mixed table', () => {
    const procs = [
      { pid: 1, ppid: 0, command: '/sbin/launchd' },
      { pid: 8964, ppid: 1, command: USER_CHROME },        // user chrome, ppid 1 → keep
      { pid: 21217, ppid: 1, command: PW_CHROME },         // reap
      { pid: 500, ppid: 27638, command: PW_CHROME },       // live parent → keep
      { pid: 811, ppid: 1, command: CDT_WATCHDOG },        // reap
      { pid: 812, ppid: 81031, command: CDT_SERVER },      // live parent → keep
      { pid: 62407, ppid: 1, command: JEST_WORKER },       // reap
      { pid: 62408, ppid: 62389, command: JEST_WORKER },   // running suite → keep
    ];
    expect(selectOrphans(procs).sort((a, b) => a - b)).toEqual([811, 21217, 62407]);
  });
});

describe('PLAYWRIGHT_PATTERN', () => {
  it('matches playwright temp profile, ms-playwright, and the mcp server; not plain Chrome', () => {
    expect(PLAYWRIGHT_PATTERN.test(PW_CHROME)).toBe(true);
    expect(PLAYWRIGHT_PATTERN.test('/x/ms-playwright/chromium-1234/chrome')).toBe(true);
    expect(PLAYWRIGHT_PATTERN.test('npm exec @playwright/mcp@latest')).toBe(true);
    expect(PLAYWRIGHT_PATTERN.test(USER_CHROME)).toBe(false);
  });
});

describe('CHROME_DEVTOOLS_PATTERN', () => {
  it('matches every chrome-devtools-mcp argv shape; not plain Chrome', () => {
    for (const cmd of [CDT_NPX, CDT_SERVER, CDT_WATCHDOG, CDT_CHROME]) {
      expect(CHROME_DEVTOOLS_PATTERN.test(cmd)).toBe(true);
    }
    expect(CHROME_DEVTOOLS_PATTERN.test(USER_CHROME)).toBe(false);
    // A Chrome DevTools *panel* / devtools:// URL is not the MCP server.
    expect(CHROME_DEVTOOLS_PATTERN.test('devtools://devtools/bundled/inspector.html')).toBe(false);
  });
});

describe('JEST_WORKER_PATTERN', () => {
  it('matches jest-worker children only', () => {
    expect(JEST_WORKER_PATTERN.test(JEST_WORKER)).toBe(true);
    expect(JEST_WORKER_PATTERN.test('node /x/node_modules/jest-worker/build/index.js')).toBe(true);
    expect(JEST_WORKER_PATTERN.test('node /x/src/app.js')).toBe(false);
    // An app's own processChild.js outside a workers/ dir must not match.
    expect(JEST_WORKER_PATTERN.test('node /x/src/processChild.js')).toBe(false);
    expect(JEST_WORKER_PATTERN.test(USER_CHROME)).toBe(false);
  });
});
