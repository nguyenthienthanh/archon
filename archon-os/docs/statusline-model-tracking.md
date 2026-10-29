---
title: Statusline Per-Step Model Tracking
audience: developers
status: active
last_aligned_with: 3.7.4
---

# Per-Step Model Tracking in the Statusline

## Why

Archon OS routes work to subagents via per-agent `model:` frontmatter
(`archon-os/agents/<id>.md`). When the main session runs Opus and dispatches
a Sonnet subagent through the `Task` tool, the statusline previously kept
showing the session model — there was no signal that the cheaper/faster
model was actually doing the work. This makes cost and latency reasoning
harder and erodes trust in the routing.

This doc explains the small fail-open mechanism added in v3.7.4 follow-up
that surfaces the per-step model on the statusline.

## How it works

```
┌──────────────┐  push   ┌────────────────────────────┐   read tail
│ PreToolUse   │ ──────▶ │ .aura-frog/runtime/        │ ─────────────▶ ┌──────────────┐
│ matcher:Task │         │ model-stack.jsonl (JSONL)  │                │ statusline.sh │
└──────────────┘         └────────────────────────────┘                └──────────────┘
        │                          ▲                                           │
        │                          │ pop last line                             │
        ▼                   ┌──────┴──────┐                                    │
   read frontmatter         │ PostToolUse │ ◀──────────────────────────────────┘
   from agents/<id>.md      │ matcher:Task│        (renders ▶ phase + step model
                            └─────────────┘         when stack is non-empty)
```

1. `archon-os/hooks/task-track-model.cjs` fires on every `PreToolUse(Task)`.
   It resolves the agent file, parses `model:` from frontmatter, maps the
   value to a short label (e.g. `claude-sonnet-4-6 → Sonnet 4.6`), and
   appends one JSONL line to the stack.
2. `archon-os/scripts/statusline.sh` reads `tail -n 1` of the stack on
   every render. When non-empty, it switches from the idle format to:
   `🦉 AF v{ver} │ ▶ {phase} │ {step_model} ⏱{duration} │ session: {session_model} │ {ctx}% ctx`.
3. `archon-os/hooks/task-clear-model.cjs` fires on `PostToolUse(Task)` and
   pops the most-recent line. When the stack is empty, the file is removed.

The stack is a JSONL list (not a single field) because `Task` calls can
nest — an agent dispatched via Task can itself dispatch another Task. The
JSONL form lets `tail -n 1` always find the active model and `sed '$d'`
unwind correctly.

## State location

`.aura-frog/runtime/model-stack.jsonl` — gitignored via
`.aura-frog/runtime/.gitignore`. Per-machine, per-session. Override the
path for tests with `AF_MODEL_STACK_FILE`.

## Disable temporarily

```bash
chmod -x archon-os/hooks/task-track-model.cjs archon-os/hooks/task-clear-model.cjs
```

The statusline gracefully falls back to the idle format if the stack file
is missing, empty, or has a malformed last line. Removing the hooks does
not break Task dispatch — they are async and fail-open by design (they
always exit 0; errors go to stderr only).

## Extend

- **Add custom model labels:** edit the family/version regex in
  `mapModelDisplay()` inside `task-track-model.cjs`. Unknown providers
  pass through as-is.
- **Add phase enrichment from run-state.json:** the pre-hook can read
  `.claude/logs/runs/<latest>/run-state.json#current_phase` and store a
  `phase_number` field on the entry, then have the statusline render
  `▶ P3 code-reviewer` instead of just `▶ code-reviewer`.
- **Cap stack depth:** add a length check in `pushStackEntry` if you
  worry about runaway nested dispatches. Today's Task dispatch surface
  has no realistic case for this.
