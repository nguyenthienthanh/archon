'use strict';
/**
 * Aura Frog — Plan Vault Index
 *
 * Maintains `<plansDir>/graph-index.json`: one adjacency record per plan node,
 * so the common questions about the tree — who is my parent, what are my
 * children, which tasks under this story are ready — can be answered without
 * walking the filesystem and parsing frontmatter out of every .md again.
 *
 * Today next-task.sh, validate-plan-tree.sh and render-plan-tree.sh each do
 * their own `find` + awk sweep of the whole tree on every invocation, and
 * next-task runs on every dispatch.
 *
 *   {
 *     "schema_version": 1,
 *     "generated_at": "2026-08-19T10:00:00Z",
 *     "nodes": {
 *       "TASK-00001": {
 *         "tier": 4, "status": "planned", "parent": "STORY-0001",
 *         "children": [], "depends_on": ["TASK-00002"],
 *         "path": "features/FEAT-001_x/stories/STORY-0001_y/tasks/TASK-00001_z/task.md",
 *         "intent": "..."
 *       }
 *     }
 *   }
 *
 * Paths are stored relative to plansDir so the index survives a moved checkout.
 *
 * OPT-IN, BY DESIGN. Nothing creates graph-index.json implicitly: until a
 * project runs a --rebuild, every reader takes its existing scan path and every
 * writer does one `existsSync` and stops. That keeps this from being a
 * correctness risk on upgrade — an index nobody asked for cannot go stale — and
 * it means the incremental update in _lib.sh costs nothing on projects that
 * never opted in.
 *
 * SELF-HEALING. Readers treat the index as a cache, never as the source of
 * truth: an entry whose file has vanished, or whose mtime is newer than the
 * index, means the index is stale and the caller falls back to the scan. The
 * plan files on disk stay authoritative — this is why validate-plan-tree.sh
 * deliberately does NOT read the index (a validator that trusts a cache can
 * report a green tree that is actually broken); it rebuilds it instead.
 *
 * Disable entirely: AF_GRAPH_INDEX_DISABLED=true
 *
 * @version 1.0.0
 */

const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 1;
const INDEX_NAME = 'graph-index.json';

// Depth 6 covers features/<F>/stories/<S>/tasks/<T>/task.md with room to spare;
// the file cap stops a pathological tree turning the index build into the
// problem it exists to solve.
const WALK_MAX_DEPTH = 6;
const WALK_MAX_FILES = 5000;

function indexPath(plansDir) {
    return path.join(plansDir, INDEX_NAME);
}

function isDisabled() {
    return process.env.AF_GRAPH_INDEX_DISABLED === 'true';
}

// Pure: pull the frontmatter block (between the first two `---` lines) out of a
// node file's text. Returns '' when there is no frontmatter.
function frontmatterOf(text) {
    if (!text.startsWith('---')) return '';
    const end = text.indexOf('\n---', 3);
    if (end === -1) return '';
    return text.slice(text.indexOf('\n') + 1, end + 1);
}

function unquote(v) {
    const t = v.trim();
    if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) {
        return t.slice(1, -1);
    }
    return t;
}

// Pure: parse the scalar and inline-list fields this index cares about. Matches
// what _lib.sh's get_field/get_list accept — `key: value` and `key: [a, b]` —
// deliberately, so the two never disagree about what a node says.
function parseFrontmatter(text) {
    const out = {};
    for (const line of frontmatterOf(text).split('\n')) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):[ \t]*(.*)$/);
        if (!m) continue;
        const [, key, rawValue] = m;
        const raw = rawValue.trim();
        if (raw.startsWith('[')) {
            const inner = raw.replace(/^\[/, '').replace(/\]$/, '');
            out[key] = inner.split(',').map(unquote).filter(Boolean);
        } else {
            out[key] = unquote(raw);
        }
    }
    return out;
}

// Pure: shape one parsed node into an index entry.
function entryFrom(fm, relPath) {
    const tier = parseInt(fm.tier, 10);
    return {
        tier: Number.isFinite(tier) ? tier : null,
        status: fm.status || null,
        parent: fm.parent || null,
        children: Array.isArray(fm.children) ? fm.children : [],
        depends_on: Array.isArray(fm.depends_on) ? fm.depends_on : [],
        path: relPath,
        intent: fm.intent || null,
    };
}

