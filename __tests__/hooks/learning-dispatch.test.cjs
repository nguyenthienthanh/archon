/**
 * FEAT-010 / STORY-0025 — learning-hook consolidation.
 *
 * learning-dispatch.cjs reads stdin once and fans the parsed payload out to
 * each learning module in-process (one node spawn instead of one-per-hook).
 * These tests pin the dispatcher's contract:
 *   - every runner receives the SAME raw input object
 *   - a runner that throws does NOT stop the next runner (isolation)
 *   - the default runner set is [feedback-capture, smart-learn]
 */

const { dispatch, defaultRunners } = require('../../archon-os/hooks/learning-dispatch.cjs');

describe('learning-dispatch.dispatch', () => {
  it('invokes every runner with the same raw input', async () => {
    const seen = [];
    const input = { tool_name: 'Write', tool_input: { file_path: '/x.js' }, source: 'assistant' };
    const runners = [
      { name: 'a', run: (i) => { seen.push(['a', i]); } },
      { name: 'b', run: (i) => { seen.push(['b', i]); } },
    ];
    const failed = await dispatch(input, runners);
    expect(failed).toEqual([]);
    expect(seen.map((s) => s[0])).toEqual(['a', 'b']);
    // Same object reference handed to both — no whitelist/copy that would drop source.
    expect(seen[0][1]).toBe(input);
    expect(seen[1][1]).toBe(input);
    expect(seen[0][1].source).toBe('assistant');
  });

  it('isolates a throwing runner — later runners still run', async () => {
    const order = [];
    const runners = [
      { name: 'boom', run: () => { order.push('boom'); throw new Error('kaboom'); } },
      { name: 'ok', run: () => { order.push('ok'); } },
    ];
    const failed = await dispatch({}, runners);
    expect(order).toEqual(['boom', 'ok']); // second ran despite first throwing
    expect(failed).toEqual(['boom']);
  });

  it('awaits async runners and collects async rejections', async () => {
    const order = [];
    const runners = [
      { name: 'slow-fail', run: async () => { await Promise.resolve(); order.push('slow-fail'); throw new Error('async'); } },
      { name: 'slow-ok', run: async () => { await Promise.resolve(); order.push('slow-ok'); } },
    ];
    const failed = await dispatch({}, runners);
    expect(order).toEqual(['slow-fail', 'slow-ok']);
    expect(failed).toEqual(['slow-fail']);
  });

  it('never throws on a malformed runner entry', async () => {
    const failed = await dispatch({}, [{ name: 'bad' /* no run fn */ }]);
    expect(failed).toEqual(['bad']);
  });

  it('default runner set is feedback-capture then smart-learn', () => {
    expect(defaultRunners().map((r) => r.name)).toEqual(['feedback-capture', 'smart-learn']);
  });

  it('default runners resolve to callable module.run functions', () => {
    // require() resolves lazily inside each thunk; assert the modules expose run().
    expect(typeof require('../../archon-os/hooks/feedback-capture.cjs').run).toBe('function');
    expect(typeof require('../../archon-os/hooks/smart-learn.cjs').run).toBe('function');
  });
});
