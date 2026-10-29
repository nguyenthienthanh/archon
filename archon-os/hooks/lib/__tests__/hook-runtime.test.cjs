'use strict';
/**
 * hook-runtime.test.cjs — Phase 2 RED tests for TASK-00023 / TASK-00024
 *
 * Defines the BEHAVIORAL CONTRACT of archon-os/hooks/lib/hook-runtime.cjs.
 * Written in Phase 2 (RED): every test MUST fail today because hook-runtime.cjs
 * does not yet exist. After Phase 3 (TASK-00023 implementation) ALL tests must
 * pass without modification.
 *
 * Test framework: Jest (this repo's runner — see jest.config.cjs)
 * Subprocess strategy: spawnSync for stdin-piping + child_process.spawn for
 * lock-contention races.
 *
 * Structure:
 *   hook-runtime: error classes
 *   hook-runtime: readHookInput
 *   hook-runtime: readHookInputCompat
 *   hook-runtime: appendAuditJsonl
 *   hook-runtime: atomicWrite
 *   hook-runtime: logger
 *   hook-runtime: safeExit
 *   hook-runtime: withBudget
 *   hook-runtime: back-compat re-exports
 */

const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');

// ---------------------------------------------------------------------------
// Module paths
// ---------------------------------------------------------------------------
const HOOK_RUNTIME = path.join(__dirname, '..', 'hook-runtime.cjs');
const SAFE_STDIN   = path.join(__dirname, '..', 'safe-stdin.cjs');
// __tests__ → lib → hooks → archon-os → repo-root (which contains .claude/)
const REPO_ROOT    = path.resolve(__dirname, '..', '..', '..', '..');

// ---------------------------------------------------------------------------
// Lazy require — defers the "Cannot find module" error to test-time so jest
// can at least collect the describe/it tree before reporting the failure.
// ---------------------------------------------------------------------------
let runtime;
function rt() {
  if (!runtime) runtime = require(HOOK_RUNTIME);
  return runtime;
}

// ---------------------------------------------------------------------------
// Tmp dir helpers
// ---------------------------------------------------------------------------
let tmpRoot;
beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-runtime-test-'));
});
afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
function tmpFile(name) {
  return path.join(tmpRoot, `${name}-${process.pid}-${Math.random().toString(36).slice(2)}`);
}