// Every node .md under plansDir except archived ones. Bounded walk.
function listNodeFiles(plansDir) {
    const found = [];
    const stack = [[plansDir, 0]];
    while (stack.length > 0 && found.length < WALK_MAX_FILES) {
        const [dir, depth] = stack.pop();
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const ent of entries) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) {
                if (ent.name === 'archive' || ent.name === 'checkpoints') continue;
                if (depth < WALK_MAX_DEPTH) stack.push([full, depth + 1]);
            } else if (ent.name.endsWith('.md') && ent.name !== 'README.md' && ent.name !== 'INDEX.md') {
                found.push(full);
                if (found.length >= WALK_MAX_FILES) break;
            }
        }
    }
    return found.sort();
}

/** Full scan → in-memory index. No I/O beyond reading the tree. */
function buildIndex(plansDir, now = new Date()) {
    const nodes = {};
    for (const file of listNodeFiles(plansDir)) {
        let text;
        try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
        const fm = parseFrontmatter(text);
        if (!fm.id) continue; // not a plan node
        nodes[fm.id] = entryFrom(fm, path.relative(plansDir, file));
    }
    return { schema_version: SCHEMA_VERSION, generated_at: now.toISOString(), nodes };
}

/** Atomic write: tmp in the same dir, then rename. */
function writeIndex(plansDir, index) {
    const target = indexPath(plansDir);
    const tmp = `${target}.tmp-${process.pid}`;
    try {
        fs.mkdirSync(plansDir, { recursive: true });
        fs.writeFileSync(tmp, JSON.stringify(index, null, 2) + '\n');
        fs.renameSync(tmp, target);
        return true;
    } catch {
        try { fs.unlinkSync(tmp); } catch { /* nothing to clean */ }
        return false;
    }
}

/** Parsed index, or null when absent/unreadable/wrong schema. */
function readIndex(plansDir) {
    try {
        const parsed = JSON.parse(fs.readFileSync(indexPath(plansDir), 'utf8'));
        if (!parsed || parsed.schema_version !== SCHEMA_VERSION || !parsed.nodes) return null;
        return parsed;
    } catch {
        return null;
    }
}

function rebuildIndex(plansDir, now = new Date()) {
    const index = buildIndex(plansDir, now);
    return writeIndex(plansDir, index) ? index : null;
}

/**
 * Re-read ONE node file and patch its entry in place. This is what _lib.sh
 * calls after a set_field, so a mutation costs one file read rather than a
 * whole-tree sweep.
 *
 * No-op (returns null) when the index does not exist — the opt-in rule above.
 */
function updateEntry(plansDir, nodeFile, now = new Date()) {
    if (isDisabled()) return null;
    const index = readIndex(plansDir);
    if (!index) return null;

    const rel = path.relative(plansDir, path.resolve(nodeFile));
    let text;
    try {
        text = fs.readFileSync(nodeFile, 'utf8');
    } catch {
        // File is gone: drop whatever entry pointed at it.
        let dropped = false;
        for (const [id, entry] of Object.entries(index.nodes)) {
            if (entry.path === rel) { delete index.nodes[id]; dropped = true; }
        }
        if (!dropped) return null;
        index.generated_at = now.toISOString();
        return writeIndex(plansDir, index) ? index : null;
    }

    const fm = parseFrontmatter(text);
    if (!fm.id) return null;

    // An id can be re-keyed by an edit; clear any stale entry still claiming
    // this path under a different id, or the index would list the node twice.
    for (const [id, entry] of Object.entries(index.nodes)) {
        if (entry.path === rel && id !== fm.id) delete index.nodes[id];
    }
    index.nodes[fm.id] = entryFrom(fm, rel);
    index.generated_at = now.toISOString();
    return writeIndex(plansDir, index) ? index : null;
}

// Timestamp granularity and the gap between writing the index and stat'ing it
// are both sub-second; without slack every fresh index reads as stale.
const MTIME_SLACK_MS = 1000;

