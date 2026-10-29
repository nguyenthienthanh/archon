# /archon-os:plan-next

**Return and activate the next ready T4 task.** Alias for `/archon-os:plan next` (v3.7.2+).

---

## Usage

```
/archon-os:plan-next
```

## Delegation

```bash
bash archon-os/scripts/plans/next-task.sh [--plans-dir <path>] [--dry-run]
```

The script collects T4 children of the active T3 with `status: planned` AND all `depends_on` in `{done, active}` — from `graph-index.json` when the project has one and it is fresh, otherwise by rescanning the task files (always correct, just slower; `next-task.sh --rebuild` regenerates the index). It picks the first, mutates it to `status: active` under the dispatch lock, sets `active.task`, and appends `history.jsonl {"verb":"next"}`.

Then surface to the user: `Next ready: <TASK-ID> (<intent>). To execute: /archon-os:run <one-line description> — auto-anchors via the Run ↔ Plan bridge.`

Full protocol in `commands/plan.md`. Frozen tasks are excluded — thaw via `/archon-os:plan thaw` first.

**Deprecation timeline:** soft-deprecated v3.7.2, warning v4.0, removed v5.0.
