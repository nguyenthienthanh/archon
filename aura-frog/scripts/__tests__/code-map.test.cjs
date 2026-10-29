'use strict';

/**
 * FEAT-F — code map: a startup digest that says where to look, plus
 * reverse-dependency lookup on demand.
 *
 * The map is a DERIVED, REBUILDABLE CACHE. Every assertion below exists to pin
 * one of the feature's acceptance criteria, and most of them are about the map
 * being allowed to cost time but never accuracy:
 *
 *   AC1  digest says where to look, and stays under the 10,000-char hook cap
 *   AC2  the map self-reports its unresolved-specifier count
 *   AC3  reverse-dependency lookup runs on demand, not at startup
 *   AC4  (path, mtime, size) cache from day one
 *   AC5  zero LLM tokens in the structural path (no network, no model call)
 *   AC6  never the sole authority on whether a file exists — the filesystem is
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const codeMap = require('../../hooks/lib/code-map.cjs');

const HOOK = path.join(__dirname, '..', '..', 'hooks', 'code-map-digest.cjs');
const REPO_ROOT = path.join(__dirname, '..', '..', '..');

let root;

const write = (rel, text) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
    return abs;
};

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-code-map-'));
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

// A small fixture with every edge shape that matters: a hub imported twice, a
// transitive chain, an external package, and a specifier that resolves to
// nothing (which is what AC2 makes the map confess to).
function seed() {
    write('src/hub.js', 'module.exports = { x: 1 };\n');
    write('src/a.js', [
        "const hub = require('./hub');",
        "const fs = require('node:fs');",
        "// require('./commented-out')",
        "const s = \"require('./in-a-string')\";",
        'module.exports = { hub, fs, s };',
    ].join('\n') + '\n');
    write('src/b.mjs', [
        "import hub from './hub.js';",
        "import { join } from 'node:path';",
        "export { default as a } from './a.js';",
        "const lazy = () => import('./missing-module.js');",
        'export default { hub, join, lazy };',
    ].join('\n') + '\n');
    write('src/deep/c.ts', [
        "import type { T } from '../b.mjs';",
        "import alias from '@/nope';",
        'export const c: T | null = null;',
    ].join('\n') + '\n');
    write('scripts/run.sh', '#!/bin/bash\necho hi\n');
}

// ---------------------------------------------------------------------------
// extraction
// ---------------------------------------------------------------------------

describe('extractSpecifiers', () => {
    it('finds static, bare, dynamic, re-export and require specifiers', () => {
        const specs = codeMap.extractSpecifiers([
            "import a from './a';",
            "import './side-effect';",
            "export * from './re';",
            "const d = await import('./dyn');",
            "const r = require('./req');",
            "import type { T } from './types';",
        ].join('\n'));
        expect(specs.sort()).toEqual(
            ['./a', './dyn', './re', './req', './side-effect', './types'].sort(),
        );
    });

    it('ignores specifiers inside comments and string literals', () => {
        const specs = codeMap.extractSpecifiers([
            "// require('./line-comment')",
            "/* import x from './block-comment'; */",
            'const s = "require(\'./double\')";',
            "const t = 'import x from \"./single\"';",
            'const re = /["\']/;',
            "const real = require('./real');",
        ].join('\n'));
        expect(specs).toEqual(['./real']);
    });
});

// ---------------------------------------------------------------------------
// build + classification
// ---------------------------------------------------------------------------

