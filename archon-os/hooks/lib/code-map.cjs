'use strict';

// Mirrors legacy AF_* / AURA_FROG_* variables onto their ARCHON_* names. This file
// reads process.env without going through safe-stdin, so it bridges for itself.
require('./env-compat.cjs');
/**
 * Archon OS — Code map (FEAT-F)
 *
 * Maintains `<root>/.claude/cache/code-map.json`: one record per source file
 * with `(mtime, size, loc)` plus its resolved import edges, its external
 * (bare) specifiers, and — the part that earns this over an authored doc — the
 * specifiers it FAILED to resolve.
 *
 *   {
 *     "schema_version": 1,
 *     "generated_at": "2026-10-29T09:00:00Z",
 *     "files": {
 *       "archon-os/hooks/dispatch.cjs": {
 *         "mtime": 1761000000000, "size": 4096, "loc": 120,
 *         "imports":    ["archon-os/hooks/lib/hook-runtime.cjs"],
 *         "external":   ["node:fs"],
 *         "unresolved": ["@/alias-we-cannot-resolve"]
 *       }
 *     },
 *     "stats": { "files": 1, "loc": 120, "edges": 1, "external": 1,
 *                "unresolved": 1, "reused": 0, "extracted": 1 }
 *   }
 *
 * Paths are repo-relative so the map survives a moved checkout.
 *
 * WHAT IT IS FOR — two jobs only, because grep already wins the rest:
 *
 *   1. A SessionStart digest that says WHERE TO GREP (not what is there).
 *      Grep needs a starting guess; the digest supplies one and then gets out
 *      of the way.
 *   2. Reverse-dependency lookup ON DEMAND — "change this, what breaks" — which
 *      is structurally impossible for grep: grep returns text matches, not a
 *      dependency closure. `src/deep/c.ts` never mentions `src/hub.js`, yet it
 *      breaks when `hub.js` changes.
 *
 * DERIVED CACHE, NEVER A SOURCE OF TRUTH. Delete code-map.json and it
 * regenerates; nothing is ever written only here. Readers reject it when a
 * recorded file is missing, its (mtime, size) moved, or a new source file
 * appeared, and fall back to a real scan. The FILESYSTEM decides whether a file
 * exists — `reverseDeps` stats every importer before reporting it and lists
 * what it dropped (see the `dropped` / `stale` fields). Same contract as
 * hooks/lib/vault-index.cjs.
 *
 * ZERO LLM TOKENS and zero dependencies: deterministic extraction on the Node
 * that Claude Code already runs. The extractor strips comments, strings and
 * regex literals before matching, so a specifier mentioned in a comment is not
 * an edge. It is still a lexical extractor and will miss edges that only a real
 * parser sees (computed specifiers, macro-generated imports); that is exactly
 * why the unresolved count is published rather than hidden.
 *
 * Disable entirely: ARCHON_CODE_MAP_DISABLED=true
 *
 * @version 1.0.0
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCHEMA_VERSION = 1;
const CACHE_DIR = path.join('.claude', 'cache');
const MAP_NAME = 'code-map.json';
const DIRTY_NAME = 'code-map.dirty';

/** SessionStart hook output is dropped past this many characters. */
const HOOK_CHAR_CAP = 10000;
/** What we actually spend, leaving the rest of the cap to other hooks. */
const DEFAULT_DIGEST_BUDGET = 3500;

// Bounds. A repo past MAX_FILES gets a truncated-population map that SAYS it is
// truncated (stats.truncated), rather than a slow one.
const MAX_FILES = 20000;
const WALK_MAX_DEPTH = 12;
const MAX_FILE_BYTES = 512 * 1024;
// Past this many queued paths, patching one entry at a time stops being cheaper
// than a rebuild.
const DIRTY_MAX = 300;

