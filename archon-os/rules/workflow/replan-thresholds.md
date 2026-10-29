> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Replan Thresholds

**Priority:** High
**Applies To:** master-planner, replanner, failure-classifier when deciding retry vs replan vs escalate

---

## Core Principle

**Replanning has a budget. When the budget is exhausted, the node freezes and the user is escalated to.**

This rule defines `replan_budget`, `deviation_score`, and the freeze-on-exhaustion policy from spec §11.3.

---

## replan_budget per node tier

```toon
budget[3]{tier,default_budget,reset_on}:
  T2 (Feature),2,"feature transitions to done"
  T3 (Story),3,"story transitions to done"
  T4 (Task),0,"never — tasks discard instead of replan"
```

Stored in node frontmatter:

```yaml
replan_budget_remaining: 3
replan_budget_total: 3
```

Decremented on every `event: replan_proposed` for that node. When `remaining == 0`, master-planner refuses further replans and freezes the node.

---

## deviation_score formula

A 0-1 score signaling how far execution has drifted from the plan:

```
deviation_score(node) =
  (failed_attempts × 0.4)        // bounded to 1.0 above 2.5 attempts
  + (revisions_since_planning × 0.3)  // bounded to 1.0 above 3.3 revisions
  + (token_overrun_pct × 0.3)    // capped at 1.0
```

Where:
- `failed_attempts` = count of T4 children with `failed_attempts > 0` for T3, or own `failed_attempts` for T4
- `revisions_since_planning` = `revision` minus `revision_at_status_active`
- `token_overrun_pct` = `max(0, (actual_tokens - context_budget) / context_budget)`

### Thresholds

| Score | Action |
|-------|--------|
| 0.0-0.3 | Continue normally |
| 0.3-0.5 | Log warning to history.jsonl; surface in /archon-os:plan-status |
| 0.5-0.7 | failure-classifier reduces F2 confidence by 0.1 (more likely to escalate) |
| 0.7-1.0 | Auto-trigger replanner with `mutation: re_decompose` proposal |
| > 1.0 | Treated as 1.0 (clamped) |

---

## Replan refusal (budget exhausted)

When `replan_budget_remaining == 0` and a replan is requested:

1. master-planner emits `event: replan_refused_budget` to history.jsonl
2. Node transitions to `status: frozen` with `freeze_reason: replan_budget_exhausted`
3. `freeze_propagated_to: <descendants>` per spec §13.1 (cascade descendants only — Q10)
4. User is surfaced via `/archon-os:plan-status` warning
5. User can `/archon-os:plan-thaw <NODE_ID>` after manual triage; thawing **resets the budget**

---

## Cycle guard (prevent thrash)

If the last 3 history events for a node are all `event: replan_proposed`, regardless of budget:

1. Refuse the new replan
2. Freeze the node with `freeze_reason: replan_cycle_detected`
3. Escalate to user

Reason: a thrash cycle indicates classifier confidence is too low for autonomous decisions.

---

## Anti-patterns

- **Resetting `replan_budget_remaining` on partial progress** — only `done` status resets
- **Increasing budget mid-flight** — only via explicit user override (`/archon-os:plan-thaw --grant-replan-budget N`)
- **Counting cosmetic revisions** (typo fixes) toward `revisions_since_planning` — exclude rev with diff_type: `cosmetic`

---

## Tie-Ins

- **Spec:** §11.3
- **Decisions:** Q5 (deviation_score formula), Q10 (freeze cascade)
- **Skill:** `failure-classifier` — uses deviation_score in F4 detection
- **Agent:** `replanner` — checks budget before proposing
- **Agent:** `master-planner` — owns budget enforcement
- **Rule:** `rules/workflow/plan-lifecycle.md` — frozen state semantics
- **Rule:** `rules/workflow/checkpoint-discipline.md` — pre-replan snapshot
