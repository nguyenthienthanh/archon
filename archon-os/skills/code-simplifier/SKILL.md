---
name: code-simplifier
description: "Detect and simplify overly complex code. Apply KISS principle - less is more."
autoInvoke: true
priority: high
triggers:
  - "simplify"
  - "too complex"
  - "make simpler"
  - "reduce complexity"
  - "KISS"
  - "over-engineered"
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Code Simplifier

KISS principle. Full guide: `rules/core/simplicity-over-complexity.md`

## Signals → Actions

```toon
signals[5]{signal,action}:
  Deep nesting (>3 levels),Flatten with early returns
  Long function (>30 lines),Extract smaller functions
  Complex conditionals,Use lookup tables
  Over-abstraction,Inline single-use code
  Premature optimization,Remove unless profiled
```

## Targets

```toon
targets[5]{metric,max}:
  Cyclomatic complexity,10
  Nesting depth,3
  Function length,30 lines
  File length,300 lines
  Parameters,3
```

## Before Writing Code Ask

1. Can I delete this? (unused code, dead branches)
2. Can I inline this? (single-use abstractions)
3. Can I flatten this? (nested conditions)
4. Can I use built-ins? (standard library)
5. Is this needed now? (YAGNI)