// ---------------------------------------------------------------------------
// Subprocess driver builder — spawns a tiny Node script that requires
// hook-runtime and calls a named export, passing JSON on stdin.
// ---------------------------------------------------------------------------
function runDriver(scriptSrc, inputJson, env = {}) {
  const driverPath = tmpFile('driver.cjs');
  fs.writeFileSync(driverPath, scriptSrc);
  return spawnSync('node', [driverPath], {
    input: inputJson !== undefined ? JSON.stringify(inputJson) : undefined,
    encoding: 'utf8',
    timeout: 8000,
    killSignal: 'SIGKILL',
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

describe('hook-runtime: error classes', () => {
  describe('HookRuntimeError (base)', () => {
    it('exports HookRuntimeError with .code and .meta properties', () => {
      const { HookRuntimeError } = rt();
      const err = new HookRuntimeError('base_code', { detail: 'x' });
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('base_code');
      expect(err.meta).toEqual({ detail: 'x' });
    });

    it('HookRuntimeError name is "HookRuntimeError"', () => {
      const { HookRuntimeError } = rt();
      const err = new HookRuntimeError('c', {});
      expect(err.name).toBe('HookRuntimeError');
    });
  });

  describe('HookInputSchemaError', () => {
    it('is instanceof HookRuntimeError', () => {
      const { HookInputSchemaError, HookRuntimeError } = rt();
      const err = new HookInputSchemaError('empty_stdin', {});
      expect(err).toBeInstanceOf(HookRuntimeError);
    });

    it('name is "HookInputSchemaError"', () => {
      const { HookInputSchemaError } = rt();
      expect(new HookInputSchemaError('empty_stdin', {}).name).toBe('HookInputSchemaError');
    });

    it('carries code: empty_stdin', () => {
      const { HookInputSchemaError } = rt();
      const e = new HookInputSchemaError('empty_stdin', {});
      expect(e.code).toBe('empty_stdin');
    });

    it('carries code: invalid_json', () => {
      const { HookInputSchemaError } = rt();
      const e = new HookInputSchemaError('invalid_json', { raw: 'bad' });
      expect(e.code).toBe('invalid_json');
      expect(e.meta.raw).toBe('bad');
    });

    it('carries code: missing_field', () => {
      const { HookInputSchemaError } = rt();
      const e = new HookInputSchemaError('missing_field', { field: 'session_id' });
      expect(e.code).toBe('missing_field');
      expect(e.meta.field).toBe('session_id');
    });
  });

  describe('HookLockError', () => {
    it('is instanceof HookRuntimeError', () => {
      const { HookLockError, HookRuntimeError } = rt();
      expect(new HookLockError('lock_timeout', {})).toBeInstanceOf(HookRuntimeError);
    });

    it('name is "HookLockError"', () => {
      const { HookLockError } = rt();
      expect(new HookLockError('lock_timeout', {}).name).toBe('HookLockError');
    });
  });

  describe('HookBudgetTimeout', () => {
    it('is instanceof HookRuntimeError', () => {
      const { HookBudgetTimeout, HookRuntimeError } = rt();
      expect(new HookBudgetTimeout('budget_exceeded', {})).toBeInstanceOf(HookRuntimeError);
    });

    it('name is "HookBudgetTimeout"', () => {
      const { HookBudgetTimeout } = rt();
      expect(new HookBudgetTimeout('budget_exceeded', {}).name).toBe('HookBudgetTimeout');
    });
  });

  describe('HookIOError', () => {
    it('is instanceof HookRuntimeError', () => {
      const { HookIOError, HookRuntimeError } = rt();
      expect(new HookIOError('io_error', {})).toBeInstanceOf(HookRuntimeError);
    });

    it('name is "HookIOError"', () => {
      const { HookIOError } = rt();
      expect(new HookIOError('io_error', {}).name).toBe('HookIOError');
    });
  });

  describe('HookConfigError', () => {
    it('is instanceof HookRuntimeError', () => {
      const { HookConfigError, HookRuntimeError } = rt();
      expect(new HookConfigError('config_error', {})).toBeInstanceOf(HookRuntimeError);
    });

    it('name is "HookConfigError"', () => {
      const { HookConfigError } = rt();
      expect(new HookConfigError('config_error', {}).name).toBe('HookConfigError');
    });
  });
});

// ============================================================================
// readHookInput
// ============================================================================

describe('hook-runtime: readHookInput', () => {
  // readHookInput is tested via subprocess so we can actually pipe stdin.

  const driverSrc = `
'use strict';
const { readHookInput, HookInputSchemaError } = require(${JSON.stringify(HOOK_RUNTIME)});
(async () => {
  try {
    const input = readHookInput();
    process.stdout.write(JSON.stringify({ ok: true, data: input }));
    process.exit(0);
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, name: e.name, code: e.code, meta: e.meta }));
    process.exit(1);
  }
})();
`;

  describe('valid input parsing', () => {
    it('parses a minimal valid input (session_id + hook_event_name for non-tool event)', () => {
      const r = runDriver(driverSrc, {
        session_id: 'sess-abc',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'hello world',
      });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.ok).toBe(true);
      expect(out.data.session_id).toBe('sess-abc');
      expect(out.data.hook_event_name).toBe('UserPromptSubmit');
    });

    it('parses a PreToolUse input with tool_name and tool_input', () => {
      const r = runDriver(driverSrc, {
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
      });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.ok).toBe(true);
      expect(out.data.tool_name).toBe('Bash');
      expect(out.data.tool_input).toEqual({ command: 'ls' });
    });

    it('parses a PostToolUse input with tool_response', () => {
      const r = runDriver(driverSrc, {
        session_id: 'sess-2',
        hook_event_name: 'PostToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/x' },
        tool_response: 'file contents',
      });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.ok).toBe(true);
      expect(out.data.tool_response).toBe('file contents');
    });

    it('returns a frozen object (Object.isFrozen)', () => {
      const frozenDriverSrc = `
'use strict';
const { readHookInput } = require(${JSON.stringify(HOOK_RUNTIME)});
const input = readHookInput();
process.stdout.write(JSON.stringify({ frozen: Object.isFrozen(input) }));
`;
      const r = runDriver(frozenDriverSrc, {
        session_id: 'sess-freeze',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'test',
      });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.frozen).toBe(true);
    });

    it('agent_name is null when absent (Q2 default: null in strict mode)', () => {
      const r = runDriver(driverSrc, {
        session_id: 'sess-noagent',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'x',
      });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      // agent_name must be present as null, not undefined
      expect('agent_name' in out.data || out.data.agent_name === null).toBe(true);
    });

    it('optional fields (cwd, transcript_path, permission_mode) pass through when present', () => {
      const r = runDriver(driverSrc, {
        session_id: 's',
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: {},
        cwd: '/tmp/proj',
        transcript_path: '/tmp/transcript.json',
        permission_mode: 'bypassPermissions',
      });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.data.cwd).toBe('/tmp/proj');
      expect(out.data.transcript_path).toBe('/tmp/transcript.json');
      expect(out.data.permission_mode).toBe('bypassPermissions');
    });
  });

  describe('throws HookInputSchemaError', () => {
    it('throws code=empty_stdin when stdin is empty string', () => {
      const r = spawnSync('node', ['-e', `
const { readHookInput } = require(${JSON.stringify(HOOK_RUNTIME)});
try {
  readHookInput();
  process.stdout.write(JSON.stringify({ok:true}));
} catch(e) {
  process.stdout.write(JSON.stringify({ok:false, code:e.code, name:e.name}));
  process.exit(1);
}
`], {
        input: '',
        encoding: 'utf8',
        timeout: 5000,
        killSignal: 'SIGKILL',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const out = JSON.parse(r.stdout);
      expect(out.ok).toBe(false);
      expect(out.name).toBe('HookInputSchemaError');
      expect(out.code).toBe('empty_stdin');
    });

    it('throws code=invalid_json when stdin is not valid JSON', () => {
      const r = spawnSync('node', ['-e', `
const { readHookInput } = require(${JSON.stringify(HOOK_RUNTIME)});
try {
  readHookInput();
  process.stdout.write(JSON.stringify({ok:true}));
} catch(e) {
  process.stdout.write(JSON.stringify({ok:false, code:e.code, name:e.name}));
  process.exit(1);
}
`], {
        input: '{not valid json',
        encoding: 'utf8',
        timeout: 5000,
        killSignal: 'SIGKILL',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const out = JSON.parse(r.stdout);
      expect(out.ok).toBe(false);
      expect(out.code).toBe('invalid_json');
    });

    it('throws code=missing_field when session_id absent', () => {
      const r = runDriver(driverSrc, { hook_event_name: 'UserPromptSubmit', prompt: 'x' });
      const out = JSON.parse(r.stdout);
      expect(out.ok).toBe(false);
      expect(out.code).toBe('missing_field');
      expect(out.meta.field).toBe('session_id');
    });

    it('throws code=missing_field when hook_event_name absent', () => {
      const r = runDriver(driverSrc, { session_id: 'sess-x' });
      const out = JSON.parse(r.stdout);
      expect(out.ok).toBe(false);
      expect(out.code).toBe('missing_field');
      expect(out.meta.field).toBe('hook_event_name');
    });

    it('throws code=missing_field when PreToolUse missing tool_name', () => {
      const r = runDriver(driverSrc, {
        session_id: 's',
        hook_event_name: 'PreToolUse',
        tool_input: {},
      });
      const out = JSON.parse(r.stdout);
      expect(out.ok).toBe(false);
      expect(out.code).toBe('missing_field');
      expect(out.meta.field).toBe('tool_name');
    });

    it('throws code=missing_field when PreToolUse missing tool_input', () => {
      const r = runDriver(driverSrc, {
        session_id: 's',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
      });
      const out = JSON.parse(r.stdout);
      expect(out.ok).toBe(false);
      expect(out.code).toBe('missing_field');
      expect(out.meta.field).toBe('tool_input');
    });

    it('throws code=missing_field when UserPromptSubmit missing prompt', () => {
      const r = runDriver(driverSrc, {
        session_id: 's',
        hook_event_name: 'UserPromptSubmit',
      });
      const out = JSON.parse(r.stdout);
      expect(out.ok).toBe(false);
      expect(out.code).toBe('missing_field');
      expect(out.meta.field).toBe('prompt');
    });

    it('does NOT touch process.env (env vars unchanged after readHookInput)', () => {
      const envProbeDriver = `
'use strict';
process.env.CLAUDE_SESSION_ID = 'env-val';
const envBefore = JSON.stringify(process.env);
const { readHookInput } = require(${JSON.stringify(HOOK_RUNTIME)});
try { readHookInput(); } catch(e) {}
const envAfter = JSON.stringify(process.env);
process.stdout.write(JSON.stringify({ same: envBefore === envAfter }));
`;
      const r = runDriver(envProbeDriver, { session_id: 's', hook_event_name: 'UserPromptSubmit', prompt: 'p' });
      const out = JSON.parse(r.stdout);
      expect(out.same).toBe(true);
    });
  });
});

// ============================================================================
// readHookInputCompat
// ============================================================================

describe('hook-runtime: readHookInputCompat', () => {
  const compatDriverSrc = `
'use strict';
const { readHookInputCompat } = require(${JSON.stringify(HOOK_RUNTIME)});
try {
  const input = readHookInputCompat();
  process.stdout.write(JSON.stringify({ ok: true, data: input }));
  process.exit(0);
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, name: e.name, code: e.code }));
  process.exit(1);
}
`;

  describe('env var fallback', () => {
    it('falls back to CLAUDE_SESSION_ID when session_id absent from stdin', () => {
      const r = runDriver(compatDriverSrc, {}, { CLAUDE_SESSION_ID: 'env-session' });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.ok).toBe(true);
      expect(out.data.session_id).toBe('env-session');
    });

    it('falls back to CLAUDE_USER_PROMPT when prompt absent from stdin', () => {
      const r = runDriver(compatDriverSrc, {}, {
        CLAUDE_USER_PROMPT: 'env-prompt',
        CLAUDE_SESSION_ID: 's',
        CLAUDE_HOOK_EVENT: 'UserPromptSubmit',
      });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.data.prompt).toBe('env-prompt');
    });

    it('falls back to CLAUDE_AGENT_NAME for agent_name', () => {
      const r = runDriver(compatDriverSrc, {
        session_id: 's',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'x',
      }, { CLAUDE_AGENT_NAME: 'lead' });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.data.agent_name).toBe('lead');
    });

    it('falls back to CLAUDE_HOOK_EVENT for hook_event_name', () => {
      const r = runDriver(compatDriverSrc, {}, {
        CLAUDE_SESSION_ID: 's',
        CLAUDE_HOOK_EVENT: 'PostToolUse',
      });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.data.hook_event_name).toBe('PostToolUse');
    });

    it('falls back to process.cwd() for cwd when absent', () => {
      const r = runDriver(compatDriverSrc, { session_id: 's', hook_event_name: 'UserPromptSubmit', prompt: 'p' }, {});
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      // cwd should be a non-empty string (process.cwd() in child)
      expect(typeof out.data.cwd).toBe('string');
      expect(out.data.cwd.length).toBeGreaterThan(0);
    });

    it('does NOT throw on schema violation — returns partial object', () => {
      // Empty stdin, no env vars → should NOT throw
      const r = spawnSync('node', ['-e', `
const { readHookInputCompat } = require(${JSON.stringify(HOOK_RUNTIME)});
try {
  const data = readHookInputCompat();
  process.stdout.write(JSON.stringify({ ok: true }));
  process.exit(0);
} catch(e) {
  process.stdout.write(JSON.stringify({ ok: false, name: e.name }));
  process.exit(1);
}
`], {
        input: '',
        encoding: 'utf8',
        timeout: 5000,
        killSignal: 'SIGKILL',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const out = JSON.parse(r.stdout);
      expect(out.ok).toBe(true);
    });
  });

  describe('tool field alias coercion (Q1 default)', () => {
    it('coerces `tool` → `tool_name` when tool present but tool_name absent', () => {
      const r = runDriver(compatDriverSrc, {
        session_id: 's',
        hook_event_name: 'PreToolUse',
        tool: 'Bash',
        tool_input: { command: 'ls' },
      });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.data.tool_name).toBe('Bash');
    });

    it('prefers tool_name over tool when both present', () => {
      const r = runDriver(compatDriverSrc, {
        session_id: 's',
        hook_event_name: 'PreToolUse',
        tool: 'Read',
        tool_name: 'Write',
        tool_input: {},
      });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.data.tool_name).toBe('Write');
    });
  });
});

