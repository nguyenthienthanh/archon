> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Recursion Limit — Break Loops Early

**Priority:** CRITICAL
**Applies To:** All agent-spawning code paths, all workflow phases, all skill invocations

---

## Core Principle

**Hard caps prevent infinite loops, runaway token consumption, and accidental DoS of the session.**

---

## The Limits

| Dimension | Cap | Rationale |
|-----------|:---:|-----------|
| **Agent-spawn depth** | ≤ 3 | Lead → architect → sub-architect is already too deep |
| **Same agent called per phase** | ≤ 3 times | More = infinite-loop smell or thrash |
| **Same skill invoked per phase** | ≤ 5 times | Generous cap — skills are cheap but not free |
| **Retry count per failed operation** | ≤ 3 | 3 strikes → stop and ask user |
| **Rejection count per approval gate** | ≤ 3 | After 3 rejections, pause for redesign (not loop) |
| **Same tool call with same args** | ≤ 2 | Second identical call = clear caching/loop signal |

---

## What Counts as a "Loop"

- Agent A spawns agent B; B spawns A back (mutual recursion)
- Same skill fires twice on same input with no state change
- Retry-on-failure that doesn't analyze the failure (just reruns)
- Approval reject → redo → reject → redo → (no learning between attempts)
- Tool call in phase 3 that was already made in phase 1 without new context

---

## Enforcement

### At the orchestrator level (`run-orchestrator` skill)

Before spawning any agent, check:

1. **Depth:** Is current depth + 1 > 3? → refuse, escalate to user
2. **Same-agent count:** Has this agent been called ≥ 3 times in current phase? → refuse, flag
3. **Budget:** Is projected token use still under cap? → per `rules/workflow/token-time-awareness.md`

### At the skill/agent level

- Before recursing, explicitly log the intent: "I'm calling X again because Y changed."
- If "Y changed" is empty → stop, ask user.

### At the hook level (if implemented)

`hooks/recursion-guard.cjs` (future): counts spawn depth via env var `AF_AGENT_DEPTH`. Refuses spawn at depth > 3. Plugin-level backstop.

---

## On Hit — What to Do

When a limit is reached:

1. **Stop immediately** — do not make the next call
2. **Report clearly:** `"Recursion limit hit: agent X called 3× in phase 2. Last inputs were identical. Suspected loop. Pausing."`
3. **Diagnose:** present the user with the repeating pattern
4. **Ask:** is this a loop, or is there a legitimate reason to recurse further? If legitimate, user can say `allow: <item>` to bypass once.

---

## Why These Specific Numbers

- **Depth 3:** Deep enough for nested delegation (lead → architect → reviewer), not deep enough for runaway trees
- **3 same-agent calls:** TDD cycle is RED→GREEN→REFACTOR = 3 phases of the same agent (tester). More than 3 = something stuck.
- **2 identical tool calls:** One retry is fine; two is a loop.

---

## Anti-Patterns (fire these yourself)

- "Let me try that again…" (3rd time, same args) → STOP
- "I'll spawn a helper subagent to check the subagent I just spawned" → depth smell
- "Maybe if I re-read the file…" (already read) → verify you're not looping
- "Let me retry — maybe the error was transient" (without analysis) → likely not transient, investigate

---

## Tie-Ins

- `rules/workflow/token-time-awareness.md` — budget also bounds runaway loops
- `rules/core/no-assumption.md` — when stuck, ask not loop
- `rules/core/verification.md` — verify before the next iteration, not just "try harder"
- `skills/run-orchestrator/SKILL.md` — orchestrator enforces depth/count