// Extension → language label. Population comes from `git ls-files` (or a walk);
// this set only decides which of those files are source.
const LANG_BY_EXT = new Map(Object.entries({
    '.js': 'js', '.cjs': 'js', '.mjs': 'js', '.jsx': 'js',
    '.ts': 'ts', '.tsx': 'ts', '.mts': 'ts', '.cts': 'ts',
    '.vue': 'vue', '.svelte': 'svelte',
    '.py': 'py', '.go': 'go', '.rs': 'rs', '.rb': 'rb', '.php': 'php',
    '.java': 'java', '.kt': 'kt', '.swift': 'swift', '.cs': 'cs',
    '.sh': 'sh', '.bash': 'sh', '.zsh': 'sh', '.sql': 'sql',
}));

// Import edges are only extracted for the JS/TS family — the only dialect whose
// specifiers this module knows how to resolve.
const JS_EXT = new Set(['.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx', '.mts', '.cts']);
// Resolution order for an extensionless relative specifier.
const RESOLVE_EXT = ['.ts', '.tsx', '.mts', '.cts', '.js', '.cjs', '.mjs', '.jsx', '.json', '.vue', '.svelte'];

const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'out', 'coverage', 'vendor',
    '.next', '.nuxt', '.output', '.turbo', '.vercel', '.cache', '.expo',
    '__pycache__', '.venv', 'venv', 'target', '.gradle', 'Pods', '.dart_tool',
]);

function isDisabled() {
    return process.env.ARCHON_CODE_MAP_DISABLED === 'true';
}

/** ARCHON_CODE_MAP_BUDGET, when it is a usable number. Clamped to the hook cap. */
function envBudget() {
    const n = parseInt(process.env.ARCHON_CODE_MAP_BUDGET || '', 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, HOOK_CHAR_CAP) : null;
}

function mapPath(root) {
    return path.join(root, CACHE_DIR, MAP_NAME);
}

function dirtyPath(root) {
    return path.join(root, CACHE_DIR, DIRTY_NAME);
}

function langOf(rel) {
    return LANG_BY_EXT.get(path.extname(rel).toLowerCase()) || null;
}

// ---------------------------------------------------------------------------
// population — FROM THE SOURCE, never a hand-written list
// ---------------------------------------------------------------------------

/**
 * Every source file in the repo, repo-relative, sorted.
 *
 * `git ls-files` is the population when the root is a git repo (tracked AND
 * untracked-but-not-ignored, so a file created a second ago is in the map).
 * Otherwise a bounded directory walk. Either way the list is derived; a file
 * nobody registered anywhere still appears.
 */
function listSourceFiles(root) {
    const fromGit = gitListFiles(root);
    const rels = fromGit || walkFiles(root);
    const out = [];
    for (const rel of rels) {
        if (out.length >= MAX_FILES) break;
        if (!langOf(rel)) continue;
        // git can list a path whose file is gone (staged deletion); the
        // filesystem decides.
        if (fromGit && !isFile(path.join(root, rel))) continue;
        out.push(rel);
    }
    return out.sort();
}

function isFile(abs) {
    try { return fs.statSync(abs).isFile(); } catch { return false; }
}