// Bounded walk of DIRECTORIES only (no file reads, no parsing) — this is the
// completeness half of the staleness check and has to stay cheap.
function listNodeDirs(plansDir) {
    const dirs = [plansDir];
    const stack = [[plansDir, 0]];
    while (stack.length > 0 && dirs.length < WALK_MAX_FILES) {
        const [dir, depth] = stack.pop();
        if (depth >= WALK_MAX_DEPTH) continue;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const ent of entries) {
            if (!ent.isDirectory()) continue;
            if (ent.name === 'archive' || ent.name === 'checkpoints') continue;
            const full = path.join(dir, ent.name);
            dirs.push(full);
            stack.push([full, depth + 1]);
        }
    }
    return dirs;
}

/**
 * Is the index safe to read? Returns a reason string when stale, or null when
 * it can be trusted. Cheap checks only — this runs before every dispatch.
 *
 *   - no index / bad schema
 *   - a referenced file has vanished, or is newer than the index
 *   - any directory in the tree is newer than the index
 *
 * The directory check is what makes this safe rather than merely fast. Creating,
 * deleting or renaming a file updates its containing directory's mtime, so a
 * task file added by new-task.sh — which knows nothing about this index — marks
 * the index stale and the caller falls back to its own scan. Without it a
 * brand-new task would simply be invisible to next-task.sh, which is a far worse
 * failure than a slow scan.
 */
function stalenessReason(plansDir, index = readIndex(plansDir)) {
    if (!index) return 'no index';
    let indexMtime;
    try { indexMtime = fs.statSync(indexPath(plansDir)).mtimeMs; } catch { return 'no index'; }
    const cutoff = indexMtime + MTIME_SLACK_MS;

    for (const [id, entry] of Object.entries(index.nodes)) {
        const abs = path.join(plansDir, entry.path);
        let stat;
        try { stat = fs.statSync(abs); } catch { return `missing file for ${id}`; }
        if (stat.mtimeMs > cutoff) return `${id} modified after index`;
    }
    for (const dir of listNodeDirs(plansDir)) {
        let stat;
        try { stat = fs.statSync(dir); } catch { continue; }
        if (stat.mtimeMs > cutoff) return `${path.relative(plansDir, dir) || '.'} changed after index`;
    }
    return null;
}

