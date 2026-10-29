> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Run ↔ Plan Bridge

Auto-detect when `/archon-os:run` should anchor to an active hierarchical plan node, or when a task description warrants bootstrapping a plan first. The bridge is deterministic, non-destructive, and always user-overridable.

**Owner skill:** `skills/run-orchestrator/SKILL.md` (Phase 1 setup, between agent-detector and Sprint Contract).
**Owner command:** `commands/run.md` (declares the bridge runs after complexity routing).

---

## Three states

```toon
states[3]{state,trigger,bridge_action}:
  no_plan,".claude/plans/ does not exist OR active.json missing","Heuristic check on task description. If multi-feature/epic → suggest /archon-os:plan. Else proceed inline."
  plan_idle,"active.json exists, active.feature set, active.task null","Suggest /archon-os:plan-next to claim the next ready T4 before running freely."
  plan_anchored,"active.json has active.task set","Auto-anchor run-state to that T4 — deliverables write into the plan tree, status transitions sync to .claude/plans/."
```

---

## Anchoring (state: plan_anchored)

> **Critical contract — anchoring does NOT bypass the 5-phase TDD workflow.** The plan tree provides INPUTS to Phase 1 + Phase 2 (acceptance criteria, design notes, dependency hints). It does **not** replace either phase. Every anchored `/run` cycle executes Phase 1 → 2 → 3 → 4 → 5 against the task — no exceptions. Phase 2 (Test RED) is the most commonly-skipped phase under the misreading "the plan has acceptance criteria, why write failing tests?" Answer: acceptance criteria are intent; failing tests are executable contracts. Phase 2 converts one into the other. Skipping it is the bug this rule exists to prevent.
>
> One `/run` = one task's full 5-phase cycle. A feature with 5 tasks needs 5 `/run` invocations (each auto-anchoring via `/archon-os:plan next`). The bridge wires the inputs; the user — or the future "iterate all tasks" autopilot — drives the loop.

When `.claude/plans/active.json#active.task` is set:

1. **Read** the task file at `.claude/plans/features/<feature>/stories/<story>/tasks/<task>.md`.
2. **Populate run-state with anchor block:**
   ```json
   {
     "anchor": {
       "task_id": "TASK-NNNNN",
       "story_id": "STORY-NNNN",
       "feature_id": "FEAT-X",
       "context_budget": <from task frontmatter>,
       "acceptance_refs": [<AC-N from task or story>]
     }
   }
   ```
3. **Sprint Contract negotiation** uses the task's acceptance criteria as the seed — user can amend but not weaken below the plan's contract.
4. **Phase 5 (Finalize)** writes deliverable digests to `.claude/plans/.../tasks/<task>.md` under a `### Run Log` section AND triggers `post-execute-update-node.cjs` to transition the task to `status: done`.

If the task is `frozen`, abort the run with: *"TASK-N is frozen. Thaw via `/archon-os:plan-thaw <id>` first, or pick a different ready task with `/archon-os:plan-next`."*

---

## Suggestion (state: plan_idle)

If `active.feature` is set but `active.task` is null:

