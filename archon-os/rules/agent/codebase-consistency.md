> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Codebase Consistency - Learn Before Acting

**Priority:** High
**Applies To:** All phases

---

## Core Principles

1. **Learn before acting** — study existing patterns before any work
2. **Reuse before creating** — search for existing code; extend or compose before writing new

---

## Quick Reference

```toon
consistency_steps[5]{step,action,how}:
  1,Search existing,"Grep/Glob for similar code"
  2,Evaluate reuse,"Can existing code be used or extended?"
  3,Check naming,"Look at adjacent files"
  4,Match imports,"Copy import style from nearby"
  5,Follow structure,"Mirror existing file organization"
```

---

## Reuse Decision Flow

```
Need new code?
├── Search for existing similar code
│   ├── Found exact match → USE IT
│   ├── Found similar → Can extend? → YES: EXTEND / NO: Can compose? → YES: COMPOSE
│   └── Not found → CREATE NEW (following existing patterns)
```

---

## What to Check Before Creating

```toon
search_targets[4]{creating,search_for}:
  Component,"Glob: src/components/**/*Similar*.tsx"
  Hook,"Glob: src/hooks/use*.ts — also check if lodash/es-toolkit has it"
  Utility,"Glob: src/utils/*.ts src/lib/*.ts"
  Service/API,"Glob: src/services/*.ts src/api/*.ts"
```

---

## Pattern Matching

```toon
patterns[6]{check,look_for,match}:
  File naming,"PascalCase or kebab-case",Adjacent files
  Imports,"Absolute @/ or relative ./",Same folder files
  Exports,"Named or default",Similar file types
  Error handling,"try/catch or Result type",Service layer
  Logging,"console or logger",Existing utils
  Testing,"describe/it or test()",Test folder
```

---

## Anti-Patterns

- Proposing new patterns without checking existing (e.g., suggesting Redux when project uses Zustand)
- Creating duplicate components/hooks/utils when similar ones exist
- Using different file naming, import style, or error handling than adjacent code

---

## Session Context

If `.claude/session-context.toon` exists, read it first and skip redundant scans. Scan only when starting a workflow phase, creating a new file type, or when patterns are unclear.

---
