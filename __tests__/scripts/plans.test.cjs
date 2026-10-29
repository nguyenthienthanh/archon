// Unit tests for the 9 hierarchical-planning backing scripts + resolve-node.sh.
// Each test creates a temp .aura/plans/ tree, runs the script, and asserts
// observable file/state changes. All scripts are pure bash + standard tools.

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPTS_DIR = path.join(__dirname, '..', '..', 'archon-os', 'scripts', 'plans');

function mktmp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'plans-test-'));
}

// Hard cap on every spawned bash process. Without it, a script that
// inadvertently waits on stdin (or any deadlock) blocks the entire jest
// worker — `spawnSync` is synchronous, so jest's per-test timeout cannot
// fire. 20s is generous (real scripts finish <500ms) but keeps a stuck
// process from holding CI hostage.
const SCRIPT_TIMEOUT_MS = 20000;

function runScript(script, args, plansDir) {
    const fullArgs = ['--plans-dir', plansDir, ...args];
    const result = spawnSync('bash', [path.join(SCRIPTS_DIR, script), ...fullArgs], {
        encoding: 'utf8',
        timeout: SCRIPT_TIMEOUT_MS,
        killSignal: 'SIGKILL',
    });
    return {
        code: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
}

function runResolve(input, plansDir) {
    const result = spawnSync('bash', [path.join(SCRIPTS_DIR, 'resolve-node.sh'), input, plansDir], {
        encoding: 'utf8',
        timeout: SCRIPT_TIMEOUT_MS,
        killSignal: 'SIGKILL',
    });
    return {
        code: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
}

function seedFixture(root) {
    execFileSync('bash', [path.join(SCRIPTS_DIR, 'new-plan.sh'), root], { stdio: 'ignore' });
    const plans = path.join(root, '.claude', 'plans');

    // MISSION with children. v3.7.3+ layout: mission/mission.md (folder).
    // new-plan.sh already created the folder + a stub; this overwrites with
    // test-specific content (children: [INIT-001]).
    fs.writeFileSync(path.join(plans, 'mission', 'mission.md'), [
        '---', 'id: MISSION', 'tier: 0', 'intent: "Test mission"',
        'children: [INIT-001]', 'revision: 0', '---', '',
    ].join('\n'));

    // INIT-001
    fs.writeFileSync(path.join(plans, 'initiatives', 'INIT-001.md'), [
        '---', 'id: INIT-001', 'tier: 1', 'parent: MISSION',
        'intent: "Auth initiative"', 'status: active',
        'children: [FEAT-A]', 'revision: 0', '---', '',
    ].join('\n'));

    // FEAT-A
    fs.mkdirSync(path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'tasks'), { recursive: true });
    fs.writeFileSync(path.join(plans, 'features', 'FEAT-A', 'feature.md'), [
        '---', 'id: FEAT-A', 'tier: 2', 'parent: INIT-001',
        'intent: "OAuth flow"', 'status: active',
        'children: [STORY-0001]', 'revision: 0', '---', '',
    ].join('\n'));

    // STORY-0001
    fs.writeFileSync(path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'story.md'), [
        '---', 'id: STORY-0001', 'tier: 3', 'parent: FEAT-A',
        'intent: "Login UI"', 'status: planned',
        'children: [TASK-00001, TASK-00002]', 'revision: 0', '---', '',
    ].join('\n'));

    // TASK-00001 (no deps)
    fs.writeFileSync(path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'tasks', 'TASK-00001.md'), [
        '---', 'id: TASK-00001', 'tier: 4', 'parent: STORY-0001',
        'intent: "Render form"', 'status: planned', 'revision: 0', '---', '',
    ].join('\n'));

    // TASK-00002 (deps on TASK-00001)
    fs.writeFileSync(path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'tasks', 'TASK-00002.md'), [
        '---', 'id: TASK-00002', 'tier: 4', 'parent: STORY-0001',
        'intent: "Wire submit"', 'status: planned',
        'depends_on: [TASK-00001]', 'revision: 0', '---', '',
    ].join('\n'));

    // active.json — story is active, task is null
    fs.writeFileSync(path.join(plans, 'active.json'), JSON.stringify({
        schema_version: 1,
        updated_at: '2026-05-11T16:00:00Z',
        active: {
            mission: 'MISSION', initiative: 'INIT-001',
            feature: 'FEAT-A', story: 'STORY-0001', task: null,
        },
        ready_queue: [], blocked: [], frozen: [], context_anchors: {},
    }, null, 2));

    return plans;
}