describe('buildMap', () => {
    it('takes its population from the source, not a hand-written list', () => {
        seed();
        const map = codeMap.buildMap(root);
        expect(Object.keys(map.files).sort()).toEqual([
            'scripts/run.sh',
            'src/a.js',
            'src/b.mjs',
            'src/deep/c.ts',
            'src/hub.js',
        ]);
        // A file nobody told the map about still shows up on the next build.
        write('src/brand-new.js', "require('./hub');\n");
        expect(Object.keys(codeMap.buildMap(root).files)).toContain('src/brand-new.js');
    });

    it('resolves relative edges, classifies bare specifiers as external', () => {
        seed();
        const map = codeMap.buildMap(root);
        expect(map.files['src/a.js'].imports).toEqual(['src/hub.js']);
        expect(map.files['src/a.js'].external).toEqual(['node:fs']);
        expect(map.files['src/b.mjs'].imports.sort()).toEqual(['src/a.js', 'src/hub.js']);
        expect(map.files['src/deep/c.ts'].imports).toEqual(['src/b.mjs']);
    });

    it('self-reports unresolved specifiers rather than dropping them (AC2)', () => {
        seed();
        const map = codeMap.buildMap(root);
        expect(map.files['src/b.mjs'].unresolved).toEqual(['./missing-module.js']);
        expect(map.files['src/deep/c.ts'].unresolved).toEqual(['@/nope']);
        expect(map.stats.unresolved).toBe(2);
    });

    it('records (path, mtime, size) and reuses unchanged entries (AC4)', () => {
        seed();
        const first = codeMap.buildMap(root);
        const entry = first.files['src/a.js'];
        const stat = fs.statSync(path.join(root, 'src/a.js'));
        expect(entry.mtime).toBe(Math.floor(stat.mtimeMs));
        expect(entry.size).toBe(stat.size);

        const second = codeMap.buildMap(root, { previous: first });
        expect(second.stats.reused).toBe(5);
        expect(second.stats.extracted).toBe(0);

        // Change one file: exactly that one is re-extracted.
        fs.writeFileSync(path.join(root, 'src/a.js'), "require('./hub');\nrequire('./b.mjs');\n");
        const third = codeMap.buildMap(root, { previous: second });
        expect(third.stats.extracted).toBe(1);
        expect(third.stats.reused).toBe(4);
        expect(third.files['src/a.js'].imports.sort()).toEqual(['src/b.mjs', 'src/hub.js']);
    });
});

// ---------------------------------------------------------------------------
// cache contract: rebuildable, self-healing, never authoritative
// ---------------------------------------------------------------------------

describe('cache contract', () => {
    it('regenerates identically after the cache file is deleted', () => {
        seed();
        const built = codeMap.rebuildMap(root);
        expect(fs.existsSync(codeMap.mapPath(root))).toBe(true);

        fs.unlinkSync(codeMap.mapPath(root));
        expect(codeMap.readMap(root)).toBeNull();

        const again = codeMap.rebuildMap(root);
        expect(again.files).toEqual(built.files);
        expect(again.stats).toEqual(built.stats);
    });

    it('rejects a cache whose schema does not match', () => {
        seed();
        codeMap.rebuildMap(root);
        const raw = JSON.parse(fs.readFileSync(codeMap.mapPath(root), 'utf8'));
        raw.schema_version = codeMap.SCHEMA_VERSION + 99;
        fs.writeFileSync(codeMap.mapPath(root), JSON.stringify(raw));
        expect(codeMap.readMap(root)).toBeNull();
    });

    it('reports staleness when a tracked file changes, vanishes or is added', () => {
        seed();
        const map = codeMap.rebuildMap(root);
        expect(codeMap.stalenessReason(root, map)).toBeNull();

        const edited = { ...map, files: { ...map.files } };
        edited.files['src/a.js'] = { ...edited.files['src/a.js'], size: 1 };
        expect(codeMap.stalenessReason(root, edited)).toMatch(/src\/a\.js/);

        const withGhost = { ...map, files: { ...map.files, 'src/ghost.js': { mtime: 0, size: 0, loc: 0, imports: [], external: [], unresolved: [] } } };
        expect(codeMap.stalenessReason(root, withGhost)).toMatch(/src\/ghost\.js/);

        write('src/added-later.js', '\n');
        expect(codeMap.stalenessReason(root, map)).toMatch(/added-later|file count/);
    });

    it('drains a dirty queue per changed file instead of rescanning', () => {
        seed();
        const map = codeMap.rebuildMap(root);
        fs.writeFileSync(path.join(root, 'src/a.js'), "require('./b.mjs');\n");
        codeMap.markDirty(root, path.join(root, 'src/a.js'));
        expect(fs.readFileSync(codeMap.dirtyPath(root), 'utf8')).toContain('src/a.js');

        const drained = codeMap.drainDirty(root, map);
        expect(drained.updated).toEqual(['src/a.js']);
        expect(drained.map.files['src/a.js'].imports).toEqual(['src/b.mjs']);
        expect(fs.existsSync(codeMap.dirtyPath(root))).toBe(false);
        // untouched entries kept their recorded stats — no full rescan
        expect(drained.map.files['src/hub.js']).toEqual(map.files['src/hub.js']);
    });

    it('is disabled by AF_CODE_MAP_DISABLED', () => {
        seed();
        const prev = process.env.AF_CODE_MAP_DISABLED;
        process.env.AF_CODE_MAP_DISABLED = 'true';
        try {
            expect(codeMap.isDisabled()).toBe(true);
            expect(codeMap.rebuildMap(root)).toBeNull();
            expect(fs.existsSync(codeMap.mapPath(root))).toBe(false);
        } finally {
            if (prev === undefined) delete process.env.AF_CODE_MAP_DISABLED;
            else process.env.AF_CODE_MAP_DISABLED = prev;
        }
    });
});