function gitListFiles(root) {
    try {
        const out = execFileSync(
            'git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
            // Bounded on both axes: a huge repo must not blow the buffer, and a
            // hung git (network-backed worktree, index lock) must not hang a
            // hook — either way we fall through to the directory walk.
            { encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
        );
        const rels = out.split('\0').filter(Boolean);
        return rels.length > 0 ? rels : null;
    } catch {
        return null;
    }
}

function walkFiles(root) {
    const found = [];
    const stack = [['', 0]];
    while (stack.length > 0 && found.length < MAX_FILES) {
        const [rel, depth] = stack.pop();
        let entries;
        try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
        for (const ent of entries) {
            const childRel = rel ? `${rel}/${ent.name}` : ent.name;
            if (ent.isDirectory()) {
                if (SKIP_DIRS.has(ent.name)) continue;
                if (depth < WALK_MAX_DEPTH) stack.push([childRel, depth + 1]);
            } else if (ent.isFile()) {
                found.push(childRel);
                if (found.length >= MAX_FILES) break;
            }
        }
    }
    return found;
}

// ---------------------------------------------------------------------------
// extraction — comment / string / regex aware, then match
// ---------------------------------------------------------------------------

const SLOT = '\u0000';

/**
 * Pure: one lexer pass that
 *   - deletes comments and regex literals (a specifier named in a comment is
 *     not an edge, and `const re = /["']/` must not open a string that
 *     swallows the rest of the file), and
 *   - replaces every string literal's CONTENT with a numbered slot.
 *
 * Returns `{ code, strings }`. The slot indirection is what makes
 * `require('./real')` distinguishable from `"require('./fake')"`: the first is
 * a require in code whose argument is slot N, the second is itself slot N and
 * its interior is never scanned as code.
 *
 * A template literal containing `${` is recorded as `null` — a computed
 * specifier is not a static edge, and pretending otherwise is how a lexical
 * extractor starts lying.
 */
function maskSource(text) {
    const strings = [];
    let code = '';
    const n = text.length;
    let i = 0;
    let lastSignificant = '';
    while (i < n) {
        const c = text[i];
        const d = text[i + 1];
        if (c === '/' && d === '/') {
            while (i < n && text[i] !== '\n') i++;
            continue;
        }
        if (c === '/' && d === '*') {
            let j = i + 2;
            while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j++;
            code += text.slice(i, Math.min(j + 2, n)).replace(/[^\n]/g, '');
            i = Math.min(j + 2, n);
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            let j = i + 1;
            let body = '';
            while (j < n) {
                if (text[j] === '\\') { body += text.slice(j, j + 2); j += 2; continue; }
                if (text[j] === c) break;
                // An unterminated quote must not eat the file: the single-line
                // quote styles end at the newline.
                if (c !== '`' && text[j] === '\n') break;
                body += text[j];
                j++;
            }
            const dynamic = c === '`' && body.includes('${');
            strings.push(dynamic ? null : body);
            code += `${c}${SLOT}${strings.length - 1}${SLOT}${c}`;
            // Keep line numbers roughly honest for multi-line literals.
            code += '\n'.repeat((body.match(/\n/g) || []).length);
            i = Math.min(j + 1, n);
            lastSignificant = 'x';
            continue;
        }
        if (c === '/' && canStartRegex(lastSignificant)) {
            let j = i + 1;
            let inClass = false;
            let closed = false;
            while (j < n && text[j] !== '\n') {
                if (text[j] === '\\') { j += 2; continue; }
                if (text[j] === '[') inClass = true;
                else if (text[j] === ']') inClass = false;
                else if (text[j] === '/' && !inClass) { closed = true; break; }
                j++;
            }
            if (closed) { i = j + 1; lastSignificant = 'x'; continue; }
        }
        if (!/\s/.test(c)) lastSignificant = c;
        code += c;
        i++;
    }
    return { code, strings };
}

// A `/` begins a regex literal only where a value may begin. After an
// identifier, a literal or a closing bracket it is division.
function canStartRegex(prev) {
    if (prev === '') return true;
    return '(,=:[!&|?{};+-*%~^<>'.includes(prev);
}

// Matched against the MASKED source, so `S` is a slot reference rather than a
// raw literal — `['"\`]\0 12 \0['"\`]`.
const S = '[\'"`]\\u0000(\\d+)\\u0000[\'"`]';
const RE_FROM = new RegExp(`(?:^|[^\\w$.])(?:import|export)\\b[^;\\u0000]{0,400}?\\bfrom\\s*${S}`, 'g');
const RE_BARE_IMPORT = new RegExp(`(?:^|[^\\w$.])import\\s*${S}`, 'g');
const RE_DYNAMIC = new RegExp(`\\bimport\\s*\\(\\s*${S}\\s*\\)`, 'g');
const RE_REQUIRE = new RegExp(`(?:^|[^\\w$.])require\\s*\\(\\s*${S}\\s*\\)`, 'g');

/** Pure: every static module specifier in a JS/TS source, deduped. */
function extractSpecifiers(text) {
    const { code, strings } = maskSource(text);
    const seen = new Set();
    for (const re of [RE_FROM, RE_BARE_IMPORT, RE_DYNAMIC, RE_REQUIRE]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(code)) !== null) {
            const spec = strings[Number(m[1])];
            if (typeof spec === 'string' && spec.trim()) seen.add(spec.trim());
        }
    }
    return [...seen];
}

