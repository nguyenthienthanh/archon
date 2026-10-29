-- Aura Frog Learning System - Supabase Schema
-- Version: 1.18.0
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ============================================================================
-- TABLES
-- ============================================================================

-- Feedback from user corrections, approvals, and ratings
CREATE TABLE IF NOT EXISTS af_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  workflow_id TEXT,
  project_name TEXT,
  phase TEXT,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('correction', 'approval', 'rejection', 'rating', 'agent_switch')),
  original_response TEXT,
  corrected_response TEXT,
  reason TEXT,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow execution metrics
CREATE TABLE IF NOT EXISTS af_workflow_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id TEXT UNIQUE NOT NULL,
  project_name TEXT,
  project_type TEXT,
  framework TEXT,
  workflow_type TEXT, -- 'full', 'fasttrack', 'bugfix'
  total_phases INT DEFAULT 5,
  completed_phases INT DEFAULT 0,
  success BOOLEAN,
  failure_reason TEXT,
  auto_stop_phase TEXT,
  auto_stop_reason TEXT,
  total_tokens INT DEFAULT 0,
  tokens_by_phase JSONB DEFAULT '{}', -- {"phase_1": 1500, "phase_2": 2000, ...}
  duration_seconds INT,
  duration_by_phase JSONB DEFAULT '{}', -- {"phase_1": 120, "phase_2": 300, ...}
  test_pass_rate FLOAT,
  code_coverage FLOAT,
  retries INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Agent performance tracking
CREATE TABLE IF NOT EXISTS af_agent_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  workflow_id TEXT,
  agent_name TEXT NOT NULL,
  task_type TEXT,
  task_description TEXT,
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 100),
  detection_method TEXT, -- 'keyword', 'context', 'explicit', 'fallback'
  success BOOLEAN,
  user_override BOOLEAN DEFAULT FALSE, -- Did user switch agents?
  override_to_agent TEXT, -- Which agent did user switch to?
  duration_ms INT,
  tokens_used INT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow events (approve/reject/modify/cancel tracking)
CREATE TABLE IF NOT EXISTS af_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('APPROVED', 'REJECTED', 'MODIFIED', 'CANCELLED', 'PHASE_START', 'WORKFLOW_COMPLETE')),
  phase INT NOT NULL CHECK (phase >= 1 AND phase <= 9),
  reason TEXT,
  attempt_count INT DEFAULT 1,
  project_name TEXT,
  session_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learned patterns (AI-generated insights)
