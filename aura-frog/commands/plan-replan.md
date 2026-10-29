# /archon-os:plan-replan &lt;id&gt;

**Force replan of a node and all descendants.** Alias for `/archon-os:plan replan <id>` (v3.7.2+).

---

## Usage

```
/archon-os:plan-replan TASK-00101
/archon-os:plan-replan STORY-0042 --reason "design pivot"
/archon-os:plan-replan FEAT-A --avoid src/legacy
```

## Delegation

```bash
bash aura-frog/scripts/plans/replan-node.sh <ID> [--reason "..."] [--avoid <path-or-id>] [--force]
```

The script:
1. Refuses on `replan_count >= replan_budget` unless `--force`.
2. Saves a per-node checkpoint.
3. Marks all descendants `status: discarded` (preserves IDs).
4. Bumps target's `revision` + `replan_count`, records `last_replan_at` / `last_replan_reason`.
5. Appends `history.jsonl event=replan`.

The caller (or `replanner` agent in Milestone B+) is then responsible for proposing the new subtree shape.

Full protocol in `commands/plan.md`. Cannot replan `done|archived` — use `/archon-os:plan undo` first if you need to revert.

**Deprecation timeline:** soft-deprecated v3.7.2, warning v4.0, removed v5.0.
