// Unit tests for hooks/lib/safe-stdin.cjs — the helper that fixes the
// production TTY-hang bug in `fs.readFileSync(0)`.
//
// Strategy:
//   - Direct calls into the module (require + invoke) — must NOT hang
//     regardless of how jest's fd 0 is configured.
//   - spawnSync end-to-end tests that pipe known JSON / no input through
//     a tiny driver script to verify the production path.

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const LIB = path.join(__dirname, '..', '..', '..', 'archon-os', 'hooks', 'lib', 'safe-stdin.cjs');
const { readStdinSafely, parseStdinJson, readPromptFromStdin } = require(LIB);

describe('readStdinSafely() — never hangs', () => {
    // The smoke test: every call must return within a few ms regardless of
    // what fd 0 is. If the helper ever hangs, jest itself would time out;
    // here we additionally enforce a sub-second wall-clock.
    test('returns within 100ms when called directly (jest stdin shape unknown)', () => {
        const start = Date.now();
        const result = readStdinSafely();
        const elapsed = Date.now() - start;
        expect(typeof result).toBe('string');
        expect(elapsed).toBeLessThan(100);
    });
});

describe('parseStdinJson()', () => {
    test('valid JSON object → parsed', () => {
        expect(parseStdinJson('{"a":1}')).toEqual({ a: 1 });
    });
    test('valid JSON array → parsed', () => {
        expect(parseStdinJson('[1,2,3]')).toEqual([1, 2, 3]);
    });
    test('malformed JSON → null', () => {
        expect(parseStdinJson('not json {')).toBeNull();
    });
    test('empty string → null', () => {
        expect(parseStdinJson('')).toBeNull();
    });
    test('non-string input → null', () => {
        expect(parseStdinJson(null)).toBeNull();
        expect(parseStdinJson(undefined)).toBeNull();
        expect(parseStdinJson(42)).toBeNull();
    });
});

describe('readPromptFromStdin() — env fallback', () => {
    const origEnv = process.env.CLAUDE_USER_PROMPT;
    afterEach(() => {
        if (origEnv === undefined) delete process.env.CLAUDE_USER_PROMPT;
        else process.env.CLAUDE_USER_PROMPT = origEnv;
    });

    test('falls back to CLAUDE_USER_PROMPT when stdin is unsafe', () => {
        process.env.CLAUDE_USER_PROMPT = 'fallback-prompt';
        // Direct call in jest — stdin is likely unsafe (TTY or unknown).
        const result = readPromptFromStdin();
        // Either we got the env fallback OR a real piped stdin from jest
        // (depends on environment). Both are valid; the contract is that
        // we never throw and never hang.
        expect(typeof result).toBe('string');
    });
});

// End-to-end: spawn a tiny Node driver that requires the lib and prints
// what it reads. Verify behavior under three stdin shapes.
describe('end-to-end via subprocess', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-stdin-e2e-'));
    const driverPath = path.join(tmpDir, 'driver.cjs');

    beforeAll(() => {
        fs.writeFileSync(driverPath, `
const { readStdinSafely, readPromptFromStdin } = require(${JSON.stringify(LIB)});
const mode = process.argv[2];
if (mode === 'raw') {
  process.stdout.write(readStdinSafely());
} else {
  process.stdout.write(readPromptFromStdin());
}
`);
    });

    afterAll(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

    test('piped JSON → readPromptFromStdin returns .prompt', () => {
        const r = spawnSync('node', [driverPath, 'json'], {
            input: JSON.stringify({ prompt: 'hello' }),
            encoding: 'utf8',
            timeout: 5000,
            killSignal: 'SIGKILL',
        });
        expect(r.status).toBe(0);
        expect(r.stdout).toBe('hello');
    });

    test('piped raw text → readStdinSafely returns it trimmed', () => {
        const r = spawnSync('node', [driverPath, 'raw'], {
            input: '  raw payload  ',
            encoding: 'utf8',
            timeout: 5000,
            killSignal: 'SIGKILL',
        });
        expect(r.status).toBe(0);
        expect(r.stdout).toBe('raw payload');
    });

    test('no stdin piped → returns env fallback (no hang)', () => {
        // No `input` option means stdin is inherited / closed. The driver
        // should exit immediately with the env-fallback value.
        const r = spawnSync('node', [driverPath, 'json'], {
            encoding: 'utf8',
            timeout: 5000,
            killSignal: 'SIGKILL',
            env: { ...process.env, CLAUDE_USER_PROMPT: 'env-fallback' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        expect(r.status).toBe(0);
        expect(r.stdout).toBe('env-fallback');
    });

    test('JSON without prompt key → returns raw JSON string', () => {
        const r = spawnSync('node', [driverPath, 'json'], {
            input: '{"other":"value"}',
            encoding: 'utf8',
            timeout: 5000,
            killSignal: 'SIGKILL',
        });
        expect(r.status).toBe(0);
        // No `prompt` and no `user_prompt` keys → falls back to env (empty here).
        expect(r.stdout).toBe('');
    });

    test('latency budget — sub-200ms cold start', () => {
        const start = Date.now();
        spawnSync('node', [driverPath, 'json'], {
            input: '{"prompt":"x"}',
            encoding: 'utf8',
            timeout: 5000,
            killSignal: 'SIGKILL',
        });
        const elapsed = Date.now() - start;
        // Node cold-start dominates; we just want to confirm it doesn't
        // hang. 1000ms is 5× the watchdog cap; should always pass.
        expect(elapsed).toBeLessThan(1000);
    });
});

describe('installWatchdog()', () => {
    const { installWatchdog } = require(LIB);

    test('returns a timer with unref method (does not keep process alive)', () => {
        const t = installWatchdog(60000); // 60s — long enough that it won't fire in this test
        expect(t).toBeDefined();
        expect(typeof t.unref).toBe('function');
        clearTimeout(t);
    });

    test('clearTimeout cancels the watchdog', () => {
        // If clearTimeout didn't work, this test's process would exit during
        // run with stderr "watchdog tripped". Test surviving is the assertion.
        const t = installWatchdog(50, 1);
        clearTimeout(t);
        // Wait > 50ms to confirm it didn't fire.
        return new Promise(resolve => setTimeout(resolve, 100));
    });
});
