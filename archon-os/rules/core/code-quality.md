> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Code Quality Rules

**Purpose:** Consistent, high-quality code across all projects

---

## Project Config Priority

Project's ESLint/TSLint/Prettier overrides these rules. These fill gaps only.

---

## TypeScript/JavaScript

```toon
rules[8]{rule}:
  No `any` — use strict typing
  No non-null assertions (!) — use ?? or optional chaining
  Proper error handling — catch specific errors, never swallow silently
  Single responsibility per component/function
  Inject dependencies, don't hardcode
  DRY — extract repeated logic into reusable functions
  No magic numbers — use named constants
  Early returns over nested conditionals
```

## Naming

```toon
naming[4]{pattern,convention}:
  Variables/functions,camelCase — descriptive names
  Constants,UPPER_SNAKE_CASE
  Booleans,is/has/can prefix
  Components,PascalCase
```

## Import Order

React/RN → third-party → navigation → store → API → components → hooks → utils → types → assets

## Testing

```toon
coverage[4]{scope,target}:
  Overall,80%
  Critical business logic,90%
  UI components,70%
  Utility functions,95%
```

Tests: Arrange/Act/Assert pattern. Descriptive names in `describe`/`it` blocks.

## Documentation

JSDoc for public APIs. Comment "why" not "what". No obvious comments.
