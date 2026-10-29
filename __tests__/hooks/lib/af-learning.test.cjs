'use strict';
/**
 * Tests for the REAL archon-os/hooks/lib/af-learning.cjs module.
 *
 * History: this suite previously asserted against functions copy-pasted into
 * the test file ("Replicate pure functions from source"), so it passed no
 * matter what the real module did. It now require()s the actual module and
 * drives its local-storage behavior through a temp project root
 * (AF_PROJECT_ROOT is honored by hook-runtime's findProjectRoot, which
 * af-learning uses to compute LEARNING_DIR at require time).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point the module at a temp project root BEFORE requiring it —
// LEARNING_DIR is computed at require time via findProjectRoot().
const TMP_ROOT = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'af-learning-test-'));
process.env.AF_PROJECT_ROOT = TMP_ROOT;

const learning = require('../../../archon-os/hooks/lib/af-learning.cjs');

const LEARNING_DIR = path.join(TMP_ROOT, '.claude', 'learning');
const WORKFLOW_EVENTS_FILE = path.join(LEARNING_DIR, 'workflow-events.json');
const FEEDBACK_FILE = path.join(LEARNING_DIR, 'feedback.json');

function writeLearningFile(file, data) {
  fs.mkdirSync(LEARNING_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

describe('af-learning (real module)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.AF_LEARNING_DISABLED;
    delete process.env.AF_FEEDBACK_COLLECTION;
    delete process.env.AF_METRICS_COLLECTION;
    fs.rmSync(LEARNING_DIR, { recursive: true, force: true });
  });

  afterAll(() => {
    process.env = originalEnv;
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  // =========================================================================
  // Feature flags
  // =========================================================================
  describe('isSupabaseConfigured', () => {
    it('returns false when neither var is set', () => {
      expect(learning.isSupabaseConfigured()).toBe(false);
    });

    it('returns false when only URL is set', () => {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      expect(learning.isSupabaseConfigured()).toBe(false);
    });

    it('returns false when only SECRET_KEY is set', () => {
      process.env.SUPABASE_SECRET_KEY = 'secret';
      expect(learning.isSupabaseConfigured()).toBe(false);
    });

    it('returns true when both are set', () => {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_SECRET_KEY = 'secret';
      expect(learning.isSupabaseConfigured()).toBe(true);
    });
  });

  describe('isLearningEnabled', () => {
    it('returns true by default', () => {
      expect(learning.isLearningEnabled()).toBe(true);
    });

    it('returns false when AF_LEARNING_DISABLED=true', () => {
      process.env.AF_LEARNING_DISABLED = 'true';
      expect(learning.isLearningEnabled()).toBe(false);
    });

    it('returns true when AF_LEARNING_DISABLED is something else', () => {
      process.env.AF_LEARNING_DISABLED = 'false';
      expect(learning.isLearningEnabled()).toBe(true);
    });
  });

  describe('isLocalMode', () => {
    it('returns true when Supabase not configured', () => {
      expect(learning.isLocalMode()).toBe(true);
    });

    it('returns false when Supabase is configured', () => {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_SECRET_KEY = 'secret';
      expect(learning.isLocalMode()).toBe(false);
    });
  });

  describe('isFeedbackEnabled', () => {
    it('returns true by default (learning enabled + feedback not disabled)', () => {
      expect(learning.isFeedbackEnabled()).toBe(true);
    });

    it('returns false when learning is disabled', () => {
      process.env.AF_LEARNING_DISABLED = 'true';
      expect(learning.isFeedbackEnabled()).toBe(false);
    });

    it('returns false when AF_FEEDBACK_COLLECTION=false', () => {
      process.env.AF_FEEDBACK_COLLECTION = 'false';
      expect(learning.isFeedbackEnabled()).toBe(false);
    });
  });

  describe('isMetricsEnabled', () => {
    it('returns true by default', () => {
      expect(learning.isMetricsEnabled()).toBe(true);
    });

    it('returns false when learning disabled', () => {
      process.env.AF_LEARNING_DISABLED = 'true';
      expect(learning.isMetricsEnabled()).toBe(false);
    });

    it('returns false when AF_METRICS_COLLECTION=false', () => {
      process.env.AF_METRICS_COLLECTION = 'false';
      expect(learning.isMetricsEnabled()).toBe(false);
    });
  });

  // =========================================================================
  // Storage paths (exported constants)
  // =========================================================================
  describe('storage paths', () => {
    it('LEARNING_DIR is under <projectRoot>/.claude/learning', () => {
      expect(learning.LEARNING_DIR).toBe(LEARNING_DIR);
    });

    it('workflow events file is workflow-events.json under LEARNING_DIR', () => {
      expect(learning.LOCAL_WORKFLOW_EVENTS_FILE).toBe(WORKFLOW_EVENTS_FILE);
    });
  });

  // =========================================================================
  // loadLocalFile / saveLocalFile
  // =========================================================================
  describe('loadLocalFile', () => {
    it('returns empty array when file does not exist', () => {
      expect(learning.loadLocalFile(path.join(LEARNING_DIR, 'missing.json'))).toEqual([]);
    });

    it('returns parsed JSON when file exists', () => {
      const data = [{ id: 1 }, { id: 2 }];
      writeLearningFile(path.join(LEARNING_DIR, 'data.json'), data);
      expect(learning.loadLocalFile(path.join(LEARNING_DIR, 'data.json'))).toEqual(data);
    });

    it('returns empty array on malformed JSON', () => {
      fs.mkdirSync(LEARNING_DIR, { recursive: true });
      fs.writeFileSync(path.join(LEARNING_DIR, 'bad.json'), 'not json{{{');
      expect(learning.loadLocalFile(path.join(LEARNING_DIR, 'bad.json'))).toEqual([]);
    });

    it('handles object JSON (not just arrays)', () => {
      const obj = { key: 'value', nested: { a: 1 } };
      writeLearningFile(path.join(LEARNING_DIR, 'obj.json'), obj);
      expect(learning.loadLocalFile(path.join(LEARNING_DIR, 'obj.json'))).toEqual(obj);
    });
  });

  describe('saveLocalFile', () => {
    it('writes pretty-printed JSON to the file (atomic tmp+rename)', () => {
      const target = path.join(LEARNING_DIR, 'out.json');
      const data = [{ key: 'value' }];
      learning.saveLocalFile(target, data);
      expect(fs.readFileSync(target, 'utf-8')).toBe(JSON.stringify(data, null, 2));
      // no leftover tmp file from the atomic write
      expect(fs.readdirSync(LEARNING_DIR).filter(f => f.endsWith('.tmp'))).toEqual([]);
    });

    it('creates the parent directory if missing', () => {
      const target = path.join(LEARNING_DIR, 'deep', 'file.json');
      learning.saveLocalFile(target, []);
      expect(fs.existsSync(target)).toBe(true);
    });

    it('round-trips nested objects through loadLocalFile', () => {
      const target = path.join(LEARNING_DIR, 'nested.json');
      const data = { patterns: [{ type: 'a' }], meta: { count: 1 } };
      learning.saveLocalFile(target, data);
      const parsed = learning.loadLocalFile(target);
      expect(parsed.patterns[0].type).toBe('a');
      expect(parsed.meta.count).toBe(1);
    });

    it('handles empty array', () => {
      const target = path.join(LEARNING_DIR, 'empty.json');
      learning.saveLocalFile(target, []);
      expect(learning.loadLocalFile(target)).toEqual([]);
    });
  });

  // =========================================================================
  // getWorkflowEvents
  // =========================================================================
  describe('getWorkflowEvents', () => {
    it('returns empty array when no events stored', () => {
      expect(learning.getWorkflowEvents('wf-1')).toEqual([]);
    });

    it('filters events by workflow_id', () => {
      const events = [
        { workflow_id: 'wf-1', event_type: 'APPROVED', phase: 1 },
        { workflow_id: 'wf-2', event_type: 'REJECTED', phase: 2 },
        { workflow_id: 'wf-1', event_type: 'MODIFIED', phase: 3 },
      ];
      writeLearningFile(WORKFLOW_EVENTS_FILE, events);

      const result = learning.getWorkflowEvents('wf-1');
      expect(result).toHaveLength(2);
      expect(result.every(e => e.workflow_id === 'wf-1')).toBe(true);
    });
  });

  // =========================================================================
  // getWorkflowEventStats
  // =========================================================================
  describe('getWorkflowEventStats', () => {
    const sampleEvents = [
      { workflow_id: 'wf-1', event_type: 'APPROVED', phase: 1 },
      { workflow_id: 'wf-1', event_type: 'REJECTED', phase: 2 },
      { workflow_id: 'wf-1', event_type: 'APPROVED', phase: 3 },
      { workflow_id: 'wf-2', event_type: 'MODIFIED', phase: 1 },
    ];

    beforeEach(() => {
      writeLearningFile(WORKFLOW_EVENTS_FILE, sampleEvents);
    });

    it('returns stats for all events when no workflowId given', () => {
      expect(learning.getWorkflowEventStats().total).toBe(4);
    });

    it('returns stats filtered by workflowId', () => {
      expect(learning.getWorkflowEventStats('wf-1').total).toBe(3);
    });

    it('counts event types correctly', () => {
      const stats = learning.getWorkflowEventStats();
      expect(stats.byType['APPROVED']).toBe(2);
      expect(stats.byType['REJECTED']).toBe(1);
      expect(stats.byType['MODIFIED']).toBe(1);
    });

    it('groups by phase correctly', () => {
      const stats = learning.getWorkflowEventStats('wf-1');
      expect(stats.byPhase['phase_1'].approved).toBe(1);
      expect(stats.byPhase['phase_2'].rejected).toBe(1);
      expect(stats.byPhase['phase_3'].approved).toBe(1);
    });

    it('includes recentEvents (max 10)', () => {
      const stats = learning.getWorkflowEventStats();
      expect(stats.recentEvents.length).toBeLessThanOrEqual(10);
      expect(stats.recentEvents).toEqual(sampleEvents);
    });

    it('returns empty stats when no events file', () => {
      fs.rmSync(WORKFLOW_EVENTS_FILE, { force: true });
      const stats = learning.getWorkflowEventStats();
      expect(stats.total).toBe(0);
      expect(stats.byType).toEqual({});
    });
  });

  // =========================================================================
  // getRecentFeedback
  // =========================================================================
  describe('getRecentFeedback', () => {
    it('returns empty array when no feedback file', () => {
      expect(learning.getRecentFeedback()).toEqual([]);
    });

    it('returns last N feedback entries', () => {
      const feedback = Array.from({ length: 30 }, (_, i) => ({ id: i }));
      writeLearningFile(FEEDBACK_FILE, feedback);

      const result = learning.getRecentFeedback(5);
      expect(result).toHaveLength(5);
      expect(result[0].id).toBe(25);
      expect(result[4].id).toBe(29);
    });

    it('defaults to 20 entries', () => {
      const feedback = Array.from({ length: 30 }, (_, i) => ({ id: i }));
      writeLearningFile(FEEDBACK_FILE, feedback);
      expect(learning.getRecentFeedback()).toHaveLength(20);
    });

    it('returns all entries if fewer than limit', () => {
      writeLearningFile(FEEDBACK_FILE, [{ id: 1 }, { id: 2 }]);
      expect(learning.getRecentFeedback(20)).toHaveLength(2);
    });
  });
});
