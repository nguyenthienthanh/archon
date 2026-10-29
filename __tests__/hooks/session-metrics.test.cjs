/**
 * Tests for archon-os/hooks/session-metrics.cjs
 *
 * sendWorkflowMetrics / sendAgentMetrics are not exported — they post metrics.
 */

const { findActiveWorkflow, extractPatterns } = require('../../archon-os/hooks/session-metrics.cjs');

describe('session-metrics — extractPatterns', () => {
  // Pure: builds a pattern list from (state, metrics).
  it('is empty when nothing notable happened', () => {
    expect(extractPatterns({}, { success: false })).toEqual([]);
  });

  describe('workflow success', () => {
    const state = { workflowType: 'feature', framework: 'nextjs', codeCoverage: 91, testPassRate: 100 };
    const metrics = { success: true, workflowId: 'W-1' };

    it('emits one success pattern', () => {
      const p = extractPatterns(state, metrics);
      expect(p).toHaveLength(1);
      expect(p[0].type).toBe('success');
      expect(p[0].category).toBe('workflow');
    });

    it('describes the workflow type and framework', () => {
      const [p] = extractPatterns(state, metrics);
      expect(p.description).toContain('feature');
      expect(p.description).toContain('nextjs');
    });

    it('falls back when type/framework are unknown', () => {
      const [p] = extractPatterns({}, metrics);
      expect(p.description).toContain('full');
      expect(p.description).toContain('unknown');
    });

    it('carries coverage and pass rate as evidence', () => {
      const [p] = extractPatterns(state, metrics);
      expect(p.evidence[0]).toMatchObject({ workflowId: 'W-1', coverage: 91, testPassRate: 100 });
    });
  });

  describe('auto-stop', () => {
    it('emits a failure pattern naming the phase and reason', () => {
      const p = extractPatterns(
        { autoStopPhase: 'phase-3', autoStopReason: 'tests failing' },
        { success: false, workflowId: 'W-2' },
      );
      expect(p).toHaveLength(1);
      expect(p[0].type).toBe('failure');
      expect(p[0].description).toContain('phase-3');
      expect(p[0].description).toContain('tests failing');
    });
  });

  describe('token usage', () => {
    const metrics = (tokensByPhase) => ({ success: false, workflowId: 'W-3', tokensByPhase });

    it('flags a phase over the 50k threshold', () => {
      const p = extractPatterns({}, metrics({ 'phase-1': 60000 }));
      expect(p).toHaveLength(1);
      expect(p[0].type).toBe('optimization');
      expect(p[0].description).toContain('phase-1');
      expect(p[0].evidence[0].tokens).toBe(60000);
    });

    it('ignores a phase at or under the threshold', () => {
      expect(extractPatterns({}, metrics({ 'phase-1': 50000 }))).toEqual([]);
      expect(extractPatterns({}, metrics({ 'phase-1': 10 }))).toEqual([]);
    });

    it('flags each heavy phase separately', () => {
      const p = extractPatterns({}, metrics({ a: 60000, b: 70000, c: 10 }));
      expect(p).toHaveLength(2);
    });

    it('tolerates a missing tokensByPhase', () => {
      expect(() => extractPatterns({}, { success: false, workflowId: 'W' })).not.toThrow();
    });
  });

  it('combines every signal in one pass', () => {
    const p = extractPatterns(
      { autoStopPhase: 'phase-2', autoStopReason: 'x' },
      { success: true, workflowId: 'W-4', tokensByPhase: { 'phase-1': 99999 } },
    );
    expect(p.map((x) => x.type).sort()).toEqual(['failure', 'optimization', 'success']);
  });
});

describe('session-metrics — findActiveWorkflow', () => {
  // Read-only scan of the workflow/run dirs; assert safe degradation only.
  it('returns without throwing', () => {
    expect(() => findActiveWorkflow()).not.toThrow();
  });
});
