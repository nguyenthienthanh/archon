> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Cross-Review Workflow Rules

**Category:** Workflow Quality
**Priority:** Critical
**Applies To:** Phase 1, Phase 2, Phase 4

---

## Core Principle

**Builder ≠ Reviewer.** The agent that builds MUST NOT be the primary reviewer of its own work. Different perspective catches different issues.

---

## Review Matrix

```toon
review_matrix[4]{phase,builder,reviewer,focus}:
  Phase 1 (Design),architect,"tester (testability) + security (risk) + strategist (scope)",Design quality
  Phase 2 (Test RED),tester,"architect (feasibility) + frontend/mobile (coverage)",Test quality
  Phase 3 (Build GREEN),architect/frontend/mobile,"tester (behavior) + security (vulnerabilities)",Implementation quality
  Phase 4 (Refactor),architect/frontend/mobile,"security (PRIMARY reviewer) + tester (regression)",Code quality — builder must NOT lead review
```

**Rule:** Phase 4 reviewer MUST be a different agent than Phase 3 builder. If architect built in P3, security or tester leads P4 review.

---

## Reviewer Cap — Analysis Paralysis Defense

**Max 2 reviewers per phase.** No exceptions without explicit user approval.

| Phase | Builder | Reviewer slots | Cap |
|-------|---------|----------------|:---:|
| Phase 1 | architect | tester + security (strategist optional 3rd if Deep) | 2, exceptionally 3 |
| Phase 2 | tester | architect (feasibility only) | 1 |
| Phase 3 | builder (arch/front/mobile) | tester + security | 2 |
| Phase 4 | builder (refactor only) | security (primary) + tester | 2 |

**Why the cap:**
- 3+ reviewers → conflicting feedback, decision stalls, "design-by-committee" effect
- 2 reviewers cover complementary angles (feasibility + security / tests + risk)
- A third reviewer is usually asking the same questions differently
- For Deep complexity with truly cross-functional concerns, user can explicitly add a 3rd via `/run add-reviewer <name>`

**If 3+ reviewers seem needed:** lead must present justification and ask user. Default answer: trim to 2.

---

## Review Focus Areas

### Dev Review
Feasibility, clarity, scope, integration points, performance, edge cases, dependencies.

### QA Review
Measurable acceptance criteria, testability, test data, coverage achievability, quality requirements.

### Each reviewer produces
Approval status (Approved / Approved with concerns / Needs revision), key points, concerns, suggestions.

---

## Consolidation

PM Orchestrator creates summary: reviewer count, approval status, key feedback, "must address" items, then presents to user for approval.

---

## Conflict Resolution

When reviewers disagree: PM facilitates discussion → reviewers explain perspectives → team discusses trade-offs → user makes final decision.

---

## Timeline Impact

```toon
time_impact[3]{phase,added_time}:
  Phase 1,+50 min
  Phase 2,+15 min
  Phase 4,+30 min
```

Total: ~65 minutes added. Quality improvement: significant.

---

## Team Mode (Agent Teams)

When `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`: reviews happen in parallel via teammate messaging (~60% faster).

```toon
team_savings[3]{phase,sequential,team_mode,savings}:
  Phase 1,185 min,80 min,57%
  Phase 2,75 min,35 min,53%
  Phase 4,120 min,40 min,67%
```

Fallback: Without Agent Teams, standard sequential review applies.

---
