---
name: plan-archivist
description: "Compresses a completed plan-tree branch into .claude/plans/archive/{NODE_ID}.summary.md. Removes the original node files (preserved by checkpoint history). Reduces always-loaded surface area as features ship."
when_to_use: "/archon-os:plan-archive <NODE_ID> — invoked after a T2 (Feature) reaches status: done AND epic-summarizer has finished distilling"
allowed-tools: Read, Write, Glob, Bash
effort: medium
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Plan Archivist

**STATUS — v3.7.0-alpha.4.** Compression companion to `epic-summarizer`.

## Difference vs. epic-summarizer

| Concern | epic-summarizer | plan-archivist |
|---|---|---|
| Output | `.claude/memory/permanent_memory.md` (durable wisdom) | `.claude/plans/archive/{NODE_ID}.summary.md` (plan-tree compaction) |
| Scope | Cross-cutting decisions + gotchas | Per-branch summary: what shipped, with what AC, what tasks |
| Lifecycle | Survives reset | Survives reset |
| Token budget | ≤500/Epic, ≤8000 total | ≤300/branch, no global cap (one file per archived branch) |

epic-summarizer captures *what was learned*. plan-archivist captures *what was built*.

## Behavior

1. Detect: caller passed `<NODE_ID>` — must be T2 or T1, status `done`. Refuse otherwise.
2. **Read** the node + all descendants (Stories, Tasks).
3. **Compose** archive summary:
   - One-line intent
   - Children summary (id, status, AC count, completion date)
   - Acceptance criteria roll-up (passed/total per Story)
   - Total tasks (done/discarded/skipped)
   - Trace size + hallucination count (if traces exist)
4. **Write** `.claude/plans/archive/{NODE_ID}.summary.md`.
5. **Optional pruning** (only with `--prune` flag): remove the original Story/Task files (they're in checkpoints if needed). Refuse to prune if any descendant is not in `done` or `archived`.
6. **Update** parent's `children` list — replace pruned IDs with archive references.
7. **Append** `history.jsonl` event: `event: branch_archived`, with archive_path + pruned count.

## Pruning rules

- Default: keep originals — `--prune` is opt-in
- Always preserves `archive/{NODE_ID}.summary.md` even if pruning fails midway
- Never prunes the T1 Initiative or T0 Mission node (top-tier nodes accumulate, not archive-prune)

## Output schema (archive .summary.md)

```yaml
---
archived_id: FEAT-007
tier: 2
parent: INIT-001
archived_at: <ISO-8601>
archived_by: plan-archivist
status: archived
original_revision: 5
intent: "<one-line>"
acceptance_summary_pass_rate: "12/14 AC"
children_count: { stories: 3, tasks: 14, discarded: 1 }
trace_summary: { events: 287, hallucinations_flagged: 1, recovered: 1 }
---

# Archive — FEAT-007

<one-paragraph summary of what shipped>

## Stories

- ✓ STORY-0042 — JWT issuance (5/5 AC)
- ✓ STORY-0043 — Refresh flow (4/4 AC)
- ✓ STORY-0044 — Revocation (3/5 AC, 2 deferred to FEAT-009)

## Tasks (rolled up)

14 done, 1 discarded — see history.jsonl for per-task detail.

## Cross-references

- permanent_memory.md → "Epic: FEAT-007"
- checkpoints/FEAT-007.* preserved per checkpoint-discipline.md retention
```

## What this skill does NOT do

- Does NOT read or write `.claude/memory/` (that's epic-summarizer's lane)
- Does NOT delete checkpoints — those follow checkpoint-discipline.md retention
- Does NOT mutate node frontmatter on un-pruned nodes (only the `archived` status transition; revision++)
- Does NOT decompress an archive — restoration is via `/archon-os:plan-undo` against checkpoints

## Tie-Ins

- **Spec:** §9.4
- **Companion agent:** `epic-summarizer` — runs first; archivist runs after
- **Command:** `/archon-os:plan-archive` — only consumer
- **Hook:** `hooks/feature-done-trigger-archive.cjs` — invokes both summarizer + archivist on T2 done
- **Rule:** `rules/workflow/plan-lifecycle.md` — defines `archived` as terminal state
- **Rule:** `rules/workflow/checkpoint-discipline.md` — pruned nodes must have checkpoint history
