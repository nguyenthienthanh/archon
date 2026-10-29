> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Observer Agent — Runtime Loop & Budget Watchdog

**Priority:** HIGH
**Applies To:** All active workflows, all phases (advisory during Quick/Standard, enforced during Deep)

---

## Core Principle

**A distinct "observer" role watches execution for loops, budget overruns, and stuck agents. The observer's only job is to notice problems — not to do the work.**

The `lead` agent plays observer by default. No separate agent file needed; this is a role, not a process.

---

## What the Observer Watches

| Signal | Threshold | Action |
|--------|-----------|--------|
| Same agent called ≥ 3× this phase | per `rules/core/recursion-limit.md` | Pause + flag |
| Token budget > 85% of session cap | per `rules/workflow/token-time-awareness.md` | Suggest handoff |
| Phase duration > 2× estimate | — | Ask user if stuck |
| Tests fail after refactor in P4 | per `rules/core/tdd-workflow.md` | Auto-stop per orchestrator rule |
| Agent makes same tool call twice with identical args | per `rules/core/recursion-limit.md` | Flag cache/loop |
| No progress after 3 retries of same operation | — | Escalate to user |
| Workflow state divergence (runs/ path drift) | — | Emit warning, fall back to legacy |

---

## When the Observer Speaks

The observer is **silent by default** — just accumulates signals. It speaks when:

1. A threshold is breached (auto-stop or pause)
2. User types `/run status` (observer reports what it's seen)
3. A phase transition happens (quick health check)
4. A handoff is prepared (observer summarizes anomalies)

Silence between triggers is correct behavior. Chatty observer = noise.

---

## Observer's Log (in workflow state)

Every run carries an `observations[]` array in `run-state.json`:

```json
{
  "observations": [
    {"t": "18:32:05", "phase": 3, "level": "info", "msg": "architect invoked 2/3"},
    {"t": "18:41:12", "phase": 3, "level": "warn", "msg": "token 78% — pacing normal"},
    {"t": "18:47:30", "phase": 4, "level": "block", "msg": "same Bash twice — loop risk"}
  ]
}
```

User can review with `/run status --detailed`.

---

## Not a Separate Agent

- No `agents/observer.md` file
- `lead` agent plays this role when orchestrating
- When `lead` is busy (e.g., dispatching Phase 3), the observation role is embedded in the orchestrator skill itself
- This avoids recursion (observer observing observer)

**Exception:** Agent Teams mode may spin up a dedicated observer teammate — documented in `docs/guides/AGENT_TEAMS_GUIDE.md`.

---

## Why Not a Live Process

A true runtime observer would need:
- Live stdio monitoring of the Claude Code session
- Separate async context with shared state
- Hooks on every tool call

This is over-engineered for what we need. The orchestrator-as-observer pattern is 90% of the value at 5% of the complexity.

---

## Tie-Ins

- `rules/core/recursion-limit.md` — observer enforces these limits
- `rules/workflow/token-time-awareness.md` — observer watches budget
- `skills/run-orchestrator/SKILL.md` — orchestrator plays observer role
- `skills/session-continuation/SKILL.md` — handoff includes observer log
- `rules/workflow/workflow-navigation.md` — observer reports at phase transitions
