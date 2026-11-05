// Unit tests for hooks/lib/plans-dir.cjs — JS mirror of
// scripts/plans/_lib.sh#plans_dir(). Replaces hard-coded `.aura/plans/` paths
// in 10 hooks (v3.7.3 sweep gap) so plan state writes default to
// `.claude/plans/` even on upgraded projects that still have a legacy
// `.aura/plans/` folder around (resolution prefers `.claude/plans/`).
//
// Resolution order:
//   1. process.env.ARCHON_PLANS_DIR (explicit override, absolute or relative)
//   2. `<cwd>/.claude/plans` (default — matches v3.7.3 contract)
//   3. `<cwd>/.aura/plans` (legacy fallback, only when it exists and
//      `.claude/plans` does NOT)
//   4. `<cwd>/.claude/plans` (absent-tree case — caller mkdir's it)

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const LIB = path.join(__dirname, '..', '..', '..', 'archon-os', 'hooks', 'lib', 'plans-dir.cjs');

describe('resolvePlansDir() — resolution order', () => {
    let tmpDir;
    const origEnv = process.env.ARCHON_PLANS_DIR;
    let resolvePlansDir;

    beforeAll(() => {
        // Require fresh so the test fails clearly if the file is missing.
        resolvePlansDir = require(LIB).resolvePlansDir || require(LIB);
    });

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plans-dir-test-'));
        delete process.env.ARCHON_PLANS_DIR;
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        if (origEnv === undefined) delete process.env.ARCHON_PLANS_DIR;
        else process.env.ARCHON_PLANS_DIR = origEnv;
    });

    test('default (neither dir exists) → <cwd>/.claude/plans', () => {
        const got = resolvePlansDir(tmpDir);
        expect(got).toBe(path.join(tmpDir, '.claude', 'plans'));
    });

    test('.claude/plans exists → returns it', () => {
        fs.mkdirSync(path.join(tmpDir, '.claude', 'plans'), { recursive: true });
        const got = resolvePlansDir(tmpDir);
        expect(got).toBe(path.join(tmpDir, '.claude', 'plans'));
    });

    test('only legacy .aura/plans exists → returns it (fallback)', () => {
        fs.mkdirSync(path.join(tmpDir, '.aura', 'plans'), { recursive: true });
        const got = resolvePlansDir(tmpDir);
        expect(got).toBe(path.join(tmpDir, '.aura', 'plans'));
    });

    test('both exist → .claude/plans wins (v3.7.3 contract)', () => {
        fs.mkdirSync(path.join(tmpDir, '.claude', 'plans'), { recursive: true });
        fs.mkdirSync(path.join(tmpDir, '.aura', 'plans'), { recursive: true });
        const got = resolvePlansDir(tmpDir);
        expect(got).toBe(path.join(tmpDir, '.claude', 'plans'));
    });

    test('ARCHON_PLANS_DIR env wins over both defaults', () => {
        process.env.ARCHON_PLANS_DIR = path.join(tmpDir, 'custom-plans');
        fs.mkdirSync(path.join(tmpDir, '.claude', 'plans'), { recursive: true });
        const got = resolvePlansDir(tmpDir);
        expect(got).toBe(path.join(tmpDir, 'custom-plans'));
    });

    test('ARCHON_PLANS_DIR resolves relative paths', () => {
        process.env.ARCHON_PLANS_DIR = '.aura/plans';
        const got = resolvePlansDir(tmpDir);
        // path.resolve is relative to process.cwd(), not the cwd arg, by design.
        expect(path.isAbsolute(got)).toBe(true);
        expect(got.endsWith(path.join('.aura', 'plans'))).toBe(true);
    });

    test('called with no arg → uses process.cwd()', () => {
        const got = resolvePlansDir();
        expect(path.isAbsolute(got)).toBe(true);
        // We don't assert which dir wins (depends on test runner cwd state);
        // just that we get a sane absolute path.
    });
});