/** Pure: is this specifier a bare package name (external), rather than a path? */
function isExternal(spec) {
    if (spec.startsWith('.') || spec.startsWith('/')) return false;
    if (spec.startsWith('#')) return false;                   // node subpath imports
    if (spec.startsWith('~')) return false;                   // common alias form
    if (spec.startsWith('@') && !spec.slice(1).includes('/')) return true;
    if (spec.startsWith('@/')) return false;                  // alias, not a scope
    return true;
}

/**
 * Resolve a path-ish specifier to a repo-relative file, or null when nothing on
 * disk answers it. Null is what the unresolved count is made of.
 */
function resolveSpecifier(root, fromRel, spec) {
    const base = spec.startsWith('/')
        ? path.join(root, spec)
        : path.resolve(root, path.dirname(fromRel), spec);
    const candidates = [base];
    for (const ext of RESOLVE_EXT) candidates.push(base + ext);
    for (const ext of RESOLVE_EXT) candidates.push(path.join(base, `index${ext}`));
    for (const abs of candidates) {
        if (!isFile(abs)) continue;
        const rel = path.relative(root, abs);
        if (rel.startsWith('..') || path.isAbsolute(rel)) return null; // outside the repo
        return rel.split(path.sep).join('/');
    }
    return null;
}

/** One file → one map entry. Reads the file; no other I/O beyond resolution stats. */
function entryFor(root, rel, stat) {
    const entry = {
        mtime: Math.floor(stat.mtimeMs),
        size: stat.size,
        loc: 0,
        imports: [],
        external: [],
        unresolved: [],
    };
    let text = '';
    if (stat.size <= MAX_FILE_BYTES) {
        try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return entry; }
    }
    entry.loc = text ? text.split('\n').length : 0;
    if (!JS_EXT.has(path.extname(rel).toLowerCase()) || !text) return entry;

    const imports = new Set();
    for (const spec of extractSpecifiers(text)) {
        if (isExternal(spec)) { entry.external.push(spec); continue; }
        const target = resolveSpecifier(root, rel, spec);
        if (target) imports.add(target);
        else entry.unresolved.push(spec);
    }
    entry.imports = [...imports].sort();
    entry.external.sort();
    entry.unresolved.sort();
    return entry;
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

function emptyStats() {
    return { files: 0, loc: 0, edges: 0, external: 0, unresolved: 0, reused: 0, extracted: 0, truncated: false };
}

function statsFor(files, counters) {
    const stats = { ...emptyStats(), ...counters };
    stats.files = Object.keys(files).length;
    for (const entry of Object.values(files)) {
        stats.loc += entry.loc;
        stats.edges += entry.imports.length;
        stats.external += entry.external.length;
        stats.unresolved += entry.unresolved.length;
    }
    return stats;
}

/**
 * Full build. `opts.previous` is the `(path, mtime, size)` cache: an entry whose
 * file has not moved is copied instead of re-read, which is what makes the
 * incremental path cheap enough to simply never be stale.
 */
function buildMap(root, opts = {}) {
    const prevFiles = (opts.previous && opts.previous.files) || {};
    const rels = listSourceFiles(root);
    const files = {};
    let reused = 0;
    let extracted = 0;
    for (const rel of rels) {
        let stat;
        try { stat = fs.statSync(path.join(root, rel)); } catch { continue; }
        const prev = prevFiles[rel];
        if (prev && prev.size === stat.size && prev.mtime === Math.floor(stat.mtimeMs)) {
            files[rel] = prev;
            reused++;
            continue;
        }
        files[rel] = entryFor(root, rel, stat);
        extracted++;
    }
    return {
        schema_version: SCHEMA_VERSION,
        generated_at: (opts.now || new Date()).toISOString(),
        files,
        stats: { ...statsFor(files, { reused, extracted }), truncated: rels.length >= MAX_FILES },
    };
}