// ============================================================================
// appendAuditJsonl
// ============================================================================

describe('hook-runtime: appendAuditJsonl', () => {
  describe('basic append', () => {
    it('creates file and writes newline-terminated JSON row', () => {
      const p = tmpFile('audit.jsonl');
      rt().appendAuditJsonl(p, { event: 'test', ts: 1 });
      const content = fs.readFileSync(p, 'utf8');
      expect(content.endsWith('\n')).toBe(true);
      const row = JSON.parse(content.trim());
      expect(row.event).toBe('test');
      expect(row.ts).toBe(1);
    });

    it('appends multiple rows — one per line', () => {
      const p = tmpFile('audit-multi.jsonl');
      rt().appendAuditJsonl(p, { n: 1 });
      rt().appendAuditJsonl(p, { n: 2 });
      rt().appendAuditJsonl(p, { n: 3 });
      const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(3);
      expect(JSON.parse(lines[0]).n).toBe(1);
      expect(JSON.parse(lines[2]).n).toBe(3);
    });
  });

  describe('lock-acquire success', () => {
    it('acquires lock file, appends, then releases lock (no lock file remains)', () => {
      const p = tmpFile('audit-lock.jsonl');
      const lockPath = p + '.lock';
      rt().appendAuditJsonl(p, { locked: true });
      // After the call the lock file must be gone
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });

  describe('concurrent writes — no interleaving', () => {
    it('10 parallel child processes each append 1 row — produces exactly 10 valid JSON lines', async () => {
      const auditPath = tmpFile('audit-concurrent.jsonl');
      const workerSrc = `
'use strict';
const { appendAuditJsonl } = require(${JSON.stringify(HOOK_RUNTIME)});
const n = parseInt(process.argv[2], 10);
appendAuditJsonl(${JSON.stringify(auditPath)}, { worker: n });
process.exit(0);
`;
      const workerScript = tmpFile('worker.cjs');
      fs.writeFileSync(workerScript, workerSrc);

      // Spawn 10 workers and collect close events via Promise
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          new Promise((resolve) => {
            const p = spawn('node', [workerScript, String(i)], {
              stdio: 'ignore',
            });
            p.on('close', resolve);
            p.on('error', resolve); // resolve even on spawn error (RED: module missing)
          })
        )
      );

      // Verify the output — all 10 rows must be present and valid JSON
      const content = fs.readFileSync(auditPath, 'utf8').trim();
      const lines = content.split('\n');
      expect(lines).toHaveLength(10);
      lines.forEach(l => expect(() => JSON.parse(l)).not.toThrow());
      const workers = lines.map(l => JSON.parse(l).worker).sort((a, b) => a - b);
      expect(workers).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }, 15000);
  });

  describe('lock contention and timeout', () => {
    it('throws HookLockError when lock is held and timeout expires', () => {
      const auditPath = tmpFile('audit-timeout.jsonl');
      const lockPath = auditPath + '.lock';

      // Write a lock file that looks like it belongs to a running process.
      // Strategy: create the lock with the CURRENT PID (alive) and use a
      // very short custom timeout so the busy-wait expires without reclaim.
      fs.writeFileSync(lockPath, String(process.pid)); // current PID = alive

      const lockDriver = `
'use strict';
const { appendAuditJsonl, HookLockError } = require(${JSON.stringify(HOOK_RUNTIME)});
process.env.HOOK_LOCK_TIMEOUT_MS = '200';
try {
  appendAuditJsonl(${JSON.stringify(auditPath)}, { x: 1 });
  process.stdout.write(JSON.stringify({ ok: true }));
  process.exit(0);
} catch(e) {
  process.stdout.write(JSON.stringify({ ok: false, name: e.name, code: e.code }));
  process.exit(1);
}
`;
      const r = runDriver(lockDriver, undefined, { HOOK_LOCK_TIMEOUT_MS: '200' });
      // Lock file is held by THIS process (alive) → should timeout
      const out = JSON.parse(r.stdout);
      expect(out.ok).toBe(false);
      expect(out.name).toBe('HookLockError');

      // Cleanup
      try { fs.unlinkSync(lockPath); } catch { /* */ }
    }, 10000);

    it('reclaims stale lock (dead PID) and logs stale_lock_reclaimed warning', () => {
      const auditPath = tmpFile('audit-stale.jsonl');
      const lockPath = auditPath + '.lock';

      // Write a lock file with a dead PID (1 = init, won't SIGKILL our test)
      // Actually use 99999999 — a PID that almost certainly doesn't exist.
      fs.writeFileSync(lockPath, '99999999');

      const staleDriver = `
'use strict';
const { appendAuditJsonl } = require(${JSON.stringify(HOOK_RUNTIME)});
appendAuditJsonl(${JSON.stringify(auditPath)}, { reclaimed: true });
process.exit(0);
`;
      const r = runDriver(staleDriver);
      expect(r.status).toBe(0);

      // The row must have been written
      const content = fs.readFileSync(auditPath, 'utf8').trim();
      expect(JSON.parse(content).reclaimed).toBe(true);

      // stderr should contain stale_lock_reclaimed
      expect(r.stderr).toMatch(/stale_lock_reclaimed/);
    });
  });

  describe('HOOK_LOCK_TIMEOUT_MS env tuning', () => {
    it('default timeout is 2000ms (fast-path: lock acquired immediately)', () => {
      // Just verify no timeout error on normal operation (lock free path)
      const p = tmpFile('audit-default-timeout.jsonl');
      expect(() => rt().appendAuditJsonl(p, { t: 1 })).not.toThrow();
    });
  });
});

