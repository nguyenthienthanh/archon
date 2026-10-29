# /archon-os:plan-thaw

**Reverse a freeze.** Alias for `/archon-os:plan thaw <id>` (v3.7.2+).

---

## Usage

```
/archon-os:plan-thaw <NODE_ID>                       # thaw + cascade descendants
/archon-os:plan-thaw <NODE_ID> --partial             # node only; descendants stay frozen
/archon-os:plan-thaw <NODE_ID> --discard             # set status: discarded, not planned
/archon-os:plan-thaw <NODE_ID> --grant-replan-budget 1
```

## Delegation

```bash
bash aura-frog/scripts/plans/thaw-branch.sh <ID> [--partial] [--discard] [--grant-replan-budget N] [--force]
```

The script:
1. Refuses on non-`frozen` status.
2. If `conflict_id` is set on the node, looks up the latest record in `conflicts.jsonl`. If `resolution` is null/missing → refuses (blocker still active) unless `--force`.
3. Saves checkpoint per touched node.
4. Clears `freeze_reason` / `frozen_at` / `frozen_by_ancestor` fields and sets new status:
   - default → `planned`
   - `--discard` → `discarded`
5. Cascade-thaws descendants (unless `--partial`) — only those previously `frozen` get reset.
6. Optional `--grant-replan-budget N` adds N to the target's existing budget.
7. Appends `history.jsonl event=thaw` with cascade list.

Compatibility check (git diff vs blocker's recorded artifacts per Tech Spec §21.6) is best-effort; full integration with conflict-arbiter ships in a later milestone.

Companion: `/archon-os:plan freeze`, `/archon-os:plan replan`.

Full protocol in `commands/plan.md`.

**Deprecation timeline:** soft-deprecated v3.7.2, warning v4.0, removed v5.0.