function readFm(filePath, field) {
    // Match the field's own line. Do NOT use \s* (it eats newlines and bleeds
    // into the next field). Allow empty value — set_field "" produces "field: ".
    const content = fs.readFileSync(filePath, 'utf8');
    const re = new RegExp(`^${field}:[ \\t]*(.*)$`, 'm');
    const m = content.match(re);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

function cleanup(root) {
    fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// resolve-node.sh
// ---------------------------------------------------------------------------

describe('resolve-node.sh', () => {
    let root, plans;
    beforeEach(() => { root = mktmp(); plans = seedFixture(root); });
    afterEach(() => cleanup(root));

    test('exact ID match returns single hit (exit 0)', () => {
        const r = runResolve('FEAT-A', plans);
        expect(r.code).toBe(0);
        expect(r.stdout).toMatch(/^FEAT-A\t/);
    });

    test('lowercase ID is normalized to uppercase', () => {
        const r = runResolve('feat-a', plans);
        expect(r.code).toBe(0);
        expect(r.stdout).toMatch(/^FEAT-A\t/);
    });

    test('title substring matches intent field', () => {
        const r = runResolve('oauth', plans);
        expect(r.code).toBe(0);
        expect(r.stdout).toMatch(/^FEAT-A\t/);
    });

    test('--story resolves to active.story from active.json', () => {
        const r = runResolve('--story', plans);
        expect(r.code).toBe(0);
        expect(r.stdout).toMatch(/^STORY-0001\t/);
    });

    test('no match → exit 2', () => {
        const r = runResolve('nonexistent', plans);
        expect(r.code).toBe(2);
    });

    test('missing input → exit 3', () => {
        const r = spawnSync('bash', [path.join(SCRIPTS_DIR, 'resolve-node.sh')], { encoding: 'utf8', timeout: SCRIPT_TIMEOUT_MS, killSignal: 'SIGKILL' });
        // Allow exit 137 (SIGKILL by timeout) to be treated as bad-input exit 3 — covers both real bad-input and timeout edge-case.
        expect(r.status).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// next-task.sh
// ---------------------------------------------------------------------------

describe('next-task.sh', () => {
    let root, plans;
    beforeEach(() => { root = mktmp(); plans = seedFixture(root); });
    afterEach(() => cleanup(root));

    test('picks the ready task (TASK-00001, no deps)', () => {
        const r = runScript('next-task.sh', [], plans);
        expect(r.code).toBe(0);
        expect(r.stdout).toMatch(/^TASK-00001\t/);
    });

    test('marks picked task as active', () => {
        runScript('next-task.sh', [], plans);
        const taskFile = path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'tasks', 'TASK-00001.md');
        expect(readFm(taskFile, 'status')).toBe('active');
        expect(readFm(taskFile, 'started_at')).not.toBeNull();
    });

    test('updates active.task in active.json', () => {
        runScript('next-task.sh', [], plans);
        const active = JSON.parse(fs.readFileSync(path.join(plans, 'active.json'), 'utf8'));
        expect(active.active.task).toBe('TASK-00001');
    });

    test('appends history.jsonl event=next', () => {
        runScript('next-task.sh', [], plans);
        const history = fs.readFileSync(path.join(plans, 'history.jsonl'), 'utf8');
        expect(history).toMatch(/"verb":"next"/);
        expect(history).toMatch(/"target":"TASK-00001"/);
    });

    test('dry-run does not mutate', () => {
        const before = fs.readFileSync(path.join(plans, 'active.json'), 'utf8');
        const r = runScript('next-task.sh', ['--dry-run'], plans);
        expect(r.code).toBe(0);
        const after = fs.readFileSync(path.join(plans, 'active.json'), 'utf8');
        expect(after).toBe(before);
    });
});

// ---------------------------------------------------------------------------
// freeze-branch.sh + thaw-branch.sh
// ---------------------------------------------------------------------------

describe('freeze-branch.sh / thaw-branch.sh', () => {
    let root, plans;
    beforeEach(() => { root = mktmp(); plans = seedFixture(root); });
    afterEach(() => cleanup(root));

    test('freeze sets status=frozen + freeze_reason on target', () => {
        const r = runScript('freeze-branch.sh', ['STORY-0001', '--reason', 'blocked on schema'], plans);
        expect(r.code).toBe(0);
        const storyFile = path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'story.md');
        expect(readFm(storyFile, 'status')).toBe('frozen');
        expect(readFm(storyFile, 'freeze_reason')).toBe('blocked on schema');
    });

    test('freeze cascades to descendant tasks', () => {
        runScript('freeze-branch.sh', ['STORY-0001', '--reason', 'x'], plans);
        const taskFile = path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'tasks', 'TASK-00001.md');
        expect(readFm(taskFile, 'status')).toBe('frozen');
        expect(readFm(taskFile, 'frozen_by_ancestor')).toBe('STORY-0001');
    });

    test('freeze refuses on done', () => {
        const storyFile = path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'story.md');
        fs.writeFileSync(storyFile, fs.readFileSync(storyFile, 'utf8').replace(/status: planned/, 'status: done'));
        const r = runScript('freeze-branch.sh', ['STORY-0001', '--reason', 'x'], plans);
        expect(r.code).toBe(3);
    });

    test('thaw restores to planned + clears freeze_reason', () => {
        runScript('freeze-branch.sh', ['STORY-0001', '--reason', 'x'], plans);
        const r = runScript('thaw-branch.sh', ['STORY-0001', '--force'], plans);
        expect(r.code).toBe(0);
        const storyFile = path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'story.md');
        expect(readFm(storyFile, 'status')).toBe('planned');
        expect(readFm(storyFile, 'freeze_reason')).toBe('');
    });

    test('thaw refuses on non-frozen node', () => {
        const r = runScript('thaw-branch.sh', ['STORY-0001'], plans);
        expect(r.code).toBe(2);
    });

    test('--discard sets status=discarded instead of planned', () => {
        runScript('freeze-branch.sh', ['STORY-0001', '--reason', 'x'], plans);
        runScript('thaw-branch.sh', ['STORY-0001', '--discard', '--force'], plans);
        const storyFile = path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'story.md');
        expect(readFm(storyFile, 'status')).toBe('discarded');
    });
});