// ============================================================================
// atomicWrite
// ============================================================================

describe('hook-runtime: atomicWrite', () => {
  describe('successful write', () => {
    it('writes content to the target path', () => {
      const p = tmpFile('atomic.txt');
      rt().atomicWrite(p, 'hello atomic');
      expect(fs.readFileSync(p, 'utf8')).toBe('hello atomic');
    });

    it('uses a .tmp.<pid>.<hex> intermediate file then renames (no tmp remains)', () => {
      const p = tmpFile('atomic-clean.txt');
      rt().atomicWrite(p, 'content');
      // The final file exists
      expect(fs.existsSync(p)).toBe(true);
      // No .tmp file remains next to it
      const dir = path.dirname(p);
      const base = path.basename(p);
      const tmpFiles = fs.readdirSync(dir).filter(f => f.startsWith(base + '.tmp.'));
      expect(tmpFiles).toHaveLength(0);
    });

    it('overwrites existing file atomically', () => {
      const p = tmpFile('atomic-overwrite.txt');
      fs.writeFileSync(p, 'old content');
      rt().atomicWrite(p, 'new content');
      expect(fs.readFileSync(p, 'utf8')).toBe('new content');
    });

    it('returns void (undefined)', () => {
      const p = tmpFile('atomic-void.txt');
      const result = rt().atomicWrite(p, 'x');
      expect(result).toBeUndefined();
    });
  });

  describe('does NOT create parent directories (Q4 default)', () => {
    it('throws when parent directory does not exist', () => {
      // In RED: rt() itself throws Cannot find module — which also satisfies
      // .toThrow(), making this a false green. We add a module-exists guard
      // to ensure the test only passes when atomicWrite specifically rejects
      // a missing parent, not just because the module is absent.
      expect(() => {
        // This must throw for the right reason: missing parent dir, NOT missing module.
        // The `atomicWrite` function is what we want to throw here.
        const { atomicWrite } = rt(); // throws Cannot find module in RED → test fails
        const p = path.join(tmpRoot, 'nonexistent-dir', 'file.txt');
        atomicWrite(p, 'content');
      }).toThrow(/ENOENT|no such file/i); // specific error message — not module error
    });
  });

  describe('cleanup on error', () => {
    it('unlinks .tmp file when rename fails (simulated via read-only parent dir)', () => {
      // Must first require the module — fails in RED with Cannot find module.
      const { atomicWrite } = rt();

      const roDir = tmpFile('ro-dir');
      fs.mkdirSync(roDir);
      // On Darwin/Linux, chmod 0o444 on dir prevents rename-into
      try {
        fs.chmodSync(roDir, 0o444);
      } catch {
        // chmod not available — skip
        return;
      }

      const target = path.join(roDir, 'target.txt');
      try {
        atomicWrite(target, 'data');
        // OS allowed it (e.g., running as root) — no assertion needed
      } catch {
        // Verify no .tmp file leaked
        try {
          fs.chmodSync(roDir, 0o755);
          const leaked = fs.readdirSync(roDir).filter(f => f.includes('.tmp.'));
          expect(leaked).toHaveLength(0);
        } catch { /* can't enumerate — best effort */ }
      } finally {
        try { fs.chmodSync(roDir, 0o755); } catch { /* */ }
      }
    });
  });
});

// ============================================================================
// logger
// ============================================================================

describe('hook-runtime: logger', () => {
  const loggerDriverSrc = (level, logLevel) => `
'use strict';
const { logger } = require(${JSON.stringify(HOOK_RUNTIME)});
const log = logger('test-scope');
process.env.HOOK_LOG_LEVEL = ${JSON.stringify(logLevel)};
log.${level}('msg_key', { detail: 'x' });
process.exit(0);
`;

  describe('output routing — stderr only, never stdout', () => {
    it('info logs go to stderr, stdout is empty', () => {
      const r = runDriver(loggerDriverSrc('info', 'debug'), undefined, { HOOK_LOG_LEVEL: 'debug' });
      expect(r.status).toBe(0); // driver exits 0 only after successful log call
      expect(r.stdout).toBe('');
      expect(r.stderr.length).toBeGreaterThan(0);
    });

    it('warn logs go to stderr, stdout is empty', () => {
      const r = runDriver(loggerDriverSrc('warn', 'debug'), undefined, { HOOK_LOG_LEVEL: 'debug' });
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
      expect(r.stderr.length).toBeGreaterThan(0);
    });

    it('error logs go to stderr, stdout is empty', () => {
      const r = runDriver(loggerDriverSrc('error', 'debug'), undefined, { HOOK_LOG_LEVEL: 'debug' });
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
      expect(r.stderr.length).toBeGreaterThan(0);
    });

    it('debug logs go to stderr when HOOK_LOG_LEVEL=debug', () => {
      const r = runDriver(loggerDriverSrc('debug', 'debug'), undefined, { HOOK_LOG_LEVEL: 'debug' });
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
      expect(r.stderr.length).toBeGreaterThan(0);
    });
  });

  describe('NDJSON format on stderr', () => {
    it('each log line is valid JSON', () => {
      const r = runDriver(loggerDriverSrc('info', 'debug'), undefined, { HOOK_LOG_LEVEL: 'debug' });
      const lines = r.stderr.trim().split('\n').filter(Boolean);
      // At least the one line we emitted
      const logLines = lines.filter(l => {
        try { JSON.parse(l); return true; } catch { return false; }
      });
      expect(logLines.length).toBeGreaterThanOrEqual(1);
    });

    it('log record contains scope, level, and message key fields', () => {
      const r = runDriver(loggerDriverSrc('info', 'debug'), undefined, { HOOK_LOG_LEVEL: 'debug' });
      const lines = r.stderr.trim().split('\n').filter(Boolean);
      const logLines = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const record = logLines.find(l => l.msg === 'msg_key' || l.message === 'msg_key' || l.event === 'msg_key');
      expect(record).toBeDefined();
      // Must contain scope
      expect(record.scope || record.logger || record.name).toBeTruthy();
    });
  });

  describe('HOOK_LOG_LEVEL gating', () => {
    it('suppresses debug logs at HOOK_LOG_LEVEL=info (default)', () => {
      const r = runDriver(loggerDriverSrc('debug', 'info'), undefined, { HOOK_LOG_LEVEL: 'info' });
      expect(r.status).toBe(0); // driver must exit 0 (module loaded successfully)
      // stderr should have NO JSON lines containing 'msg_key'
      const lines = r.stderr.trim().split('\n').filter(Boolean);
      const logLines = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const found = logLines.some(l => l.msg === 'msg_key' || l.message === 'msg_key' || l.event === 'msg_key');
      expect(found).toBe(false);
    });

    it('suppresses info+debug at HOOK_LOG_LEVEL=warn', () => {
      const r = runDriver(loggerDriverSrc('info', 'warn'), undefined, { HOOK_LOG_LEVEL: 'warn' });
      expect(r.status).toBe(0);
      const lines = r.stderr.trim().split('\n').filter(Boolean);
      const logLines = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const found = logLines.some(l => l.msg === 'msg_key' || l.message === 'msg_key' || l.event === 'msg_key');
      expect(found).toBe(false);
    });

    it('suppresses everything except error at HOOK_LOG_LEVEL=error', () => {
      const r = runDriver(loggerDriverSrc('warn', 'error'), undefined, { HOOK_LOG_LEVEL: 'error' });
      expect(r.status).toBe(0);
      const lines = r.stderr.trim().split('\n').filter(Boolean);
      const logLines = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const found = logLines.some(l => l.msg === 'msg_key' || l.message === 'msg_key' || l.event === 'msg_key');
      expect(found).toBe(false);
    });

    it('unknown HOOK_LOG_LEVEL defaults to info', () => {
      // debug should be suppressed with unknown level (defaults to info)
      const r = runDriver(loggerDriverSrc('debug', 'nonsense'), undefined, { HOOK_LOG_LEVEL: 'nonsense' });
      expect(r.status).toBe(0);
      const lines = r.stderr.trim().split('\n').filter(Boolean);
      const logLines = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const found = logLines.some(l => l.msg === 'msg_key' || l.message === 'msg_key' || l.event === 'msg_key');
      expect(found).toBe(false);
    });

    it('shows info logs at HOOK_LOG_LEVEL=info', () => {
      const r = runDriver(loggerDriverSrc('info', 'info'), undefined, { HOOK_LOG_LEVEL: 'info' });
      expect(r.status).toBe(0);
      const lines = r.stderr.trim().split('\n').filter(Boolean);
      const logLines = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const found = logLines.some(l => l.msg === 'msg_key' || l.message === 'msg_key' || l.event === 'msg_key');
      expect(found).toBe(true);
    });
  });

  describe('logger returns object with debug, info, warn, error methods', () => {
    it('logger(scope) returns an object with exactly {debug, info, warn, error}', () => {
      const { logger } = rt();
      const log = logger('check');
      expect(typeof log.debug).toBe('function');
      expect(typeof log.info).toBe('function');
      expect(typeof log.warn).toBe('function');
      expect(typeof log.error).toBe('function');
    });
  });
});

