> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# State Management Rules

**Category:** Code Quality
**Priority:** High
**Applies To:** Frontend applications (React, Vue, React Native)

---

## Core Principles

1. **Start local, lift only when needed**
2. **Server state != Client state** — use query libraries for API data
3. **Never duplicate or store derived state**

---

## State Location

```toon
state_types[4]{type,storage,example}:
  UI State,Local (useState/ref),Modal open / form input
  Client State,Global store (Zustand/Pinia),Theme / user preferences
  Server State,Query cache (TanStack Query),API responses
  URL State,URL params,Filters / pagination
```

### Decision Tree

```
From API? → TanStack Query / SWR
Multiple components? → Truly global? → Global store : Context/provide
Single component? → Local state
```

---

## Tool Selection

```toon
tools[5]{state_type,react,vue}:
  Local UI,useState,ref/reactive
  Shared UI,Context,provide/inject
  Global,Zustand/Redux,Pinia
  Server,TanStack Query,TanStack Query
  Forms,React Hook Form,VeeValidate
```

---

## Anti-Patterns

```toon
anti_patterns[4]{pattern,fix}:
  Copy API data to useState,"Use useQuery() — let query lib manage it"
  Prop drilling through many levels,"Use context or store"
  Store computed values,"useMemo/computed — derive on render"
  Subscribe to entire store,"Select specific slices: useStore(s => s.count)"
```

---

## Performance

- Memoize expensive computations
- Split stores by domain
- Subscribe to specific slices with selectors
- Keep stores small and focused

---