CREATE TABLE IF NOT EXISTS af_learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('success', 'failure', 'optimization', 'anti_pattern', 'best_practice')),
  category TEXT, -- 'agent', 'workflow', 'phase', 'command', 'rule'
  description TEXT NOT NULL,
  evidence JSONB DEFAULT '[]', -- Array of supporting data points
  frequency INT DEFAULT 1,
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  suggested_action TEXT,
  suggested_rule TEXT, -- If pattern should become a rule
  applied BOOLEAN DEFAULT FALSE,
  applied_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ, -- Optional expiration for temporary patterns
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge base for persistent learnings
CREATE TABLE IF NOT EXISTS af_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_type TEXT NOT NULL CHECK (knowledge_type IN ('rule', 'example', 'warning', 'tip', 'workaround')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  context TEXT, -- When this knowledge applies
  source_pattern_id UUID REFERENCES af_learned_patterns(id),
  tags TEXT[] DEFAULT '{}',
  priority INT DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  active BOOLEAN DEFAULT TRUE,
  usage_count INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_feedback_workflow ON af_feedback(workflow_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON af_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON af_feedback(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_workflow ON af_workflow_metrics(workflow_id);
CREATE INDEX IF NOT EXISTS idx_metrics_project ON af_workflow_metrics(project_name);
CREATE INDEX IF NOT EXISTS idx_metrics_success ON af_workflow_metrics(success);
CREATE INDEX IF NOT EXISTS idx_metrics_started ON af_workflow_metrics(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_name ON af_agent_performance(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_task ON af_agent_performance(task_type);
CREATE INDEX IF NOT EXISTS idx_agent_success ON af_agent_performance(success);
CREATE INDEX IF NOT EXISTS idx_agent_created ON af_agent_performance(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_events_workflow ON af_workflow_events(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_type ON af_workflow_events(event_type);
CREATE INDEX IF NOT EXISTS idx_workflow_events_phase ON af_workflow_events(phase);
CREATE INDEX IF NOT EXISTS idx_workflow_events_created ON af_workflow_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pattern_type ON af_learned_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_pattern_active ON af_learned_patterns(active);
CREATE INDEX IF NOT EXISTS idx_pattern_confidence ON af_learned_patterns(confidence DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_type ON af_knowledge_base(knowledge_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_tags ON af_knowledge_base USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_active ON af_knowledge_base(active);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Agent success rates by task type
CREATE OR REPLACE VIEW v_agent_success_rates AS
SELECT
  agent_name,
  task_type,
  COUNT(*) as total_tasks,
  COUNT(*) FILTER (WHERE success = TRUE) as successful_tasks,
  ROUND((100.0 * COUNT(*) FILTER (WHERE success = TRUE) / NULLIF(COUNT(*), 0))::numeric, 2) as success_rate,
  ROUND(AVG(confidence_score)::numeric, 2) as avg_confidence,
  COUNT(*) FILTER (WHERE user_override = TRUE) as user_overrides,
  ROUND(AVG(duration_ms)::numeric, 0) as avg_duration_ms,
  ROUND(AVG(tokens_used)::numeric, 0) as avg_tokens
FROM af_agent_performance
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY agent_name, task_type
ORDER BY total_tasks DESC;

-- Common patterns summary
CREATE OR REPLACE VIEW v_common_patterns AS
SELECT
  pattern_type,
  category,
  description,
  frequency,
  confidence,
  suggested_action,
  CASE
    WHEN applied THEN 'Applied'
    WHEN confidence >= 0.8 THEN 'High confidence - ready to apply'
    WHEN confidence >= 0.5 THEN 'Medium confidence - review needed'
    ELSE 'Low confidence - gathering more data'
  END as status,
  created_at
FROM af_learned_patterns
WHERE active = TRUE
ORDER BY frequency DESC, confidence DESC
LIMIT 50;

-- Improvement suggestions
CREATE OR REPLACE VIEW v_improvement_suggestions AS
SELECT
  p.id,
  p.pattern_type,
  p.category,
  p.description,
  p.suggested_action,
  p.suggested_rule,
  p.frequency,
  p.confidence,
  COALESCE(json_array_length(p.evidence::json), 0) as evidence_count
FROM af_learned_patterns p
WHERE p.active = TRUE
  AND p.applied = FALSE
  AND p.confidence >= 0.6
  AND p.suggested_action IS NOT NULL
ORDER BY p.confidence DESC, p.frequency DESC;

-- Workflow success trends
CREATE OR REPLACE VIEW v_workflow_trends AS
SELECT
  DATE_TRUNC('week', started_at) as week,
  project_type,
  COUNT(*) as total_workflows,
  COUNT(*) FILTER (WHERE success = TRUE) as successful,
  ROUND((100.0 * COUNT(*) FILTER (WHERE success = TRUE) / NULLIF(COUNT(*), 0))::numeric, 2) as success_rate,
  ROUND(AVG(total_tokens)::numeric, 0) as avg_tokens,
  ROUND(AVG(duration_seconds)::numeric, 0) as avg_duration_seconds,
  ROUND(AVG(code_coverage)::numeric, 2) as avg_coverage
FROM af_workflow_metrics
WHERE started_at > NOW() - INTERVAL '90 days'
GROUP BY DATE_TRUNC('week', started_at), project_type
ORDER BY week DESC;

-- Feedback summary
CREATE OR REPLACE VIEW v_feedback_summary AS
SELECT
  feedback_type,
  COUNT(*) as total_count,
  COUNT(DISTINCT workflow_id) as unique_workflows,
  COUNT(DISTINCT project_name) as unique_projects,
  MAX(created_at) as last_feedback
FROM af_feedback
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY feedback_type
ORDER BY total_count DESC;

-- Workflow events summary (rejections/modifications per phase)
CREATE OR REPLACE VIEW v_workflow_events_summary AS
SELECT
  phase,
  event_type,
  COUNT(*) as total_count,
  COUNT(DISTINCT workflow_id) as unique_workflows,
  AVG(attempt_count) as avg_attempts,
  MAX(created_at) as last_event
FROM af_workflow_events
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY phase, event_type
ORDER BY phase, total_count DESC;

-- Phase rejection rates
CREATE OR REPLACE VIEW v_phase_rejection_rates AS
SELECT
  phase,
  COUNT(*) FILTER (WHERE event_type = 'APPROVED') as approved_count,
  COUNT(*) FILTER (WHERE event_type = 'REJECTED') as rejected_count,
  COUNT(*) FILTER (WHERE event_type = 'MODIFIED') as modified_count,
  ROUND(
    (100.0 * COUNT(*) FILTER (WHERE event_type = 'REJECTED') /
    NULLIF(COUNT(*) FILTER (WHERE event_type IN ('APPROVED', 'REJECTED')), 0))::numeric, 2
  ) as rejection_rate,
  ROUND(AVG(attempt_count) FILTER (WHERE event_type = 'REJECTED')::numeric, 2) as avg_rejection_attempts
FROM af_workflow_events
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY phase
ORDER BY phase;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to record feedback
CREATE OR REPLACE FUNCTION record_feedback(
  p_session_id TEXT,
  p_workflow_id TEXT,
  p_project_name TEXT,
  p_phase TEXT,
  p_feedback_type TEXT,
  p_original TEXT DEFAULT NULL,
  p_corrected TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_rating INT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO af_feedback (
    session_id, workflow_id, project_name, phase, feedback_type,
    original_response, corrected_response, reason, rating, metadata
  ) VALUES (
    p_session_id, p_workflow_id, p_project_name, p_phase, p_feedback_type,
    p_original, p_corrected, p_reason, p_rating, p_metadata
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update pattern frequency
CREATE OR REPLACE FUNCTION update_pattern_frequency(
  p_pattern_type TEXT,
  p_category TEXT,
  p_description TEXT,
  p_evidence JSONB DEFAULT '[]'
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_existing UUID;
BEGIN
  -- Check for existing similar pattern
  SELECT id INTO v_existing
  FROM af_learned_patterns
  WHERE pattern_type = p_pattern_type
    AND category = p_category
    AND description = p_description
    AND active = TRUE
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    -- Update existing pattern
    UPDATE af_learned_patterns
    SET frequency = frequency + 1,
        evidence = evidence || p_evidence,
        updated_at = NOW()
    WHERE id = v_existing
    RETURNING id INTO v_id;
  ELSE
    -- Create new pattern
    INSERT INTO af_learned_patterns (
      pattern_type, category, description, evidence, frequency, confidence
    ) VALUES (
      p_pattern_type, p_category, p_description, p_evidence, 1, 0.3
    ) RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get agent recommendations
CREATE OR REPLACE FUNCTION get_agent_recommendation(
  p_task_type TEXT
) RETURNS TABLE (
  agent_name TEXT,
  success_rate NUMERIC,
  avg_confidence NUMERIC,
  recommendation_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ap.agent_name,
    ROUND((100.0 * COUNT(*) FILTER (WHERE ap.success = TRUE) / NULLIF(COUNT(*), 0))::numeric, 2) as success_rate,
    ROUND(AVG(ap.confidence_score)::numeric, 2) as avg_confidence,
    ROUND(
      ((100.0 * COUNT(*) FILTER (WHERE ap.success = TRUE) / NULLIF(COUNT(*), 0)) * 0.6 +
      AVG(ap.confidence_score) * 0.4)::numeric,
      2
    ) as recommendation_score
  FROM af_agent_performance ap
  WHERE ap.task_type = p_task_type
    AND ap.created_at > NOW() - INTERVAL '90 days'
  GROUP BY ap.agent_name
  HAVING COUNT(*) >= 3  -- Minimum sample size
  ORDER BY recommendation_score DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE af_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE af_workflow_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE af_agent_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE af_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE af_learned_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE af_knowledge_base ENABLE ROW LEVEL SECURITY;

-- Policies for service role (full access)
CREATE POLICY "Service role full access on af_feedback" ON af_feedback
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role full access on af_workflow_metrics" ON af_workflow_metrics
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role full access on af_agent_performance" ON af_agent_performance
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role full access on af_learned_patterns" ON af_learned_patterns
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role full access on af_workflow_events" ON af_workflow_events
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role full access on af_knowledge_base" ON af_knowledge_base
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update confidence based on frequency
CREATE OR REPLACE FUNCTION update_pattern_confidence()
RETURNS TRIGGER AS $$
BEGIN
  -- Increase confidence as frequency grows (logarithmic scale)
  NEW.confidence := LEAST(0.95, 0.3 + (LN(NEW.frequency + 1) * 0.15));
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pattern_confidence
  BEFORE UPDATE OF frequency ON af_learned_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_pattern_confidence();

-- Auto-update knowledge usage
CREATE OR REPLACE FUNCTION update_knowledge_usage()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_used_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_knowledge_usage
  BEFORE UPDATE OF usage_count ON af_knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_usage();

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Seed some baseline knowledge
INSERT INTO af_knowledge_base (knowledge_type, title, content, context, tags, priority)
VALUES
  ('tip', 'Use TDD workflow for new features', 'The 5-phase TDD workflow ensures comprehensive test coverage and reduces bugs in production.', 'When starting a new feature implementation', ARRAY['workflow', 'tdd', 'testing'], 80),
  ('tip', 'Agent detector runs first', 'The smart-agent-detector skill runs before any other processing to ensure the right agent handles the task.', 'Understanding skill priority', ARRAY['agents', 'skills', 'priority'], 70),
  ('warning', 'Avoid skipping approval gates', 'Skipping Phase 2 or 5b approval gates can lead to misaligned implementations and wasted effort.', 'During workflow execution', ARRAY['workflow', 'approval', 'gates'], 90),
  ('rule', 'Fresh verification before done', 'Always perform fresh verification before claiming a task is complete. Re-run tests, re-check requirements.', 'Before marking task complete', ARRAY['verification', 'quality', 'completion'], 85)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant usage to anon and authenticated roles (for client-side if needed)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Service role gets full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
