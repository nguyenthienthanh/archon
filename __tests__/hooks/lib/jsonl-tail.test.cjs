/**
 * jsonl-tail — bounded tail reads of append-only JSONL stores.
 *
 * Guards the reason the helper exists: three Stop-registered hooks used to
 * slurp the whole of .claude/plans/history.jsonl on every Stop. The tail read
 * must be exact for small files and must never hand a caller a half-line.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { readJsonlTail, DEFAULT_MAX_BYTES } = require('../../../archon-os/hooks/lib/jsonl-tail.cjs');

describe('jsonl-tail — readJsonlTail', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-')); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

  const write = (name, content) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content);
    return p;
  };
  const evt = (n) => JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', node: `T-${n}`, pad: 'x'.repeat(200) });

  it('returns [] for a missing file', () => {
    expect(readJsonlTail(path.join(dir, 'nope.jsonl'))).toEqual([]);
  });

  it('returns [] for an empty file', () => {
    expect(readJsonlTail(write('empty.jsonl', ''))).toEqual([]);
  });

  it('returns [] for a directory (unreadable target)', () => {
    expect(readJsonlTail(dir)).toEqual([]);
  });

  it('returns every line when the file is smaller than the window', () => {
    const p = write('small.jsonl', ['a', 'b', 'c'].map(s => JSON.stringify({ s })).join('\n') + '\n');
    expect(readJsonlTail(p)).toEqual([
      '{"s":"a"}', '{"s":"b"}', '{"s":"c"}',
    ]);
  });

  it('handles a file with no trailing newline', () => {
    const p = write('nonl.jsonl', '{"s":"a"}\n{"s":"b"}');
    expect(readJsonlTail(p)).toEqual(['{"s":"a"}', '{"s":"b"}']);
  });

  it('drops blank lines', () => {
    const p = write('blank.jsonl', '{"s":"a"}\n\n\n{"s":"b"}\n');
    expect(readJsonlTail(p)).toEqual(['{"s":"a"}', '{"s":"b"}']);
  });

  it('drops the partial first line when the read is truncated', () => {
    const lines = Array.from({ length: 50 }, (_, i) => evt(i));
    const p = write('big.jsonl', lines.join('\n') + '\n');

    // Window deliberately lands mid-record.
    const out = readJsonlTail(p, { maxBytes: 1000 });

    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(lines.length);
    // Every returned line must be a complete, parseable record.
    for (const line of out) expect(() => JSON.parse(line)).not.toThrow();
    // The tail must end at the newest record.
    expect(out[out.length - 1]).toBe(lines[lines.length - 1]);
    // And be a contiguous suffix of the file.
    expect(out).toEqual(lines.slice(lines.length - out.length));
  });

  it('does not drop the first line when the window exactly covers the file', () => {
    const body = '{"s":"a"}\n{"s":"b"}\n';
    const p = write('exact.jsonl', body);
    expect(readJsonlTail(p, { maxBytes: Buffer.byteLength(body) })).toEqual(['{"s":"a"}', '{"s":"b"}']);
  });

  it('never emits replacement chars when the cut lands inside a multi-byte char', () => {
    const lines = Array.from({ length: 40 }, (_, i) => JSON.stringify({ i, s: 'ướ'.repeat(40) }));
    const p = write('utf8.jsonl', lines.join('\n') + '\n');

    for (let win = 300; win < 900; win += 37) {
      const out = readJsonlTail(p, { maxBytes: win });
      for (const line of out) {
        expect(line).not.toContain('�');
        expect(() => JSON.parse(line)).not.toThrow();
      }
    }
  });

  it('caps the result with maxLines, keeping the newest', () => {
    const lines = Array.from({ length: 10 }, (_, i) => JSON.stringify({ i }));
    const p = write('cap.jsonl', lines.join('\n') + '\n');
    expect(readJsonlTail(p, { maxLines: 3 })).toEqual(lines.slice(7));
  });

  it('exposes a default window big enough for real plan histories', () => {
    expect(DEFAULT_MAX_BYTES).toBeGreaterThanOrEqual(256 * 1024);
  });
});
