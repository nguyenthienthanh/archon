> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Collaborative Planning (Multi-Team Deliberation)

**Applies to:** Phase 1 (Understand + Design) for Deep complexity tasks
**Gate:** Only when `agent-detector` classifies task as **Deep** complexity

---

## Activation

```toon
activation_gate[3]{condition,value,result}:
  Complexity,Deep,Activate collaborative planning
  Complexity,Standard/Quick,Skip → use single-agent Phase 1
  Teams enabled,false,Use subagents instead of teammates (same flow)
```

Works regardless of Agent Teams. With teams → parallel teammates. Without → sequential subagents.

---

## The Process: 4 Rounds

```
Round 1: Independent Analysis    (4 perspectives, parallel)
Round 2: Cross-Review + Debate   (each reviews the other three)
Round 3: Use Case Simulation     (adversarial testing of the plan)
Round 4: Convergence             (lead synthesizes final plan)
```

---

## Round 1: Independent Analysis

```toon
perspectives[4]{agent,perspective,focus}:
  architect,"Builder" — How to implement,Architecture / tech choices / data model / API design / performance
  tester,"Breaker" — How it can fail,Edge cases / test strategy / error scenarios / security gaps / load
  frontend OR domain-expert,"User" — How it's experienced,UX flow / user stories / accessibility / business logic gaps
  strategist,"Why" — Should we build this,Business case / ROI / MVP scope / opportunity cost / phasing
```

Each agent produces: Requirements, Proposed Approach, Risks & Concerns, Estimated Effort, Open Questions.

Prompt: Be opinionated. Flag over-engineering or under-engineering.

---

## Round 2: Cross-Review + Debate

Each agent reviews the other analyses and produces: Agreements, Disagreements (with alternatives), Gaps Found, Revised Position.

Goal: best plan, not consensus for its own sake.

---

## Round 3: Use Case Simulation

```toon
simulation_scenarios[5]{type,what_to_test}:
  Happy Path,Main user flow end-to-end
  Edge Cases,Empty data / max limits / concurrent users / network failure
  Security,Auth bypass / injection / data leak
  Scale,10x / 100x expected load
  Integration,Interaction with existing systems / breaking changes
```

Output as table: `scenario | status (PASS/PARTIAL/FAIL) | notes`

---

## Round 4: Convergence

Lead synthesizes final plan by merging best ideas, resolving disagreements, incorporating simulation findings, documenting dissent.

```toon
final_plan[9]{section,source}:
  Requirements (Final),Merged from all analyses + simulation findings
  Architecture Decision,Best approach from debate (with justification)
  Dissenting Views,Logged disagreements that weren't resolved
  Risk Register,Combined from all + simulation failures
  Test Strategy Outline,From tester's analysis
  UX Considerations,From frontend's analysis
  Business Case,From strategist's analysis (MVP scope + ROI + phasing)
  Effort Estimate,Averaged from 4 estimates with variance noted
  Open Questions (Final),Unresolved items requiring user input
```

---

## Implementation

### With Agent Teams
Spawn 4 teammates in parallel (Round 1), cross-review via SendMessage (Round 2), lead runs simulation + convergence (Rounds 3-4).

### Without Agent Teams
Same flow, sequential subagents (~2x slower).

---

## Token Budget

```toon
token_budget[4]{round,budget,notes}:
  Round 1 (4 analyses),4000 total (1000 each),TOON format — no prose
  Round 2 (4 reviews),2000 total (500 each),Focus on disagreements only
  Round 3 (simulation),1000,Table format for results
  Round 4 (convergence),1500,Final plan in TOON
```

**Total: ~8500 tokens** (vs ~2000 for single-agent Phase 1). Justified: prevents expensive mistakes caught later (10-50x more costly to fix).

---

## When NOT to Use

- Quick/Standard tasks — single agent
- Deep but single-domain — single agent with deeper analysis
- User says "just do it" — skip deliberation

---
