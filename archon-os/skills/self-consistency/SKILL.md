---
name: self-consistency
description: "Generate N independent reasoning paths and vote on the answer. Use for architectural trade-offs, ambiguous design decisions, or when single-path reasoning risks locking onto the first plausible answer. Paper: Wang et al. 2022."
when_to_use: "architectural trade-off, design decision, reason: sc, ambiguous trade-off, deep complexity design choice"
allowed-tools: Read, Grep, Glob, Bash
effort: high
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Self-Consistency

For ambiguous design decisions with multiple plausible answers. Generate multiple independent paths, take the majority.

**Governed by:** `rules/workflow/self-consistency.md` (when / why)

---

## When NOT to Use

- Single-answer tasks (file rename, typo)
- Quick/Standard complexity — cost doesn't pay back
- User said `must do:` / `just do:` / `no discussion`
- Budget already >85% of session limit

---

## The Protocol

### Step 1 — Frame the decision

Write the decision as a question with ≥2 possible answers:

> "Should the API use REST or GraphQL?"
> "Monolith, modular monolith, or microservices?"
> "Redis for cache vs in-memory LRU?"

If the question has only one sensible answer, skip SC.

### Step 2 — Generate N = 3 paths

For each path, reason from scratch in an isolated context:

```
Path 1:
  - Consider user scale (est. 10K DAU for this product)
  - Consider team size (2 backend devs)
  - Consider infra (already on Fly.io, no k8s expertise)
  → Answer: Modular monolith

Path 2:
  - Consider dev velocity (team ships weekly)
  - Consider deploy complexity (monorepo, single deploy)
  - Consider failure domains (single point of failure OK at this scale)
  → Answer: Modular monolith

Path 3:
  - Consider future scale (could hit 100K DAU in 12mo)
  - Consider hiring plan (doubling team in 6mo)
  - Consider isolation needs (auth service is security-critical)
  → Answer: Microservices (start with auth as separate service)
```

Each path should use **different starting considerations** — don't copy-paste one reasoning with cosmetic changes.

### Step 3 — Extract answers, count votes

```
Answers: [modular monolith, modular monolith, microservices]
Votes:   modular monolith: 2 | microservices: 1
Winner:  modular monolith (2/3 majority)
```

### Step 4 — Report

If clear majority (2/3 or 3/3):

> **Decision: Modular monolith (2/3 paths agreed)**
>
> Both winning paths cited scale (10K DAU), team size (2 devs), and existing Fly.io infra. The dissenting path optimized for 12-month scale which is speculative.
>
> Flagging dissent: if hiring doubles and we hit 100K DAU fast, consider extracting auth service as a Phase 2 refactor.

If no majority (1/1/1 with 3 different answers):

> **Paths disagreed — pausing to ask.**
>
> Path 1 → REST (simplicity)
> Path 2 → GraphQL (client flexibility)
> Path 3 → tRPC (end-to-end types)
>
> Which constraint matters most to you: simplicity, client flexibility, or type safety across client/server?

Per `rules/core/no-assumption.md` — when paths disagree, ask rather than pick.

---

## Anti-Patterns

- **Cosmetic paths** — same reasoning with word swaps. Don't. Each path must start from different considerations.
- **Forcing consensus** — if paths disagree, don't pick silently. Ask.
- **N > 3** — diminishing returns. 3 catches most issues; 5+ is expensive and rarely changes the answer.
- **Using SC for non-trade-offs** — if the answer is obvious, skip this. SC costs 3× tokens.

---

## Output Format

```markdown
## Decision: [Answer]
**Votes:** [X/N paths]
**Majority reasoning:** [1-2 sentence summary of why the winning paths agreed]
**Dissent:** [if any — what the losing path(s) prioritized]
**Flag for Phase 5:** [any follow-up action implied by dissent]
```

---

## Tie-Ins

- `rules/workflow/self-consistency.md` — policy
- `rules/workflow/tree-of-thoughts.md` — for branching exploration (different technique)
- `rules/core/no-assumption.md` — when to escalate to user
- `skills/chain-of-verification/SKILL.md` — verify the SC winner's facts
