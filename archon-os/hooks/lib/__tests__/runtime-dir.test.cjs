'use strict';

/**
 * runtime-dir.cjs — where per-project runtime state lives after the v4 rename.
 *
 * The case worth pinning: a project upgraded mid-run. The model stack is pushed
 * when a Task dispatches and popped when the subagent returns, so if the push
 * landed in .aura-frog/ and the pop resolves to .archon/, the stack never drains
 * and the statusline keeps reporting a model that stopped executing.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { runtimePath, RUNTIME_DIR, LEGACY_RUNTIME_DIR } = require('../runtime-dir.cjs');

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'archon-runtime-dir-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function seed(dir, ...rel) {
  const file = path.join(root, dir, ...rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{}\n');
  return file;
}

describe('runtimePath', () => {
  it('resolves to .archon/ for a project with no runtime state yet', () => {
    expect(runtimePath(root, 'runtime', 'model-stack.jsonl'))
      .toBe(path.join(root, '.archon', 'runtime', 'model-stack.jsonl'));
  });

  it('resolves to .archon/ when that is where the state already is', () => {
    const file = seed(RUNTIME_DIR, 'runtime', 'model-stack.jsonl');
    expect(runtimePath(root, 'runtime', 'model-stack.jsonl')).toBe(file);
  });

  it('resolves to the legacy dir while it is the one holding state', () => {
    const file = seed(LEGACY_RUNTIME_DIR, 'runtime', 'model-stack.jsonl');
    expect(runtimePath(root, 'runtime', 'model-stack.jsonl')).toBe(file);
  });

  it('prefers .archon/ when both exist, so a migrated project moves on', () => {
    const canonical = seed(RUNTIME_DIR, 'runtime', 'model-stack.jsonl');
    seed(LEGACY_RUNTIME_DIR, 'runtime', 'model-stack.jsonl');
    expect(runtimePath(root, 'runtime', 'model-stack.jsonl')).toBe(canonical);
  });

  it('is per-file, not per-directory: a legacy sibling does not drag others along', () => {
    seed(LEGACY_RUNTIME_DIR, 'runtime', 'model-stack.jsonl');
    expect(runtimePath(root, 'runtime', 'other.jsonl'))
      .toBe(path.join(root, '.archon', 'runtime', 'other.jsonl'));
  });

  it('accepts a bare runtime dir with no sub-path', () => {
    expect(runtimePath(root)).toBe(path.join(root, '.archon'));
  });
});
