# /archon-os:reset-session

**Distill the active Epic (T2 Feature) into permanent_memory and offer to start a fresh session.** Preserves history.jsonl, plan tree, conflict cache.

---

## Usage

```
/archon-os:reset-session                       # default: distill active Feature, prompt to reset
/archon-os:reset-session --feature FEAT-007    # explicit feature ID (overrides active)
/archon-os:reset-session --initiative INIT-001 # rare — distill at T1 level (quarterly use)
/archon-os:reset-session --dry-run             # show what would be distilled without writing
/archon-os:reset-session --no-prompt           # skip the reset confirmation (distill only)
```

## Protocol (imperative)

1. **Resolve target.** If `--feature` given, use it. Else read `.claude/plans/active.json` and pick `active.feature`. Refuse if neither (no active feature → nothing to distill).
2. **Validate target status.** Refuse if status is not `done` or `archived`. Reset only triggers on completed Epics (per spec §19.1).
3. **Refuse if epic-summarizer already ran.** Check `history.jsonl` for `event: epic_summarized` matching this feature_id with `revision >= current.revision`. If found, surface "already distilled" and skip to step 6 (reset prompt).
4. **Invoke epic-summarizer agent** via Agent dispatch. Pass: feature_id, prior permanent_memory.md state, trace files for the feature's tasks.
5. **Wait for distillation completion.** epic-summarizer writes the new section to `.claude/memory/permanent_memory.md` and appends `event: epic_summarized` to history.jsonl.
6. **Show distilled section** to the user (preview only — file is already written).
7. **Prompt: reset session?** unless `--no-prompt`. Show what's preserved vs. what's reset:
   - **Preserved:** history.jsonl, permanent_memory.md, plan tree, conflict cache, manual_overrides.md
   - **Reset (cleared):** active conversation context, in-flight task buffers, scratch files
8. **On user `y` / `yes` / `reset`:**
   - Append `event: session_reset` to history.jsonl
   - Update `.claude/plans/active.json` — clear `active.task` (and `active.story` if its parent feature was the one distilled), preserve `active.feature` set to next pending Feature if any
   - Emit a control event hint to the runtime (e.g., suggest `/clear` or new session start)
9. **On user `n` / `no` / silence:**
   - Distillation stays (it's already written); only the reset is skipped
   - Append `event: session_reset_declined` to history.jsonl

## What's NOT reset (per spec §19.5)

- `.claude/plans/history.jsonl` — single durable timeline
- `.claude/memory/permanent_memory.md` — accumulates wisdom across Epics
- Plan tree files (`.claude/plans/{mission,initiatives,features}/`) — persistent
- `.claude/plans/conflicts.jsonl` and `conflict_cache.jsonl` — persistent
- `.claude/memory/manual_overrides.md` — user-curated; never touched

## Dry-run mode

`--dry-run` skips steps 4-9. Shows:
- Which feature would be distilled
- Estimated token count of new permanent_memory section
- Files that WOULD be appended to (paths only)

Useful for previewing before a real distillation.

## Failure modes

| Failure | Behavior |
|---|---|
| epic-summarizer fails (timeout, write error) | History event `event: epic_summarize_failed`; no reset prompt; user runs again later |
| permanent_memory.md exceeds 8,000 tokens | Oldest Epic section auto-moved to `.claude/memory/archive/` per session-reset-policy |
| Active feature not in `done` status | Refuse; suggest `/archon-os:plan-status` to see why |
| No `.claude/plans/` exists | Refuse with hint: "no plan tree; nothing to distill" |

## Tie-Ins

- **Spec:** §10.3, §19 (semantic session reset)
- **Agent:** `epic-summarizer` — only producer of distilled output
- **Skill:** `permanent-memory-loader` — auto-loads the new section in subsequent sessions
- **Rule:** `rules/workflow/session-reset-policy.md` — defines triggers, distillation rules, what's preserved
- **Hook:** `hooks/session-reset-trigger.cjs` — auto-fires this command on T2 done (with user prompt)
- **Companion command:** `/archon-os:plan-archive` — compresses the plan tree branch (separate concern from memory distillation)
