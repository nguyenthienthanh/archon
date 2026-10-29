> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Plan Lifecycle

**Priority:** Critical
**Applies To:** All plan-tree state transitions when `.claude/plans/` exists

---

## Core Principle

**Plan nodes follow a strict state machine. Forbidden transitions are policy violations and MUST be blocked by master-planner.**

This rule encodes the state diagram in spec §13 with the phase-role mapping from §24.

---

## State Machine

```
planned ────────► active
                  │
                  ├─► done ─────► archived
                  ├─► blocked ─► active (when blocker cleared)
                  ├─► discarded
                  └─► frozen
                       │
                       ├─► planned (blocker cleared, output compatible)
                       └─► discarded (abandoned)

planned ────────► frozen (conflict detected at dispatch time)
```

### Allowed transitions

| From | To | Trigger |
|------|----|---------|
| planned | active | `/archon-os:plan-next` returns this T4; OR user approves at Phase 1 gate |
| planned | frozen | conflict-detector flags conflict at dispatch (Milestone D) |
| planned | discarded | parent's `replan` discards children |
| active | done | acceptance check passes |
| active | blocked | dependency reverted to non-done (rare) |
| active | discarded | user explicitly drops |
| active | frozen | conflict detected mid-execution |
| frozen | planned | blocker `done` AND output compatible (auto-thaw) |
| frozen | discarded | user `/archon-os:plan-thaw --discard` |
| blocked | active | blocker reaches `done` |
| done | archived | parent T2 archived (cascade) |

### Forbidden transitions

- `done → active` (re-running a done node = create new node via replan)
- `archived → *` (archive is terminal)
- `discarded → active` (replan creates new child instead)
- Skipping intermediate states (e.g., `planned → done` without acceptance pass)

---

## Branch freeze cascade

Per spec §13.1, freezing a node freezes its **descendants only** (Q10 decision).

```yaml
status: frozen
freeze_reason: conflict_with_TASK-00120
freeze_propagated_to: [TASK-00126, TASK-00127]
frozen_at: <ISO-8601>
frozen_by: master-planner
conflict_id: CONFLICT-00007
```

Children inherit `status: frozen` with `frozen_by_ancestor: <ancestor-id>`. Siblings are NOT frozen.

---

## phase_role_map (TDD ↔ T3 binding) — HARD RULE

Per spec §24 and decision Q17, **Phase 4 reviewer MUST NOT be the same agent as Phase 3 builder.** This formalizes the Generator/Evaluator separation per Anthropic's harness design.

```toon
phase_role_map[5]{phase,primary,consultants,output}:
  phase_1,architect,"security, tdd-engineer","design + acceptance criteria"
  phase_2,tdd-engineer,"frontend / backend by artifact","failing tests"
  phase_3,"backend or frontend or mobile",,"passing tests + minimal impl"
  phase_4,code-reviewer,"security if auth/data","refactored + reviewed"
  phase_5,tdd-engineer,code-reviewer,"integration verified"
```

### Enforcement (rc.1 hard rule, was advisory in earlier alphas)

When run-orchestrator is about to dispatch Phase 4:

1. Read `run-state.json` for the run's Phase 3 builder agent
2. Refuse if the proposed Phase 4 reviewer == Phase 3 builder
3. Prefer `code-reviewer` as primary; if it WAS the Phase 3 builder (rare), fall back to a different reviewer (next in `agent-detector`'s ranked list)
4. Append history.jsonl: `event: phase_role_enforced` with the chosen reviewer
5. If no eligible reviewer remains, **block the phase transition** and surface to user — do not silently bypass

When inside an active phase, `agent-detector` skill MUST prefer `phase_role_map` over content scoring AND apply the Phase 4 ≠ Phase 3 builder check.

### Rationale

- Generator-only validation has well-known coverage gaps: the agent that wrote the code is more likely to miss the same flaw twice
- Evaluator separation forces a fresh read with adversarial intent
- Cost: ~10% extra dispatch overhead in Phase 4; benefit: catches code-self-review blind spots
- Per Anthropic harness research: Generator≠Evaluator is one of the highest-leverage discipline rules

---

## State persistence

Every transition logged to `.claude/plans/history.jsonl` as append-only event:

```jsonl
{"ts":"2026-04-28T11:30:00Z","node":"TASK-00101","from":"planned","to":"active","trigger":"plan_next","actor":"master-planner"}
{"ts":"2026-04-28T11:45:00Z","node":"TASK-00101","from":"active","to":"done","trigger":"acceptance_pass","actor":"master-planner"}
```

---

## Tie-Ins

- **Spec:** §13 (state machine), §13.1 (freeze cascade), §24 (phase-role)
- **Rule:** `rules/core/plan-trust-policy.md` — defines trust transitions tied to status
- **Rule:** `rules/workflow/cross-review-workflow.md` — enforces phase 4 reviewer ≠ phase 3 builder
- **Rule:** `rules/workflow/checkpoint-discipline.md` — Milestone B (checkpoint at every status transition that touches files)
- **Hook:** `pre-execute-load-plan-context.cjs` — reads current status before any tool call
- **Hook:** `post-execute-update-node.cjs` — writes status transitions
- **Decisions:** Q10 (cascade descendants only), Q17 (phase 4 ≠ phase 3 builder hard rule)
