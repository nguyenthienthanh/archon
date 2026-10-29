> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Self-Consistency (SC)

**Priority:** HIGH
**Applies:** Phase 1 design, only when complexity = Deep AND task involves a trade-off decision

**Paper:** Wang et al. 2022 — *Self-Consistency Improves Chain of Thought Reasoning*

---

## Core Principle

**For ambiguous design trade-offs, generate N independent reasoning paths, pick the answer most paths agree on.**

Single-pass reasoning can lock onto the first plausible answer. Independent reruns expose this bias. The majority winner is usually more robust than any single path.

---

## When to Apply

| Trigger | SC fires? |
|---------|:--------:|
| Phase 1 design with multiple valid approaches | ✓ |
| Architectural trade-off (REST vs GraphQL, monolith vs services, etc.) | ✓ |
| Deep complexity + ambiguous requirements passed through prompt-validation | ✓ |
| Quick / Standard complexity | ✗ — too expensive for small payoff |
| Single-answer tasks (typos, renames, formatting) | ✗ |
| User uses force-mode prefix (`just do:`, `must do:`, `no discussion`) | ✗ |

**Opt-in trigger:** User adds `reason: sc` / `reason: all` to `/run <task>`.

---

## How to Apply (brief)

Full procedure: `skills/self-consistency/SKILL.md`

1. **N = 3** independent paths (balance cost vs robustness)
2. Each path starts from the same prompt, fresh context
3. Extract the **answer** (not the reasoning) from each path
4. Count votes → pick majority; flag disagreement if no 2/3 majority
5. Present the winning answer + vote breakdown to user

---

## Token Cost

- 3 paths ≈ **3× base Phase 1 cost** (~25K vs ~8K). Reserve for high-impact decisions.
- Phase 1 total typically stays under 40K with SC.
- Skip if running low on budget (use `/run budget`).

---

## Tie-Ins

- `rules/core/no-assumption.md` — when paths disagree, ASK user rather than pick silently
- `rules/core/prompt-validation.md` — SC can't fix a bad prompt; validate first
- `skills/self-consistency/SKILL.md` — concrete playbook
- `rules/workflow/tree-of-thoughts.md` — for multi-branch exploration (different technique)
- `rules/workflow/collaborative-planning.md` — SC is orthogonal; both can run in P1
