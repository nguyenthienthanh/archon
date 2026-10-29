> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Token & Time Awareness

**Priority:** HIGH
**Type:** Rule (Always Enforced)

---

## Core Rule

**Monitor token usage and processing time. Show status at thresholds.**

---

## Token Thresholds

```toon
thresholds[4]{level,tokens,action}:
  Normal,0-100K (0-50%),Continue normally
  Moderate,100K-150K (50-75%),Show usage occasionally
  Warning,150K-175K (75-87%),Warn user + suggest handoff
  Critical,175K-200K (87-100%),Strongly recommend handoff
```

**Show at:** End of each phase, after complex operations, at warning/critical thresholds, when user asks.

Format: `Token Usage: ~[X]K / 200K ([Y]%)`

---

## Time Awareness

Show processing time for: code generation, phase completion, multi-file changes, test execution. Not for quick answers or file reads.

---

## Phase Completion Summary

At end of every phase:

```
PHASE [N] SUMMARY
Duration: ~[X] minutes
Tokens: ~[X]K this phase | ~[Y]K total ([Z]%)
[If >75%:] ⚠️ Consider `handoff`
```

---

## Handoff Triggers

Auto-suggest `handoff` when:
- Token estimate >150K (75%)
- Complex workflow with 3+ phases remaining
- User working >2 hours
- Multiple large file operations

---

## User Commands

| Command | Action |
|---------|--------|
| `tokens` | Show current estimate |
| `handoff` | Save state for later |
| `/run resume <id>` | Resume saved run |

---

**See:** `skills/session-continuation/SKILL.md`

**Last Updated:** 2025-11-29