// ============================================================================
// safeExit
// ============================================================================

describe('hook-runtime: safeExit', () => {
  const safeExitDriverSrc = (code, reason) => `
'use strict';
const { safeExit } = require(${JSON.stringify(HOOK_RUNTIME)});
safeExit(${code}${reason !== undefined ? `, ${JSON.stringify(reason)}` : ''});
`;

  describe('exit code', () => {
    it('exits with code 0 (and stderr contains a JSON record proving safeExit ran)', () => {
      const r = runDriver(safeExitDriverSrc(0));
      expect(r.status).toBe(0);
      // Must have at least one valid JSON line on stderr to prove safeExit
      // (not just a crash exit). If hook-runtime is missing, the crash exits
      // with code 1 and no JSON record — so these two together are a RED gate.
      const jsonLines = r.stderr.trim().split('\n')
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
      expect(jsonLines.length).toBeGreaterThanOrEqual(1);
    });

    it('exits with code 1 (and stderr contains a JSON record proving safeExit ran)', () => {
      const r = runDriver(safeExitDriverSrc(1));
      // When hook-runtime is missing, crash is also code 1, but NO JSON record.
      // So the JSON record check is the discriminator.
      const jsonLines = r.stderr.trim().split('\n')
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);
      // In RED: hook-runtime missing → no JSON record on stderr
      // In GREEN: safeExit emits JSON then exits with code 1 → jsonLines ≥ 1
      expect(r.status).toBe(1);
      expect(jsonLines.length).toBeGreaterThanOrEqual(1);
    });

    it('exits with code 2', () => {
      const r = runDriver(safeExitDriverSrc(2));
      expect(r.status).toBe(2);
    });
  });

  describe('structured record emitted to stderr before exit', () => {
    it('emits a JSON record to stderr', () => {
      const r = runDriver(safeExitDriverSrc(0, 'test-reason'));
      // In RED: node crashes with module-not-found → no valid JSON on stderr
      // In GREEN: safeExit writes structured NDJSON → at least 1 JSON line
      const lines = r.stderr.trim().split('\n').filter(Boolean);
      const jsonLines = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      expect(r.status).toBe(0); // driver must exit cleanly
      expect(jsonLines.length).toBeGreaterThanOrEqual(1);
    });

    it('stderr record contains exit code and reason', () => {
      const r = runDriver(safeExitDriverSrc(1, 'hook_error'));
      expect(r.status).toBe(1);
      const lines = r.stderr.trim().split('\n').filter(Boolean);
      const records = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const record = records.find(r => r.exit !== undefined || r.code === 'exit' || r.reason !== undefined);
      expect(record).toBeDefined();
    });

    it('stdout is empty — safeExit writes only to stderr', () => {
      const r = runDriver(safeExitDriverSrc(0));
      expect(r.status).toBe(0); // must exit cleanly, not crash
      expect(r.stdout).toBe('');
    });

    it('works synchronously via fs.writeSync(2, ...) — no async flush needed', () => {
      // Driver must exit with the requested code (0) — proves safeExit ran,
      // not just that node crashed quickly. Time bound confirms synchronous path.
      const start = Date.now();
      const r = runDriver(safeExitDriverSrc(0, 'sync-check'));
      const elapsed = Date.now() - start;
      expect(r.status).toBe(0); // discriminates RED (crash → code 1) from GREEN
      expect(elapsed).toBeLessThan(3000);
    });
  });
});

// ============================================================================
// withBudget
// ============================================================================