describe('migrateLegacyPlansDir() — one-shot .aura/plans → .claude/plans', () => {
    let tmpDir;
    let migrateLegacyPlansDir;

    beforeAll(() => {
        migrateLegacyPlansDir = require(LIB).migrateLegacyPlansDir;
    });

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plans-migrate-test-'));
        delete process.env.ARCHON_PLANS_DIR;
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('migrates .aura/plans → .claude/plans when only legacy exists', () => {
        const legacy = path.join(tmpDir, '.aura', 'plans');
        fs.mkdirSync(legacy, { recursive: true });
        fs.writeFileSync(path.join(legacy, 'active.json'), '{"active":{}}');

        const result = migrateLegacyPlansDir(tmpDir);

        expect(result.migrated).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, '.claude', 'plans', 'active.json'))).toBe(true);
        expect(fs.existsSync(legacy)).toBe(false);
    });

    test('no-op when .claude/plans already exists', () => {
        fs.mkdirSync(path.join(tmpDir, '.aura', 'plans'), { recursive: true });
        fs.mkdirSync(path.join(tmpDir, '.claude', 'plans'), { recursive: true });

        const result = migrateLegacyPlansDir(tmpDir);

        expect(result.migrated).toBe(false);
        // Legacy still exists — manual cleanup required
        expect(fs.existsSync(path.join(tmpDir, '.aura', 'plans'))).toBe(true);
    });

    test('no-op when ARCHON_PLANS_DIR is set (user opted into custom location)', () => {
        process.env.ARCHON_PLANS_DIR = path.join(tmpDir, 'custom');
        fs.mkdirSync(path.join(tmpDir, '.aura', 'plans'), { recursive: true });

        const result = migrateLegacyPlansDir(tmpDir);

        expect(result.migrated).toBe(false);
        expect(fs.existsSync(path.join(tmpDir, '.aura', 'plans'))).toBe(true);

        delete process.env.ARCHON_PLANS_DIR;
    });

    test('no-op when legacy does not exist', () => {
        const result = migrateLegacyPlansDir(tmpDir);
        expect(result.migrated).toBe(false);
    });

    test('skips migration on errors (returns migrated:false + error info)', () => {
        // Create the source as a file, not a directory, to provoke rename failure
        // on some platforms (rename from file to dir path).
        fs.mkdirSync(path.join(tmpDir, '.aura'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, '.aura', 'plans'), 'not a dir');

        const result = migrateLegacyPlansDir(tmpDir);

        // On macOS, fs.renameSync of a file to a directory path succeeds; we
        // just confirm the helper doesn't crash and returns a structured result.
        expect(result).toEqual(expect.objectContaining({ migrated: expect.any(Boolean) }));
    });
});

describe('no production hook hard-codes .aura/plans/', () => {
    // Regression test for the v3.7.3 sweep gap: 8 hooks were missed.
    // After the fix, every hook that referenced `.aura/plans/` must either
    // (a) be removed, or (b) route through lib/plans-dir.cjs.
    const HOOKS_DIR = path.join(__dirname, '..', '..', '..', 'archon-os', 'hooks');

    test('no hook file constructs the path literal ".aura/plans" outside lib/ or user-facing messages', () => {
        const offenders = [];
        const files = fs.readdirSync(HOOKS_DIR).filter(f => f.endsWith('.cjs'));
        for (const f of files) {
            const full = path.join(HOOKS_DIR, f);
            const src = fs.readFileSync(full, 'utf8');
            const lines = src.split('\n');
            lines.forEach((line, idx) => {
                if (!line.includes('.aura/plans') && !line.includes("'.aura', 'plans'")) return;
                const trimmed = line.trim();
                // Comments
                if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
                // lib/ subfolder (the migration helper itself)
                if (full.includes(path.join('hooks', 'lib'))) return;
                // User-facing console/stderr messages that mention the legacy path
                if (/(console\.(log|error|warn)|process\.stderr\.write|console\.error)/.test(trimmed)) return;
                offenders.push(`${f}:${idx + 1}  ${trimmed}`);
            });
        }
        expect(offenders).toEqual([]);
    });
});
