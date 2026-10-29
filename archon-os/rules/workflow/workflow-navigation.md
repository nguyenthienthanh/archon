> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Workflow Navigation

**Priority:** HIGH
**Applies:** All workflow phases and approval gates

---

## Core Rule

**After each phase, show what comes next: next phase, skippable steps, and progress.**

---

## Navigation Block Format

After every phase completion:

```markdown
━━━ WORKFLOW PROGRESS ━━━

✅ Completed: Phase 1 (Understand + Design)
🔄 Current: Phase 2 (Test RED) - Auto-continuing
⏭️ Next: Phase 3 (Build GREEN)

Progress: ████████░░░░░░░░ 50% (4/8 phases)
```

---

## When to Show

Show navigation after: phase completed, approval gate, phase rejected, phase modified, workflow started, workflow resumed.

---

## Skip Detection

```toon
auto_skips[3]{phase,skip_when}:
  Phase 1 (UI part),No UI components detected
  Phase 5 (Share part),Slack not configured
  Any phase,User explicitly skipped
```

Announce skips proactively. Users can unskip with "include phase N".

---

## Phase Status Icons

```toon
icons[5]{icon,meaning}:
  ✅,Completed
  🔄,In progress
  ⏳,Pending
  ⏩,Will be skipped
  ❌,Rejected (redo needed)
```

---

## Approval Gate Integration

**2 gates:** Phase 1 (Understand + Design) and Phase 3 (Build GREEN).

Include progress in gate blocks with options: `approve`, `reject: <reason>`, `modify: <changes>`, `stop`.

---

## Token Awareness Integration

Include token status when >75%:

```
Progress: ██████████░░░░░░ 60% (3/5 phases)
Tokens: ████████████░░░░ 75% (~150K used)
⚠️ Token usage high. Consider `handoff` after Phase 4.
```

---

**See also:** `rules/workflow/next-step-guidance.md` for command reference and context-aware guidance.

**Last Updated:** 2025-12-04
