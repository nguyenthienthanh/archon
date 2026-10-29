> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Approval Gates - Phase Transition Control

**Purpose:** Streamlined 2-gate approval workflow
**Priority:** CRITICAL

---

## Core Rule

**Only 2 approval gates** in the 5-phase workflow:

| Gate | Phase | Why |
|------|-------|-----|
| 1st | Phase 1 (Understand + Design) | Requirements & architecture decisions are hard to change later |
| 2nd | Phase 3 (Build GREEN) | Main implementation — review before refactor |

All other phases **auto-continue** after executing and showing deliverables.

---

## Phase Transitions

```toon
phases[5]{phase,name,type,auto_stop_if}:
  1,Understand + Design,✋ Approval,—
  2,Test RED,⚡ Auto,Tests pass (should fail)
  3,Build GREEN,✋ Approval,—
  4,Refactor + Review,⚡ Auto,Tests fail or critical security issues
  5,Finalize,⚡ Auto-complete,Never (skip Share if no Slack)
```

**Legend:** ✋ = Wait for user | ⚡ = Auto-continue | ⚡* = Auto unless issues

---

## Flow Overview

```
START → Phase 1 ✋ APPROVAL
      → Phase 2 (auto) → Phase 3 ✋ APPROVAL
      → Phase 4-5 (auto) → DONE
```

**IMPORTANT:** Auto-continue ≠ Skip. Every phase executes fully and shows deliverables.

---

## Approval Prompt Format

```markdown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏗️ Phase [N]: [Name] - Approval Needed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Deliverables summary]

📍 Progress: ████░░░░░░ [X]% ([N]/5 phases)
⏭️ After approval: Auto-continues to Phase [Y]

Options: approve | reject: <reason> | modify: <changes> | stop
```

---

## Valid Responses

```toon
responses[5]{input,action}:
  "approve/yes/ok/continue",Proceed to next phase
  "reject: <reason>",Brainstorm feedback then restart phase
  "modify: <changes>",Light brainstorm then adjust deliverables
  "stop/cancel",Save state and end workflow
  "back/previous",Return to previous phase (requires confirm)
```

**Force mode:** "must do: ..." or "just do: ..." skips brainstorming.

---

## State Tracking

Run state saved to `.claude/logs/runs/[run-id]/run-state.json`

**Full details:** `skills/run-orchestrator/SKILL.md`

---

