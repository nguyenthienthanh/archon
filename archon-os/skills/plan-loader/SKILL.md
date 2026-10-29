---
name: plan-loader
description: "Loads minimum hierarchical plan context (.claude/plans/) for current execution focus. Auto-invokes every session when plans exist. Stays under 800 always-loaded tokens regardless of plan tree size."
autoInvoke: true
when_to_use: "Every Claude turn when .claude/plans/ exists in project; loads mission + active node + ancestors only"
allowed-tools: Read, Glob, Bash
effort: low
user-invocable: false
---

# Plan Loader

Provides minimum plan context for the hierarchical planning system. Read-only.

## Behavior (in order)

1. **Detect:** if `.claude/plans/` does NOT exist → exit silently
2. **Read** `.claude/plans/active.json` — current focus pointer
3. **Load mission.md** (T0) if it exists
4. **Load active T1 → T2 → T3 → T4** per `active.*` pointers; for the active T3 also load sibling T4 summaries (id + intent + status only)
5. **Stamp** loaded nodes `trust: plan` per `rules/core/plan-trust-policy.md`

## Budget

Always-loaded target 800 tokens (hard cap 1000). Never loads siblings outside the active path, archive/, traces/, history.jsonl, or conflicts.jsonl; never mutates plan files.

## Detection one-liner

```bash
[ -f .claude/plans/active.json ] && echo "plan-active" || echo "no-plan"
```

**Detail (full budget table, degradation rules, tie-ins):** `skills/plan-loader/reference.md` — load on demand only.