/** Entries under `parentId`, in id order. Adjacency without a filesystem walk. */
function childrenOf(index, parentId) {
    return Object.entries(index.nodes)
        .filter(([, e]) => e.parent === parentId)
        .map(([id, e]) => ({ id, ...e }))
        .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * T4 children of `storyId` that are dispatchable: status planned, every
 * depends_on satisfied (dep status done or active). Same rule next-task.sh
 * applies, expressed once.
 */
function readyTasks(index, storyId) {
    return childrenOf(index, storyId).filter((node) => {
        if (node.tier !== 4 || node.status !== 'planned') return false;
        return node.depends_on.every((dep) => {
            const d = index.nodes[dep];
            return d && (d.status === 'done' || d.status === 'active');
        });
    });
}

// Status → glyph. Must match render-plan-tree.sh's icon(), which stays the
// fallback renderer: the two outputs are the same view of the same tree, and a
// user should not be able to tell which path produced the one they are looking at.
const ICONS = {
    active: '▶', done: '✓', planned: '○', blocked: '■',
    frozen: '❄', discarded: '✗', archived: '⌂',
};
const TIER_PREFIX = ['', '├─ ', '│  ├─ ', '│  │  ├─ ', '│  │  │  └─ '];

function renderLine(id, entry) {
    const icon = ICONS[entry.status || 'planned'] || '?';
    const prefix = TIER_PREFIX[entry.tier] ?? '';
    return `${prefix}${icon} ${id} — ${entry.intent || '(no intent)'}`;
}

/**
 * The whole tree as ASCII, walked by adjacency rather than by filesystem.
 * Children are ordered by id so two renders of one tree always match. Nodes
 * whose parent is missing from the index are still rendered under their tier —
 * an orphan should be visible in the tree, not silently dropped from it.
 */
function renderTree(index) {
    const lines = [];
    const byTier = (t) => Object.entries(index.nodes)
        .filter(([, e]) => e.tier === t)
        .sort(([a], [b]) => a.localeCompare(b));

    const emitted = new Set();
    const emit = (id, entry) => { emitted.add(id); lines.push(renderLine(id, entry)); };
    const walk = (parentId, tier) => {
        for (const [id, entry] of byTier(tier)) {
            if (entry.parent !== parentId) continue;
            emit(id, entry);
            if (tier < 4) walk(id, tier + 1);
        }
    };

    for (const [id, entry] of byTier(0)) { emit(id, entry); walk(id, 1); }
    // Tiers with no reachable T0 root (a tree built bottom-up, or a broken
    // parent link) still get walked from their own top.
    for (let tier = 1; tier <= 4; tier++) {
        for (const [id, entry] of byTier(tier)) {
            if (emitted.has(id)) continue;
            emit(id, entry);
            if (tier < 4) walk(id, tier + 1);
        }
    }
    return lines;
}

// --- CLI -------------------------------------------------------------------
// Used from _lib.sh and the plan scripts, which are bash.
//
//   vault-index.cjs --plans-dir <dir> --rebuild
//   vault-index.cjs --plans-dir <dir> --update <node.md>
//   vault-index.cjs --plans-dir <dir> --ready <STORY-ID>   # one id per line
//   vault-index.cjs --plans-dir <dir> --children <ID>      # id<TAB>tier<TAB>status<TAB>path<TAB>intent
//   vault-index.cjs --plans-dir <dir> --render             # ASCII tree
//
// Exit 0 on success, 3 when the index is absent or stale (caller falls back to
// its own scan), 1 on bad usage.
function cli(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--plans-dir') args.plansDir = argv[++i];
        else if (a === '--rebuild') args.rebuild = true;
        else if (a === '--update') args.update = argv[++i];
        else if (a === '--ready') args.ready = argv[++i];
        else if (a === '--children') args.children = argv[++i];
        else if (a === '--check') args.check = true;
        else if (a === '--render') args.render = true;
        else return { code: 1, out: `unknown arg: ${a}\n` };
    }
    const plansDir = args.plansDir || process.env.AF_PLANS_DIR;
    if (!plansDir) return { code: 1, out: '--plans-dir is required\n' };

    if (args.rebuild) {
        if (isDisabled()) return { code: 3, out: '' };
        return rebuildIndex(plansDir)
            ? { code: 0, out: `${indexPath(plansDir)}\n` }
            : { code: 1, out: 'index write failed\n' };
    }
    if (args.update) {
        updateEntry(plansDir, args.update);
        return { code: 0, out: '' };   // best-effort: never fail a mutation on the cache
    }

    if (isDisabled()) return { code: 3, out: '' };
    const index = readIndex(plansDir);
    const reason = stalenessReason(plansDir, index);
    if (reason) return { code: 3, out: '' };

    if (args.check) return { code: 0, out: '' };
    if (args.render) {
        const lines = renderTree(index);
        // An empty index is not a tree — let the caller fall back rather than
        // print a convincing blank one.
        if (lines.length === 0) return { code: 3, out: '' };
        return { code: 0, out: lines.join('\n') + '\n' };
    }
    if (args.ready) {
        return { code: 0, out: readyTasks(index, args.ready).map((n) => `${n.id}\t${n.path}`).join('\n') + '\n' };
    }
    if (args.children) {
        return {
            code: 0,
            out: childrenOf(index, args.children)
                .map((n) => [n.id, n.tier, n.status, n.path, n.intent || ''].join('\t'))
                .join('\n') + '\n',
        };
    }
    return { code: 1, out: 'nothing to do\n' };
}

if (require.main === module) {
    const { code, out } = cli(process.argv.slice(2));
    if (out) process.stdout.write(out);
    process.exit(code);
}

module.exports = {
    SCHEMA_VERSION, INDEX_NAME, indexPath,
    parseFrontmatter, entryFrom, listNodeFiles,
    buildIndex, writeIndex, readIndex, rebuildIndex, updateEntry,
    stalenessReason, childrenOf, readyTasks, renderTree, renderLine, cli,
};
