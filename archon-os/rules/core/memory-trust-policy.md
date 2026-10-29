> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Memory Trust Policy

**Category:** Core
**Priority:** Critical
**Scope:** All sessions, all agents

---

## Purpose

Prevent context pollution and stale-state bugs by treating cached context as hints, not facts. Ensure memory is only updated after verified success.

---

## Part 1: Memory as Hint

All cached context — session state, project detection results, previous tool outputs, handoff data — is a **hint**, not a source of truth.

```toon
trust_policy[5]{rule,reason}:
  Before modifying any file: READ it first,File may have changed since last read
  Before claiming a test passes: RUN the test,Previous results may be stale
  If memory conflicts with actual file: FILE WINS,Update memory to match reality
  Never propagate unverified info via handoff,Downstream agents inherit bad assumptions
  Treat project detection cache as stale after edits,New files change detection results
```

### Verification Hierarchy

```toon
verification[4]{source,trust_level,action}:
  Current tool output (just ran),High,Act on it
  In-context data (this session),Medium,Verify if >5 turns old
  Session cache / MEMORY-INDEX,Low,Always verify before acting
  Memory from previous session,Lowest,Treat as starting point only
```

---

## Part 2: Strict Write Discipline

State files (workflow state, session cache, MEMORY-INDEX) are only updated **after** an action succeeds.

### Flow

```
1. Agent receives task
2. Agent executes task
3. IF success → verify output → update state → advance
4. IF failure → log reason → retry or escalate → DO NOT update state
```

### Anti-Patterns

```toon
antipatterns[4]{pattern,problem}:
  Update state BEFORE action completes,Pollutes state with unfinished work
  Mark "completed" without running tests,False positive propagates to next phase
  Copy-paste output into state without verification,Unverified claims become "facts"
  Update state on failure,Failed attempts clutter context
```

### Write-After-Verify Examples

```toon
examples[3]{action,verify_how,then_update}:
  Wrote new endpoint,Run tests + verify HTTP response,Mark task complete in workflow state
  Fixed a bug,Run failing test → confirm it passes,Update MEMORY-INDEX with fix
  Generated migration,Run migration → check schema,Log migration as applied
```

---

## Part 3: Context Retrieval Before Action

Before reading a file or fetching external data, check if you already have it:

```toon
retrieval_hierarchy[5]{source,cost,when}:
  MEMORY-INDEX pointer,0 tokens (already loaded),Check first — may have the answer
  In-context data,0 tokens (already in window),Check if read in last 5 turns
  Project files via grep/read,Variable tokens,When pointer or cache is stale
  MCP external call,Tokens + latency,When local data insufficient
  Ask user,1 turn + wait,Last resort
```

**Before reading a file, ask:**
- Do I already have this info in context? → Use it
- Do I need the whole file or just one function? → Grep first
- Did I read this file in the last 5 turns? → Reuse cached content

---

## Related

- `rules/core/verification.md` — Fresh verification before claiming done
- `rules/core/context-management.md` — Token optimization

---
