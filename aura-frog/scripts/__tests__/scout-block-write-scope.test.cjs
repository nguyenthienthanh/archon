/**
 * FEAT-D/5 — scout-block must not apply `.afignore` to writes.
 *
 * `.afignore` is a token-economy list. Its own header says the directories in it
 * are "blocked from scanning to save tokens" — it is not a safety boundary.
 * scout-block was applying it to Write/Edit as well, which made the plugin
 * contradict itself: this repo's .afignore lists `__tests__`, and the plugin's
 * own rules make Phase 2 Test RED mandatory, so creating the required failing
 * test was blocked by the plugin that required it.
 *
 * The safety boundary is DEFAULT_BLOCKED (node_modules, dist, .git, …). That
 * must keep blocking writes. Both ends are asserted here: a gate tested only in
 * the permissive direction is how a gate stops gating.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(process.cwd(), 'aura-frog', 'hooks', 'scout-block.cjs');

let root;
beforeAll(() => {
  // scout-block reads .afignore from process.cwd(), so the fixture needs its
  // own project root rather than relying on this repo's layout.
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sbw-'));
  fs.writeFileSync(path.join(root, '.afignore'), ['__tests__', 'coverage', ''].join('\n'));
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

/** @returns {'BLOCKED'|'allowed'} */
function run(toolName, key, value) {
  const r = spawnSync('node', [HOOK], {
    cwd: root,
    encoding: 'utf8',
    input: JSON.stringify({ tool_name: toolName, tool_input: { [key]: value } }),
  });
  return r.status === 2 ? 'BLOCKED' : 'allowed';
}

describe('.afignore patterns scope to scanning, not writing', () => {
  it.each([
    ['Read', 'file_path', 'scripts/__tests__/x.test.cjs'],
    ['Glob', 'pattern', 'scripts/__tests__/**'],
    ['Grep', 'pattern', 'coverage/**'],
  ])('%s on an .afignore path is still blocked', (tool, key, value) => {
    expect(run(tool, key, value)).toBe('BLOCKED');
  });

  it.each([
    ['Write', 'scripts/__tests__/x.test.cjs'],
    ['Edit', 'scripts/__tests__/x.test.cjs'],
    ['MultiEdit', 'scripts/__tests__/x.test.cjs'],
  ])('%s to an .afignore path is allowed', (tool, value) => {
    expect(run(tool, 'file_path', value)).toBe('allowed');
  });
});

describe('DEFAULT_BLOCKED remains a write boundary', () => {
  it.each([
    ['node_modules/pkg/index.js'],
    ['dist/bundle.js'],
    ['.git/config'],
    ['vendor/lib.php'],
  ])('Write to %s is blocked', (value) => {
    expect(run('Write', 'file_path', value)).toBe('BLOCKED');
  });

  it.each([
    ['node_modules/pkg/index.js'],
    ['dist/bundle.js'],
  ])('Read of %s is blocked', (value) => {
    expect(run('Read', 'file_path', value)).toBe('BLOCKED');
  });
});

describe('ordinary source paths are untouched in both directions', () => {
  it.each([
    ['Write', 'aura-frog/scripts/plans/_lib.sh'],
    ['Read', 'aura-frog/scripts/plans/_lib.sh'],
    ['Write', 'src/index.ts'],
  ])('%s %s is allowed', (tool, value) => {
    expect(run(tool, 'file_path', value)).toBe('allowed');
  });
});