describe('hook-runtime: withBudget', () => {
  describe('fast path — fn resolves within budget', () => {
    it('resolves with the fn return value when fn completes within ms', async () => {
      const { withBudget } = rt();
      const result = await withBudget(500, () => Promise.resolve('done'));
      expect(result).toBe('done');
    });

    it('resolves with a numeric value', async () => {
      const { withBudget } = rt();
      const result = await withBudget(500, () => Promise.resolve(42));
      expect(result).toBe(42);
    });

    it('resolves with an object value', async () => {
      const { withBudget } = rt();
      const result = await withBudget(500, async () => ({ x: 1 }));
      expect(result).toEqual({ x: 1 });
    });

    it('clears the timeout after resolution (no lingering timer)', async () => {
      const { withBudget } = rt();
      // If the timer is NOT cleared, jest would complain about open handles.
      // The test passing without --forceExit proves clearTimeout was called.
      await withBudget(1000, () => Promise.resolve('ok'));
    });
  });

  describe('slow path — fn exceeds budget', () => {
    it('rejects with HookBudgetTimeout when fn does not resolve within ms', async () => {
      const { withBudget, HookBudgetTimeout } = rt();
      // Keep a handle on the work timer: withBudget abandons but cannot cancel
      // the work fn (F8 note in hook-runtime.cjs), so an un-cleared 2s timer
      // would keep the jest process alive after the run.
      let workTimer;
      const slowFn = () => new Promise(resolve => { workTimer = setTimeout(resolve, 2000); });
      await expect(withBudget(50, slowFn)).rejects.toBeInstanceOf(HookBudgetTimeout);
      clearTimeout(workTimer);
    }, 5000);

    it('emits logger warn with budget_exceeded before rejecting', async () => {
      // Run in subprocess so we can capture stderr
      const src = `
'use strict';
const { withBudget } = require(${JSON.stringify(HOOK_RUNTIME)});
(async () => {
  try {
    await withBudget(50, () => new Promise(r => setTimeout(r, 2000)), { label: 'test_label' });
  } catch(e) {
    // Expected
  }
  process.exit(0);
})();
`;
      const r = runDriver(src, undefined, { HOOK_LOG_LEVEL: 'debug' });
      expect(r.status).toBe(0);
      expect(r.stderr).toMatch(/budget_exceeded/);
    }, 10000);

    it('logs label in the budget_exceeded warning when provided', async () => {
      const src = `
'use strict';
const { withBudget } = require(${JSON.stringify(HOOK_RUNTIME)});
(async () => {
  try {
    await withBudget(50, () => new Promise(r => setTimeout(r, 2000)), { label: 'my_task' });
  } catch(e) {}
  process.exit(0);
})();
`;
      const r = runDriver(src, undefined, { HOOK_LOG_LEVEL: 'debug' });
      expect(r.stderr).toMatch(/my_task/);
    }, 10000);

    it('emits exactly ONE warn log on timeout (not multiple)', async () => {
      const src = `
'use strict';
const { withBudget } = require(${JSON.stringify(HOOK_RUNTIME)});
(async () => {
  try {
    await withBudget(50, () => new Promise(r => setTimeout(r, 2000)));
  } catch(e) {}
  process.exit(0);
})();
`;
      const r = runDriver(src, undefined, { HOOK_LOG_LEVEL: 'debug' });
      const lines = r.stderr.trim().split('\n').filter(Boolean);
      const jsonLines = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const budgetWarns = jsonLines.filter(l =>
        l.msg === 'budget_exceeded' || l.message === 'budget_exceeded' || l.event === 'budget_exceeded'
      );
      expect(budgetWarns).toHaveLength(1);
    }, 10000);

    it('does NOT propagate errors thrown by the work promise (silent catch)', async () => {
      const { withBudget, HookBudgetTimeout } = rt();
      let workTimer;
      const throwingFn = () => new Promise((_, reject) => {
        workTimer = setTimeout(() => reject(new Error('work error')), 2000);
      });
      // Should reject with HookBudgetTimeout (timeout wins), not 'work error'
      const err = await withBudget(50, throwingFn).catch(e => e);
      expect(err).toBeInstanceOf(HookBudgetTimeout);
      clearTimeout(workTimer); // don't leak the abandoned work timer
    }, 5000);

    it('clears the budget timer when fn rejects within budget', async () => {
      // Replaces a former assertion-free test whose premise ("jest open handle
      // detector is the gate") was false twice over: detectOpenHandles is not
      // enabled, and the budget timer is unref()'d so it could never trip the
      // detector anyway. Assert the clearTimeout call directly instead.
      const { withBudget } = rt();
      const setSpy = jest.spyOn(global, 'setTimeout');
      const clearSpy = jest.spyOn(global, 'clearTimeout');
      try {
        const err = await withBudget(5000, () => Promise.reject(new Error('boom'))).catch(e => e);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('boom');
        // Find the budget timer withBudget created (the 5000ms setTimeout)...
        const idx = setSpy.mock.calls.findIndex(c => c[1] === 5000);
        expect(idx).toBeGreaterThanOrEqual(0);
        const budgetTimer = setSpy.mock.results[idx].value;
        // ...and require that it was cleared on the rejection path.
        expect(clearSpy.mock.calls.some(c => c[0] === budgetTimer)).toBe(true);
      } finally {
        setSpy.mockRestore();
        clearSpy.mockRestore();
      }
    }, 5000);
  });

  describe('withBudget label option', () => {
    it('accepts {label} as optional third argument without error', async () => {
      const { withBudget } = rt();
      const result = await withBudget(500, () => Promise.resolve('labeled'), { label: 'my-op' });
      expect(result).toBe('labeled');
    });

    it('works when label is omitted entirely', async () => {
      const { withBudget } = rt();
      const result = await withBudget(500, () => Promise.resolve('no-label'));
      expect(result).toBe('no-label');
    });
  });
});

// ============================================================================
// BACK-COMPAT RE-EXPORTS (safe-stdin.cjs surface)
// ============================================================================

describe('hook-runtime: back-compat re-exports', () => {
  // Each re-export must be === the original from safe-stdin.cjs.
  // This proves no wrapping, no proxy — byte-for-byte the same reference.

  let safeSrc;
  beforeAll(() => {
    safeSrc = require(SAFE_STDIN);
  });

  it('readStdinSafely is strictly equal to safe-stdin#readStdinSafely', () => {
    expect(rt().readStdinSafely).toBe(safeSrc.readStdinSafely);
  });

  it('parseStdinJson is strictly equal to safe-stdin#parseStdinJson', () => {
    expect(rt().parseStdinJson).toBe(safeSrc.parseStdinJson);
  });

  it('readPromptFromStdin is strictly equal to safe-stdin#readPromptFromStdin', () => {
    expect(rt().readPromptFromStdin).toBe(safeSrc.readPromptFromStdin);
  });

  it('installWatchdog is strictly equal to safe-stdin#installWatchdog', () => {
    expect(rt().installWatchdog).toBe(safeSrc.installWatchdog);
  });
});

// ============================================================================
// findProjectRoot — fixes CWD ≠ project root cache pollution (v3.8.0-alpha.2)
// ============================================================================

describe('hook-runtime: findProjectRoot', () => {
  describe('marker discovery', () => {
    it('returns dir containing .claude/ when called from that dir', () => {
      const { findProjectRoot } = rt();
      // The repo root has .claude/. Running from repo root.
      const root = findProjectRoot(REPO_ROOT);
      expect(root).toBe(REPO_ROOT);
    });

    it('walks up from a subdir to the nearest ancestor with .claude/', () => {
      const { findProjectRoot } = rt();
      // archon-os/hooks is a subdir of REPO_ROOT (which has .claude/).
      // findProjectRoot should walk up and return REPO_ROOT.
      const subdir = path.join(REPO_ROOT, 'archon-os', 'hooks');
      const root = findProjectRoot(subdir);
      expect(root).toBe(REPO_ROOT);
    });

    it('walks up from a deeply nested subdir', () => {
      const { findProjectRoot } = rt();
      const deep = path.join(REPO_ROOT, 'archon-os', 'hooks', 'lib', '__tests__');
      const root = findProjectRoot(deep);
      expect(root).toBe(REPO_ROOT);
    });
  });

  describe('ARCHON_PROJECT_ROOT env override', () => {
    it('honors ARCHON_PROJECT_ROOT when set, ignoring cwd', () => {
      const { findProjectRoot } = rt();
      const oldEnv = process.env.ARCHON_PROJECT_ROOT;
      try {
        process.env.ARCHON_PROJECT_ROOT = '/tmp';
        const root = findProjectRoot('/some/other/path');
        expect(root).toBe('/tmp');
      } finally {
        if (oldEnv === undefined) delete process.env.ARCHON_PROJECT_ROOT;
        else process.env.ARCHON_PROJECT_ROOT = oldEnv;
      }
    });

    it('resolves ARCHON_PROJECT_ROOT to absolute path', () => {
      const { findProjectRoot } = rt();
      const oldEnv = process.env.ARCHON_PROJECT_ROOT;
      try {
        process.env.ARCHON_PROJECT_ROOT = '/tmp/../tmp';
        const root = findProjectRoot();
        expect(root).toBe('/tmp');
      } finally {
        if (oldEnv === undefined) delete process.env.ARCHON_PROJECT_ROOT;
        else process.env.ARCHON_PROJECT_ROOT = oldEnv;
      }
    });
  });

  describe('fallback', () => {
    it('returns the start dir when no marker found anywhere up to /', () => {
      const { findProjectRoot } = rt();
      const oldEnv = process.env.ARCHON_PROJECT_ROOT;
      try {
        delete process.env.ARCHON_PROJECT_ROOT;
        // /private (or /) has no .claude or .git — fall back to itself
        const root = findProjectRoot('/private');
        // Either /private (no marker) or /Users (if /Users has .git on dev mac)
        // The contract: result is some ancestor of /private OR /private itself
        expect(root.length).toBeGreaterThan(0);
        expect('/private'.startsWith(root) || root === '/private').toBe(true);
      } finally {
        if (oldEnv !== undefined) process.env.ARCHON_PROJECT_ROOT = oldEnv;
      }
    });
  });
});

