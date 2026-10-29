---
name: bugfix-quick
description: "Fast bug fixes with root cause investigation + TDD. Enforces 'no fix without root cause' discipline and verification protocol. Without this skill, fixes are applied at symptoms instead of sources, and bugs return."
autoInvoke: true
priority: medium
triggers:
  - "fix bug"
  - "broken"
  - "crash"
  - "not working"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
effort: low
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Quick Bugfix

For bugs only. Features/refactors → run-orchestrator.

---

## Core Principle

**NO FIXES WITHOUT ROOT CAUSE.** Fix at SOURCE, not symptom.

## Process (4 Steps)

| Step | Name | Agent | Statusline |
|---|---|---|---|
| S1 | Investigate | `lead` (inline) — uses Read/Grep/Bash to reproduce | `bugfix S1` |
| S2 | Test RED | `tester` — writes failing test | `bugfix S2` |
| S3 | Fix GREEN | `architect` / `frontend` / `mobile` (per artifact, via `agent-detector`) | `bugfix S3` |
| S4 | Verify | `tester` — runs full suite | `bugfix S4` |

**Announce per step.** When transitioning, surface to the user: `─── Step S{N} · {Name} ─── Dispatching {agent}…`. Also update `run-state.json#current_step` (one of: `investigate`, `test-red`, `fix-green`, `verify`) and `#active_agent` so the statusline reflects reality.

### 1. Investigate
- Read error + stack trace
- Reproduce the bug
- `git log` / `git diff` for recent changes
- Trace backward: where did bad data originate?
- **Context economy** (`rules/core/context-economy.md`) — Grep for the failing symbol first, then Read with `offset`+`limit` on the matched lines only. Don't read the full file unless the bug spans it.

### 2. Write Failing Test (RED)
- Test that reproduces the bug exactly
- **Pick the right layer** (`skills/test-writer/SKILL.md#test-type-selection`). If the bug is a UI / user-flow / auth / payment regression → **e2e spec via Playwright MCP**, not a unit test that won't actually reproduce it. If the bug is in pure logic → unit. The test must fail for the *right* reason.
- User confirms test FAILS

### 3. Fix (GREEN)
- Minimal, focused change at root cause
- User confirms test PASSES

### 4. Verify
- Run full test suite — **and the e2e suite if S2 wrote an e2e spec** (`npx playwright test` / `npx cypress run`). No regressions in either.
- Read output, THEN claim result. "Tests passed" with no pass count = `0 tests collected` = bug.
- **Wrong:** "Should work now" / **Right:** "Tests pass: [output]"

---

## Red Flags (Return to Step 1)

"Quick fix for now" / "Just try changing X" / "It's probably X" / "Seems fixed"

---

## Output

```markdown
## Bug Fix: [Description]
**Root Cause:** [Why — traced to source]
**Test Added:** [file + test name]
**Fix Applied:** [file + change summary]
**Verification:** Tests pass, no regressions
```

If complex → switch to `run-orchestrator`.

**Escalation:** If the bug resists quick fix (intermittent, race condition, "works on my machine", multiple plausible causes), escalate to `skills/deep-debugging/SKILL.md` for scientific-method root-cause analysis.

---

## Related Rules

- `rules/core/tdd-workflow.md` — Failing test before fix
- `rules/core/verification.md` — Run tests, read output, then claim
- `rules/core/execution-rules.md` — Root-cause discipline
- `rules/core/simplicity-over-complexity.md` — Minimal fix at root cause, no speculative refactoring during bug fix
