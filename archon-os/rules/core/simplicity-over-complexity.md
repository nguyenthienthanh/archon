> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Simplicity Over Complexity (YAGNI + DRY + KISS)

**Priority:** Critical

---

## Core Principles

```toon
principles[3]{principle,rule}:
  YAGNI,"Only implement what's needed RIGHT NOW. No speculative features."
  DRY,"Wait for Rule of Three (3 occurrences) before abstracting."
  KISS,"Choose simplest solution. No over-engineering."
```

## Decision Flow

```
Is this in current requirements?
├── NO → Don't implement (YAGNI)
└── YES → Is there a simpler approach?
    ├── YES → Use simpler one (KISS)
    └── NO → Duplicated 3+ times?
        ├── NO → Keep duplicate
        └── YES → Abstract it
```

## Anti-Patterns

```toon
anti_patterns[6]{pattern,fix}:
  Speculative features,Only add when there's a ticket
  Premature abstraction,Wait for 3rd occurrence
  Excessive config,Only configure what varies
  Future-proof params,Only current-need params
  Unnecessary layers,Direct implementation for simple CRUD
  Over-generic code,Specific named functions
```

## Abstract vs Keep Duplicated

**Safe to abstract:** Pure utilities, business rules, API clients, design tokens.
**Keep duplicated:** Similar UI components (diverge by context), similar validations (domain-specific), similar tests (must be independent).

## Warning Signs

- "We might need this later" → YAGNI
- "This is more flexible" → Flexibility without use case = complexity
- More configuration than code → Over-configurable
- Many parameters or type switches → Abstraction too broad

Three similar lines of code is better than a premature abstraction.
