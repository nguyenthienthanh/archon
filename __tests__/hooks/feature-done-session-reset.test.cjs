/**
 * Tests for the pure history-scan logic of two trigger hooks made importable by
 * FEAT-007 / issue #5: feature-done-trigger-archive and session-reset-trigger.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { shouldTriggerArchive, readFeatureStatus } =
  require('../../archon-os/hooks/feature-done-trigger-archive.cjs');
const { findPromptableSummarize } = require('../../archon-os/hooks/session-reset-trigger.cjs');

const jl = (events) => events.map((e) => JSON.stringify(e));

describe('feature-done-trigger-archive — shouldTriggerArchive', () => {
  // Detection is frontmatter-status driven: nothing in the engine writes
  // status_transition events, so history is consulted only for the fired-once
  // (feature_done_detected) and already-summarized (epic_summarized) guards.

  it('triggers when the feature status is done and history has no prior guard event', () => {
    const h = jl([{ ts: 't', verb: 'next', target: 'TASK-00001' }]);
    expect(shouldTriggerArchive(h, 'FEAT-A', 'done')).toBe(true);
  });

  it('does not trigger when the feature status is not done', () => {
    expect(shouldTriggerArchive([], 'FEAT-A', 'active')).toBe(false);
    expect(shouldTriggerArchive([], 'FEAT-A', null)).toBe(false);
  });

  it('fires once — a prior feature_done_detected suppresses re-firing on later Edit/Write', () => {
    const h = jl([{ node: 'FEAT-A', event: 'feature_done_detected' }]);
    expect(shouldTriggerArchive(h, 'FEAT-A', 'done')).toBe(false);
  });

  it('does not trigger when the feature was already epic-summarized', () => {
    const h = jl([{ node: 'FEAT-A', event: 'epic_summarized' }]);
    expect(shouldTriggerArchive(h, 'FEAT-A', 'done')).toBe(false);
  });

  it('ignores guard events for other features', () => {
    const h = jl([
      { node: 'FEAT-B', event: 'feature_done_detected' },
      { node: 'FEAT-B', event: 'epic_summarized' },
    ]);
    expect(shouldTriggerArchive(h, 'FEAT-A', 'done')).toBe(true);
  });

  it('legacy status_transition events (which nothing writes) no longer gate the trigger', () => {
    const h = jl([{ node: 'FEAT-A', event: 'status_transition', to: 'done' }]);
    expect(shouldTriggerArchive(h, 'FEAT-A', 'active')).toBe(false);
    expect(shouldTriggerArchive(h, 'FEAT-A', 'done')).toBe(true);
  });

  it('skips malformed lines without throwing', () => {
    const h = ['{bad json', JSON.stringify({ node: 'FEAT-A', event: 'feature_done_detected' })];
    expect(shouldTriggerArchive(h, 'FEAT-A', 'done')).toBe(false);
  });

  it('triggers on empty history when status is done', () => {
    expect(shouldTriggerArchive([], 'FEAT-A', 'done')).toBe(true);
  });
});

describe('feature-done-trigger-archive — readFeatureStatus', () => {
  let plansDir;

  beforeEach(() => {
    plansDir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-feature-status-'));
  });
  afterEach(() => {
    fs.rmSync(plansDir, { recursive: true, force: true });
  });

  const writeFeature = (rel, id, status) => {
    const dir = path.join(plansDir, rel);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'feature.md'),
      `---\nid: ${id}\ntier: 2\nstatus: ${status}\n---\n\n# ${id}\n`,
    );
  };

  it('reads the frontmatter status of a top-level feature', () => {
    writeFeature('features/FEAT-A_auth', 'FEAT-A', 'done');
    expect(readFeatureStatus(plansDir, 'FEAT-A')).toBe('done');
  });

  it('finds a nested subfeature', () => {
    writeFeature('features/FEAT-A_auth', 'FEAT-A', 'active');
    writeFeature('features/FEAT-A_auth/subfeatures/FEAT-B_mfa', 'FEAT-B', 'done');
    expect(readFeatureStatus(plansDir, 'FEAT-B')).toBe('done');
  });

  it('returns null when the feature does not exist or features/ is missing', () => {
    expect(readFeatureStatus(plansDir, 'FEAT-X')).toBeNull();
    writeFeature('features/FEAT-A_auth', 'FEAT-A', 'done');
    expect(readFeatureStatus(plansDir, 'FEAT-X')).toBeNull();
  });
});

describe('session-reset-trigger — findPromptableSummarize', () => {
  const NOW = 1_700_000_000_000;
  const WINDOW = 60 * 1000;
  const at = (msAgo) => new Date(NOW - msAgo).toISOString();

  it('returns a recent epic_summarized event', () => {
    const h = jl([{ event: 'epic_summarized', feature: 'FEAT-A', ts: at(1000) }]);
    expect(findPromptableSummarize(h, NOW, WINDOW)).toMatchObject({ feature: 'FEAT-A' });
  });

  it('is null when the summarize is older than the window', () => {
    const h = jl([{ event: 'epic_summarized', feature: 'FEAT-A', ts: at(WINDOW + 1) }]);
    expect(findPromptableSummarize(h, NOW, WINDOW)).toBeNull();
  });

  it('is null when a session_reset came after the summarize (seen first, newest-first)', () => {
    const h = jl([
      { event: 'epic_summarized', feature: 'FEAT-A', ts: at(2000) },
      { event: 'session_reset' },
    ]);
    expect(findPromptableSummarize(h, NOW, WINDOW)).toBeNull();
  });

  it('is null when there is no summarize at all', () => {
    expect(findPromptableSummarize(jl([{ event: 'status_transition', to: 'done' }]), NOW, WINDOW))
      .toBeNull();
  });

  it('is null on an unparseable summarize timestamp', () => {
    const h = jl([{ event: 'epic_summarized', feature: 'FEAT-A', ts: 'not-a-date' }]);
    expect(findPromptableSummarize(h, NOW, WINDOW)).toBeNull();
  });

  it('skips malformed lines without throwing', () => {
    const h = ['{bad', JSON.stringify({ event: 'epic_summarized', feature: 'FEAT-A', ts: at(1000) })];
    expect(findPromptableSummarize(h, NOW, WINDOW)).toMatchObject({ feature: 'FEAT-A' });
  });
});
