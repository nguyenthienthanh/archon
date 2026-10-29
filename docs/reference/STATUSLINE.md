---
last_aligned_with: v3.8.0-alpha.10
status: reference
audience: contributor
---

# Status Line Spec

The status line is owned end-to-end by `scripts/statusline.sh` and costs **0 conversation tokens** — Claude never renders it. This doc is the full rendering reference (moved out of `archon-os/CLAUDE.md` so it stops costing always-on context). `archon-os/CLAUDE.md` keeps only the one-line directive: *do not render banners in conversation.*

Format (v3.8.0-alpha.4+): **multi-line**, owned end-to-end by `scripts/statusline.sh`:

```
➜  aura-frog  git:(main) ✗3 ↑1              🕐 14:32
🐸 AF v3.8.0-alpha.6 │ deep P3 │ architect
Opus 4.8 │ 12% ctx
⏳ 5h 37% ↻14:40 │ 7d 4% ↻Wed 22:00
💰 $1.23 │ +342/-87 │ ⏱ 32m 5s │ cc 2.1.16      ← opt-in (AF_STATUSLINE_COST=1)
```

- **Line 1** — `{dir}  git:({branch}) {✓ clean | ✗N changed} {↑ahead} {↓behind}` + `🕐 HH:MM`. Git calls guarded (non-git cwd skips them) and degrade silently.
- **Line 2** — `🐸 AF v{version} │ {mode} {step} │ {agent}`.
  - **mode** — from `run-state.json#flow` (bugfix / deep / standard / quick / refactor / test / project / security / review / deploy / quality). `idle` when no active run.
  - **step** — `P{N}` for 5-phase Deep runs (`current_phase`), `S{N}` for bugfix's 4-step TDD (`current_step`). Omitted for quick/idle.
  - **agent** — `run-state.json#active_agent`, updated by run-orchestrator at every dispatch.
- **Line 3** — `{model} │ {ctx}% ctx`. Splitting AF across lines 2–3 avoids single-line truncation on narrow terminals.
- **Usage line** — `⏳ 5h {pct}% ↻{reset} │ 7d {pct}% ↻{reset}` from `rate_limits.{five_hour,seven_day}`. % color-coded (red ≥90 · yellow ≥70 · green); reset = local time. Subscribers only, after the first API response — hidden otherwise. Disable: **`AF_STATUSLINE_USAGE=0`**.
- **Cost line (opt-in)** — session metrics. Cost was removed from the always-on line in v3.7.4 ("noise without per-call breakdown"); re-add it by setting **`AF_STATUSLINE_COST=1`** (only renders when the data is present). Or use `/af status` for a richer report.

The `~/.claude/statusline-command.sh` shim is now a thin pass-through (the prefix logic lives in the plugin).

Auto-refresh: 30s (set `refreshInterval` in settings). Setup: `/project sync`.