/** Atomic write: tmp beside the target, then rename. */
function writeMap(root, map) {
    const target = mapPath(root);
    const tmp = `${target}.tmp-${process.pid}`;
    try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(tmp, JSON.stringify(map) + '\n');
        fs.renameSync(tmp, target);
        return true;
    } catch {
        try { fs.unlinkSync(tmp); } catch { /* nothing to clean */ }
        return false;
    }
}

/** Parsed cache, or null when absent / unreadable / wrong schema. */
function readMap(root) {
    try {
        const parsed = JSON.parse(fs.readFileSync(mapPath(root), 'utf8'));
        if (!parsed || parsed.schema_version !== SCHEMA_VERSION || !parsed.files) return null;
        return parsed;
    } catch {
        return null;
    }
}

function rebuildMap(root, opts = {}) {
    if (isDisabled()) return null;
    const map = buildMap(root, { previous: readMap(root), ...opts });
    writeMap(root, map);            // best-effort: an unwritable cache is still a usable map
    return map;
}

/**
 * Is the cache safe to read? Returns a reason string when stale, null when it
 * can be trusted. Three ways to be stale, and the third is the one that makes
 * this safe rather than merely fast:
 *
 *   - a recorded file is gone
 *   - a recorded file's (mtime, size) moved
 *   - a source file exists that the map has never heard of
 *
 * Without the third check a brand-new file would simply be invisible, which is
 * the quiet failure this repo's hard rule is about.
 */
function stalenessReason(root, map = readMap(root)) {
    if (!map || !map.files) return 'no map';
    for (const [rel, entry] of Object.entries(map.files)) {
        let stat;
        try { stat = fs.statSync(path.join(root, rel)); } catch { return `missing ${rel}`; }
        if (stat.size !== entry.size || Math.floor(stat.mtimeMs) !== entry.mtime) {
            return `${rel} changed since the map was built`;
        }
    }
    const onDisk = listSourceFiles(root);
    for (const rel of onDisk) {
        if (!map.files[rel]) return `new file ${rel} is not in the map`;
    }
    if (onDisk.length !== Object.keys(map.files).length) {
        return `file count differs (${onDisk.length} on disk vs ${Object.keys(map.files).length} in map)`;
    }
    return null;
}

// ---------------------------------------------------------------------------
// dirty queue — per changed file, never a full rescan
// ---------------------------------------------------------------------------

/**
 * Queue one changed file for re-extraction. Called from PostToolUse, so it has
 * to be trivially cheap: one append, no map read, no parse. Paths outside the
 * root and non-source files are ignored.
 */
function markDirty(root, filePath) {
    if (isDisabled() || !filePath) return false;
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (!rel || rel.startsWith('..')) return false;
    if (!langOf(rel)) return false;
    try {
        fs.mkdirSync(path.join(root, CACHE_DIR), { recursive: true });
        fs.appendFileSync(dirtyPath(root), rel + '\n');
        return true;
    } catch {
        return false;
    }
}

function readDirty(root) {
    try {
        return [...new Set(fs.readFileSync(dirtyPath(root), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean))].sort();
    } catch {
        return [];
    }
}

/**
 * Apply the queue to `map` and clear it. Each queued path costs one stat plus,
 * at most, one file read — the whole point is that a session that edited three
 * files does not pay for a rescan of the repo. An over-long queue falls back to
 * a rebuild, because at that size patching is no longer the cheaper path.
 */
function drainDirty(root, map) {
    const queued = readDirty(root);
    const clear = () => { try { fs.unlinkSync(dirtyPath(root)); } catch { /* already gone */ } };
    if (queued.length === 0) return { map, updated: [], removed: [], overflow: false };
    if (!map || !map.files || queued.length > DIRTY_MAX) {
        clear();
        return { map: rebuildMap(root) || map, updated: queued, removed: [], overflow: true };
    }

    const files = { ...map.files };
    const updated = [];
    const removed = [];
    for (const rel of queued) {
        let stat;
        try { stat = fs.statSync(path.join(root, rel)); } catch { stat = null; }
        if (!stat || !stat.isFile()) {
            if (files[rel]) { delete files[rel]; removed.push(rel); }
            continue;
        }
        files[rel] = entryFor(root, rel, stat);
        updated.push(rel);
    }
    const next = {
        schema_version: SCHEMA_VERSION,
        generated_at: new Date().toISOString(),
        files,
        stats: statsFor(files, { reused: Object.keys(files).length - updated.length, extracted: updated.length }),
    };
    clear();
    writeMap(root, next);
    return { map: next, updated, removed, overflow: false };
}

