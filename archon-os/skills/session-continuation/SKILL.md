---
name: session-continuation
description: "Manage workflow state across sessions with handoff and resume. TOON-based state persistence."
autoInvoke: false
priority: high
model: haiku
triggers:
  - "handoff"
  - "save state"
  - "resume workflow"
  - "workflow:handoff"
  - "workflow:resume"
allowed-tools: Read, Write, Bash
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Session Continuation

Manage workflow state across sessions.

## Triggers

Token ≥75% → suggest handoff. User says handoff/save → execute. User says resume + name/ID → load.

## Handoff = one file per session, named after the session

`.claude/handoffs/<name>.{json,md}` — `<name>` = slug of the session title: `/rename` custom title → auto (ai) title → `session-<id8>`. Two sessions in one project never overwrite each other; a same-title clash gets `-<id8>`.

## Handoff Flow (user says `handoff`)

1. Run `node "${CLAUDE_PLUGIN_ROOT}/hooks/compact-handoff.cjs" --save --note "<done · next steps · decisions · blockers>"`. The session id comes from `AF_CLAUDE_SESSION_ID` (exported at SessionStart). The note is the part only you know — make it specific.
2. **Follow the project's plan.** The handoff records the plan tree anchor (`.claude/plans/active.json`, from the project root) and the project's own plan docs (`ROADMAP.md`, `*_PLAN.md`, `docs/*plan*`…). If one of those is the living plan, update it there — don't fork a second plan into the handoff.
3. **Code project** with an open `/run`: also keep `run-state.json` current (`current_phase`, `next_action`).
   **Non-code project** (no `.git`, no manifest): do **not** create `.claude/logs/runs/` or plan logs — the handoff file is the only state.
4. Output the name + resume command the script prints: `/run resume <name>` (or `claude --resume "<title>"`).

## Resume Flow (`/run resume <name>`)

1. `node "${CLAUDE_PLUGIN_ROOT}/hooks/compact-handoff.cjs" --show <name>` (accepts name, title or session id; `--list` for all).
2. Re-read the plan docs + run state it lists → verify file state → continue from the note / next action. Don't restart finished work.

## Auto-Save / Auto-Resume (hooks — no action needed)

`hooks/compact-handoff.cjs` saves the same per-session file automatically:

- **PreCompact** (manual + auto) → always saves.
- **Stop** → saves when context ≥ `AF_HANDOFF_THRESHOLD` (default 70%, read from the statusline's `.claude/cache/context-usage.json`); without statusline data, saves only while a run is open.
- **SessionStart** `compact`/`resume` of the **same session** → injects its handoff (auto snapshots are then deleted; manual ones stay). A **new** session only gets a list of named handoffs — never another session's context. `clear` → nothing.

Handoffs older than 14 days are pruned. Disable: `AF_COMPACT_HANDOFF_DISABLED=true`.

## TOON State Format (~160 tokens vs JSON ~600)

```toon
workflow:
  id: AUTH-1234
  phase: 3
  status: in_progress
agents[2]: architect,tester
```

## Error Handling

Not found → show available, suggest `/run`. Corrupted → restore from `.backup.json`.

## Cleanup

Completed: 30 days. Cancelled: 7 days. Paused: indefinitely.
