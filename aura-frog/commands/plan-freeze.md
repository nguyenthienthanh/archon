# /archon-os:plan-freeze

**Manually freeze a plan node, cascading to descendants.** Alias for `/archon-os:plan freeze <id>` (v3.7.2+).

---

## Usage

```
/archon-os:plan-freeze <NODE_ID> --reason "<text>"
/archon-os:plan-freeze <NODE_ID> --conflict <CONFLICT-ID>
/archon-os:plan-freeze --active --reason "..."
```

## Delegation

```bash
bash aura-frog/scripts/plans/freeze-branch.sh <ID> [--reason "..."] [--conflict <CID>] [--force]
```

The script:
1. Refuses on `done|archived|frozen`.
2. Walks descendants depth-first (per Tech Spec §13.1 — descendants only, NOT siblings, NOT ancestors).
3. Saves a checkpoint per touched node.
4. Sets `status: frozen` + `freeze_reason` + `frozen_at` on target; adds `frozen_by_ancestor: <NODE_ID>` on descendants.
5. Optional `conflict_id` links the freeze to a record in `conflicts.jsonl`.
6. Appends `history.jsonl event=freeze` with cascade list.

`--active` resolves to `active.task` via `resolve-node.sh --active`.

Companion: `/archon-os:plan thaw` (reverse), `/archon-os:plan conflicts list` (find blocker IDs).

Full protocol in `commands/plan.md`.

**Deprecation timeline:** soft-deprecated v3.7.2, warning v4.0, removed v5.0.