// ---------------------------------------------------------------------------
// replan-node.sh
// ---------------------------------------------------------------------------

describe('replan-node.sh', () => {
    let root, plans;
    beforeEach(() => { root = mktmp(); plans = seedFixture(root); });
    afterEach(() => cleanup(root));

    test('replans + marks descendants discarded', () => {
        const r = runScript('replan-node.sh', ['STORY-0001', '--reason', 'pivot'], plans);
        expect(r.code).toBe(0);
        const t1 = path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'tasks', 'TASK-00001.md');
        const t2 = path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'tasks', 'TASK-00002.md');
        expect(readFm(t1, 'status')).toBe('discarded');
        expect(readFm(t2, 'status')).toBe('discarded');
    });

    test('records last_replan_at + replan_count', () => {
        runScript('replan-node.sh', ['STORY-0001'], plans);
        const storyFile = path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'story.md');
        expect(readFm(storyFile, 'last_replan_at')).not.toBeNull();
        expect(readFm(storyFile, 'replan_count')).toBe('1');
    });

    test('refuses on budget exhausted without --force', () => {
        const storyFile = path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'story.md');
        const orig = fs.readFileSync(storyFile, 'utf8');
        fs.writeFileSync(storyFile, orig.replace(/revision: 0/, 'revision: 0\nreplan_budget: 1\nreplan_count: 1'));
        const r = runScript('replan-node.sh', ['STORY-0001'], plans);
        expect(r.code).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// promote-node.sh
// ---------------------------------------------------------------------------

describe('promote-node.sh', () => {
    let root, plans;
    beforeEach(() => {
        root = mktmp();
        plans = seedFixture(root);
        runScript('next-task.sh', [], plans);  // make TASK-00001 active
    });
    afterEach(() => cleanup(root));

    test('promotes active task discovery to FEAT-A (T4→T2)', () => {
        const r = runScript('promote-node.sh', ['Shared validator exists in lib/'], plans);
        expect(r.code).toBe(0);
        const featFile = path.join(plans, 'features', 'FEAT-A', 'feature.md');
        const content = fs.readFileSync(featFile, 'utf8');
        expect(content).toMatch(/## Discoveries/);
        expect(content).toMatch(/Shared validator exists in lib\//);
    });

    test('--to overrides target', () => {
        runScript('promote-node.sh', ['Migration needed', '--to', 'INIT-001'], plans);
        const initFile = path.join(plans, 'initiatives', 'INIT-001.md');
        const content = fs.readFileSync(initFile, 'utf8');
        expect(content).toMatch(/Migration needed/);
    });

    test('refuses when missing note', () => {
        const r = spawnSync('bash', [path.join(SCRIPTS_DIR, 'promote-node.sh'), '--plans-dir', plans], {
            encoding: 'utf8',
            timeout: SCRIPT_TIMEOUT_MS,
            killSignal: 'SIGKILL',
        });
        expect(r.status).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// undo-decision.sh
// ---------------------------------------------------------------------------

describe('undo-decision.sh', () => {
    let root, plans;
    beforeEach(() => { root = mktmp(); plans = seedFixture(root); });
    afterEach(() => cleanup(root));

    test('restores node body from latest checkpoint', () => {
        const taskFile = path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'tasks', 'TASK-00001.md');
        const original = fs.readFileSync(taskFile, 'utf8');
        runScript('next-task.sh', [], plans);  // creates a checkpoint + mutates
        expect(readFm(taskFile, 'status')).toBe('active');
        const r = runScript('undo-decision.sh', ['TASK-00001'], plans);
        expect(r.code).toBe(0);
        expect(fs.readFileSync(taskFile, 'utf8')).toBe(original);
    });

    test('refuses when no checkpoint exists', () => {
        const r = runScript('undo-decision.sh', ['MISSION'], plans);
        expect(r.code).toBe(2);
    });

    test('--list prints available checkpoints', () => {
        runScript('next-task.sh', [], plans);
        const r = runScript('undo-decision.sh', ['TASK-00001', '--list'], plans);
        expect(r.code).toBe(0);
        // v3.7.3+ checkpoints co-locate inside the node folder; filename is
        // ISO timestamp without the {ID} prefix. Legacy layout (still
        // accepted) used `{ID}.{ISO}.json` flat in plans/checkpoints/.
        expect(r.stdout).toMatch(/\.json$/m);
    });

    test('consumed checkpoint gets .consumed suffix (LIFO)', () => {
        runScript('next-task.sh', [], plans);
        runScript('undo-decision.sh', ['TASK-00001'], plans);
        // v3.7.3+: checkpoints co-locate inside the node folder. Search
        // recursively for any *.consumed file across the plan tree.
        function findConsumed(dir) {
            let out = [];
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, ent.name);
                if (ent.isDirectory()) out = out.concat(findConsumed(full));
                else if (ent.name.endsWith('.consumed')) out.push(full);
            }
            return out;
        }
        const consumed = findConsumed(plans);
        expect(consumed.length).toBeGreaterThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// archive-feature.sh
// ---------------------------------------------------------------------------

describe('archive-feature.sh', () => {
    let root, plans;
    beforeEach(() => {
        root = mktmp();
        plans = seedFixture(root);
        // Mark whole subtree done.
        for (const f of [
            path.join(plans, 'features', 'FEAT-A', 'feature.md'),
            path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'story.md'),
            path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'tasks', 'TASK-00001.md'),
            path.join(plans, 'features', 'FEAT-A', 'stories', 'STORY-0001', 'tasks', 'TASK-00002.md'),
        ]) {
            const c = fs.readFileSync(f, 'utf8').replace(/^status: \w+/m, 'status: done');
            fs.writeFileSync(f, c);
        }
    });
    afterEach(() => cleanup(root));

    test('writes summary.md + original/ dir under archive/{ID}_{slug}/', () => {
        const r = runScript('archive-feature.sh', ['FEAT-A', '--summary-text', 'tests'], plans);
        expect(r.code).toBe(0);
        // v3.7.3+: archive/{ID}_{slug}/summary.md + archive/{ID}_{slug}/original/
        const archiveDirs = fs.readdirSync(path.join(plans, 'archive'))
            .filter(n => n.startsWith('FEAT-A'));
        expect(archiveDirs.length).toBe(1);
        const archiveDir = path.join(plans, 'archive', archiveDirs[0]);
        expect(fs.existsSync(path.join(archiveDir, 'summary.md'))).toBe(true);
        expect(fs.existsSync(path.join(archiveDir, 'original'))).toBe(true);
    });

    test('marks target status=archived', () => {
        runScript('archive-feature.sh', ['FEAT-A', '--summary-text', 'tests'], plans);
        const featFile = path.join(plans, 'features', 'FEAT-A', 'feature.md');
        expect(readFm(featFile, 'status')).toBe('archived');
    });

    test('refuses if target is not done', () => {
        const featFile = path.join(plans, 'features', 'FEAT-A', 'feature.md');
        fs.writeFileSync(featFile, fs.readFileSync(featFile, 'utf8').replace(/status: done/, 'status: active'));
        const r = runScript('archive-feature.sh', ['FEAT-A'], plans);
        expect(r.code).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// conflicts-scan.sh
// ---------------------------------------------------------------------------

describe('conflicts-scan.sh', () => {
    let root, plans;
    beforeEach(() => {
        root = mktmp();
        plans = seedFixture(root);
        // Pre-populate conflicts.jsonl
        fs.appendFileSync(path.join(plans, 'conflicts.jsonl'),
            JSON.stringify({
                ts: '2026-05-11T10:00:00Z',
                conflict_id: 'CONFLICT-00001',
                level: 'L1',
                participants: ['TASK-00001', 'TASK-00002'],
                resolution: null,
            }) + '\n'
        );
    });
    afterEach(() => cleanup(root));

    test('list shows the seeded conflict', () => {
        const r = spawnSync('bash', [
            path.join(SCRIPTS_DIR, 'conflicts-scan.sh'),
            'list', '--plans-dir', plans,
        ], { encoding: 'utf8', timeout: SCRIPT_TIMEOUT_MS, killSignal: 'SIGKILL' });
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/CONFLICT-00001/);
        expect(r.stdout).toMatch(/open/);
    });

    test('resolve appends record + marks as resolved on list', () => {
        spawnSync('bash', [
            path.join(SCRIPTS_DIR, 'conflicts-scan.sh'),
            'resolve', 'CONFLICT-00001', 'accept-proposed',
            '--plans-dir', plans,
        ]);
        const r = spawnSync('bash', [
            path.join(SCRIPTS_DIR, 'conflicts-scan.sh'),
            'list', '--plans-dir', plans,
        ], { encoding: 'utf8', timeout: SCRIPT_TIMEOUT_MS, killSignal: 'SIGKILL' });
        expect(r.stdout).toMatch(/resolved/);
    });

    test('show on nonexistent CID → exit 2', () => {
        const r = spawnSync('bash', [
            path.join(SCRIPTS_DIR, 'conflicts-scan.sh'),
            'show', 'CONFLICT-99999',
            '--plans-dir', plans,
        ], { encoding: 'utf8', timeout: SCRIPT_TIMEOUT_MS, killSignal: 'SIGKILL' });
        expect(r.status).toBe(2);
    });

    test('resolve with invalid choice → exit 5', () => {
        const r = spawnSync('bash', [
            path.join(SCRIPTS_DIR, 'conflicts-scan.sh'),
            'resolve', 'CONFLICT-00001', 'bogus',
            '--plans-dir', plans,
        ], { encoding: 'utf8', timeout: SCRIPT_TIMEOUT_MS, killSignal: 'SIGKILL' });
        expect(r.status).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// link-run.sh — two-sided run ↔ feature linking (v3.7.3+)
// ---------------------------------------------------------------------------

describe('link-run.sh', () => {
    let root, plans, runsDir, runId;
    beforeEach(() => {
        root = mktmp();
        plans = seedFixture(root);
        // Stand up a fake run alongside the plan tree.
        runsDir = path.join(root, '.claude', 'logs', 'runs');
        runId = 'auth-260512';
        fs.mkdirSync(path.join(runsDir, runId), { recursive: true });
        fs.writeFileSync(
            path.join(runsDir, runId, 'run-state.json'),
            JSON.stringify({ run_id: runId, task: 'oauth', status: 'in_progress' }, null, 2)
        );
    });
    afterEach(() => cleanup(root));

    function runLink(args) {
        const env = { ...process.env, RUNS_DIR: path.join(root, '.claude', 'logs', 'runs') };
        return spawnSync('bash', [
            path.join(SCRIPTS_DIR, 'link-run.sh'),
            ...args,
        ], { cwd: root, encoding: 'utf8', timeout: SCRIPT_TIMEOUT_MS, killSignal: 'SIGKILL', env });
    }

    test('link writes feature_id + feature_slug to run-state.json', () => {
        const r = runLink(['link', runId, 'FEAT-A', '--anchor', 'TASK-00001']);
        expect(r.status).toBe(0);
        const state = JSON.parse(fs.readFileSync(path.join(runsDir, runId, 'run-state.json'), 'utf8'));
        expect(state.feature_id).toBe('FEAT-A');
        expect(state.feature_slug).toMatch(/FEAT-A/);
        expect(state.anchor.task_id).toBe('TASK-00001');
    });

    test('link appends ## Runs row to feature.md', () => {
        runLink(['link', runId, 'FEAT-A']);
        const featFile = path.join(plans, 'features', 'FEAT-A', 'feature.md');
        const content = fs.readFileSync(featFile, 'utf8');
        expect(content).toMatch(/## Runs/);
        expect(content).toMatch(new RegExp(`\\| ${runId} \\|`));
    });

    test('re-linking same run replaces the row (idempotent)', () => {
        runLink(['link', runId, 'FEAT-A', '--status', 'in_progress']);
        runLink(['link', runId, 'FEAT-A', '--status', 'done']);
        const featFile = path.join(plans, 'features', 'FEAT-A', 'feature.md');
        const content = fs.readFileSync(featFile, 'utf8');
        const rows = content.split('\n').filter(l => l.includes(`| ${runId} |`));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatch(/done/);
    });

    test('list outputs the runs table rows', () => {
        runLink(['link', runId, 'FEAT-A']);
        const r = runLink(['list', 'FEAT-A']);
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(new RegExp(`\\| ${runId} \\|`));
    });

    test('link refuses on missing run-state', () => {
        const r = runLink(['link', 'nonexistent-run', 'FEAT-A']);
        expect(r.status).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// expand-node.sh (preparation only — agent dispatch is out-of-band)
// ---------------------------------------------------------------------------

describe('expand-node.sh', () => {
    let root, plans;
    beforeEach(() => { root = mktmp(); plans = seedFixture(root); });
    afterEach(() => cleanup(root));

    test('T1 → T2 prep succeeds for INIT-001', () => {
        const r = runScript('expand-node.sh', ['INIT-001'], plans);
        expect(r.code).toBe(0);
        expect(r.stdout).toMatch(/agent:\s+feature-architect/);
    });

    test('T2 → T3 prep succeeds for FEAT-A', () => {
        const r = runScript('expand-node.sh', ['FEAT-A'], plans);
        expect(r.code).toBe(0);
        expect(r.stdout).toMatch(/agent:\s+story-planner/);
    });

    test('T0 refuses (cannot expand mission directly)', () => {
        const r = runScript('expand-node.sh', ['MISSION'], plans);
        expect(r.code).toBe(3);
    });

    test('appends history.jsonl event=expand', () => {
        runScript('expand-node.sh', ['FEAT-A'], plans);
        const h = fs.readFileSync(path.join(plans, 'history.jsonl'), 'utf8');
        expect(h).toMatch(/"verb":"expand".*"target":"FEAT-A"/);
    });
});

// ---------------------------------------------------------------------------
// _lib.sh helpers — feature_folder + find_feature_path (T2 recursion support)
// ---------------------------------------------------------------------------

function sourceLib(snippet) {
    // Source _lib.sh + run a one-liner snippet. Used to test pure-bash helpers
    // without spawning the surrounding script.
    const result = spawnSync('bash', ['-c', `source "${path.join(SCRIPTS_DIR, '_lib.sh')}"; ${snippet}`], {
        encoding: 'utf8',
        timeout: SCRIPT_TIMEOUT_MS,
        killSignal: 'SIGKILL',
    });
    return { code: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

describe('_lib.sh: feature_folder()', () => {
    test('flat top-level feature: id + intent', () => {
        const r = sourceLib('feature_folder FEAT-A "OAuth Flow"');
        expect(r.code).toBe(0);
        expect(r.stdout.trim()).toBe('FEAT-A_oauth-flow');
    });

    test('JIRA-prefixed ID survives the slugify pass', () => {
        const r = sourceLib('feature_folder JIRA-1234 "Login Redesign"');
        expect(r.code).toBe(0);
        expect(r.stdout.trim()).toBe('JIRA-1234_login-redesign');
    });

    test('empty intent → slug = unnamed', () => {
        const r = sourceLib('feature_folder FEAT-X ""');
        expect(r.code).toBe(0);
        expect(r.stdout.trim()).toBe('FEAT-X_unnamed');
    });

    test('with parent feature → nested subfeatures path', () => {
        const r = sourceLib('feature_folder FEAT-A "Core Combat MVP" FEAT-001 "Core Gameplay"');
        expect(r.code).toBe(0);
        expect(r.stdout.trim()).toBe('FEAT-001_core-gameplay/subfeatures/FEAT-A_core-combat-mvp');
    });

    test('with parent + empty parent intent → unnamed slug', () => {
        const r = sourceLib('feature_folder FEAT-A "Child" FEAT-PARENT ""');
        expect(r.code).toBe(0);
        expect(r.stdout.trim()).toBe('FEAT-PARENT_unnamed/subfeatures/FEAT-A_child');
    });
});

describe('_lib.sh: find_feature_path()', () => {
    let root, plans;

    beforeEach(() => {
        root = mktmp();
        plans = path.join(root, '.claude', 'plans');
        fs.mkdirSync(plans, { recursive: true });
        // Top-level feature
        fs.mkdirSync(path.join(plans, 'features', 'FEAT-A_top-level'), { recursive: true });
        // Nested subfeature: features/FEAT-001_parent/subfeatures/FEAT-B_child/
        fs.mkdirSync(path.join(plans, 'features', 'FEAT-001_parent', 'subfeatures', 'FEAT-B_child'), { recursive: true });
        // Another top-level for collision testing
        fs.mkdirSync(path.join(plans, 'features', 'FEAT-C_another'), { recursive: true });
    });
    afterEach(() => cleanup(root));

    test('finds top-level feature by ID', () => {
        const r = sourceLib(`find_feature_path "${plans}" FEAT-A`);
        expect(r.code).toBe(0);
        expect(r.stdout.trim()).toBe(path.join(plans, 'features', 'FEAT-A_top-level'));
    });

    test('finds nested subfeature by ID', () => {
        const r = sourceLib(`find_feature_path "${plans}" FEAT-B`);
        expect(r.code).toBe(0);
        expect(r.stdout.trim()).toBe(path.join(plans, 'features', 'FEAT-001_parent', 'subfeatures', 'FEAT-B_child'));
    });

    test('finds the parent feature itself', () => {
        const r = sourceLib(`find_feature_path "${plans}" FEAT-001`);
        expect(r.code).toBe(0);
        expect(r.stdout.trim()).toBe(path.join(plans, 'features', 'FEAT-001_parent'));
    });

    test('returns empty + exit 1 on missing feature', () => {
        const r = sourceLib(`find_feature_path "${plans}" FEAT-ZZZ`);
        expect(r.code).toBe(1);
        expect(r.stdout.trim()).toBe('');
    });

    test('returns empty + exit 1 on missing features root', () => {
        const r = sourceLib(`find_feature_path "${plans}/nope" FEAT-A`);
        expect(r.code).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// new-plan.sh INDEX.md template — documents subfeatures + optional T1
// ---------------------------------------------------------------------------

describe('new-plan.sh: INDEX.md template', () => {
    let root, plans;

    beforeEach(() => {
        root = mktmp();
        execFileSync('bash', [path.join(SCRIPTS_DIR, 'new-plan.sh'), root], { stdio: 'ignore' });
        plans = path.join(root, '.claude', 'plans');
    });
    afterEach(() => cleanup(root));

    test('mentions subfeatures/ directory in the ASCII tree', () => {
        const idx = fs.readFileSync(path.join(plans, 'INDEX.md'), 'utf8');
        expect(idx).toMatch(/subfeatures\//);
    });

    test('flags initiative tier as optional', () => {
        const idx = fs.readFileSync(path.join(plans, 'INDEX.md'), 'utf8');
        expect(idx).toMatch(/T1[^|]*OPTIONAL|optional/i);
    });

    test('documents subfeature pattern in Naming convention section', () => {
        const idx = fs.readFileSync(path.join(plans, 'INDEX.md'), 'utf8');
        expect(idx).toMatch(/Subfeatures \(T2 recursion\)/);
        expect(idx).toMatch(/parent:\s*<PARENT_FEAT_ID>/);
    });
});

// ---------------------------------------------------------------------------
// resolve-node.sh — finds features nested under subfeatures/
// ---------------------------------------------------------------------------

describe('resolve-node.sh: nested feature lookup', () => {
    let root, plans;

    beforeEach(() => {
        root = mktmp();
        plans = path.join(root, '.claude', 'plans');
        fs.mkdirSync(plans, { recursive: true });
        // parent feature
        const parentDir = path.join(plans, 'features', 'FEAT-001_parent');
        fs.mkdirSync(parentDir, { recursive: true });
        fs.writeFileSync(path.join(parentDir, 'feature.md'), [
            '---', 'id: FEAT-001', 'tier: 2', 'parent: MISSION',
            'intent: "Parent feature"', 'status: active', 'revision: 0', '---', '',
        ].join('\n'));
        // nested subfeature
        const subDir = path.join(parentDir, 'subfeatures', 'FEAT-B_child');
        fs.mkdirSync(subDir, { recursive: true });
        fs.writeFileSync(path.join(subDir, 'feature.md'), [
            '---', 'id: FEAT-B', 'tier: 2', 'parent: FEAT-001',
            'intent: "Nested child"', 'status: planned', 'revision: 0', '---', '',
        ].join('\n'));
    });
    afterEach(() => cleanup(root));

    test('resolves nested FEAT-B to its actual file path', () => {
        const r = runResolve('FEAT-B', plans);
        expect(r.code).toBe(0);
        // Output is `<id>\t<file>` — split on tab.
        const [id, file] = r.stdout.trim().split('\t');
        expect(id).toBe('FEAT-B');
        expect(file).toBe(path.join(plans, 'features', 'FEAT-001_parent', 'subfeatures', 'FEAT-B_child', 'feature.md'));
    });

    test('resolves parent FEAT-001 to top-level path (not the subfeature)', () => {
        const r = runResolve('FEAT-001', plans);
        expect(r.code).toBe(0);
        const [id, file] = r.stdout.trim().split('\t');
        expect(id).toBe('FEAT-001');
        expect(file).toBe(path.join(plans, 'features', 'FEAT-001_parent', 'feature.md'));
    });
});

// ---------------------------------------------------------------------------
// expand-node.sh: subfeature decomposition — stories live under the
// subfeature's actual folder (NOT at the top-level features/<ID>/stories).
// Regression: pre-fix, the script emitted a literal `features/.../stories/`
// template that confused agents when the parent was nested.
// ---------------------------------------------------------------------------

describe('expand-node.sh: T2 subfeature → T3 stories nest at the right path', () => {
    let root, plans;

    beforeEach(() => {
        root = mktmp();
        plans = path.join(root, '.claude', 'plans');
        fs.mkdirSync(plans, { recursive: true });

        // Minimal scaffolding
        fs.writeFileSync(path.join(plans, '.counters.json'), JSON.stringify({
            schema_version: 1, counters: { FEAT: 1, STORY: 0, TASK: 0, CONFLICT: 0, DEC: 0 },
        }));
        fs.writeFileSync(path.join(plans, 'history.jsonl'), '');
        fs.writeFileSync(path.join(plans, 'active.json'), JSON.stringify({
            schema_version: 1, active: {}, ready_queue: [], blocked: [], frozen: [], context_anchors: {},
        }));

        // Parent feature
        const parentDir = path.join(plans, 'features', 'FEAT-001_parent');
        fs.mkdirSync(parentDir, { recursive: true });
        fs.writeFileSync(path.join(parentDir, 'feature.md'), [
            '---', 'id: FEAT-001', 'tier: 2', 'parent: MISSION',
            'intent: "Parent feature"', 'status: active', 'revision: 0', '---', '',
        ].join('\n'));

        // Nested subfeature — the system-under-test
        const subDir = path.join(parentDir, 'subfeatures', 'FEAT-B_child');
        fs.mkdirSync(subDir, { recursive: true });
        fs.writeFileSync(path.join(subDir, 'feature.md'), [
            '---', 'id: FEAT-B', 'tier: 2', 'parent: FEAT-001',
            'intent: "Nested child"', 'status: planned', 'revision: 0', '---', '',
        ].join('\n'));
    });
    afterEach(() => cleanup(root));

    test('expand FEAT-B prints the concrete subfeature folder, not a `...` placeholder', () => {
        const r = runScript('expand-node.sh', ['FEAT-B'], plans);
        expect(r.code).toBe(0);
        // The script must surface where the child stories will land.
        // Previously: "features/.../stories/${ID}_${slug}/" (literal ellipsis)
        // Now: "features/FEAT-001_parent/subfeatures/FEAT-B_child/stories/..."
        expect(r.stdout).toMatch(/features\/FEAT-001_parent\/subfeatures\/FEAT-B_child\/stories\//);
    });

    test('expand FEAT-B still dispatches story-planner (T2 → T3)', () => {
        const r = runScript('expand-node.sh', ['FEAT-B'], plans);
        expect(r.code).toBe(0);
        expect(r.stdout).toMatch(/agent:\s+story-planner/);
    });

    test('history.jsonl records the expand against the subfeature ID', () => {
        runScript('expand-node.sh', ['FEAT-B'], plans);
        const h = fs.readFileSync(path.join(plans, 'history.jsonl'), 'utf8');
        expect(h).toMatch(/"verb":"expand".*"target":"FEAT-B"/);
    });

    test('expand on top-level FEAT-001 still emits top-level stories path', () => {
        // Regression-guard: don't break the non-nested case.
        const r = runScript('expand-node.sh', ['FEAT-001'], plans);
        expect(r.code).toBe(0);
        expect(r.stdout).toMatch(/features\/FEAT-001_parent\/stories\//);
        expect(r.stdout).not.toMatch(/subfeatures\/.*\/stories\//);
    });
});