> Detected an active Feature (FEAT-X) with no claimed task. Run `/archon-os:plan-next` to dispatch the next ready T4 — the run will auto-anchor to it. Or type `proceed` to run freely (deliverables won't write into the plan tree).

Wait for user input. `proceed` skips the bridge; anything else routes through `/archon-os:plan-next` then re-enters run-orchestrator with the new anchor.

---

## Escalation heuristic (state: no_plan)

When `.claude/plans/` doesn't exist, scan the task description against these triggers:

```toon
escalation_triggers[8]{signal,weight}:
  multi_feature,"contains 2+ distinct user-facing capabilities (e.g. 'auth + billing + dashboard')",2
  multi_week,"contains 'roadmap', 'epic', 'initiative', 'multi-week', 'over N weeks/months', 'phase 1 of'",2
  shipping_scope,"contains 'ship v', 'v2.0', 'rollout', 'migrate from X to Y', 'launch'",2
  scale_words,"contains 'across N teams', '50+ files', 'monorepo migration', 'org-wide'",1
  cross_session,"contains 'continue from yesterday', 'session reset', 'come back to'",1
  user_explicit,"contains 'plan first', 'decompose', 'hierarchical'",3
  word_count,"task description exceeds 80 words (length-as-complexity proxy)",1
  scope_verbs,"contains 'rebuild', 'redesign', 'rewrite', 'from-scratch', 'overhaul'",2
```

**Suggest planning if total weight ≥ 3.**

The suggestion is a 3-option prompt (v3.7.2+):

> Your task scores ≥3 on the escalation heuristic — multi-feature / multi-session scope.
> Options:
>   `plan` — bootstrap `/archon-os:plan` first (writes pending-plan-bootstrap.json with mission + feature seeds)
>   `deep` — proceed with normal Deep flow (`escalation_declined: true` recorded in run-state)
>   `details` — show the breakdown of which signals fired, re-ask

Honor `proceed` (legacy alias for `deep`) immediately. Default to inline if no signals match. Phase C of v3.7.2 wires `run-orchestrator` to emit this prompt and consume the answer.

When the user picks `plan`, run-orchestrator writes `.claude/cache/pending-plan-bootstrap.json` then invokes `/archon-os:plan` — see "Pending bootstrap from /run escalation" section in `commands/plan.md` for the consumption schema.

### Override prefixes (skip the heuristic)

- `/run task: <desc>` — force task mode, skip escalation entirely (treat as Quick/Standard).
- `/run project: <desc>` — force project mode, skip ask (writes pending-plan-bootstrap.json and routes to `/archon-os:plan`).

These bypass the heuristic; combine with `AF_ESCALATION_DISABLED=true` for full per-session opt-out.

---

## Reverse direction — `/archon-os:plan-next` → `/archon-os:run`

After `plan-next` claims a task and sets `active.task`, it MUST surface:

> Next ready: **TASK-NNNNN** ({intent}).
> To execute: `/archon-os:run <one-line description>` — the run will auto-anchor to this task.

The user can also dispatch a different agent manually via the Agent tool — anchoring is an opt-in convenience.

---

## Constraints

- **Never silently mutate** `active.json` — anchoring only reads, never writes (write happens through `plan-next` or `post-execute-update-node`).
- **Force modes** (`must do:`, `just do:`, `exactly:` prefixes) skip the bridge entirely.
- **Sprint Contract weakening** vs plan acceptance criteria requires explicit user override + a `manual_override.json` audit entry.
- **No plan ≠ failure** — most tasks legitimately don't need a plan tree. The bridge biases toward inline execution unless evidence suggests planning helps.

---

## Disable

```
export AF_RUN_PLAN_BRIDGE_DISABLED=true     # disable all three states (anchor/idle/heuristic)
export AF_ESCALATION_DISABLED=true          # disable just the escalation heuristic (v3.7.2+)
```

`AF_RUN_PLAN_BRIDGE_DISABLED` makes `/run` behave exactly as in v3.7.0-rc.1 (no plan awareness). `AF_ESCALATION_DISABLED` is narrower — it skips the weight-≥-3 prompt but still allows anchoring to an existing active task.

---

## Tie-Ins

- **Skill:** `run-orchestrator` (consumes this rule in Phase 1 setup)
- **Command:** `commands/run.md` (documents bridge in protocol)
- **Command:** `commands/plan-next.md` (reverse-direction suggestion)
- **Hook:** `plan-escalation-check.cjs` (UserPromptSubmit — enforces the weight-≥-3 escalation heuristic deterministically, even when `/run` isn't typed; respects `AF_ESCALATION_DISABLED` / `AF_RUN_PLAN_BRIDGE_DISABLED`)
- **Hook:** `post-execute-update-node.cjs` (writes task status back to plan tree on Phase 5)
- **Spec:** `docs/specs/AURA_FROG_V3.7.0_TECH_SPEC.md` §10.1, §13
