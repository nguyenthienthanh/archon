# /archon-os:plan-conflicts

**Inspect, resolve, audit plan-tree conflicts.** Alias for `/archon-os:plan conflicts <sub>` (v3.7.2+).

---

## Usage

```
/archon-os:plan-conflicts list                  # all (open + resolved)
/archon-os:plan-conflicts list --open
/archon-os:plan-conflicts show <CONFLICT-ID>
/archon-os:plan-conflicts resolve <CONFLICT-ID> <choice>
/archon-os:plan-conflicts history
/archon-os:plan-conflicts check                 # run L1+L2 detector against active.task
```

`<choice>`: `accept-proposed | accept-blocker | sequential | freeze-both | escalate`.

## Delegation

```bash
bash aura-frog/scripts/plans/conflicts-scan.sh <list|show|resolve|history|check> [args...]
```

The script:
- **list** — folds `conflicts.jsonl` per `conflict_id` (latest record wins), optionally filtered by `--open` (records with no `resolution`).
- **show** — prints every record matching `conflict_id`.
- **resolve** — appends a new record with the user's choice + writes `history.jsonl event=conflicts.resolve`. Validates choice against the allowed set.
- **history** — dumps `conflicts.jsonl` raw.
- **check** — runs the `conflict-detector` skill for on-demand L1+L2 detection (Tier-1 per Tech Spec §21); the `pre-dispatch-conflict-check.cjs` hook performs the same automatically before each dispatch.

Full per-choice mutation semantics (accept-proposed discards blocker, sequential sets `depends_on`, freeze-both cascades, etc.) are documented in `commands/plan.md` and the Tech Spec §21.5.

**Deprecation timeline:** soft-deprecated v3.7.2, warning v4.0, removed v5.0.
