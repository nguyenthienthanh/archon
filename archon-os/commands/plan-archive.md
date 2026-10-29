# /archon-os:plan-archive &lt;id&gt;

**Compress a completed branch.** Alias for `/archon-os:plan archive <id>` (v3.7.2+).

---

## Usage

```
/archon-os:plan-archive FEAT-005
/archon-os:plan-archive INIT-001 --summary-text "..."
/archon-os:plan-archive FEAT-005 --force
```

## Delegation

```bash
bash archon-os/scripts/plans/archive-feature.sh <ID> [--summary-text "..."] [--force]
```

The script:
1. Refuses on non-`done` target status.
2. Walks descendants — refuses unless all are in `{done, discarded, archived}` (override with `--force`).
3. Writes `.claude/plans/archive/<id>.summary.md` (frontmatter + stats + node-list body).
4. Copies originals to `.claude/plans/archive/<id>.original/` (audit trail).
5. Sets target to `status: archived`, bumps revision.
6. Appends `history.jsonl event=archive`.

The `epic-summarizer` agent (Milestone C+) may be dispatched in lieu of inline `--summary-text` for richer summaries. T2 archival triggers session-reset prompt per Tech Spec §19 (Milestone C+).

Full protocol in `commands/plan.md`. Archive is one-way; `archived → *` is a forbidden state transition.

**Deprecation timeline:** soft-deprecated v3.7.2, warning v4.0, removed v5.0.
