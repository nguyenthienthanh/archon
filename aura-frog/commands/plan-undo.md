# /archon-os:plan-undo

**Restore the latest checkpoint** (LIFO). Alias for `/archon-os:plan undo [<id>]` (v3.7.2+).

---

## Usage

```
/archon-os:plan-undo                 # active node (deepest non-null in active path)
/archon-os:plan-undo <NODE_ID>
/archon-os:plan-undo --dry-run       # preview
/archon-os:plan-undo --list          # list available checkpoints for the node
```

## Delegation

```bash
bash aura-frog/scripts/plans/undo-decision.sh [<NODE_ID>] [--dry-run] [--list] [--force]
```

The script:
1. Resolves target: explicit arg, else walks `active.{task,story,feature,initiative}` for deepest non-null.
2. Picks the latest `.claude/plans/checkpoints/<id>.<ISO8601>.json` (LIFO).
3. Restores the node body (base64-decoded from `node_state_before_b64`).
4. Moves the consumed checkpoint to `.consumed` so LIFO advances.
5. Appends `history.jsonl event=undo`.

Multi-step undo works — call again to undo further. Retention cap is 5 checkpoints per node (per `rules/workflow/checkpoint-discipline.md`).

**Not undoable:** trace/history appends (append-only by design), archived nodes (terminal), mutations older than the retention window.

Git-state rollback (the `git_sha` in each checkpoint) is recorded but NOT auto-restored — git resets are deferred to a follow-up that asks for explicit user confirmation; v3.7.2 ships the plan-only undo.

Full protocol in `commands/plan.md`.

**Deprecation timeline:** soft-deprecated v3.7.2, warning v4.0, removed v5.0.
