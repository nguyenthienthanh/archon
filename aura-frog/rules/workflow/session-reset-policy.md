> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Session Reset Policy

**Priority:** High
**Applies To:** epic-summarizer agent, /archon-os:reset-session command, feature-done-trigger-archive + session-reset-trigger hooks

---

## Core Principle

**An "Epic" (T2 Feature done) marks a natural session boundary. The Epic's durable wisdom is distilled into `permanent_memory.md`; the conversation context is cleanly reset. History is never erased — only the live conversation buffer is.**

This rule formalizes when reset triggers, what gets distilled, what's preserved, and the hard caps that keep memory from bloating.

---

## Triggers

```toon
triggers[3]{type,scope,frequency}:
  default,T2 (Feature) status: done,every Epic completion
  optional,T1 (Initiative) status: done,quarterly (rare)
  manual,/archon-os:reset-session command,user-initiated anytime
```

T2 done is the **default** trigger because Features are the natural unit of "we shipped something" — they have user-facing acceptance criteria and a clear boundary.

T1 done is optional because Initiatives span weeks; resetting at that scope is rare and usually only useful for quarterly retrospectives.

---

## Distillation rules (per spec §19.3)

| Include | Exclude |
|---|---|
| Architectural decisions (DEC-NNN with date, context, alternatives, rationale, outcome) | File contents — use `sha256:abc123 (path:lines)` references |
| Gotchas with reproduction steps | Tool output verbatim |
| Anti-patterns with bad-example references | Conversation transcripts |
| Patterns that worked | Step-by-step walkthroughs |
| Cross-cutting concerns | Personal preferences |
| Conflicts encountered (count + resolution paths) | > 500 tokens per Epic |

The exclude list is **non-negotiable**. epic-summarizer must reject content matching exclusion criteria, even if confidence is high.

---

## Hard caps (token budget)

```toon
caps[3]{scope,limit,enforcement}:
  per_epic_section,500 tokens,"epic-summarizer trims lowest-confidence first; if still over, escalates to user"
  total_permanent_memory,8000 tokens,"oldest Epic auto-moves to .claude/memory/archive/"
  archive_directory,unlimited,"user manually cleans"
```

When `permanent_memory.md` exceeds 8,000 tokens after a new section is appended:

1. Move the oldest Epic section (chronologically by `**Completed:**`) to `.claude/memory/archive/{ISO-date}.md`
2. Append `history.jsonl` event: `event: memory_archived`
3. Repeat until total ≤ 8,000

---

## Confidence-tiered output

epic-summarizer scores each item 0.0-1.0:

| Score | Interpretation | Placement |
|---|---|---|
| 1.0 | Direct quote from trace event or file_read | Main section |
| 0.7-0.99 | Inferred from grounded evidence | Main section (no flag) |
| <0.7 | Speculation or low-grounded | `### Tentative (low confidence — review)` subsection |

Items in the Tentative subsection are loaded by `permanent-memory-loader` ONLY in non-degraded mode (auto-degradation drops them first to free tokens).

---

## What's preserved across reset (per spec §19.5)

```toon
preserved[5]{path,reason}:
  .claude/plans/history.jsonl,"Single durable timeline — append-only audit"
  .claude/memory/permanent_memory.md,"Accumulates wisdom across Epics"
  .claude/plans/{mission,initiatives,features}/**,"Plan tree is persistent"
  .claude/plans/conflicts.jsonl + conflict_cache.jsonl,"Conflict knowledge persists"
  .claude/memory/manual_overrides.md,"User-curated; never touched by reset"
```

---

## What's reset

- Active conversation context (Claude's in-session buffer)
- In-flight task buffers (transient state in run-state.json that wasn't persisted)
- `active.task` pointer (cleared if its Story is the one being reset)
- Scratch files in `.claude/tmp/` (if any)

`active.feature` rolls forward to the next pending Feature in the plan tree; if none, it's cleared.

---

## Reset flow (per spec §19.4)

1. T2 transitions to `done` → `feature-done-trigger-archive` hook fires
2. Hook invokes epic-summarizer agent
3. epic-summarizer writes new section to `permanent_memory.md`
4. master-planner prompts user: "Distillation done. Reset session? (y/n)"
5. **On yes:** write `event: session_reset`, update `active.json`, emit reset control event
6. **On no:** continue current session (distillation stays — it's already written)

---

## Anti-patterns

- **Resetting before T2 reaches done** — distillation is meaningful only on completed Epics
- **Bloating permanent_memory beyond 8000 tokens** — caps exist for a reason; archive aggressively
- **Editing permanent_memory.md by hand** — use `manual_overrides.md` instead; manual edits to the auto-generated file get overwritten on next distillation
- **Skipping confidence scoring** — all distilled items must have a score; ungraded items default to <0.7 (Tentative)
- **Resetting on every Story done** — too granular; resetting at Story level loses cross-Story patterns

---

## Tie-Ins

- **Spec:** §19 (semantic session reset)
- **Agent:** `epic-summarizer` — sole writer of distilled output
- **Skill:** `permanent-memory-loader` — auto-loads the output across sessions
- **Skill:** `plan-archivist` — companion (compresses plan tree; this rule covers memory)
- **Command:** `/archon-os:reset-session` — user-initiated trigger
- **Hooks:** `feature-done-trigger-archive.cjs` (auto-trigger), `session-reset-trigger.cjs` (post-distillation prompt)
- **Rule:** `rules/core/memory-trust-policy.md` — defines `trust: file` for loaded memory content
- **Rule:** `rules/workflow/checkpoint-discipline.md` — distillation does NOT touch checkpoints (they have their own retention)
