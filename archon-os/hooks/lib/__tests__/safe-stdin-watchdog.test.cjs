/**
 * FEAT-007 / STORY-0012 (GH#21) — watchdog message is NDJSON via fs.writeSync(2).
 * The old plain-text process.stderr.write could interleave bytes with another
 * emitter mid-record and corrupt an NDJSON line, and broke the v3.8 invariant
 * that this library's stderr is always NDJSON.
 */

const { watchdogRecord } = require('../safe-stdin.cjs');

describe('safe-stdin watchdogRecord', () => {
  it('is a single valid NDJSON line', () => {
    const line = watchdogRecord(250);
    expect(line.endsWith('\n')).toBe(true);
    expect(line.indexOf('\n')).toBe(line.length - 1); // exactly one trailing newline
    const rec = JSON.parse(line.trim());
    expect(rec).toMatchObject({ scope: 'safe-stdin.watchdog', level: 'warn', msg: 'watchdog_tripped', meta: { ms: 250 } });
    expect(typeof rec.ts).toBe('string');
  });

  it('carries the timeout in meta.ms', () => {
    expect(JSON.parse(watchdogRecord(1000).trim()).meta.ms).toBe(1000);
  });
});
