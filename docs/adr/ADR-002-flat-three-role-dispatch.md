---
last_aligned_with: v4.0.0-alpha.2
status: current
audience: contributor
---

# ADR-002 — Flat three-role dispatch instead of departments and leads

**Status:** Committed · **Date:** 2026-10-29 · **Node:** FEAT-G (verifier itself: FEAT-E)

> `committed` in the sense of Oxide's RFD lifecycle: this describes the shape the
> orchestrator rules now carry, not an intention.

## Context and problem statement

The v4 orchestrator respec was drafted as a company: a requirement arrives, gets
decomposed, is routed **to a department**, and a **department lead** assigns it to
an agent and holds the final verification. Steps 4, 5, 9 and 10 of that spec all
described some part of that hierarchy.

Two things were wrong with it, one organisational and one empirical.

Ethan settled the first himself on review: *"không cần phòng ban, nó phân tầng
quá nhiều, đó chỉ là idea, mục tiêu là có agent làm riêng việc của nó, độc lập,
và 1 agent quan sát, 1 agent verify độc lập để không bao che."*

The second is the one that makes this an architectural decision rather than a
preference, and it has a receipt in this repo. A handoff written 2026-10-28
claimed:

- *"Live Verification: verified with a 16,500-char tool execution"* — true of the
  unit tests, not of the claim it was attached to.
- *"90/90 Jest test suites passed (1592 tests)"* — the real number was **89/90,
  1591/1592**. `port-plugin.test.cjs` had been red since the v4 rebrand.

Nobody lied. **The agent that graded the work was the agent that did it.**

## Decision drivers

- An agent asked to assess its own output agrees with itself. Seniority does not
  fix this; independence does.
- Hierarchy in human organisations exists for span of control and specialisation.
  An agent does not tire, and a "lead" costs what any other agent costs.
- What an agent *does* have is a finite context window, and **relaying spends
  it.** Handoff loss is this system's number-one measured failure mode — see
  ADR-003 and the real handoff with `recent_prompts: []`, `context: {}`.
- The workspace hard rule forbids a second gate beside an existing one, so any
  new role has to extend a component that already exists or replace it outright.

## Considered options

1. **Departments with leads** (the original spec). `orchestrator → department
   lead → agent → verifier`: three handoffs per task.
2. **Flat, two hops, with an observer and an independent verifier.**
   `orchestrator → specialist → verifier`, observer attached rather than
   interposed.
3. **Do nothing** — keep `lead` coordinating *and* signing off.

## Decision outcome

**Option 2.**

```toon
roles[3]{role,job,hard_constraint}:
  specialist,"Owns one job end to end, independently","May not hand its own job to a peer and then bless the result"
  observer,"Watches progress, stalls, scope drift, budget; reports","Does not do the work and does not grade it"
  verifier,"Grades the result + confidence score","Not the producer, not the producer's context, no debate"
```

Option 3 is rejected by the receipt above: it is the configuration that produced
the false claims.

### Consequences

**Easier.** Two hops instead of three leaves more context for the work. The
observer's job (watch) and the verifier's job (grade) are separable and separated,
so neither can quietly absorb the other. Every step that produces a result now has
a neutral grader, not only Phase 4.

**Harder.** `lead` loses the final verdict — amended in `agents/lead.md`. It keeps
coordination, observation and the approval gates. Work that genuinely needs a
relay layer now has to justify it in run-state by naming the missing context; an
org chart is not a reason.

**Dropped as redundant**, each already having an owner: route-to-department
(`agent-detector`), assign-agent (the 13 domain agents),
coordinate-across-agents (`master-planner`, `conflict-arbiter`),
lead-final-verify (now the verifier).

**Added, because the spec was missing them:** a gate that may answer *"do not
build this"*, routed to the existing read-only `strategist` — the top failure mode
for a solo builder is building the right thing nobody needs — and a spend ceiling,
because the real constraint here is exhausting a quota pool mid-task, not dollars.

### Confirmation

Not a review convention — a test. The verifier records the producer's agent id, and
a verdict whose grader id matches the producer's is **rejected, not warned about**.
This is the same mechanism `rules/workflow/cross-review-workflow.md` already uses
for Builder ≠ Reviewer in Phase 4; this decision extends that discipline to every
step that produces a result rather than adding a gate beside it.

## More information

- `rules/workflow/three-role-dispatch.md` — the operative rule, including the
  model-routing corrections (effort before tier; Haiku 4.5 is **ten times** Haiku
  5.5; version pinning is impossible through the Agent tool, whose `model`
  parameter takes only four aliases)
- `rules/workflow/cross-review-workflow.md` — the Phase-4 ancestor
- `rules/workflow/chain-of-verification.md` — the incumbent the cheap verifier must
  beat on a labelled corpus before it may replace it
- ADR-003 — the session-memory decision this one leans on for the handoff-loss claim
