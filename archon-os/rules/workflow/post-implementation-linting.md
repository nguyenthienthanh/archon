> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Post-Implementation Linting

**Priority:** High
**Applies To:** All code implementation tasks

---

## Core Rule

**After every implementation, run lint and resolve ALL issues before completing.**

`Implementation → Lint → Fix → Verify Clean → Done`

---

## When to Lint

```toon
triggers[5]{event,action}:
  New file created,Lint file
  Existing file modified,Lint file
  Feature implementation done,Lint all changed files
  Bug fix completed,Lint affected files
  Refactoring finished,Lint refactored files
```

---

## Commands by Framework

```toon
commands[6]{framework,lint_command}:
  Next.js,next lint --fix
  Vue.js,vue-cli-service lint --fix
  Angular,ng lint --fix
  React Native,npx eslint --fix .
  NestJS,npm run lint
  Laravel,./vendor/bin/pint
```

Generic: `npx eslint --fix "src/**/*.{ts,tsx,js,jsx}"` + `npx tsc --noEmit`

---

## Resolution

1. Run lint → 2. Auto-fix (`--fix`) → 3. Manually fix remaining → 4. Verify clean (zero errors)

Common manual fixes: replace `any` with proper types, remove unused vars, fix hook deps, reorder imports, remove console.log, use `const` over `let`.

---

## Mandatory Checks

```toon
checklist[5]{check,command,required}:
  ESLint,npx eslint .,Yes
  TypeScript,npx tsc --noEmit,Yes (if TS project)
  Prettier,npx prettier --check .,Recommended
  Tests pass,npm test,Yes
  Build succeeds,npm run build,Yes
```

---

## Exceptions

If a rule MUST be disabled, add explanation:
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Legacy API returns untyped response
```

---

## Workflow Integration

Lint applies in: Phase 3 (after each file), Phase 4 (test files + verify zero issues), Phase 5 (final check before merge).

---