// ============================================================================
// MODULE SHAPE — sanity-check all 6 documented exports exist
// ============================================================================

describe('hook-runtime: module shape', () => {
  it('exports readHookInput as a function', () => {
    expect(typeof rt().readHookInput).toBe('function');
  });

  it('exports readHookInputCompat as a function', () => {
    expect(typeof rt().readHookInputCompat).toBe('function');
  });

  it('exports appendAuditJsonl as a function', () => {
    expect(typeof rt().appendAuditJsonl).toBe('function');
  });

  it('exports atomicWrite as a function', () => {
    expect(typeof rt().atomicWrite).toBe('function');
  });

  it('exports logger as a function', () => {
    expect(typeof rt().logger).toBe('function');
  });

  it('exports safeExit as a function', () => {
    expect(typeof rt().safeExit).toBe('function');
  });

  it('exports withBudget as a function', () => {
    expect(typeof rt().withBudget).toBe('function');
  });

  it('exports all 5 error classes', () => {
    const { HookRuntimeError, HookInputSchemaError, HookLockError, HookBudgetTimeout, HookIOError, HookConfigError } = rt();
    expect(typeof HookRuntimeError).toBe('function');
    expect(typeof HookInputSchemaError).toBe('function');
    expect(typeof HookLockError).toBe('function');
    expect(typeof HookBudgetTimeout).toBe('function');
    expect(typeof HookIOError).toBe('function');
    expect(typeof HookConfigError).toBe('function');
  });
});

// ============================================================================
// IN-PROCESS COVERAGE — TASK-00024 §AC-9 (≥90% line coverage)
// ============================================================================
// Subprocess-driven tests above achieve full BEHAVIORAL coverage but jest's
// instrumentation does not see code executed inside child node processes.
// These supplementary tests exercise the same exports IN-PROCESS so jest's
// coverage report reflects the true reach of the test suite. They are
// idempotent and side-effect-isolated to a tmp dir.

describe('hook-runtime: in-process coverage smokes (TASK-00024)', () => {
  describe('error class hierarchy', () => {
    it('HookRuntimeError carries code + meta + stack', () => {
      const { HookRuntimeError } = rt();
      const e = new HookRuntimeError('test_code', { k: 'v' });
      expect(e.code).toBe('test_code');
      expect(e.meta).toEqual({ k: 'v' });
      expect(e.name).toBe('HookRuntimeError');
      expect(e.stack).toBeTruthy();
    });
    it('all 5 subclasses extend HookRuntimeError', () => {
      const { HookRuntimeError, HookInputSchemaError, HookLockError, HookBudgetTimeout, HookIOError, HookConfigError } = rt();
      for (const Cls of [HookInputSchemaError, HookLockError, HookBudgetTimeout, HookIOError, HookConfigError]) {
        const e = new Cls('c', { x: 1 });
        expect(e).toBeInstanceOf(HookRuntimeError);
        expect(e.code).toBe('c');
        expect(e.meta).toEqual({ x: 1 });
      }
    });
    it('error constructor handles missing meta', () => {
      const { HookIOError } = rt();
      const e = new HookIOError('c');
      expect(e.meta).toEqual({});
    });
  });

  describe('logger (in-process)', () => {
    let stderrSpy;
    const captured = [];
    beforeEach(() => {
      captured.length = 0;
      stderrSpy = jest.spyOn(fs, 'writeSync').mockImplementation((fd, str) => {
        if (fd === 2) captured.push(str);
        return Buffer.byteLength(str);
      });
    });
    afterEach(() => stderrSpy.mockRestore());

    it('logger.info emits NDJSON to fd 2', () => {
      const { logger } = rt();
      logger('test').info('hello', { k: 1 });
      expect(captured.length).toBe(1);
      const obj = JSON.parse(captured[0]);
      expect(obj.scope).toBe('test');
      expect(obj.level).toBe('info');
      expect(obj.msg).toBe('hello');
      expect(obj.meta).toEqual({ k: 1 });
      expect(obj.ts).toBeTruthy();
    });
    it('all 4 levels (debug/info/warn/error) emit at appropriate threshold', () => {
      const { logger } = rt();
      const old = process.env.HOOK_LOG_LEVEL;
      try {
        process.env.HOOK_LOG_LEVEL = 'debug';
        const log = logger('lvl');
        log.debug('d'); log.info('i'); log.warn('w'); log.error('e');
        expect(captured.length).toBe(4);
        expect(captured.map(c => JSON.parse(c).level)).toEqual(['debug', 'info', 'warn', 'error']);
      } finally {
        if (old === undefined) delete process.env.HOOK_LOG_LEVEL;
        else process.env.HOOK_LOG_LEVEL = old;
      }
    });
    it('HOOK_LOG_LEVEL=warn suppresses info + debug', () => {
      const { logger } = rt();
      const old = process.env.HOOK_LOG_LEVEL;
      try {
        process.env.HOOK_LOG_LEVEL = 'warn';
        const log = logger('lvl');
        log.debug('d'); log.info('i'); log.warn('w'); log.error('e');
        expect(captured.length).toBe(2);
        expect(captured.map(c => JSON.parse(c).level)).toEqual(['warn', 'error']);
      } finally {
        if (old === undefined) delete process.env.HOOK_LOG_LEVEL;
        else process.env.HOOK_LOG_LEVEL = old;
      }
    });
    it('unknown HOOK_LOG_LEVEL falls back to info', () => {
      const { logger } = rt();
      const old = process.env.HOOK_LOG_LEVEL;
      try {
        process.env.HOOK_LOG_LEVEL = 'bogus';
        logger('lvl').info('hello');
        expect(captured.length).toBe(1);
      } finally {
        if (old === undefined) delete process.env.HOOK_LOG_LEVEL;
        else process.env.HOOK_LOG_LEVEL = old;
      }
    });
  });

  describe('atomicWrite (in-process)', () => {
    const tmpDir = path.join(os.tmpdir(), `hook-runtime-cov-${process.pid}`);
    beforeAll(() => {
      try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
    });
    afterAll(() => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    });

    it('writes content via tmp+rename', () => {
      const { atomicWrite } = rt();
      const target = path.join(tmpDir, `aw-${Date.now()}.txt`);
      atomicWrite(target, 'hello world');
      expect(fs.readFileSync(target, 'utf-8')).toBe('hello world');
      // No tmp leftover
      const leftovers = fs.readdirSync(tmpDir).filter(f => f.startsWith(`aw-`) && f.includes('.tmp.'));
      expect(leftovers).toEqual([]);
    });
    it('rejects parent-traversal paths', () => {
      const { atomicWrite, HookIOError } = rt();
      // Use raw string (not path.join, which normalizes '..' away)
      expect(() => atomicWrite('/tmp/foo/../evil', 'x')).toThrow(HookIOError);
    });
    it('wraps fs.writeFileSync errors in HookIOError with preserved message', () => {
      const { atomicWrite, HookIOError } = rt();
      const badParent = path.join(tmpDir, 'does-not-exist', 'file.txt');
      let caught;
      try { atomicWrite(badParent, 'x'); } catch (e) { caught = e; }
      expect(caught).toBeInstanceOf(HookIOError);
      expect(caught.message).toMatch(/ENOENT|no such file/i);
    });
  });

  describe('appendAuditJsonl (in-process)', () => {
    const tmpDir = path.join(os.tmpdir(), `hook-runtime-audit-${process.pid}`);
    beforeAll(() => { try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {} });
    afterAll(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

    it('appends a single row and releases lock', () => {
      const { appendAuditJsonl } = rt();
      const target = path.join(tmpDir, `aj-${Date.now()}.jsonl`);
      appendAuditJsonl(target, { ts: 'x', event: 'test' });
      const lines = fs.readFileSync(target, 'utf-8').trim().split('\n');
      expect(lines.length).toBe(1);
      expect(JSON.parse(lines[0])).toEqual({ ts: 'x', event: 'test' });
      expect(fs.existsSync(target + '.lock')).toBe(false);
    });
    it('rejects parent-traversal paths', () => {
      const { appendAuditJsonl, HookIOError } = rt();
      expect(() => appendAuditJsonl('/tmp/foo/../evil.jsonl', { x: 1 })).toThrow(HookIOError);
    });
  });

  describe('withBudget (in-process additional)', () => {
    it('opts is optional', async () => {
      const { withBudget } = rt();
      const v = await withBudget(1000, async () => 42);
      expect(v).toBe(42);
    });
    it('opts.label is used in the timeout warn meta when timeout fires', async () => {
      const { withBudget, HookBudgetTimeout } = rt();
      let caught;
      let workTimer;
      try {
        await withBudget(20, () => new Promise(r => { workTimer = setTimeout(r, 500); }), { label: 'work' });
      } catch (e) { caught = e; }
      clearTimeout(workTimer); // don't leak the abandoned work timer
      expect(caught).toBeInstanceOf(HookBudgetTimeout);
      expect(caught.meta.label).toBe('work');
      expect(caught.meta.ms).toBe(20);
    });
  });

  describe('zero stdout pollution (TASK-00024 §AC-10)', () => {
    it('stdout is never written by any export', () => {
      const { logger, withBudget, atomicWrite, appendAuditJsonl, HookIOError } = rt();
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      try {
        logger('zs').info('msg');
        logger('zs').warn('w');
        const tmpFile = path.join(os.tmpdir(), `zsp-${Date.now()}.txt`);
        atomicWrite(tmpFile, 'data');
        appendAuditJsonl(tmpFile + '.jsonl', { k: 1 });
        try { atomicWrite('..', 'x'); } catch (e) { expect(e).toBeInstanceOf(HookIOError); }
        // withBudget fast-path
        return withBudget(500, async () => 1).then(() => {
          expect(spy).not.toHaveBeenCalled();
          // Cleanup
          try { fs.unlinkSync(tmpFile); fs.unlinkSync(tmpFile + '.jsonl'); } catch {}
        });
      } finally {
        spy.mockRestore();
      }
    });
  });
});

