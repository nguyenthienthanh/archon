# /archon-os:trace

**Render the reasoning trace for a task** — file_reads, output_claims, tool_calls, decisions. Surfaces hallucinations (claims with `grounded: false`).

---

## Usage

```
/archon-os:trace <TASK_ID>                          # full trace, table format
/archon-os:trace <TASK_ID> --filter file_read       # one event type only
/archon-os:trace <TASK_ID> --hallucinations         # only output_claim events with grounded:false
/archon-os:trace <TASK_ID> --tail 50                # last N events
/archon-os:trace <TASK_ID> --since 2026-04-29T12:00:00Z
/archon-os:trace --active                            # use the active.task from .claude/plans/active.json
```

## Protocol

1. **Resolve** TASK_ID. If `--active`, read `.claude/plans/active.json` → `active.task`. Refuse if no active task.
2. **Locate the trace file.** Since v3.7.3 the trace is co-located with the task, so resolve the task folder first and only then fall back to the legacy flat path — the same order `resolveTracePaths()` in `hooks/tool-call-tracer.cjs` uses, which is what both writers (`tool-call-tracer.cjs` and `tdd-red-failure-tracker.cjs`) follow:
   1. Find the task folder: the directory under `.claude/plans/features/*/stories/*/tasks/` whose `task.md` frontmatter has `id: {TASK_ID}`. If found → read `{taskFolder}/trace.jsonl`.
   2. Otherwise → read the legacy `.claude/plans/traces/{TASK_ID}.jsonl`.
   3. If neither exists → exit with message "no trace yet for {TASK_ID}".

   Read only the first location that exists; do not merge the two. A legacy file alongside a task folder is a pre-v3.7.3 leftover, and reporting it as the live trace would show a stale event stream.
3. **Parse** each line as JSON. Filter by `--filter` and `--since` flags.
4. **Render table** (columns: ts, event_id, type, summary). For long payloads (>80 chars), truncate with `…`.
5. **Halluciation summary**: count of `output_claim` with `grounded:false`. If > 0 in non-`--hallucinations` mode, print: `⚠️  N potential hallucinations — re-run with --hallucinations to see them`.
6. **Storage warning**: if trace file > 10 MB or > 1000 events → suggest `/archon-os:plan-archive` (Milestone C).

## Output format

Event ids are `TR-{TASK_ID with non-alphanumerics as dashes}-{NNN}`, numbered from the sibling counter file (`.trace.count`) next to the trace.

```
TR-TASK-00101-001  2026-04-29T14:32:00Z  file_read     src/auth/jwt.ts (sha256:abc…)
TR-TASK-00101-002  2026-04-29T14:32:01Z  tool_call     Read({path: "src/auth/jwt.ts"})
TR-TASK-00101-003  2026-04-29T14:32:01Z  tool_result   exit=0 duration=12ms
TR-TASK-00101-004  2026-04-29T14:32:05Z  output_claim  "exports verifyToken" grounded:✓ (by TR-TASK-00101-001)
TR-TASK-00101-005  2026-04-29T14:32:08Z  output_claim  "uses HS256 algorithm" grounded:✗

Summary: 5 events | 2 file_reads | 2 output_claims | 1 hallucination flagged

⚠️  1 potential hallucination — re-run with --hallucinations to see them
```

## --hallucinations mode

Prints only `output_claim` events where `grounded == false`. For each, shows:
- The unsupported claim text
- The closest matching file_read events (Levenshtein distance on path/symbol)
- A pointer to grounding-discipline rule

## Constraints

- Read-only — never mutates trace files
- Exits 0 if trace file is missing (not an error; just no trace yet)
- Exits 1 if `--active` and no active task is set
- Limits output to `--tail 200` by default; full trace rendered only on `--all`

## Tie-Ins

- **Spec:** §10.3, §11.1 (grounding-discipline)
- **Skill:** `reasoning-trace-recorder` — produces the .jsonl files
- **Rule:** `rules/core/grounding-discipline.md` — defines what counts as "grounded"
- **Hook:** `hooks/tool-call-tracer.cjs` — owns `resolveTracePaths()`/`nextEventId()`; appends tool_call/tool_result/file_read events
- **Hook:** `hooks/tdd-red-failure-tracker.cjs` — appends P2_RED `decision` events to the same file via that resolver
- **Companion command:** `/archon-os:plan-status` — high-level plan view
