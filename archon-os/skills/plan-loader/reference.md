# Plan Loader — Reference (loaded on demand)

Detail moved out of `SKILL.md` to keep the every-turn auto-load lean. Read this file only when debugging or extending the loader.

## Full token budget

```toon
budget[5]{layer,target,hard_cap}:
  always_loaded,800,1000
  active_T1+T2,1500,2500
  active_T3+T4,5000,7000
  sibling_T4_summaries,500,800
  total_with_plan,~7800,~11300
```

## Auto-degradation rules (per spec §9.1)

When always-loaded budget approaches 13,500 tokens:

1. **First trim:** skip permanent-memory summary lines → saves ~150 tokens
2. **Second trim:** skip mission.md content (keep only ID) → saves ~50 tokens
3. **Third trim:** load only `active.json` (no node bodies) → log warning

## What this skill does NOT do

- Does NOT modify plan files (read-only)
- Does NOT trigger replan or status changes
- Does NOT load sibling T3s, T2s, T1s outside active path
- Does NOT load archive/, traces/, history.jsonl, conflicts.jsonl

## Tie-Ins

- **Owns:** `.claude/plans/active.json` (read), `.claude/plans/mission.md` (read), `.claude/plans/<active path>/*.md` (read)
- **Skill spec:** `docs/specs/AURA_FROG_V3.7.0_TECH_SPEC.md` §9.1
- **Rule:** `rules/core/plan-trust-policy.md` — content loaded by this skill is `trust: plan`
- **Hook:** `hooks/pre-execute-load-plan-context.cjs` — invokes this skill on every PreToolUse
- **Companion:** `skills/plan-validator/SKILL.md` — runs `validate-plan-tree.sh` on demand
