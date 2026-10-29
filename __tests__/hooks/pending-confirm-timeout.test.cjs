/**
 * Tests for archon-os/hooks/pending-confirm-timeout.cjs
 *
 * The walk + warning used to run at module scope with process.exit() on require.
 * It was restructured into a main() (FEAT-007 / issue #5) with the decision and
 * formatting logic extracted as pure functions, tested here. collectStale (real
 * filesystem walk) and main (process I/O) are not exported.
 */

const {
  parseFrontmatterField,
  evaluateTaskFile,
  formatWarning,
} = require('../../archon-os/hooks/pending-confirm-timeout.cjs');

const NOW = 1_700_000_000_000;
const HOUR = 3600 * 1000;
const opts = { now: NOW, timeoutMs: 24 * HOUR };

const fm = (fields) => '---\n' + Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\nbody\n';
const iso = (ms) => new Date(NOW - ms).toISOString();

describe('pending-confirm-timeout — parseFrontmatterField', () => {
  it('reads a field value, trimmed', () => {
    expect(parseFrontmatterField('---\nstatus:   planned  \n---', 'status')).toBe('planned');
  });
  it('is null for an absent field', () => {
    expect(parseFrontmatterField('---\ntier: 4\n---', 'status')).toBeNull();
  });
});

describe('pending-confirm-timeout — evaluateTaskFile', () => {
  const stale = fm({ id: 'TASK-1', tier: 4, status: 'planned', updated_at: iso(48 * HOUR) });

  it('surfaces a T4 task idle past the timeout', () => {
    const rec = evaluateTaskFile(stale, 'plans/TASK-1/task.md', opts);
    expect(rec).toMatchObject({ id: 'TASK-1', status: 'planned', age_hours: 48, file: 'plans/TASK-1/task.md' });
  });

  it.each(['planned', 'frozen', 'blocked'])('surfaces status=%s', (status) => {
    const c = fm({ id: 'T', tier: 4, status, updated_at: iso(48 * HOUR) });
    expect(evaluateTaskFile(c, 'p', opts)).not.toBeNull();
  });

  it('skips a task younger than the timeout', () => {
    const c = fm({ id: 'T', tier: 4, status: 'planned', updated_at: iso(1 * HOUR) });
    expect(evaluateTaskFile(c, 'p', opts)).toBeNull();
  });

  it('skips exactly at the timeout boundary (age must EXCEED it)', () => {
    const c = fm({ id: 'T', tier: 4, status: 'planned', updated_at: iso(24 * HOUR) });
    // ageMs === timeoutMs is not < timeoutMs, so it is surfaced; one ms less is skipped.
    expect(evaluateTaskFile(c, 'p', opts)).not.toBeNull();
    const younger = fm({ id: 'T', tier: 4, status: 'planned', updated_at: iso(24 * HOUR - 1) });
    expect(evaluateTaskFile(younger, 'p', opts)).toBeNull();
  });

  it('skips non-T4 tiers', () => {
    const c = fm({ id: 'T', tier: 3, status: 'planned', updated_at: iso(48 * HOUR) });
    expect(evaluateTaskFile(c, 'p', opts)).toBeNull();
  });

  it('skips statuses that are not planned/frozen/blocked', () => {
    const c = fm({ id: 'T', tier: 4, status: 'done', updated_at: iso(48 * HOUR) });
    expect(evaluateTaskFile(c, 'p', opts)).toBeNull();
  });

  it('skips a file with no id', () => {
    const c = fm({ tier: 4, status: 'planned', updated_at: iso(48 * HOUR) });
    expect(evaluateTaskFile(c, 'p', opts)).toBeNull();
  });

  it('skips a missing or unparseable updated_at', () => {
    const noDate = fm({ id: 'T', tier: 4, status: 'planned' });
    expect(evaluateTaskFile(noDate, 'p', opts)).toBeNull();
    const badDate = fm({ id: 'T', tier: 4, status: 'planned', updated_at: 'not-a-date' });
    expect(evaluateTaskFile(badDate, 'p', opts)).toBeNull();
  });

  it('skips content without frontmatter', () => {
    expect(evaluateTaskFile('no frontmatter here', 'p', opts)).toBeNull();
    expect(evaluateTaskFile('', 'p', opts)).toBeNull();
  });
});

describe('pending-confirm-timeout — formatWarning', () => {
  const rec = (id, age) => ({ id, status: 'planned', age_hours: age, file: `${id}.md` });

  it('is null for an empty list', () => {
    expect(formatWarning([], { timeoutHours: 24, maxShown: 5 })).toBeNull();
  });

  it('renders a header with the count and threshold', () => {
    const out = formatWarning([rec('A', 48)], { timeoutHours: 24, maxShown: 5 });
    expect(out).toContain('1 T4 task(s) idle > 24h');
    expect(out).toContain('A [planned] 48h old (A.md)');
  });

  it('sorts oldest first', () => {
    const out = formatWarning([rec('A', 30), rec('B', 90)], { timeoutHours: 24, maxShown: 5 });
    expect(out.indexOf('B ')).toBeLessThan(out.indexOf('A '));
  });

  it('caps at maxShown and appends a "+N more" tail', () => {
    const many = Array.from({ length: 8 }, (_, i) => rec(`T${i}`, 100 - i));
    const out = formatWarning(many, { timeoutHours: 24, maxShown: 5 });
    expect(out).toContain('+3 more stale T4 task(s)');
    expect(out.match(/\[planned\]/g)).toHaveLength(5); // only 5 detail rows
  });

  it('does not mutate the caller\'s array', () => {
    const input = [rec('A', 30), rec('B', 90)];
    formatWarning(input, { timeoutHours: 24, maxShown: 5 });
    expect(input.map((r) => r.id)).toEqual(['A', 'B']);
  });
});
