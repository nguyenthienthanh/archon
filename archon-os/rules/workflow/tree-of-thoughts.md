> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Tree of Thoughts (ToT)

**Priority:** HIGH
**Applies:** Phase 1 architecture decisions + Phase 4 refactor planning, Deep complexity only

**Paper:** Yao et al. 2023 — *Tree of Thoughts: Deliberate Problem Solving with Large Language Models*

---

## Core Principle

**For problems with multiple partial-solution paths, explore a small tree of thoughts with pruning and backtracking. Beats single-path reasoning when the search space is branching.**

ToT = branch → evaluate each branch → prune weak ones → expand survivors → pick final.

---

## When to Apply

| Situation | Use ToT? |
|-----------|:-------:|
| Architecture decision with 3+ valid paths, each with sub-decisions | ✓ |
| Refactor planning — multiple intermediate steps, order matters | ✓ |
| Debug complex issue with branching hypotheses | ✓ (via `debugging` skill) |
| Linear task (one path of implementation) | ✗ — overkill |
| Quick / Standard complexity | ✗ — cost doesn't pay back |
| User uses force-mode prefix | ✗ |

**Opt-in trigger:** User adds `reason: tot` / `reason: all` to `/run <task>`.

---

## Structure

```
Root: problem statement
├── Branch A (hypothesis / approach 1)
│   ├── Sub-branch A1
│   └── Sub-branch A2 ← pruned: fails cost gate
├── Branch B
│   └── Sub-branch B1 ← survives → expand further
└── Branch C ← pruned: fails feasibility
```

---

## How to Apply (brief)

Full procedure: `skills/tree-of-thoughts/SKILL.md`

1. **Depth = 3, Breadth = 3** by default (9 leaf nodes max)
2. At each node: propose 2–3 sub-approaches, evaluate each (rubric: feasible? token cost? quality?)
3. Prune any branch scoring below threshold (e.g., score < 6/10)
4. Expand only surviving branches
5. Final answer: the winning leaf — present with **the path** (root → leaf) so user can follow reasoning

---

## Token Cost

- Worst case: 9-leaf tree = ~5–7× single-path cost
- Typical: 4–6 leaves after pruning = ~3–4× cost
- For Phase 1 Deep (~8K base) → ToT adds ~25K. Phase 1 total ≈ 35K.
- **Hard cap:** If token tracker projects > 120K total for workflow, abort ToT and fall back to single-path.

---

## Tie-Ins

- `rules/workflow/self-consistency.md` — SC picks one answer by vote; ToT explores alternatives with structured search. Different techniques.
- `rules/workflow/chain-of-verification.md` — CoVe verifies ToT's final answer post-hoc
- `rules/core/no-assumption.md` — if all branches fail, ASK user rather than return lowest-scoring leaf
- `skills/tree-of-thoughts/SKILL.md` — concrete playbook
- `skills/bugfix-quick/SKILL.md` — applies ToT to hypothesis trees for bugs (debugging was merged into bugfix-quick in v3.5)