// ---------------------------------------------------------------------------
// reverse dependencies (AC3, AC6)
// ---------------------------------------------------------------------------

describe('reverseDeps', () => {
    it('answers "change this, what breaks" with the dependency closure', () => {
        seed();
        const map = codeMap.buildMap(root);
        const res = codeMap.reverseDeps(root, map, 'src/hub.js');
        expect(res.direct.sort()).toEqual(['src/a.js', 'src/b.mjs']);
        // grep cannot do this part: c.ts never mentions hub.js
        expect(res.transitive.sort()).toEqual(['src/a.js', 'src/b.mjs', 'src/deep/c.ts']);
    });

    it('accepts an absolute path and a path relative to the root', () => {
        seed();
        const map = codeMap.buildMap(root);
        const abs = codeMap.reverseDeps(root, map, path.join(root, 'src', 'hub.js'));
        expect(abs.target).toBe('src/hub.js');
        expect(abs.direct.sort()).toEqual(['src/a.js', 'src/b.mjs']);
    });

    it('defers to the filesystem on existence, never to the map (AC6)', () => {
        seed();
        const map = codeMap.buildMap(root);

        // Map says a.js imports hub.js; disk says a.js is gone. The filesystem wins.
        fs.unlinkSync(path.join(root, 'src/a.js'));
        const res = codeMap.reverseDeps(root, map, 'src/hub.js');
        expect(res.direct).toEqual(['src/b.mjs']);
        expect(res.dropped).toEqual(['src/a.js']);
        expect(res.stale).toBe(true);

        // And a target the map never heard of is reported as unknown-to-the-map,
        // not as "does not exist".
        write('src/untracked.js', '\n');
        const unknown = codeMap.reverseDeps(root, map, 'src/untracked.js');
        expect(unknown.in_map).toBe(false);
        expect(unknown.exists).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// digest (AC1, AC2)
// ---------------------------------------------------------------------------

describe('buildDigest', () => {
    it('says where to look and how to ask what breaks', () => {
        seed();
        const map = codeMap.buildMap(root);
        const digest = codeMap.buildDigest(root, map);
        expect(digest.text).toContain('Code map');
        expect(digest.text).toContain('src/');                 // where to grep
        expect(digest.text).toContain('src/hub.js');           // the hub to be careful with
        expect(digest.text).toMatch(/--rdeps/);                // on-demand lookup, AC3
        expect(digest.text).toMatch(/unresolved/i);            // AC2 self-report in the digest
        expect(digest.chars).toBe(digest.text.length);
    });

    it('states the unresolved count in the digest itself', () => {
        seed();
        const map = codeMap.buildMap(root);
        expect(codeMap.buildDigest(root, map).text).toMatch(/2 unresolved/);
    });

    it('degrades by naming the tiers it dropped, never by silent truncation', () => {
        seed();
        const map = codeMap.buildMap(root);
        const full = codeMap.buildDigest(root, map, { budget: codeMap.HOOK_CHAR_CAP });
        const tiny = codeMap.buildDigest(root, map, { budget: 600 });

        expect(tiny.chars).toBeLessThanOrEqual(600);
        expect(tiny.dropped.length).toBeGreaterThan(0);
        expect(tiny.text).toContain(tiny.dropped[0]);
        expect(tiny.text).toMatch(/dropped to fit/i);
        // tiering, not truncation: the kept text is a prefix-complete set of
        // whole tiers, so no line is cut mid-way
        expect(tiny.text.endsWith('\n') || tiny.text.length > 0).toBe(true);
        for (const line of tiny.text.split('\n')) expect(line).not.toMatch(/\.\.\.$/);
        expect(full.dropped).toEqual([]);
        expect(full.tiers.length).toBeGreaterThan(tiny.tiers.length);
    });

    it('takes its budget from AF_CODE_MAP_BUDGET, clamped to the cap', () => {
        seed();
        const map = codeMap.buildMap(root);
        const prev = process.env.AF_CODE_MAP_BUDGET;
        try {
            process.env.AF_CODE_MAP_BUDGET = '700';
            expect(codeMap.buildDigest(root, map).budget).toBe(700);
            process.env.AF_CODE_MAP_BUDGET = '999999';
            expect(codeMap.buildDigest(root, map).budget).toBe(codeMap.HOOK_CHAR_CAP);
            process.env.AF_CODE_MAP_BUDGET = 'nonsense';
            expect(codeMap.buildDigest(root, map).budget).toBe(codeMap.DEFAULT_DIGEST_BUDGET);
        } finally {
            if (prev === undefined) delete process.env.AF_CODE_MAP_BUDGET;
            else process.env.AF_CODE_MAP_BUDGET = prev;
        }
    });

    it('keeps tests in the map but out of the entrypoints view', () => {
        seed();
        write('src/__tests__/hub.test.js', "require('../hub');\n");
        write('src/other.spec.ts', "import '../src/hub.js';\n");
        const map = codeMap.buildMap(root);
        expect(map.files['src/__tests__/hub.test.js']).toBeDefined();
        expect(map.files['src/other.spec.ts']).toBeDefined();
        const rels = codeMap.entrypoints(map.files, 10).map((e) => e.rel);
        expect(rels).not.toContain('src/__tests__/hub.test.js');
        expect(rels).not.toContain('src/other.spec.ts');
        expect(rels).toContain('src/deep/c.ts');
    });

    it('never exceeds the hook cap even with a pathological map', () => {
        for (let i = 0; i < 400; i++) {
            write(`pkg${i % 7}/very/deeply/nested/directory/name/file-${i}.js`,
                `require('../../../../../../pkg${(i + 1) % 7}/very/deeply/nested/directory/name/file-${(i + 1) % 400}.js');\nrequire('./gone-${i}');\n`);
        }
        const map = codeMap.buildMap(root);
        const digest = codeMap.buildDigest(root, map);
        expect(digest.chars).toBeLessThanOrEqual(codeMap.HOOK_CHAR_CAP);
        expect(digest.chars).toBeLessThanOrEqual(codeMap.DEFAULT_DIGEST_BUDGET);
        expect(digest.text).toMatch(/unresolved/i);
    });
});

// ---------------------------------------------------------------------------
// the hook / CLI
// ---------------------------------------------------------------------------

const runHook = (args, opts = {}) => spawnSync(
    'node', [HOOK, ...args],
    {
        encoding: 'utf8',
        input: opts.input || '{}',
        cwd: opts.cwd || root,
        env: { ...process.env, AF_PROJECT_ROOT: opts.projectRoot || root, ...(opts.env || {}) },
    },
);

describe('code-map-digest hook', () => {
    it('emits SessionStart additionalContext under the cap', () => {
        seed();
        const res = runHook(['--session-start'], { input: JSON.stringify({ session_id: 's1', source: 'startup' }) });
        expect(res.status).toBe(0);
        const out = JSON.parse(res.stdout);
        expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
        expect(out.hookSpecificOutput.additionalContext).toContain('Code map');
        expect(out.hookSpecificOutput.additionalContext.length).toBeLessThanOrEqual(codeMap.HOOK_CHAR_CAP);
    });

    it('does NOT run reverse-dependency lookup at startup (AC3)', () => {
        seed();
        const res = runHook(['--session-start'], { input: JSON.stringify({ session_id: 's1', source: 'startup' }) });
        const ctx = JSON.parse(res.stdout).hookSpecificOutput.additionalContext;
        // the digest advertises the lookup; it does not contain its results
        expect(ctx).toMatch(/--rdeps/);
        expect(ctx).not.toMatch(/reverse dependencies of/i);
    });

    it('answers --rdeps on demand', () => {
        seed();
        codeMap.rebuildMap(root);
        const res = runHook(['--rdeps', 'src/hub.js']);
        expect(res.status).toBe(0);
        expect(res.stdout).toMatch(/src\/a\.js/);
        expect(res.stdout).toMatch(/src\/deep\/c\.ts/);
    });

    it('marks a file dirty on PostToolUse without rebuilding', () => {
        seed();
        codeMap.rebuildMap(root);
        const before = fs.statSync(codeMap.mapPath(root)).mtimeMs;
        const res = runHook(['--post-tool-use'], {
            input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: path.join(root, 'src/a.js') } }),
        });
        expect(res.status).toBe(0);
        expect(fs.readFileSync(codeMap.dirtyPath(root), 'utf8')).toContain('src/a.js');
        expect(fs.statSync(codeMap.mapPath(root)).mtimeMs).toBe(before);
    });

    it('exits 0 and emits nothing when disabled', () => {
        seed();
        const res = runHook(['--session-start'], { env: { AF_CODE_MAP_DISABLED: 'true' } });
        expect(res.status).toBe(0);
        expect(res.stdout.trim()).toBe('');
        const post = runHook(['--post-tool-use'], { env: { AF_CODE_MAP_DISABLED: 'true' } });
        expect(post.status).toBe(0);
        // A human asking for a lookup gets told, rather than silently nothing.
        const cli = runHook(['--digest'], { env: { AF_CODE_MAP_DISABLED: 'true' } });
        expect(cli.status).toBe(3);
        expect(cli.stdout.trim()).toBe('');
    });
});

// ---------------------------------------------------------------------------
// the rest of the module surface — nothing is exported without a caller or a
// test (repo hard rule: an export nobody reaches is dead code)
// ---------------------------------------------------------------------------

describe('module surface', () => {
    it('langOf labels source files and rejects non-source ones', () => {
        expect(codeMap.langOf('a/b.cjs')).toBe('js');
        expect(codeMap.langOf('a/b.TSX')).toBe('ts');
        expect(codeMap.langOf('a/b.sh')).toBe('sh');
        expect(codeMap.langOf('README.md')).toBeNull();
        expect(codeMap.langOf('package.json')).toBeNull();
    });

    it('listSourceFiles skips vendored trees and non-source files', () => {
        seed();
        write('node_modules/pkg/index.js', '\n');
        write('dist/bundle.js', '\n');
        write('notes.md', '\n');
        expect(codeMap.listSourceFiles(root)).toEqual([
            'scripts/run.sh', 'src/a.js', 'src/b.mjs', 'src/deep/c.ts', 'src/hub.js',
        ]);
    });

    it('maskSource keeps comments out and marks computed specifiers dynamic', () => {
        const plain = codeMap.maskSource("require('./x') // require('./y')");
        expect(plain.strings).toEqual(['./x']);
        const tpl = codeMap.maskSource('require(`./${name}`)');
        expect(tpl.strings).toEqual([null]);
        expect(codeMap.extractSpecifiers('require(`./${name}`)')).toEqual([]);
        expect(codeMap.extractSpecifiers('require(`./static`)')).toEqual(['./static']);
    });

    it('isExternal tells a package scope from a path alias', () => {
        expect(codeMap.isExternal('lodash')).toBe(true);
        expect(codeMap.isExternal('node:fs')).toBe(true);
        expect(codeMap.isExternal('@scope/pkg')).toBe(true);
        expect(codeMap.isExternal('@/components/x')).toBe(false);
        expect(codeMap.isExternal('~/lib/x')).toBe(false);
        expect(codeMap.isExternal('#internal/x')).toBe(false);
        expect(codeMap.isExternal('./x')).toBe(false);
        expect(codeMap.isExternal('/abs/x')).toBe(false);
    });

    it('resolveSpecifier tries extensions and index files, and stays in the repo', () => {
        write('src/hub.js', '\n');
        write('src/pkg/index.ts', '\n');
        expect(codeMap.resolveSpecifier(root, 'src/a.js', './hub')).toBe('src/hub.js');
        expect(codeMap.resolveSpecifier(root, 'src/a.js', './pkg')).toBe('src/pkg/index.ts');
        expect(codeMap.resolveSpecifier(root, 'src/a.js', '/src/hub.js')).toBe('src/hub.js');
        expect(codeMap.resolveSpecifier(root, 'src/a.js', './nope')).toBeNull();
        expect(codeMap.resolveSpecifier(root, 'src/a.js', '../../etc/passwd')).toBeNull();
    });

    it('readDirty dedupes and sorts; drainDirty reports removals and overflow', () => {
        seed();
        const map = codeMap.rebuildMap(root);
        codeMap.markDirty(root, 'src/a.js');
        codeMap.markDirty(root, 'src/a.js');
        codeMap.markDirty(root, path.join(root, 'src/hub.js'));
        codeMap.markDirty(root, '../outside.js');     // outside the root: ignored
        codeMap.markDirty(root, 'README.md');         // not source: ignored
        expect(codeMap.readDirty(root)).toEqual(['src/a.js', 'src/hub.js']);

        fs.unlinkSync(path.join(root, 'src/hub.js'));
        const drained = codeMap.drainDirty(root, map);
        expect(drained.removed).toEqual(['src/hub.js']);
        expect(drained.map.files['src/hub.js']).toBeUndefined();
        expect(drained.overflow).toBe(false);

        // An over-long queue stops being cheaper than a rebuild and says so.
        for (let i = 0; i <= codeMap.DIRTY_MAX; i++) codeMap.markDirty(root, `src/q${i}.js`);
        expect(codeMap.drainDirty(root, drained.map).overflow).toBe(true);
        expect(codeMap.readDirty(root)).toEqual([]);
    });

    it('topDirs and hubs rank by LOC and in-degree', () => {
        seed();
        const map = codeMap.buildMap(root);
        expect(codeMap.topDirs(map.files, 1)[0].dir).toBe('src');
        expect(codeMap.hubs(root, map, 1)[0]).toEqual({ rel: 'src/hub.js', direct: 2, blast: 3 });
    });

    it('formatReverseDeps reports staleness and an unmapped target in words', () => {
        seed();
        const map = codeMap.buildMap(root);
        fs.unlinkSync(path.join(root, 'src/a.js'));
        const text = codeMap.formatReverseDeps(codeMap.reverseDeps(root, map, 'src/hub.js'));
        expect(text).toMatch(/STALE: 1 mapped file\(s\) no longer on disk/);
        const unmapped = codeMap.formatReverseDeps(codeMap.reverseDeps(root, map, 'src/nope.js'));
        expect(unmapped).toMatch(/no such file on disk/);
    });

    it('currentMap self-heals: it rebuilds rather than answering from a stale cache', () => {
        seed();
        codeMap.rebuildMap(root);
        write('src/late.js', "require('./hub');\n");
        expect(codeMap.stalenessReason(root)).toMatch(/src\/late\.js/);
        const map = codeMap.currentMap(root);
        expect(map.files['src/late.js'].imports).toEqual(['src/hub.js']);
        expect(codeMap.stalenessReason(root, map)).toBeNull();
    });

    it('cli covers rebuild / check / rdeps / digest and refuses nonsense', () => {
        seed();
        expect(codeMap.cli(['--rebuild'], root).code).toBe(0);
        expect(codeMap.cli(['--check'], root)).toEqual({ code: 0, out: 'fresh\n' });
        write('src/late.js', '\n');
        expect(codeMap.cli(['--check'], root).code).toBe(3);
        expect(codeMap.cli(['--rdeps', 'src/hub.js'], root).out).toMatch(/src\/a\.js/);
        expect(codeMap.cli(['--digest'], root).out).toMatch(/Code map/);
        expect(codeMap.cli(['--wat'], root).code).toBe(1);
        expect(codeMap.cli([], root).code).toBe(1);
    });

    it('cli reports disabled with exit 3 and no output', () => {
        seed();
        const prev = process.env.AF_CODE_MAP_DISABLED;
        process.env.AF_CODE_MAP_DISABLED = 'true';
        try {
            expect(codeMap.cli(['--digest'], root)).toEqual({ code: 3, out: '' });
        } finally {
            if (prev === undefined) delete process.env.AF_CODE_MAP_DISABLED;
            else process.env.AF_CODE_MAP_DISABLED = prev;
        }
    });

    it('envBudget parses and clamps AF_CODE_MAP_BUDGET', () => {
        const prev = process.env.AF_CODE_MAP_BUDGET;
        try {
            delete process.env.AF_CODE_MAP_BUDGET;
            expect(codeMap.envBudget()).toBeNull();
            process.env.AF_CODE_MAP_BUDGET = '0';
            expect(codeMap.envBudget()).toBeNull();
            process.env.AF_CODE_MAP_BUDGET = '2000';
            expect(codeMap.envBudget()).toBe(2000);
            process.env.AF_CODE_MAP_BUDGET = '50000';
            expect(codeMap.envBudget()).toBe(codeMap.HOOK_CHAR_CAP);
        } finally {
            if (prev === undefined) delete process.env.AF_CODE_MAP_BUDGET;
            else process.env.AF_CODE_MAP_BUDGET = prev;
        }
    });

    it('mapPath and dirtyPath live under .claude/cache', () => {
        expect(codeMap.mapPath(root)).toBe(path.join(root, '.claude', 'cache', codeMap.MAP_NAME));
        expect(codeMap.dirtyPath(root)).toBe(path.join(root, '.claude', 'cache', 'code-map.dirty'));
    });

    it('exports nothing that no caller and no test reaches', () => {
        const surface = Object.keys(module.require('../../hooks/lib/code-map.cjs')).sort();
        const source = fs.readFileSync(path.join(__dirname, 'code-map.test.cjs'), 'utf8')
            + fs.readFileSync(path.join(__dirname, '..', '..', 'hooks', 'code-map-digest.cjs'), 'utf8');
        const unreached = surface.filter((name) => !new RegExp(`codeMap\\.${name}\\b`).test(source));
        expect(unreached).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// the real repo: the cap claim has to hold here, not only on a fixture
// ---------------------------------------------------------------------------

describe('this repository', () => {
    it('produces a digest that fits the 10,000-char hook cap with headroom', () => {
        const map = codeMap.buildMap(REPO_ROOT);
        expect(Object.keys(map.files).length).toBeGreaterThan(50);
        const digest = codeMap.buildDigest(REPO_ROOT, map);
        expect(digest.chars).toBeLessThanOrEqual(codeMap.DEFAULT_DIGEST_BUDGET);
        expect(digest.chars).toBeLessThan(codeMap.HOOK_CHAR_CAP);
    });
});