// ---------------------------------------------------------------------------
// reverse dependencies — the one question grep cannot answer
// ---------------------------------------------------------------------------

function toRel(root, target) {
    const abs = path.isAbsolute(target) ? target : path.resolve(root, target);
    return path.relative(root, abs).split(path.sep).join('/');
}

/**
 * "Change this file — what breaks?" Direct importers plus the transitive
 * closure above them.
 *
 * The map is not trusted about existence: every importer is stat'd, and ones
 * the map still lists but the filesystem no longer has are returned in
 * `dropped` with `stale: true` — so a caller can see the cache is behind rather
 * than be told a confident wrong answer.
 */
function reverseDeps(root, map, target, opts = {}) {
    const maxDepth = Number.isFinite(opts.depth) ? opts.depth : 10;
    const rel = toRel(root, target);
    const files = (map && map.files) || {};
    const dropped = [];

    // Reverse adjacency, restricted to importers that still exist on disk.
    const importers = new Map();
    for (const [from, entry] of Object.entries(files)) {
        if (!isFile(path.join(root, from))) { dropped.push(from); continue; }
        for (const to of entry.imports) {
            if (!importers.has(to)) importers.set(to, []);
            importers.get(to).push(from);
        }
    }

    const direct = (importers.get(rel) || []).slice().sort();
    const seen = new Set([rel]);
    const transitive = [];
    let frontier = direct;
    let depth = 0;
    while (frontier.length > 0 && depth < maxDepth) {
        const next = [];
        for (const f of frontier) {
            if (seen.has(f)) continue;
            seen.add(f);
            transitive.push(f);
            for (const up of importers.get(f) || []) if (!seen.has(up)) next.push(up);
        }
        frontier = next;
        depth++;
    }

    return {
        target: rel,
        exists: isFile(path.join(root, rel)),       // the filesystem answers this, not the map
        in_map: Object.prototype.hasOwnProperty.call(files, rel),
        direct,
        transitive: transitive.sort(),
        dropped: dropped.sort(),
        stale: dropped.length > 0,
        depth_limit: maxDepth,
    };
}

// ---------------------------------------------------------------------------
// digest — where to look, under the cap, tiered
// ---------------------------------------------------------------------------

function topDirs(files, limit) {
    const byDir = new Map();
    for (const [rel, entry] of Object.entries(files)) {
        const parts = rel.split('/');
        const dir = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join('/') : '.';
        const agg = byDir.get(dir) || { dir, files: 0, loc: 0, langs: new Map() };
        agg.files++;
        agg.loc += entry.loc;
        const lang = langOf(rel) || '?';
        agg.langs.set(lang, (agg.langs.get(lang) || 0) + 1);
        byDir.set(dir, agg);
    }
    return [...byDir.values()]
        .map((a) => ({
            ...a,
            lang: [...a.langs.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0],
        }))
        .sort((a, b) => b.loc - a.loc || a.dir.localeCompare(b.dir))
        .slice(0, limit);
}

function inDegree(files) {
    const deg = new Map();
    for (const entry of Object.values(files)) {
        for (const to of entry.imports) deg.set(to, (deg.get(to) || 0) + 1);
    }
    return deg;
}

function hubs(root, map, limit) {
    const deg = inDegree(map.files);
    return [...deg.entries()]
        .filter(([rel]) => map.files[rel])
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([rel, n]) => ({ rel, direct: n, blast: reverseDeps(root, map, rel).transitive.length }));
}

const TEST_PATH = /(^|\/)__tests__\/|\.(test|spec)\.[cm]?[jt]sx?$/;

