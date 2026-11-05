# /archon-os:heal

**Self-healing orchestration.** Diagnose F2/F3 failures, view proposals, accept/decline, disable.

---

## Usage

```
/archon-os:heal diagnose <TASK_ID>          # run self-healing-orchestrator on the failed task; emit proposal
/archon-os:heal status                       # session counter, budget, last proposal, disabled state
/archon-os:heal accept <HEAL-ID>             # apply a proposal as a new T4 task with its own approval flow
/archon-os:heal decline <HEAL-ID> [reason]   # reject; counts toward session cap
/archon-os:heal disable                      # disable for this session (.claude/logs/.self-heal-disabled flag)
/archon-os:heal enable                       # re-enable for this session
```

## Protocol — `diagnose`

1. Refuse if `ARCHON_SELF_HEAL_DISABLED=true` or `.claude/logs/.self-heal-disabled` exists
2. Refuse if session cap reached (5 proposals total)
3. Read failure-classifier output for the task — refuse if class ∉ {F2, F3}
4. Refuse if task already has an accepted heal (max 1/task)
5. Check `replan_budget_remaining` on the task; refuse if 0
6. Invoke `self-healing-orchestrator` skill — it produces a proposal artifact at `.claude/plans/proposals/HEAL-<TASK_ID>-<NNN>.yaml`
7. If confidence < 0.7: surface raw findings only ("self-heal couldn't reach a confident proposal — escalating findings"); do NOT create a proposal
8. If confidence ≥ 0.7: surface diff + reasoning + risks; prompt user to `/archon-os:heal accept` or `/archon-os:heal decline`
9. Append history.jsonl event: `event: self_heal_proposed`

## Protocol — `accept <HEAL-ID>`

1. Refuse if proposal not found at `.claude/plans/proposals/HEAL-<HEAL-ID>.yaml`
2. Refuse if already applied (idempotency check)
3. Save checkpoint on the affected node (per `rules/workflow/checkpoint-discipline.md`)
4. Apply the patch as a NEW T4 task (mint TASK-NNNNN), NOT a modification of the failing task
5. The new T4 task goes through the standard approval flow (Phase 1 design optional, Phase 2/3 mandatory)
6. Decrement `replan_budget_remaining` on the parent T3 (counts as a replan)
7. Increment session counter
8. Append history.jsonl: `event: self_heal_accepted`, link to original proposal + new task ID

## Protocol — `decline`

1. Mark proposal as declined (mutate the YAML's `status:` field)
2. Increment session counter (declined still counts — anti-loop)
3. Append history.jsonl: `event: self_heal_declined`, reason if given

## Protocol — `status`

```toon
self_heal_status{disabled,session_count,session_cap,last_proposal,last_decision}:
  false,2,5,HEAL-TASK-00125-001,accepted
```

If `disabled: true`: show source (env / session flag), and how to re-enable.

## Protocol — `disable` / `enable`

- **disable** writes `.claude/logs/.self-heal-disabled` flag (session-scoped)
- **enable** removes the flag
- Permanent disable: set `ARCHON_SELF_HEAL_DISABLED=true` in `.envrc` (this command can't override env vars)

## Hard constraints (per spec §22.1)

- ONLY F2 / F3 — refuse F4/F5/F6
- Confidence < 0.7 → no proposal, raw findings only
- Max 1 accepted heal per task
- Session cap 5 proposals
- User approval required before patch applied (this command never auto-applies)
- Counts toward replan_budget

## Disable cascade

When disabled, all `/archon-os:heal diagnose` calls refuse. Existing proposals remain accessible via `/archon-os:heal status` for forensic review but cannot be `accept`ed without re-enable.

## Tie-Ins

- **Spec:** §10.4 (commands), §22 (self-healing)
- **Skill:** `self-healing-orchestrator` — sole producer of proposals
- **Skill:** `failure-classifier` — gates which classes are eligible
- **Rule:** `rules/workflow/replan-thresholds.md` — shared budget semantics
- **Rule:** `rules/workflow/checkpoint-discipline.md` — pre-apply snapshot
- **Agent:** `master-planner` — applies the new T4 on `accept`
- **File:** `.claude/plans/proposals/HEAL-*.yaml` — proposal artifacts
- **Env:** `ARCHON_SELF_HEAL_DISABLED=true` — permanent disable
