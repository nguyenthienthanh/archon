'use strict';

/**
 * vault-index — the plan-tree adjacency cache.
 *
 * The load-bearing property is not speed, it is that the index can never be
 * WRONG in a way a caller acts on. So the fallback cases carry more weight here
 * than the fast ones: a new task file that the index has never seen must make
 * the index read as stale, because the alternative is next-task.sh silently
 * never dispatching that task.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const idx = require('../vault-index.cjs');

let plans;

const node = (relDir, fileName, fm, body = '# node\n') => {
    const dir = path.join(plans, relDir);
    fs.mkdirSync(dir, { recursive: true });
    const front = Object.entries(fm)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`)
        .join('\n');
    const file = path.join(dir, fileName);
    fs.writeFileSync(file, `---\n${front}\n---\n\n${body}`);
    return file;
};

// A minimal but complete T0→T4 tree.
function seedTree() {
    node('mission', 'mission.md', { id: 'MISSION', tier: 0, status: 'active', intent: 'Ship it' });
    node('initiatives/INIT-001_a', 'initiative.md',
        { id: 'INIT-001', tier: 1, status: 'active', parent: 'MISSION', intent: 'Auth' });
    node('features/FEAT-001_b', 'feature.md',
        { id: 'FEAT-001', tier: 2, status: 'active', parent: 'INIT-001', intent: 'Login' });
    node('features/FEAT-001_b/stories/STORY-0001_c', 'story.md',
        { id: 'STORY-0001', tier: 3, status: 'active', parent: 'FEAT-001', intent: 'JWT' });
    node('features/FEAT-001_b/stories/STORY-0001_c/tasks/TASK-00001_d', 'task.md',
        { id: 'TASK-00001', tier: 4, status: 'planned', parent: 'STORY-0001', intent: 'verify' });
    node('features/FEAT-001_b/stories/STORY-0001_c/tasks/TASK-00002_e', 'task.md',
        {
            id: 'TASK-00002', tier: 4, status: 'planned', parent: 'STORY-0001',
            depends_on: ['TASK-00001'], intent: 'refresh',
        });
}

beforeEach(() => { plans = fs.mkdtempSync(path.join(os.tmpdir(), 'af-vault-')); });
afterEach(() => fs.rmSync(plans, { recursive: true, force: true }));

describe('parseFrontmatter', () => {
    it('reads scalars, quoted scalars and inline lists', () => {
        const fm = idx.parseFrontmatter(
            '---\nid: TASK-1\ntier: 4\nintent: "do a thing"\ndepends_on: [A, B]\n---\n\nbody\n');
        expect(fm).toMatchObject({ id: 'TASK-1', tier: '4', intent: 'do a thing', depends_on: ['A', 'B'] });
    });

    it('reads an empty list as empty, not as one blank entry', () => {
        expect(idx.parseFrontmatter('---\nid: X\ndepends_on: []\n---\n').depends_on).toEqual([]);
    });

    it('ignores body text that looks like frontmatter', () => {
        const fm = idx.parseFrontmatter('---\nid: REAL\n---\n\nid: FAKE\nstatus: done\n');
        expect(fm.id).toBe('REAL');
        expect(fm.status).toBeUndefined();
    });

    it('is empty for a file with no frontmatter', () => {
        expect(idx.parseFrontmatter('# just a doc\n')).toEqual({});
        expect(idx.parseFrontmatter('')).toEqual({});
    });
});

describe('buildIndex', () => {
    beforeEach(seedTree);

    it('indexes every node with its adjacency and a plansDir-relative path', () => {
        const index = idx.buildIndex(plans);
        expect(Object.keys(index.nodes).sort())
            .toEqual(['FEAT-001', 'INIT-001', 'MISSION', 'STORY-0001', 'TASK-00001', 'TASK-00002']);
        expect(index.nodes['TASK-00002']).toMatchObject({
            tier: 4, status: 'planned', parent: 'STORY-0001', depends_on: ['TASK-00001'],
        });
        expect(path.isAbsolute(index.nodes['TASK-00002'].path)).toBe(false);
    });

    it('skips files that are not plan nodes', () => {
        fs.writeFileSync(path.join(plans, 'INDEX.md'), '# not a node\n');
        fs.writeFileSync(path.join(plans, 'notes.md'), '# also not a node\n');
        expect(Object.keys(idx.buildIndex(plans).nodes)).not.toContain('notes');
        expect(Object.keys(idx.buildIndex(plans).nodes)).toHaveLength(6);
    });

    it('skips the archive — archived nodes are not part of the live tree', () => {
        node('archive/FEAT-999_old', 'feature.md', { id: 'FEAT-999', tier: 2, status: 'archived' });
        expect(idx.buildIndex(plans).nodes['FEAT-999']).toBeUndefined();
    });
});

describe('readIndex / writeIndex', () => {
    beforeEach(seedTree);

    it('round-trips through an atomic write, leaving no tmp file', () => {
        idx.rebuildIndex(plans);
        expect(idx.readIndex(plans).nodes['TASK-00001'].tier).toBe(4);
        expect(fs.readdirSync(plans).filter((f) => f.includes('.tmp-'))).toEqual([]);
    });

    it('returns null for a missing, corrupt, or wrong-schema index', () => {
        expect(idx.readIndex(plans)).toBeNull();
        fs.writeFileSync(idx.indexPath(plans), 'not json');
        expect(idx.readIndex(plans)).toBeNull();
        fs.writeFileSync(idx.indexPath(plans), JSON.stringify({ schema_version: 99, nodes: {} }));
        expect(idx.readIndex(plans)).toBeNull();
    });
});

describe('updateEntry', () => {
    beforeEach(seedTree);

    it('does nothing when the project has not opted in', () => {
        const file = path.join(plans, idx.buildIndex(plans).nodes['TASK-00001'].path);
        expect(idx.updateEntry(plans, file)).toBeNull();
        expect(fs.existsSync(idx.indexPath(plans))).toBe(false);
    });

    it('patches one entry without touching the rest', () => {
        idx.rebuildIndex(plans);
        const file = path.join(plans, idx.readIndex(plans).nodes['TASK-00001'].path);
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('status: planned', 'status: done'));

        idx.updateEntry(plans, file);

        const after = idx.readIndex(plans);
        expect(after.nodes['TASK-00001'].status).toBe('done');
        expect(after.nodes['TASK-00002'].status).toBe('planned');
        expect(Object.keys(after.nodes)).toHaveLength(6);
    });

    it('drops the entry when its file has been deleted', () => {
        idx.rebuildIndex(plans);
        const file = path.join(plans, idx.readIndex(plans).nodes['TASK-00002'].path);
        fs.rmSync(file);
        idx.updateEntry(plans, file);
        expect(idx.readIndex(plans).nodes['TASK-00002']).toBeUndefined();
    });

    it('does not leave the node listed twice when its id is edited', () => {
        idx.rebuildIndex(plans);
        const file = path.join(plans, idx.readIndex(plans).nodes['TASK-00002'].path);
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('id: TASK-00002', 'id: TASK-00099'));

        idx.updateEntry(plans, file);

        const after = idx.readIndex(plans);
        expect(after.nodes['TASK-00002']).toBeUndefined();
        expect(after.nodes['TASK-00099']).toBeDefined();
    });

    it('is inert when AF_GRAPH_INDEX_DISABLED=true', () => {
        idx.rebuildIndex(plans);
        const before = fs.readFileSync(idx.indexPath(plans), 'utf8');
        const file = path.join(plans, idx.readIndex(plans).nodes['TASK-00001'].path);
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('status: planned', 'status: done'));

        process.env.AF_GRAPH_INDEX_DISABLED = 'true';
        try { idx.updateEntry(plans, file); } finally { delete process.env.AF_GRAPH_INDEX_DISABLED; }

        expect(fs.readFileSync(idx.indexPath(plans), 'utf8')).toBe(before);
    });
});

describe('stalenessReason — the safety property', () => {
    beforeEach(seedTree);

    // Age the whole tree AND the index to the same past instant, so that the
    // one thing the test then touches is the only thing newer than the index —
    // no sleeping, and no false positive from the fixture's own creation time.
    const ageEverything = (seconds) => {
        const t = Date.now() / 1000 - seconds;
        const walk = (dir) => {
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, ent.name);
                if (ent.isDirectory()) walk(full);
                else fs.utimesSync(full, t, t);
            }
            fs.utimesSync(dir, t, t);
        };
        walk(plans);
    };

    it('is null for a freshly built index', () => {
        idx.rebuildIndex(plans);
        expect(idx.stalenessReason(plans)).toBeNull();
    });

    it('reports a missing index', () => {
        expect(idx.stalenessReason(plans)).toBe('no index');
    });

    it('reports a node file edited after the build', () => {
        idx.rebuildIndex(plans);
        const file = path.join(plans, idx.readIndex(plans).nodes['TASK-00001'].path);
        ageEverything(600);
        const now = Date.now() / 1000;
        fs.utimesSync(file, now, now);
        expect(idx.stalenessReason(plans)).toMatch(/TASK-00001 modified after index/);
    });

    it('reports a node file that has vanished', () => {
        idx.rebuildIndex(plans);
        fs.rmSync(path.join(plans, idx.readIndex(plans).nodes['TASK-00001'].path));
        expect(idx.stalenessReason(plans)).toMatch(/missing file for TASK-00001/);
    });

    it('reports a task file ADDED since the build — the one that matters most', () => {
        // A new task the index has never seen would otherwise be invisible to
        // next-task.sh: not in the index, and the index claims to be complete.
        // Creating the file bumps its directory's mtime, which is what catches it.
        idx.rebuildIndex(plans);
        ageEverything(600);
        node('features/FEAT-001_b/stories/STORY-0001_c/tasks/TASK-00003_f', 'task.md',
            { id: 'TASK-00003', tier: 4, status: 'planned', parent: 'STORY-0001' });
        expect(idx.stalenessReason(plans)).toMatch(/changed after index/);
    });

    it('a rebuild clears the staleness it just reported', () => {
        idx.rebuildIndex(plans);
        ageEverything(600);
        node('features/FEAT-001_b/stories/STORY-0001_c/tasks/TASK-00003_f', 'task.md',
            { id: 'TASK-00003', tier: 4, status: 'planned', parent: 'STORY-0001' });
        expect(idx.stalenessReason(plans)).not.toBeNull();

        idx.rebuildIndex(plans);

        expect(idx.stalenessReason(plans)).toBeNull();
        expect(idx.readIndex(plans).nodes['TASK-00003']).toBeDefined();
    });
});

describe('childrenOf / readyTasks', () => {
    beforeEach(seedTree);

    it('lists children by parent link, in id order', () => {
        const index = idx.buildIndex(plans);
        expect(idx.childrenOf(index, 'STORY-0001').map((n) => n.id))
            .toEqual(['TASK-00001', 'TASK-00002']);
        expect(idx.childrenOf(index, 'MISSION').map((n) => n.id)).toEqual(['INIT-001']);
        expect(idx.childrenOf(index, 'NOPE')).toEqual([]);
    });

    it('holds back a task whose dependency is not done or active', () => {
        const index = idx.buildIndex(plans);
        expect(idx.readyTasks(index, 'STORY-0001').map((n) => n.id)).toEqual(['TASK-00001']);
    });

    it('releases it once the dependency is done', () => {
        const index = idx.buildIndex(plans);
        index.nodes['TASK-00001'].status = 'done';
        expect(idx.readyTasks(index, 'STORY-0001').map((n) => n.id)).toEqual(['TASK-00002']);
    });

    it('holds back a task whose dependency is not in the index at all', () => {
        const index = idx.buildIndex(plans);
        index.nodes['TASK-00002'].depends_on = ['TASK-99999'];
        expect(idx.readyTasks(index, 'STORY-0001').map((n) => n.id)).toEqual(['TASK-00001']);
    });

    it('an active dependency counts as satisfied — work can overlap', () => {
        const index = idx.buildIndex(plans);
        index.nodes['TASK-00001'].status = 'active';
        expect(idx.readyTasks(index, 'STORY-0001').map((n) => n.id)).toEqual(['TASK-00002']);
    });

    it('never offers a task that is not planned', () => {
        const index = idx.buildIndex(plans);
        index.nodes['TASK-00001'].status = 'active';
        index.nodes['TASK-00002'].status = 'active';
        expect(idx.readyTasks(index, 'STORY-0001')).toEqual([]);
    });
});

describe('renderTree', () => {
    beforeEach(seedTree);

    it('renders the tree top-down with tier prefixes and status glyphs', () => {
        const lines = idx.renderTree(idx.buildIndex(plans));
        expect(lines[0]).toBe('▶ MISSION — Ship it');
        expect(lines[1]).toBe('├─ ▶ INIT-001 — Auth');
        expect(lines[2]).toBe('│  ├─ ▶ FEAT-001 — Login');
        expect(lines[3]).toBe('│  │  ├─ ▶ STORY-0001 — JWT');
        expect(lines[4]).toBe('│  │  │  └─ ○ TASK-00001 — verify');
        expect(lines[5]).toBe('│  │  │  └─ ○ TASK-00002 — refresh');
        expect(lines).toHaveLength(6);
    });

    it('still shows a node whose parent is missing rather than dropping it', () => {
        const index = idx.buildIndex(plans);
        delete index.nodes['FEAT-001'];
        const lines = idx.renderTree(index);
        expect(lines.join('\n')).toContain('STORY-0001');
        expect(lines.join('\n')).toContain('TASK-00001');
    });

    it('is empty for an empty index', () => {
        expect(idx.renderTree({ nodes: {} })).toEqual([]);
    });
});

describe('CLI', () => {
    beforeEach(seedTree);

    const run = (...args) => spawnSync(
        process.execPath, [path.join(__dirname, '..', 'vault-index.cjs'), ...args],
        { encoding: 'utf8' },
    );

    it('--rebuild writes the index and exits 0', () => {
        const r = run('--plans-dir', plans, '--rebuild');
        expect(r.status).toBe(0);
        expect(fs.existsSync(idx.indexPath(plans))).toBe(true);
    });

    it('--ready prints dispatchable tasks with their paths', () => {
        run('--plans-dir', plans, '--rebuild');
        const r = run('--plans-dir', plans, '--ready', 'STORY-0001');
        expect(r.status).toBe(0);
        expect(r.stdout.trim().split('\n')).toHaveLength(1);
        expect(r.stdout).toMatch(/^TASK-00001\t.*task\.md$/m);
    });

    it('exits 3 with no output when there is no index — the fallback signal', () => {
        const r = run('--plans-dir', plans, '--ready', 'STORY-0001');
        expect(r.status).toBe(3);
        expect(r.stdout).toBe('');
    });

    it('exits 3 when the index is stale rather than answering from it', () => {
        run('--plans-dir', plans, '--rebuild');
        const t = Date.now() / 1000 - 60;
        fs.utimesSync(idx.indexPath(plans), t, t);
        node('features/FEAT-001_b/stories/STORY-0001_c/tasks/TASK-00003_f', 'task.md',
            { id: 'TASK-00003', tier: 4, status: 'planned', parent: 'STORY-0001' });
        expect(run('--plans-dir', plans, '--ready', 'STORY-0001').status).toBe(3);
    });

    it('exits 3 when disabled, whatever the index says', () => {
        run('--plans-dir', plans, '--rebuild');
        const r = spawnSync(
            process.execPath, [path.join(__dirname, '..', 'vault-index.cjs'), '--plans-dir', plans, '--render'],
            { encoding: 'utf8', env: { ...process.env, AF_GRAPH_INDEX_DISABLED: 'true' } },
        );
        expect(r.status).toBe(3);
    });

    it('--render prints the tree', () => {
        run('--plans-dir', plans, '--rebuild');
        const r = run('--plans-dir', plans, '--render');
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('▶ MISSION — Ship it');
        expect(r.stdout.trim().split('\n')).toHaveLength(6);
    });

    it('rejects a missing --plans-dir and an unknown flag', () => {
        expect(run('--rebuild').status).not.toBe(0);
        expect(run('--plans-dir', plans, '--nope').status).toBe(1);
    });
});