function entrypoints(files, limit) {
    const deg = inDegree(files);
    return Object.entries(files)
        // Tests import but are imported by nothing, so they swamp this list and
        // say nothing about where the product is entered. They stay in the map;
        // they are only filtered out of this view.
        .filter(([rel]) => !TEST_PATH.test(rel))
        .filter(([rel, e]) => !deg.get(rel) && (e.imports.length > 0 || e.external.length > 0))
        .sort((a, b) => b[1].imports.length - a[1].imports.length || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([rel, e]) => ({ rel, imports: e.imports.length }));
}

function unresolvedSamples(files, limit) {
    const out = [];
    for (const [rel, entry] of Object.entries(files).sort((a, b) => a[0].localeCompare(b[0]))) {
        for (const spec of entry.unresolved) {
            if (out.length >= limit) return out;
            out.push({ rel, spec });
        }
    }
    return out;
}

function capList(lines, total) {
    if (total > lines.length) lines.push(`  (+${total - lines.length} more)`);
    return lines;
}

/**
 * The SessionStart digest. Composed of a mandatory head/foot plus independent
 * TIERS, added in priority order only while the budget allows. Dropping a tier
 * is reported by name in the text; nothing is ever cut mid-structure, because a
 * half-written list reads as a complete one.
 */