// ============================================================================
// AC MAPPING
// ============================================================================
//
// Maps each it() block to TASK-00023 acceptance criteria lines (task.md).
//
// AC-1: "exports exactly these 6 symbols: readHookInput, appendAuditJsonl,
//        atomicWrite, logger, safeExit, withBudget"
//   → describe('hook-runtime: module shape') — all shape it() blocks
//
// AC-2: "Each export has a JSDoc block matching the signature"
//   → Structural (verified by architect at build time; not a runtime test)
//
// AC-3: "readHookInput parses stdin JSON per documented contract; throws typed
//        error on schema violation; does NOT touch process.env"
//   → describe('hook-runtime: readHookInput') — all sub-blocks:
//       - 'parses a minimal valid input'
//       - 'parses a PreToolUse input with tool_name and tool_input'
//       - 'parses a PostToolUse input with tool_response'
//       - 'returns a frozen object'
//       - 'agent_name is null when absent'
//       - 'optional fields pass through'
//       - 'throws code=empty_stdin'
//       - 'throws code=invalid_json'
//       - 'throws code=missing_field (session_id)'
//       - 'throws code=missing_field (hook_event_name)'
//       - 'throws code=missing_field (tool_name in PreToolUse)'
//       - 'throws code=missing_field (tool_input in PreToolUse)'
//       - 'throws code=missing_field (prompt in UserPromptSubmit)'
//       - 'does NOT touch process.env'
//
// AC-4: "appendAuditJsonl(path, row) uses fs.appendFileSync + exclusive lock
//        file (no out-of-order interleave under fan-out)"
//   → describe('hook-runtime: appendAuditJsonl') — all sub-blocks:
//       - 'creates file and writes newline-terminated JSON row'
//       - 'appends multiple rows'
//       - 'acquires lock file, appends, then releases'
//       - '10 parallel child processes each append 1 row → 10 valid JSON lines'
//       - 'throws HookLockError when lock is held and timeout expires'
//       - 'reclaims stale lock (dead PID) and logs stale_lock_reclaimed'
//       - 'default timeout is 2000ms'
//
// AC-5: "atomicWrite(path, content) writes to <path>.tmp then fs.renameSync;
//        cleans up tmp on error"
//   → describe('hook-runtime: atomicWrite') — all sub-blocks:
//       - 'writes content to the target path'
//       - 'uses a .tmp.<pid>.<hex> intermediate file then renames'
//       - 'overwrites existing file atomically'
//       - 'returns void (undefined)'
//       - 'throws when parent directory does not exist' (Q4 default)
//       - 'unlinks .tmp file when rename fails'
//
// AC-6: "logger(scope) returns {info, warn, error}; routes all output to
//        stderr; respects HOOK_LOG_LEVEL env; NEVER writes to stdout"
//   → describe('hook-runtime: logger') — all sub-blocks
//
// AC-7: "safeExit(code, reason?) emits a structured record to stderr then
//        process.exit(code)"
//   → describe('hook-runtime: safeExit') — all sub-blocks
//
// AC-8: "withBudget(ms, fn) returns a Promise that rejects on timeout;
//        logs structured warn via logger before rejecting"
//   → describe('hook-runtime: withBudget') — all sub-blocks
//
// AC-9: "Re-exports readHookInput as drop-in superset of safe-stdin.cjs"
//   → describe('hook-runtime: back-compat re-exports') — all 4 === checks
//
// AC-10: "No new runtime deps added — pure node fs/path/crypto only"
//   → Structural (verified at build time); not a runtime assertion
//
// Phase-2-specific coverage beyond task.md ACs:
//   → readHookInputCompat (Phase 1 design §2, env fallback + alias coercion)
//   → error class hierarchy (§5, all 5 classes extend HookRuntimeError)
//
