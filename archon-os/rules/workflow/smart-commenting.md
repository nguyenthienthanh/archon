> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Smart Commenting

**Priority:** High
**Applies To:** All code, JSDoc, and commit messages

---

## Core Principle

**Only comment what's hard to understand. Never comment the obvious.**

Comments are ONLY for: complex business logic, non-obvious decisions, workarounds with context, public API docs (exported functions).

---

## Rules

```toon
comment_rules[4]{type,when,example}:
  JSDoc,Public API + complex functions,"@param user - Must be verified (see auth flow)"
  Inline,Non-obvious WHY,"// Safari bug workaround - see webkit#12345"
  TODO,With ticket reference,"// TODO: Add caching (PROJ-1234)"
  NEVER,Obvious/redundant code,"// Create user" "// Set loading" "// Loop"
```

---

## Never Comment

- Obvious assignments, standard iteration, null checks, returns, imports
- Standard patterns (useEffect, useState, map)
- "New test", "New branch", "Add coverage"
- Commented-out code (delete it)

---

## When TO Comment

- **Business logic:** WHY a discount applies, not WHAT the code does
- **Design decisions:** WHY setTimeout(0) for DOM measurement
- **Workarounds:** Link to bug tracker, explain the hack
- **TODO/FIXME:** With ticket reference

---

## JSDoc

Use for: complex public APIs, non-obvious parameter requirements, thrown exceptions.

Skip for: functions where name + types are self-explanatory, simple internal functions.

---
