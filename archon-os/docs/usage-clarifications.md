# Usage Clarifications — AI Reference

**Format:** TOON | **Human version:** `docs/getting-started/GET_STARTED.md` (repo root)

---

## Hook Types

```toon
hook_types[2]{type,format,execution}:
  Runtime,.cjs files,Executed by Claude Code hook system (hooks.json) — real Node.js scripts
  Conceptual,.md files,Instructions Claude reads and implements during workflows
```

## Workflow Mode Selection

```toon
modes[4]{mode,command,when,phases}:
  Full workflow,workflow:start,New features + complex bugs + architecture + production code,All 5 phases + 2 gates
  Quick fix,bugfix:quick,Simple bugs with clear cause,Grouped phases — 1 gate
  Refactor,refactor,Code cleanup + improvements,Analysis → plan → test → refactor → verify
  Planning only,planning,Think through task without implementing,Creates plan — no code
```

## Mode Auto-Selection

```toon
routing[3]{trigger,mode,reason}:
  Typo/config/simple,bugfix:quick or direct edit,Minimal overhead
  Feature/bugfix/standard,workflow:start or bugfix:quick,Structured TDD
  Multi-file architecture,Full 5-phase + collaborative planning,Maximum rigor
```

## Log Structure

```toon
logs[5]{dir,purpose}:
  .claude/logs/runs/{id}/,Workflow state + deliverables (was workflows/ pre-3.7)
  .claude/logs/documents/,Generated documentation
  .claude/logs/plans/,Saved execution plans
  .claude/logs/reviews/,Code review reports
  .claude/logs/metrics/,Token usage + performance data
```