function buildDigest(root, map, opts = {}) {
    const budget = Math.min(opts.budget || envBudget() || DEFAULT_DIGEST_BUDGET, HOOK_CHAR_CAP);
    const s = map.stats || statsFor(map.files, {});
    const hookRef = 'node "$CLAUDE_PLUGIN_ROOT/hooks/code-map-digest.cjs"';

    const head = [
        '## Code map — where to look',
        `${s.files} source files · ${s.loc.toLocaleString('en-US')} LOC · ${s.edges} import edges · ` +
        `${s.external} external specifiers · **${s.unresolved} unresolved** (the map reports what it could not resolve)`,
        `Derived cache: .claude/cache/${MAP_NAME} — rebuildable, never authoritative. The filesystem decides what exists; grep decides what a name means.`,
    ];
    const foot = [
        `"Change this, what breaks?" → \`${hookRef} --rdeps <path>\` (on demand, not at startup)`,
    ];
    if (s.truncated) head.push(`NOTE: population truncated at ${MAX_FILES} files — treat the map as partial.`);

    const tiers = [
        {
            name: 'dirs',
            lines: () => {
                const rows = topDirs(map.files, 8);
                return ['', 'Largest source dirs (start grepping here):',
                    ...rows.map((d) => `  ${d.dir}/ — ${d.files} files · ${d.loc.toLocaleString('en-US')} LOC · ${d.lang}`)];
            },
        },
        {
            name: 'hubs',
            lines: () => {
                const rows = hubs(root, map, 6);
                if (rows.length === 0) return [];
                return ['', 'Most-imported files (highest blast radius):',
                    ...rows.map((h) => `  ${h.rel} ← ${h.direct} direct · ${h.blast} transitive importers`)];
            },
        },
        {
            name: 'entrypoints',
            lines: () => {
                const rows = entrypoints(map.files, 5);
                if (rows.length === 0) return [];
                return ['', 'Entrypoints (nothing imports these):',
                    ...rows.map((e) => `  ${e.rel} → imports ${e.imports}`)];
            },
        },
        {
            name: 'unresolved',
            lines: () => {
                if (s.unresolved === 0) return ['', 'Unresolved specifiers: none.'];
                const rows = unresolvedSamples(map.files, 5);
                return ['', `Unresolved specifiers (${s.unresolved} total — aliases, generated or missing modules):`,
                    ...capList(rows.map((u) => `  ${u.rel} → ${u.spec}`), s.unresolved)];
            },
        },
    ];

    const kept = [];
    const dropped = [];
    const assemble = (keptNames, droppedNames) => {
        const body = [];
        for (const tier of tiers) if (keptNames.includes(tier.name)) body.push(...tier.lines());
        const note = droppedNames.length > 0
            ? ['', `(sections dropped to fit the ${budget}-char budget: ${droppedNames.join(', ')})`]
            : [];
        return [...head, ...body, '', ...foot, ...note].join('\n') + '\n';
    };

    for (const tier of tiers) {
        const candidate = assemble([...kept, tier.name], dropped);
        if (candidate.length <= budget) kept.push(tier.name);
        else dropped.push(tier.name);
    }
    // Adding the dropped-note can itself overflow; shed the lowest-priority
    // kept tier until the whole thing fits.
    let text = assemble(kept, dropped);
    while (text.length > budget && kept.length > 0) {
        dropped.unshift(kept.pop());
        text = assemble(kept, dropped);
    }

    return { text, chars: text.length, budget, tiers: kept, dropped };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function formatReverseDeps(res) {
    const lines = [`reverse dependencies of ${res.target} (exists=${res.exists}, in_map=${res.in_map})`];
    if (!res.in_map) {
        lines.push(res.exists
            ? '  file exists but is not in the map — rebuild (--rebuild) or it is not a source file'
            : '  no such file on disk');
    }
    lines.push(`  direct (${res.direct.length}):`);
    for (const f of res.direct) lines.push(`    ${f}`);
    const indirect = res.transitive.filter((f) => !res.direct.includes(f));
    lines.push(`  indirect (${indirect.length}):`);
    for (const f of indirect) lines.push(`    ${f}`);
    if (res.stale) {
        lines.push(`  STALE: ${res.dropped.length} mapped file(s) no longer on disk and were ignored: ${res.dropped.join(', ')}`);
    }
    return lines.join('\n') + '\n';
}

/** Read the cache, bring it up to date, or scan — whichever the state requires. */
function currentMap(root) {
    let map = readMap(root);
    if (map) {
        const drained = drainDirty(root, map);
        map = drained.map;
    }
    if (!map || stalenessReason(root, map)) map = rebuildMap(root) || buildMap(root);
    return map;
}

function cli(argv, root) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--rebuild') args.rebuild = true;
        else if (a === '--digest') args.digest = true;
        else if (a === '--rdeps') args.rdeps = argv[++i];
        else if (a === '--check') args.check = true;
        else if (a === '--depth') args.depth = parseInt(argv[++i], 10);
        else if (a === '--budget') args.budget = parseInt(argv[++i], 10);
        else return { code: 1, out: `unknown arg: ${a}\n` };
    }
    if (isDisabled()) return { code: 3, out: '' };

    if (args.rebuild) {
        const map = rebuildMap(root);
        if (!map) return { code: 1, out: 'rebuild failed\n' };
        const s = map.stats;
        return {
            code: 0,
            out: `${mapPath(root)}\n${s.files} files · ${s.loc} LOC · ${s.edges} edges · ${s.unresolved} unresolved · ` +
                 `${s.reused} reused / ${s.extracted} extracted\n`,
        };
    }
    if (args.check) {
        const reason = stalenessReason(root);
        return reason ? { code: 3, out: `stale: ${reason}\n` } : { code: 0, out: 'fresh\n' };
    }
    if (args.rdeps) {
        return { code: 0, out: formatReverseDeps(reverseDeps(root, currentMap(root), args.rdeps, { depth: args.depth })) };
    }
    if (args.digest) {
        return { code: 0, out: buildDigest(root, currentMap(root), { budget: args.budget }).text };
    }
    return { code: 1, out: 'nothing to do\n' };
}

// Surface rule: nothing is exported that has neither a caller nor a test.
// `entryFor`, `writeMap`, `MAX_FILES` and `DIRTY_NAME` are deliberately NOT
// exported — they are internal to a build and have no second consumer.
module.exports = {
    SCHEMA_VERSION, MAP_NAME, HOOK_CHAR_CAP, DEFAULT_DIGEST_BUDGET, DIRTY_MAX,
    isDisabled, envBudget, mapPath, dirtyPath, langOf,
    listSourceFiles, maskSource, extractSpecifiers, isExternal, resolveSpecifier,
    buildMap, readMap, rebuildMap, stalenessReason,
    markDirty, readDirty, drainDirty,
    reverseDeps, formatReverseDeps,
    topDirs, hubs, entrypoints, buildDigest,
    currentMap, cli,
};
