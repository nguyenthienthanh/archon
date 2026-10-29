> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Conflict Arbitration Policy

**Priority:** Critical
**Applies To:** `conflict-arbiter` agent, `pre-dispatch-conflict-check` + `post-execute-conflict-rescan` hooks, `/archon-os:plan-conflicts` command

---

## Core Principle

**When `conflict-detector` finds an overlap, the arbiter decides one of six resolution paths — no silent overwrites.** Detection without arbitration is a leak; arbitration without detection is a guess. They are paired.

This rule formalizes the decision table the arbiter uses, the cycle guard, and the boundary between auto-applied and user-required resolutions.

---

## Decision table (spec §21.5)

```toon
resolutions[6]{path,trigger,result,auto_or_manual}:
  auto_thaw,"L1 conflict + blocker.status==done + output compatible","frozen → planned, re-queue",auto
  auto_discard,"L1 conflict + blocker.status==done + output incompatible","frozen → planned with replan_required:true",auto
  user_priority,"/archon-os:plan-conflicts resolve <id> <choice>","user picks accept-proposed / accept-blocker / sequential / freeze-both / escalate",manual
  sequential_reorder,"L2 conflict, DAG reorder feasible","one task becomes depends_on the other; both stay planned",auto
  replan,"L2/L3/L4 conflict, no reorder, replan_budget remaining","Replanner creates alternative",auto
  escalate,"replan_budget exhausted OR cycle detected (3+ arbitrations)","human action — surface to user",auto-detect-then-manual-action
```

## Auto vs Manual boundary

```toon
auto[3]{layer,decision,rationale}:
  L1,auto_thaw|auto_discard|freeze,"deterministic file-set comparison; safe to auto-apply"
  L2,sequential_reorder|replan|freeze,"function-overlap is well-defined; reorder is cheap to attempt"
  L3+L4,user_priority,"semantic/architectural judgment requires user — never auto-arbitrate (rc.1: LLM proposes, user confirms)"
```

The arbiter **never** auto-applies resolutions for L3/L4 conflicts. In v3.7.0-beta.2 those are stubs; in rc.1 they become LLM-driven proposals that **still require user confirmation** before mutation.

---

## Auto-thaw / auto-discard (spec §21.6)

When a blocker reaches `done`, `post-execute-conflict-rescan` hook fires. For each frozen sibling:

1. Read blocker's checkpoint at the time of freeze (`git_sha` field per `checkpoint-discipline.md`)
2. `git diff <blocker.git_sha>..HEAD` — what files actually changed
3. Compare to the frozen sibling's planned `artifacts[].path`
4. **No overlap** → auto_thaw (frozen → planned, re-queue)
5. **Still overlaps** → auto_discard (frozen → planned + `replan_required: true`)

Auto-thaw is the **happy path** for the dependency-hell scenario in spec integration test #3 (Sect §28.7).

---

## Cycle guard (3-arbitration rule)

If the same `conflict_id` has been arbitrated **3 times** in this session (history.jsonl `event: conflict_arbitrated` count), the arbiter refuses further auto-arbitration and escalates to user. This prevents infinite re-detect → re-arbitrate → re-detect loops when underlying state is unstable.

Mirrors the cycle guard in `rules/workflow/replan-thresholds.md` for replans — same pattern, different state machine.

---

## replan_budget interaction

Per `rules/workflow/replan-thresholds.md`:

```toon
budget[3]{tier,default_budget}:
  T2,2
  T3,3
  T4,0 (T4 conflicts → discard or freeze, never replan T4 itself)
```

When arbiter chooses `replan`:

1. Check `replan_budget_remaining` on the affected node
2. If `>= 1`: invoke `replanner` agent, decrement budget
3. If `0`: refuse replan, escalate to user
4. Replan proposals from this path go through normal replanner cycle (propose → user confirm → master-planner apply)

---

## Freeze cascade rules (spec §13.1, decision Q10)

Once arbiter decides `freeze`:

```yaml
status: frozen
freeze_reason: conflict_with_<other-task-id>
freeze_propagated_to: [<descendant ids>]
frozen_at: <ISO>
frozen_by: conflict-arbiter
conflict_id: <CONFLICT-NNNNN>
```

**Cascade rules:**
- Descendants ONLY (not siblings)
- Children inherit `status: frozen` with `frozen_by_ancestor: <NODE_ID>`
- Cascade depth: full subtree (T2 freeze → all T3 + T4 freeze)
- Sibling freezes happen ONLY if conflict-detector ALSO finds them in conflict; not by cascade

---

## Compatibility check (post-blocker-done)

```
ON post_execute_conflict_rescan(blocker, frozen_sibling):
    actual_changes = git_diff(blocker.checkpoint.git_sha, HEAD)
    planned_paths  = frozen_sibling.artifacts[].path
    overlap = intersection(actual_changes, planned_paths)
    
    IF overlap == empty:
      arbiter.decide(auto_thaw)         ← happy path
    ELSE:
      arbiter.decide(auto_discard)      ← needs replan
```

A blocker that ended up touching different files than initially planned can still trigger auto-thaw. A blocker that was carefully scoped but still ended up overlapping triggers auto-discard.

---

## Anti-patterns

- **Auto-arbitrating L3/L4 conflicts** — those need semantic understanding; never auto-apply
- **Cascading freeze to siblings** — descendants only per Q10
- **Arbitrating without checkpoint** — pre-mutation snapshot is mandatory (`checkpoint-discipline.md`)
- **Resolving the same conflict_id twice** — `/archon-os:plan-conflicts resolve` refuses; reopen requires explicit re-detection
- **Resetting replan_budget on auto_discard** — only thaw with full success or human override resets
- **Logging only to conflicts.jsonl** — every arbitration MUST also append to history.jsonl (single source of truth for ops)

---

## Tie-Ins

- **Spec:** §21 (full conflict detection), §13.1 (cascade), §15.1 (F6 class)
- **Decisions:** Q10 (cascade descendants only), Q9 (L3 default state — siblings within Story enabled, cross-Story disabled)
- **Agent:** `conflict-arbiter` — sole arbiter (only writer of arbitration decisions)
- **Skill:** `conflict-detector` — sole producer of conflict findings
- **Skill:** `failure-classifier` — F6 routes to this rule's decision table
- **Hooks:** `pre-dispatch-conflict-check.cjs`, `post-execute-conflict-rescan.cjs`
- **Commands:** `/archon-os:plan-freeze`, `/archon-os:plan-thaw`, `/archon-os:plan-conflicts`
- **Companion rule:** `rules/workflow/replan-thresholds.md` — replan_budget enforcement (shared cycle-guard pattern)
- **Companion rule:** `rules/workflow/plan-lifecycle.md` — frozen state semantics
- **Companion rule:** `rules/workflow/checkpoint-discipline.md` — pre-mutation snapshots
