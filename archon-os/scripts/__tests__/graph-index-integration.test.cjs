'use strict';

/**
 * graph-index.json end-to-end through the plan scripts.
 *
 * The index is a cache in front of a `find` + awk sweep of the whole plan tree.
 * Two properties have to hold, and only the second is interesting:
 *
 *   1. With a fresh index, the scripts answer from it.
 *   2. With NO index, a stale one, or the feature disabled, they answer
 *      identically from the filesystem — because the filesystem is the source
 *      of truth and the cache is only ever allowed to save time.
 *
 * So every assertion below is paired: same tree, same answer, index or not.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PLANS_SCRIPTS = path.join(__dirname, '..', 'plans');
const NEXT_TASK = path.join(PLANS_SCRIPTS, 'next-task.sh');
const RENDER = path.join(PLANS_SCRIPTS, 'render-plan-tree.sh');
const VALIDATE = path.join(PLANS_SCRIPTS, 'validate-plan-tree.sh');

let plans;

// cwd is the fixture: validate-plan-tree resolves a T3's test_ref relative to
// the working directory, so the stub test file below has to be findable from it.
const run = (script, args = [], env = {}) => spawnSync(
    'bash', [script, ...args],
    { encoding: 'utf8', cwd: plans, env: { ...process.env, ...env } },
);

const node = (relDir, fileName, fm) => {
    const dir = path.join(plans, relDir);
    fs.mkdirSync(dir, { recursive: true });
    const front = Object.entries(fm)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`)
        .join('\n');
    fs.writeFileSync(path.join(dir, fileName), `---\n${front}\n---\n\n# node\n`);
};

const STORY_DIR = 'features/FEAT-001_login/stories/STORY-0001_jwt';

function seed() {
    fs.writeFileSync(path.join(plans, 'active.json'), JSON.stringify({
        schema_version: 1,
        active: { mission: 'MISSION', initiative: 'INIT-001', feature: 'FEAT-001', story: 'STORY-0001', task: null },
        blocked: [], frozen: [], context_anchors: {},
    }, null, 2));
    fs.writeFileSync(path.join(plans, '.counters.json'), JSON.stringify({ counters: { TASK: 2 } }));

    // children[] and the T3 test_ref are what validate-plan-tree's invariants 3
    // and 6 require — this fixture has to be a VALID tree, or the --rebuild
    // tests below would only ever exercise the refusal path.
    node('mission', 'mission.md',
        { id: 'MISSION', tier: 0, status: 'active', intent: 'Ship auth', children: ['INIT-001'] });
    node('initiatives/INIT-001_auth', 'initiative.md',
        { id: 'INIT-001', tier: 1, status: 'active', parent: 'MISSION', intent: 'Auth', children: ['FEAT-001'] });
    node('features/FEAT-001_login', 'feature.md',
        { id: 'FEAT-001', tier: 2, status: 'active', parent: 'INIT-001', intent: 'Login', children: ['STORY-0001'] });
    node(STORY_DIR, 'story.md', {
        id: 'STORY-0001', tier: 3, status: 'active', parent: 'FEAT-001', intent: 'JWT',
        test_ref: 'auth.test.ts', children: ['TASK-00001', 'TASK-00002'],
    });
    fs.writeFileSync(path.join(plans, 'auth.test.ts'), '// stub referenced by STORY-0001.test_ref\n');
    node(`${STORY_DIR}/tasks/TASK-00001_verify`, 'task.md',
        { id: 'TASK-00001', tier: 4, status: 'planned', parent: 'STORY-0001', intent: 'verify' });
    node(`${STORY_DIR}/tasks/TASK-00002_refresh`, 'task.md',
        {
            id: 'TASK-00002', tier: 4, status: 'planned', parent: 'STORY-0001',
            depends_on: ['TASK-00001'], intent: 'refresh',
        });
}

const indexFile = () => path.join(plans, 'graph-index.json');
const hasIndex = () => fs.existsSync(indexFile());

beforeEach(() => {
    plans = fs.mkdtempSync(path.join(os.tmpdir(), 'af-gidx-'));
    seed();
});
afterEach(() => fs.rmSync(plans, { recursive: true, force: true }));

describe('opt-in', () => {
    it('no plan script creates the index on its own', () => {
        run(NEXT_TASK, ['--plans-dir', plans, '--dry-run']);
        run(RENDER, [plans]);
        run(VALIDATE, [plans]);
        expect(hasIndex()).toBe(false);
    });

    it('--rebuild is what opts a project in', () => {
        expect(run(NEXT_TASK, ['--plans-dir', plans, '--rebuild', '--dry-run']).status).toBe(0);
        expect(hasIndex()).toBe(true);
        expect(JSON.parse(fs.readFileSync(indexFile(), 'utf8')).nodes['TASK-00001']).toBeDefined();
    });
});

describe('next-task picks the same task with and without the index', () => {
    const pick = (extra = [], env = {}) => run(NEXT_TASK, ['--plans-dir', plans, '--dry-run', ...extra], env);

    it('dispatches TASK-00001 from a filesystem scan', () => {
        const r = pick();
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('TASK-00001');
    });

    it('picks the lowest ready id, not whatever the filesystem lists first', () => {
        // Written last, sorts first. Without an ordered scan, WHICH task gets
        // dispatched depends on the filesystem — two machines with the same
        // tree could pick different work.
        node(`${STORY_DIR}/tasks/TASK-00000_setup`, 'task.md',
            { id: 'TASK-00000', tier: 4, status: 'planned', parent: 'STORY-0001', intent: 'setup' });

        expect(pick().stdout).toContain('TASK-00000');
        run(NEXT_TASK, ['--plans-dir', plans, '--rebuild', '--dry-run']);
        expect(pick().stdout).toContain('TASK-00000');
    });

    it('dispatches TASK-00001 from the index', () => {
        run(NEXT_TASK, ['--plans-dir', plans, '--rebuild', '--dry-run']);
        const r = pick();
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('TASK-00001');
    });

    it('never offers a task whose dependency is still planned, either way', () => {
        expect(pick().stdout).not.toContain('TASK-00002');
        run(NEXT_TASK, ['--plans-dir', plans, '--rebuild', '--dry-run']);
        expect(pick().stdout).not.toContain('TASK-00002');
    });

    it('sees a task ADDED after the index was built', () => {
        // The failure this guards: the new task is not in the index, and an
        // index that claimed completeness would make it undispatchable forever.
        run(NEXT_TASK, ['--plans-dir', plans, '--rebuild', '--dry-run']);
        fs.rmSync(path.join(plans, STORY_DIR, 'tasks', 'TASK-00001_verify'), { recursive: true });
        node(`${STORY_DIR}/tasks/TASK-00003_logout`, 'task.md',
            { id: 'TASK-00003', tier: 4, status: 'planned', parent: 'STORY-0001', intent: 'logout' });

        const r = pick();
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('TASK-00003');
    });

    it('behaves identically with the index disabled', () => {
        run(NEXT_TASK, ['--plans-dir', plans, '--rebuild', '--dry-run']);
        const r = pick([], { AF_GRAPH_INDEX_DISABLED: 'true' });
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('TASK-00001');
    });

    it('reports "no ready T4" from the index just as the scan does', () => {
        for (const id of ['TASK-00001_verify', 'TASK-00002_refresh']) {
            const f = path.join(plans, STORY_DIR, 'tasks', id, 'task.md');
            fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('status: planned', 'status: done'));
        }
        expect(pick().status).toBe(2);
        run(NEXT_TASK, ['--plans-dir', plans, '--rebuild', '--dry-run']);
        expect(pick().status).toBe(2);
    });
});

describe('render-plan-tree renders the same tree either way', () => {
    const ids = (out) => out.split('\n').map((l) => (l.match(/\b((?:MISSION|INIT|FEAT|STORY|TASK)[A-Z0-9-]*)/) || [])[1])
        .filter(Boolean);

    // Both paths must be ID-ORDERED, not directory-ordered. Unsorted `find`
    // returns whatever the filesystem hands back, so the same tree rendered on
    // two machines came out in two different orders — this assertion caught
    // exactly that on a CI runner whose readdir returned TASK-00002 first.
    it('scan and index produce the same nodes in the same order', () => {
        const scanned = run(RENDER, [plans]);
        expect(scanned.status).toBe(0);

        run(RENDER, [plans, '--rebuild']);
        const indexed = run(RENDER, [plans]);
        expect(indexed.status).toBe(0);

        expect(ids(indexed.stdout)).toEqual(ids(scanned.stdout));
        expect(ids(indexed.stdout)).toEqual(
            ['MISSION', 'INIT-001', 'FEAT-001', 'STORY-0001', 'TASK-00001', 'TASK-00002']);
    });

    it('orders siblings by id whichever way round they were created on disk', () => {
        // Create a task that sorts FIRST but was written LAST, so directory
        // order and id order disagree however the filesystem chooses to list.
        node(`${STORY_DIR}/tasks/TASK-00000_setup`, 'task.md',
            { id: 'TASK-00000', tier: 4, status: 'planned', parent: 'STORY-0001', intent: 'setup' });

        const scanned = ids(run(RENDER, [plans]).stdout);
        run(RENDER, [plans, '--rebuild']);
        const indexed = ids(run(RENDER, [plans]).stdout);

        const tasks = (list) => list.filter((id) => id.startsWith('TASK-'));
        expect(tasks(scanned)).toEqual(['TASK-00000', 'TASK-00001', 'TASK-00002']);
        expect(tasks(indexed)).toEqual(['TASK-00000', 'TASK-00001', 'TASK-00002']);
    });

    it('both paths print the legend', () => {
        expect(run(RENDER, [plans]).stdout).toContain('Legend:');
        run(RENDER, [plans, '--rebuild']);
        expect(run(RENDER, [plans]).stdout).toContain('Legend:');
    });

    it('falls back to the scan when the index is disabled', () => {
        run(RENDER, [plans, '--rebuild']);
        const r = run(RENDER, [plans], { AF_GRAPH_INDEX_DISABLED: 'true' });
        expect(r.status).toBe(0);
        expect(ids(r.stdout)).toContain('TASK-00002');
    });
});

describe('set_field keeps the index current', () => {
    const setStatus = (taskDir, status) => {
        const script = `
            source "${path.join(PLANS_SCRIPTS, '_lib.sh')}"
            set_field "${path.join(plans, STORY_DIR, 'tasks', taskDir, 'task.md')}" status "${status}"
        `;
        return spawnSync('bash', ['-c', script], { encoding: 'utf8', env: process.env });
    };

    it('a mutation updates the entry without a full rebuild', () => {
        run(NEXT_TASK, ['--plans-dir', plans, '--rebuild', '--dry-run']);
        expect(JSON.parse(fs.readFileSync(indexFile(), 'utf8')).nodes['TASK-00001'].status).toBe('planned');

        expect(setStatus('TASK-00001_verify', 'done').status).toBe(0);

        expect(JSON.parse(fs.readFileSync(indexFile(), 'utf8')).nodes['TASK-00001'].status).toBe('done');
    });

    it('and the updated index unblocks the dependent task', () => {
        run(NEXT_TASK, ['--plans-dir', plans, '--rebuild', '--dry-run']);
        setStatus('TASK-00001_verify', 'done');
        const r = run(NEXT_TASK, ['--plans-dir', plans, '--dry-run']);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('TASK-00002');
    });

    it('creates no index on a project that never opted in', () => {
        expect(setStatus('TASK-00001_verify', 'done').status).toBe(0);
        expect(hasIndex()).toBe(false);
    });
});

describe('validate-plan-tree is the index producer, never its consumer', () => {
    it('--rebuild writes the index after the invariants pass', () => {
        const r = run(VALIDATE, [plans, '--rebuild']);
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/graph-index\.json rebuilt/);
        expect(hasIndex()).toBe(true);
    });

    it('refuses to index a tree it just declared invalid', () => {
        // A cycle: INVARIANT 7. Indexing this would hand every reader a fast
        // path through data the validator just rejected.
        const f = path.join(plans, STORY_DIR, 'tasks', 'TASK-00001_verify', 'task.md');
        fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('---\n\n', 'depends_on: [TASK-00002]\n---\n\n'));

        const r = run(VALIDATE, [plans, '--rebuild']);
        expect(r.status).not.toBe(0);
        expect(r.stdout).toMatch(/NOT rebuilt/);
        expect(hasIndex()).toBe(false);
    });

    it('still validates against the files when a stale index disagrees', () => {
        run(VALIDATE, [plans, '--rebuild']);
        // Index says everything is fine; the tree on disk is now broken.
        const f = path.join(plans, STORY_DIR, 'tasks', 'TASK-00002_refresh', 'task.md');
        fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('status: planned', 'status: frozen'));

        const r = run(VALIDATE, [plans]);
        expect(r.status).not.toBe(0);
        expect(r.stdout).toMatch(/freeze_reason/);
    });
});
