---
name: self-improve
description: "Full learning loop for the Aura Frog plugin: analyze collected learning data from Supabase to identify success patterns, failure patterns, optimization opportunities, and agent performance trends, then apply learned improvements — update rules, adjust agent routing, modify workflow configurations, and generate knowledge base entries."
autoInvoke: false
priority: 30
triggers:
  - "/learn analyze"
  - "/learn apply"
  - "/af learn analyze"
  - "self improve"
  - "apply improvements"
  - "analyze learning data"
  - "success patterns"
  - "failure patterns"
  - "agent performance trends"
  - "optimization opportunities"
  - "learning analysis"
  - "pattern analysis"
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Self-Improve Skill

Full learning loop: **Analyze** collected learning data (success/failure patterns, optimization opportunities, agent performance) → **Apply** learned improvements (update rules, adjust agent routing, modify workflow configs, generate knowledge entries).

---

## Analyze

Analyze learning data from Supabase: success/failure patterns, optimization opportunities, agent performance. Runs before Apply — its `v_improvement_suggestions` output feeds the Apply process below.

### Analyze Usage

```bash
/af learn analyze                      # Full analysis
/af learn analyze --period 30d         # Last 30 days
/af learn analyze --focus agents       # Agent performance
/af learn analyze --focus workflows    # Workflow patterns
/af learn analyze --focus feedback     # User feedback
```

### Analyze Process

#### 1. Query Supabase Views

```toon
views[5]{view,purpose}:
  v_agent_success_rates,Agent performance by task type
  v_common_patterns,Identified patterns
  v_improvement_suggestions,Actionable suggestions
  v_workflow_trends,Weekly workflow trends
  v_feedback_summary,Feedback statistics
```

#### 2. AI Pattern Recognition

Identify: Top 3 success patterns, top 3 failure patterns, top 3 optimization opportunities, agent recommendations.

#### 3. Output Report

```markdown
## Learning Analysis Report
Generated: {timestamp} | Period: {dates}

### Success Patterns
1. **Pattern:** {description} — Frequency: {N}, Confidence: {%}

### Failure Patterns
1. **Pattern:** {description} — Impact: {severity}, Suggested Fix: {fix}

### Optimization Opportunities
1. **Opportunity:** {description} — Savings: {tokens/time}

### Agent Recommendations
| Task Type | Agent | Success Rate | Confidence |

### Suggested Rule Updates
- [ ] {suggestion}
```

### Analyze Environment

```bash
AF_LEARNING_ENABLED=true
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

### Analyze → Apply Handoff

After analysis, improvements can be: reviewed (`/af learn review`), auto-applied (`/af learn apply --auto`, high confidence only), or saved as pending (`/af learn save`). The Apply section below consumes these suggestions.

---

## Apply

Apply learned improvements: update rules, adjust agent routing, modify workflow configs, generate knowledge entries.

### Apply Usage

```bash
/af learn apply                    # Review and apply pending
/af learn apply --auto             # Auto-apply high-confidence (>=0.8)
/af learn apply --preview          # Preview without applying
/af learn apply --id <pattern_id>  # Apply specific pattern
```

---

## Improvement Types

```toon
types[4]{type,target,example}:
  Rule updates,rules/*.md,Increase coverage threshold 80→85
  Agent routing,agent-detector config,Load framework-expert refs/react.md for .tsx
  Workflow adjustments,workflow config,Increase Phase 2 timeout
  Knowledge base,knowledge entries,TDD reduces bugs by 40% for APIs
```

---

## Safety Guards

**Approval required** unless: `--auto` AND confidence >= 0.8 AND frequency >= 5.

**Rollback:** Every change creates backup + log. `/af learn rollback <id>` or `--all`.

**Validation:** Syntax check, conflict detection, impact assessment before applying.

---

## Apply Process

1. **Fetch:** Query `v_improvement_suggestions WHERE applied = FALSE`
2. **Generate:** Determine target files, create modifications, calculate impact
3. **Review:** Present diff with confidence, frequency, evidence. User chooses: Apply / Skip / Modify
4. **Apply:** Create backup, apply modification, mark applied in Supabase, log change

---

## Rollback

```bash
/af learn rollback <change_id>     # Specific change
/af learn rollback --list          # List recent changes
/af learn rollback --all           # All changes from today
```

---

## Configuration

```yaml
learning:
  self_improve:
    enabled: true
    auto_apply_threshold: 0.8
    min_frequency: 5
    backup_dir: backups/
    max_auto_per_day: 10
```

---
