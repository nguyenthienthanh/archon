---
name: refactor-expert
description: "Guide safe, incremental refactoring that improves code quality without changing behavior."
autoInvoke: false
priority: medium
triggers:
  - "refactor"
  - "code cleanup"
  - "improve code"
  - "refactor:analyze"
  - "refactor:plan"
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Skill: Refactor Expert

Safe, incremental refactoring. Improve quality without changing behavior.

---

## Commands

| Command | Output |
|---------|--------|
| `refactor:analyze <file>` | `.claude/logs/refactors/{target}-analysis.md` |
| `refactor:plan <file>` | `.claude/logs/refactors/{target}-plan.md` |
| `refactor:docs <file>` | Analysis + Plan + Summary |
| `refactor:quick <file>` | Skip approvals |
| `refactor:performance <file>` | Performance-focused |
| `refactor:structure <file>` | Structure-focused |

---

## Decision

| Signal | Action |
|--------|--------|
| Code smell detected | Identify specific smell |
| Tests passing | Safe to refactor |
| No tests | Write tests FIRST |
| Large change | Break into small steps |

**Golden Rule:** Never refactor and add features simultaneously.

---

## Code Smells -> Refactoring

| Smell | Refactoring |
|-------|-------------|
| Long Method | Extract Method |
| Large Class | Extract Class |
| Long Parameter List | Parameter Object |
| Duplicate Code | Extract Method/Class |
| Feature Envy | Move Method |
| Primitive Obsession | Replace with Object |
| Switch Statements | Polymorphism |
| Dead Code | Delete it |

---

## Safe Process

```
1. Ensure tests pass
2. ONE small change
3. Run tests
4. Commit
5. Repeat
```

Never multiple changes between test runs.

---

## Checklist

**Before:** Tests exist and pass, understand current behavior, identify smell.
**During:** One change at a time, test after each, commit frequently.
**After:** All tests pass, code cleaner, behavior unchanged.

---

## Related Rules

- `rules/core/simplicity-over-complexity.md` — the point of refactoring: Rule of 3 before abstracting, delete before extracting, flatten before nesting
- `rules/core/tdd-workflow.md` — refactor only when tests are green
- `rules/core/verification.md` — tests must still pass after every step
- `rules/workflow/cross-review-workflow.md` — refactorer ≠ reviewer
- `skills/code-simplifier/SKILL.md` — companion skill for pure simplification passes

---
