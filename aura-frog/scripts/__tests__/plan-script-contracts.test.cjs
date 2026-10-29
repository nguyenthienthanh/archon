/**
 * FEAT-D — plan-infrastructure correctness.
 *
 * Four defects found 2026-10-29 while bootstrapping this repo's own T0-T2 tree.
 * Every one of them failed in the same direction: a gate reporting success where
 * it should have reported failure. That direction is the expensive one — a loud
 * wrong answer gets fixed, a silent green one does not.
 *
 *   1. get_field() stripped only the OPENING quote of a quoted frontmatter
 *      scalar. awk's sub() replaces the first match only, so
 *      `sub(/^["']|["']$/, "")` left the closing quote attached. The same awk
 *      program existed in FOUR copies (_lib.sh plus local redefinitions in
 *      validate-plan-tree.sh, render-plan-tree.sh and resolve-node.sh, each of
 *      which already sourced _lib.sh and then shadowed it).
 *
 *   2. validate-plan-tree.sh exited 0 ("Empty plan tree — nothing to validate")
 *      for a directory with no node files. Every plan mutation gates on this
 *      script, so one mis-specified path turned all 8 invariants into a no-op
 *      that reported green.
 *
 *   3. plans_dir() accepted a positional path but resolved it literally, while
 *      the sibling new-plan.sh documents its positional as a PROJECT ROOT.
 *      Passing a project root scanned the whole repo (670 markdown files, 42
 *      bogus violations) or an empty path (defect 2). It now accepts either.
 *
 *   4. INVARIANT 7 collected depends_on edges only from tier==4 nodes, so a
 *      dependency cycle between two T2 features validated clean.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PLANS = path.join(process.cwd(), 'aura-frog', 'scripts', 'plans');
const LIB = path.join(PLANS, '_lib.sh');
const VALIDATE = path.join(PLANS, 'validate-plan-tree.sh');
const RENDER = path.join(PLANS, 'render-plan-tree.sh');

const made = [];
function tmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(d);
  return d;
}
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

function node(file, frontmatter) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fm = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
  fs.writeFileSync(file, ['---', ...fm, '---', '', ''].join('\n'));
}

function mission(dir, children = '[]') {
  node(path.join(dir, 'mission', 'mission.md'),
    { id: 'MISSION', tier: 0, status: 'active', intent: '"m"', children });
}

function feature(dir, id, depends) {
  node(path.join(dir, 'features', `${id}_x`, 'feature.md'), {
    id, tier: 2, parent: 'MISSION', status: 'planned',
    intent: `"${id}"`, children: '[]', depends_on: `[${depends}]`,
  });
}

function sh(script, args) {
  return spawnSync('bash', [script, ...args], { encoding: 'utf8' });
}

function getField(file, field) {
  const r = spawnSync('bash', ['-c',
    `source ${JSON.stringify(LIB)} >/dev/null 2>&1; get_field ${JSON.stringify(file)} ${field}`,
  ], { encoding: 'utf8' });
  return r.stdout.trim();
}

// ---------------------------------------------------------------------------
describe('get_field strips BOTH surrounding quotes (FEAT-D/1)', () => {
  it.each([
    ['double-quoted', '"Archon OS — a planning-first OS"', 'Archon OS — a planning-first OS'],
    ['single-quoted', "'single quoted intent'", 'single quoted intent'],
    ['unquoted is untouched', 'bare intent text', 'bare intent text'],
  ])('%s', (_label, raw, expected) => {
    const f = path.join(tmp('gf-'), 'n.md');
    node(f, { id: 'FEAT-X', tier: 2, intent: raw });
    expect(getField(f, 'intent')).toBe(expected);
  });

  it('render-plan-tree emits no dangling quote', () => {
    const dir = tmp('gfr-');
    node(path.join(dir, 'mission', 'mission.md'),
      { id: 'MISSION', tier: 0, status: 'active', intent: '"quoted mission intent"', children: '[]' });
    const out = sh(RENDER, [dir]).stdout;
    expect(out).toContain('quoted mission intent');
    expect(out).not.toMatch(/quoted mission intent"/);
  });

  it('is defined exactly once across the plans scripts', () => {
    const defs = fs.readdirSync(PLANS)
      .filter((f) => f.endsWith('.sh'))
      .filter((f) => /^get_field\(\) \{/m.test(fs.readFileSync(path.join(PLANS, f), 'utf8')));
    // A second definition in a script that already sources _lib.sh silently
    // shadows the fixed one — which is how defect 1 survived three fixes.
    expect(defs).toEqual(['_lib.sh']);
  });
});

// ---------------------------------------------------------------------------
describe('validate-plan-tree refuses a path with no nodes (FEAT-D/2)', () => {
  it('a directory containing zero node files exits non-zero', () => {
    expect(sh(VALIDATE, [tmp('vz-')]).status).not.toBe(0);
  });

  it('a path that does not exist exits non-zero', () => {
    expect(sh(VALIDATE, [path.join(os.tmpdir(), 'archon-no-such-plans-dir')]).status).not.toBe(0);
  });

  it('a real single-node tree still passes (negative control)', () => {
    const dir = tmp('vp-');
    mission(dir);
    expect(sh(VALIDATE, [dir]).status).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('plans_dir accepts a plans dir OR a project root (FEAT-D/3)', () => {
  it('both shapes resolve to the same tree', () => {
    const root = tmp('pr-');
    const plansDir = path.join(root, '.claude', 'plans');
    fs.mkdirSync(plansDir, { recursive: true });
    mission(plansDir);
    expect(sh(VALIDATE, [plansDir]).status).toBe(0);
    expect(sh(VALIDATE, [root]).status).toBe(0);
  });

  it('a project root with no plan tree is still rejected, not silently accepted', () => {
    expect(sh(VALIDATE, [tmp('pr-empty-')]).status).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('INVARIANT 7 detects depends_on cycles above tier 4 (FEAT-D/4)', () => {
  it('a T2 feature cycle FEAT-P ⇄ FEAT-Q is reported', () => {
    const dir = tmp('v7-');
    mission(dir, '[FEAT-P, FEAT-Q]');
    feature(dir, 'FEAT-P', 'FEAT-Q');
    feature(dir, 'FEAT-Q', 'FEAT-P');
    const r = sh(VALIDATE, [dir]);
    expect(`${r.stdout}${r.stderr}`).toMatch(/INVARIANT 7/);
    expect(r.status).not.toBe(0);
  });

  it('a longer T2 cycle P → Q → R → P is reported', () => {
    const dir = tmp('v7l-');
    mission(dir, '[FEAT-P, FEAT-Q, FEAT-R]');
    feature(dir, 'FEAT-P', 'FEAT-Q');
    feature(dir, 'FEAT-Q', 'FEAT-R');
    feature(dir, 'FEAT-R', 'FEAT-P');
    expect(`${sh(VALIDATE, [dir]).stdout}`).toMatch(/INVARIANT 7/);
  });

  it('an acyclic T2 depends_on edge still passes (negative control)', () => {
    const dir = tmp('v7ok-');
    mission(dir, '[FEAT-P, FEAT-Q]');
    feature(dir, 'FEAT-P', 'FEAT-Q');
    feature(dir, 'FEAT-Q', '');
    const r = sh(VALIDATE, [dir]);
    expect(`${r.stdout}${r.stderr}`).not.toMatch(/INVARIANT 7/);
  });
});
