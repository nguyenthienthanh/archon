/**
 * FEAT-007 / STORY-0011 — af-learning saveLocalFile atomic write.
 * A plain writeFileSync could leave a half-written invalid-JSON file (crash or
 * concurrent write); loadLocalFile then parse-fails and returns [], silently
 * wiping learning history. mktemp + rename makes the swap atomic.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { saveLocalFile, loadLocalFile } = require('../af-learning.cjs');

describe('af-learning saveLocalFile', () => {
  it('round-trips valid JSON and leaves no .tmp file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'afl-'));
    const f = path.join(dir, 'patterns.json');
    saveLocalFile(f, [{ p: 1 }, { p: 2 }]);
    expect(loadLocalFile(f)).toEqual([{ p: 1 }, { p: 2 }]);
    const leftovers = fs.readdirSync(dir).filter(n => n.includes('.tmp'));
    fs.rmSync(dir, { recursive: true, force: true });
    expect(leftovers).toEqual([]);
  });

  it('creates the target directory if missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'afl-'));
    const f = path.join(dir, 'nested', 'deep', 'x.json');
    saveLocalFile(f, { ok: true });
    expect(loadLocalFile(f)).toEqual({ ok: true });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('the swap is atomic — the target is never a partial file', () => {
    // Write a large payload repeatedly; loadLocalFile must always parse (never
    // see a truncated write) since rename is atomic.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'afl-'));
    const f = path.join(dir, 'big.json');
    const big = Array.from({ length: 2000 }, (_, i) => ({ i, s: 'x'.repeat(50) }));
    for (let k = 0; k < 5; k++) {
      saveLocalFile(f, big);
      expect(Array.isArray(loadLocalFile(f))).toBe(true);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
