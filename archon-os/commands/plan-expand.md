# /archon-os:plan-expand &lt;id&gt;

**Decompose a plan node one tier down** (T1→T2, T2→T3, T3→T4). Alias for `/archon-os:plan expand <id>` (v3.7.2+).

---

## Usage

```
/archon-os:plan-expand FEAT-A             # decompose Feature into Stories
/archon-os:plan-expand STORY-0042         # decompose Story into Tasks
/archon-os:plan-expand INIT-001           # decompose Initiative into Features
```

## Delegation

This file is a thin alias. Claude MUST translate the invocation to:

```bash
bash archon-os/scripts/plans/expand-node.sh <ID> [--dry-run] [--plans-dir <path>]
```

Then dispatch the appropriate agent (`feature-architect` for T1→T2, `story-planner` for T2→T3 or T3→T4) to write the child node files using the prepared checkpoint and counter. Full protocol in `commands/plan.md` and `skills/plan-orchestrator/SKILL.md`.

## Why an alias?

Backwards-compatible from pre-v3.7.2 — old muscle memory still works. New users should prefer `/archon-os:plan expand <id>` (consolidated form).

**Deprecation timeline:** soft-deprecated v3.7.2, warning v4.0, removed v5.0.
