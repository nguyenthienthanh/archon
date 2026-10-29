> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Checkpoint Discipline

**Priority:** High
**Applies To:** master-planner before any plan-tree mutation; `/archon-os:plan-undo` consumer

---

## Core Principle

**Every plan-tree mutation is preceded by a checkpoint snapshot. `/archon-os:plan-undo` restores the latest checkpoint.**

Reversibility is not optional — it's the safety net that lets master-planner make autonomous decisions in Milestone B+.

---

## When to checkpoint

Before applying any of these mutations:

1. Status transition that changes more than `frontmatter.updated_at` (e.g., `planned → active`, `active → frozen`)
2. `revision` increment caused by content edit
3. Children list reorder, add, or remove
4. Replanner-applied proposals
5. `/archon-os:plan-archive` runs (Milestone C)
6. `/archon-os:plan-promote` tier change

NOT checkpointed (cosmetic):

- Trace/history append-only writes (no rollback semantics)
- Reading nodes (no mutation)
- Counter increments in `.counters.json`

---

## Checkpoint format

Writer: `save_checkpoint` in `scripts/plans/_lib.sh` (v3.7.3+ co-located layout).

Path: `<node_folder>/checkpoints/<ISO-8601-with-dashes>.json` — e.g.
`features/FEAT-A_auth/stories/STORY-0007_login/tasks/TASK-00101_form/checkpoints/2026-04-29T14-30-00Z.json`.
The filename is the timestamp only; the node identity lives inside the JSON.
Fallback for nodes whose file path can't be resolved (rare — archived/orphan):
`.claude/plans/checkpoints/{NODE_ID}_legacy/<ISO>.json`.
(Pre-v3.7.3 checkpoints were flat: `.claude/plans/checkpoints/{NODE_ID}.{ISO}.json` — read-only legacy.)

```json
{
  "schema_version": 1,
  "node_id": "TASK-00101",
  "node_file": ".claude/plans/features/.../tasks/TASK-00101_form/task.md",
  "saved_at": "2026-04-29T14:30:00Z",
  "git_sha": "abc123def",
  "node_state_before_b64": "<base64 of the entire node file (frontmatter + body)>"
}
```

The node's pre-mutation state is one opaque base64 blob (`node_state_before_b64`) — there is no parsed frontmatter/body split, no sibling or parent snapshot, and no branch/dirty flags.

**git_sha tracking** (per spec §17.1): every checkpoint records the current `HEAD` sha at capture time. This lets `/archon-os:plan-undo` (and the conflict-rescan compatibility check) diff what actually changed while the node was active.

---

## Retention

```toon
retention[3]{rule,limit}:
  per_node,5,"keep last 5 checkpoints per node"
  age_cap,30 days,"checkpoints older than 30 days are pruned"
  size_cap,50 MB,"all checkpoints/ dirs under .claude/plans/ total"
```

Pruning runs in `/archon-os:plan-archive` (lazy, not a daemon) via the `plan-archivist` skill — checkpoint compression is part of branch archival; there is no standalone prune script.

---

## Restore semantics

`/archon-os:plan-undo {NODE_ID}` (or defaulting to the deepest active node) — implemented by `scripts/plans/undo-decision.sh`:

1. Find latest `<node_folder>/checkpoints/*.json` (lexicographic max — ISO timestamps sort correctly); fall back to the legacy flat `.claude/plans/checkpoints/{NODE_ID}.*.json`
2. Refuse if no checkpoint found → "no checkpoint for {NODE_ID}"
3. Decode `node_state_before_b64` and atomically replace the file at `node_file`
4. Rename the consumed checkpoint to `*.json.consumed` so repeated undo advances LIFO
5. Validate the tree (`require_no_regression`); refuse on regression
6. Append history.jsonl: `{"verb":"undo","target":...,"checkpoint_consumed":...}`

---

## Multi-step undo

Each `/archon-os:plan-undo` restores ONE checkpoint. To undo further, the user runs `/archon-os:plan-undo` again (LIFO order). After 5 undos (the retention cap), older checkpoints are gone.

---

## Anti-patterns

- **Checkpointing on every read** — only mutations need checkpoints (read-mostly is huge — would explode storage)
- **Mutating without checkpoint** — master-planner MUST checkpoint first; tested in invariant-CI (Milestone E)
- **Restoring across `archived` boundary** — archived nodes don't restore (they're terminal)
- **Hand-editing checkpoint JSON** — never; it's an opaque dump

---

## Failure modes

| Failure | Behavior |
|---------|----------|
| Disk full when writing checkpoint | Refuse mutation; emit `event: checkpoint_failed` |
| Checkpoint JSON corrupt at undo time | Try previous checkpoint; if all corrupt, refuse and escalate |
| Multiple concurrent mutations on same node | First-writer-wins via .counters.json lock; second is rejected |

---

## Tie-Ins

- **Spec:** §11.3 (checkpoint), §15 (storage)
- **Agent:** `master-planner` — only writer of checkpoints
- **Command:** `/archon-os:plan-undo` — only consumer
- **Rule:** `rules/workflow/replan-thresholds.md` — replan-triggered checkpoints
- **Rule:** `rules/workflow/plan-lifecycle.md` — status-transition triggered checkpoints
- **Command:** `/archon-os:plan-archive` — checkpoint pruning + branch compression (via the `plan-archivist` skill)
