> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Execution Rules

**Priority:** CRITICAL
**Updated:** v1.8.0

---

## ALWAYS

```toon
always[10]{rule}:
  Load project context before any task
  Detect appropriate agent
  Read command definition — follow exact steps
  Follow phase order (phases build on each other)
  Execute pre/post phase hooks
  Run ESLint/TSLint + TypeScript check after implementation — fix ALL issues
  Show deliverables at phase completion
  Save workflow state
  Approval phases (1 & 3): show gate → WAIT for explicit approval
  Auto-continue phases (2, 4, 5): execute fully → show deliverables → continue
```

## NEVER

```toon
never[13]{rule}:
  Auto-commit without explicit user confirmation (show files + message then ask)
  Auto-push without explicit user confirmation
  Commit credentials/tokens
  Push to main/master without approval
  Write to external systems without confirmation
  Skip project context loading
  Ignore approval gates at Phase 1 & 3
  Skip auto-continue phases (must execute and show deliverables)
  Implement without tests (TDD mandatory)
  Skip RED phase in TDD
  Ignore linter errors
  Leave any/unknown types (TypeScript strictness)
  Let builder agent lead its own review (builder ≠ reviewer — see cross-review-workflow.md)
```

---

## Plan Mode

Use Claude Code's native plan mode for Quick/Standard tasks (brainstorm, design, evaluate).
For Deep complexity: use `/run` for structured 5-phase TDD.

---

## Blocking Conditions

Stop execution on: user rejection, tests failing, coverage below target, linter errors, security vulnerabilities, token limit approaching (150K), external system errors, missing credentials.

## Auto-Continue

After approval, continue until: next approval gate, blocking condition, workflow complete (Phase 5), user interruption, or token limit.

---

## Exception Handling

**Priority:** Project rules > Plugin rules > Generic rules

**User requests skip:** Check if allowed → Document reason → Proceed or explain why not.

**Token limit (150K):** Warn → Suggest handoff → Auto-save state.

---

## Team Mode (Agent Teams)

**When:** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` enabled.

```toon
team_gate[4]{complexity,domains,mode,cost}:
  Quick,any,single agent,1x
  Standard,any,subagent,1x
  Deep,1 domain,subagent,1x
  Deep,2+ domains (≥50 each),team,~3x
```

Team mode ONLY for Deep + multi-domain. If agent-detector returns `Mode: subagent`, do NOT create a team.

**Startup:** TeamCreate → TaskCreate × N (one message) → Task × N (parallel) → teammates work independently.

```toon
team_always[6]{rule}:
  Max 3 teammates per phase
  Pass complete context to teammates
  Use TaskCreate for all work items
  Claim files before editing via TaskUpdate
  Use SendMessage for handoffs
  Spawn teammates in parallel (one message)
```

```toon
team_never[5]{rule}:
  Team mode for Quick/Standard tasks
  Teammates commit independently (only lead manages git)
  Skip file claiming
  Create more than 3 teammates per phase
  Teammates advance phases (only lead manages transitions)
```
