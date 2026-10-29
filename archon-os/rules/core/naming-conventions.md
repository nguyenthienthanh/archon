> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Naming Conventions

**Priority:** High
**Enforcement:** Linter + Code Review

---

## Project Config Priority

Project's ESLint naming rules override these. These fill gaps only.

---

## File Naming

```toon
files[5]{type,pattern,example}:
  Components,"PascalCase.{phone|tablet}.tsx",ShareModal.phone.tsx
  Hooks,"useCamelCase.tsx",useSharePost.tsx
  Utilities,"camelCase.ts",formatDate.ts
  Tests,"Name.test.tsx",ShareModal.test.tsx
  Constants,"UPPER_SNAKE_CASE.ts",API_ENDPOINTS.ts
```

## Variable Naming

```toon
variables[4]{type,convention,example}:
  Booleans,"is/has/should/can prefix","isLoading hasPermission canEdit"
  Arrays,"Plural nouns","users items products"
  Functions,"Verb + noun","fetchUser handleSubmit validateEmail"
  Event handlers,"handle + Event","handleClick handleChange"
```

## Types & Components

- Components: PascalCase (`ShareModal`, `UserCard`)
- Interfaces/Types: PascalCase (`User`, `ShareModalProps`)
- Props: suffix with `Props` (`ShareModalProps`)
- Constants: UPPER_SNAKE_CASE for values, camelCase for config objects

## Structured Data

Use TOON format for structured data in documentation. Reference: `docs/guides/TOON_FORMAT_GUIDE.md`

## Avoid

Single-letter vars (except loop counters), vague abbreviations (`usr`, `btn`), generic names (`data`, `temp`, `obj`), inconsistent casing.
