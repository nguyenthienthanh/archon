# Three-Role Dispatch — specialist · observer · verifier

**Decided 2026-10-29.** Replaces the department-and-lead hierarchy that an
earlier draft of the orchestrator spec proposed. Ethan: *"không cần phòng ban,
nó phân tầng quá nhiều… mục tiêu là có agent làm riêng việc của nó, độc lập, và
1 agent quan sát, 1 agent verify độc lập để không bao che."*

Owning plan node: **FEAT-G**. The verifier itself is **FEAT-E**.

---

## The shape

```
                  ┌── observer (watches; does not do the work, does not grade it) ──┐
                  │                                                                 │
requirement ─▶ orchestrator ─▶ specialist agent (owns one job, end to end, alone)
                                        │
                                        ▼
                            independent verifier ──▶ verdict + confidence
```

Two hops of work, one watcher, one grader. Not three hops of relay.

```toon
roles[3]{role,job,hard_constraint}:
  specialist,"Owns one job end to end, independently.","No sub-delegation of its own job — it may not hand its work to a peer and then bless the result."
  observer,"Watches the run: progress, stalls, scope drift, budget. Reports.","Does not do the work and does not grade it."
  verifier,"Grades the result: correct or not, plus a confidence score.","Not the producer. Not the producer's context. No debate — one verdict back."
```

---

## Why independence, not seniority, is the load-bearing part

An agent asked to grade its own output agrees with itself. This repo has the
receipt. A handoff written on 2026-10-28 claimed:

> *"Live Verification: verified with a 16,500-char tool execution"* — true of unit
> tests only, not of the claim it was attached to.
> *"90/90 Jest test suites passed (1592 tests)"* — the real number was **89/90,
> 1591/1592**.

Nobody lied on purpose. **The grader was the builder.** Seniority would not have
caught it; a reviewer with no stake and no shared context would have. That is
the whole mechanism, and it is the same discipline `rules/workflow/cross-review-workflow.md`
already enforces as **Builder ≠ Reviewer** in Phase 4 — this rule extends that
discipline to every step that produces a result, rather than adding a second
gate beside it.

**Enforced, not documented:** the verifier records the producer's agent id, and a
verdict whose grader id matches the producer's is rejected, not warned about.

---

## Why flat, and when a layer is allowed

Hierarchy exists in human organizations because of span of control and
specialization — constraints an agent does not have. An agent does not tire, and
a "lead" costs exactly what any other agent costs.

What an agent *does* have is a finite context window, and **hierarchy spends it
relaying instead of working.** `orchestrator → lead → agent → verifier` is three
handoffs per task, and handoff loss is this system's number-one measured failure
mode (see FEAT-B: `recent_prompts: []`, `context: {}` on a real handoff).

```toon
layer_rule[2]{case,ruling}:
  default,"Two hops: orchestrator → specialist → verifier. Observer attached, not interposed."
  exception,"Add a layer only when ONE agent genuinely lacks the context for the task. Record the context reason in run-state. An org chart is not a reason."
```

---

## Where the roles live — existing components, not new ones

The hard rule in `~/.claude/rules/no-dead-code-no-crossed-jobs.md` forbids a
second gate beside an existing one. These roles therefore **extend** what is
already in the process table:

```toon
mapping[5]{role_or_step,existing_component,change}:
  specialist,"the 13 domain agents in agents/","unchanged"
  observer,"master-planner + conflict-arbiter + scope-drift hook","extended: progress / stall / budget reporting joins them"
  verifier,"FEAT-E","new — this is the one genuinely new capability"
  "final verification","lead agent","MOVED to the verifier. A lead no longer signs off on work it coordinated."
  routing,"agent-detector","unchanged"
```

Spec steps that were **dropped as redundant**: route-to-department, assign-agent,
coordinate-across-agents, lead-final-verify. Each already had an owner.

---

## Two gates the spec was missing

### 1. "Do not build this"

Verifying that a requirement is *correct, complete and understood* cannot catch
the top failure mode for a solo builder: **building the right thing nobody
needs.** The `strategist` agent (ROI, MVP scope, scope challenge, read-only)
already exists and was not routed to. It is now the first gate on a new
requirement, and it is allowed to return *don't*.

### 2. A spend ceiling

A retry cap and a score threshold bound the *shape* of the loop, not its cost.
The real constraint here is **exhausting a quota pool mid-task**, not dollars
(`~/.claude/rules/model-quota-routing.md`). The loop must stop and report when it
hits the ceiling rather than burning on silently. `claude -p --max-budget-usd`
exists for the per-call case.

---

## Model routing — three corrections to intuition

```toon
pricing[4]{model,in_out_per_mtok,relative_input_cost}:
  Fable 5.1,$10 / $50,1x (most expensive)
  Opus 5.5,$4 / $20,2.5x cheaper
  Sonnet 5.5,$2 / $10,5x cheaper
  Haiku 5.5,$0.10 / $0.50,100x cheaper
```

1. **"Research needs the biggest model" is backwards on cost.** Research is the
   most input-heavy task there is — the research agents in the FEAT-B session
   consumed 128k–176k tokens each. Pairing the heaviest input with the highest
   input price is the worst available choice. **Tune effort before tier:** lower
   effort on a newer model often matches a previous generation at high effort.
2. **Older is not cheaper.** Haiku 4.5 is **$1 / $5 — ten times Haiku 5.5's
   $0.10 / $0.50.** Any heuristic that assumes an older version is the budget
   option overspends silently.
3. **Version pinning is impossible through the Agent tool.** Its `model`
   parameter accepts exactly `sonnet | opus | haiku | fable` — aliases only, no
   full IDs. Pinning a version requires `claude -p --model <full-id>` or the
   Messages API. Do not write routing logic that pretends otherwise.
4. **Capability claims come from the Models API, not from assumption.** "Vision
   needs Sonnet" was never measured. Query `client.models.retrieve(id)` →
   `capabilities` once and cache it.

---

## Step 7 — the human-approved implementation doc

**Do not write a new template.** This repo already carries researched,
primary-sourced ones:

| Need | Existing file |
|---|---|
| Decisions (4-tier: Y-statement → ADR → MADR 4.0.0 → RFC) | `templates/decision-record.md` |
| Human-readable spec for review | `templates/confluence-page.md` |
| Which deliverable exists per phase | `rules/workflow/workflow-deliverables.md` |

The approval doc is the Phase-1 pair already scaffolded —
`TECH_SPEC_CONFLUENCE.md` + `DESIGN_DECISIONS.md` — not a third document beside
them. The only thing step 7 adds is the **delivery choice**: offer the user a
published artifact (with the link) or the markdown in the run log, and record
which they chose.

For the record, since it was an open question: **arc42 is rejected here.** It is
a 12-section whole-system architecture reference; a per-feature approval doc is
not that, and adopting it would create a second system description next to
`AGENTS.md`.

---

## Related

- `rules/workflow/cross-review-workflow.md` — Builder ≠ Reviewer, the Phase-4 ancestor of this rule
- `rules/workflow/chain-of-verification.md` — the verification approach FEAT-E must beat on a labelled corpus before it may replace it
- `rules/core/small-to-large-routing.md` — model/effort routing
- `rules/workflow/workflow-deliverables.md` — the phase deliverables step 7 extends
- `~/.claude/rules/no-dead-code-no-crossed-jobs.md` — why these roles extend components instead of adding gates
