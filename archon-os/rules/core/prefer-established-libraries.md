> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Prefer Established Libraries

**Priority:** High
**Applies To:** All utility functions, common operations

---

## Core Principle

Use established libraries instead of writing custom utilities. For library documentation, **use Context7**.

```
Before writing a utility:
1. Check if lodash/es-toolkit/date-fns already does this
2. Add "use context7" to get current library docs
3. Only write custom code if no library exists
```

---

## Recommended Libraries

```toon
libraries[12]{category,library,use_for}:
  Utilities,lodash/es-toolkit,Array/object/string manipulation
  Dates,date-fns/dayjs,Date manipulation
  Validation,zod/yup,Schema validation
  HTTP,axios/ky,HTTP requests
  Async,p-limit/p-retry,Concurrency + retry
  Strings,validator,Email/URL validation
  State,zustand/jotai,State management
  Forms,react-hook-form,Form handling
  Animation,framer-motion,Animations
  Testing,vitest/jest,Unit testing
  E2E,playwright/cypress,E2E testing
  Styling,tailwindcss,Utility CSS
```

---

## Don't Reinvent

```toon
avoid[6]{pattern,use_instead}:
  Custom debounce/throttle,lodash
  Custom deep clone/merge,lodash
  Custom date formatting,date-fns
  Custom array groupBy/chunk,es-toolkit
  Custom validation regex,zod + validator
  Custom retry logic,p-retry
```

---

## When Custom Code Is OK

```toon
acceptable[4]{case,example}:
  Domain-specific logic,Business rules no library handles
  Performance-critical,Profiled + documented why
  Trivial one-liners,Simple sum/isEmpty
  No library exists,Searched npm first
```

---

## Getting Library Docs

```
"How to use zod for validation" use context7
"date-fns format examples" use context7
"lodash groupBy usage" use context7
```

Context7 fetches current, version-specific documentation.

---

