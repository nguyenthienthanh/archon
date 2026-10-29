> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Next Step Guidance

**Priority:** CRITICAL
**Applies To:** All interactions, phases, and approval gates

---

## Core Rule

**Every response MUST end with a "What's Next" section showing available actions.**

---

## Format

### Standard (end of every response)

```markdown
━━━ WHAT'S NEXT ━━━
**Quick Actions:** `approve` | `reject: <reason>` | `skip`
**Commands:** `status` | `handoff`
**Suggested:** → Type `approve` to continue to Phase 4
```

### Minimal (mid-phase, simple confirmation)

```markdown
---
**Next:** `approve` to continue | `reject: <feedback>` to revise
```

---

## Show FULL Guidance When

First interaction of a phase, after rejection, user seems stuck, complex decision point, multiple valid paths.

Show MINIMAL when mid-phase or user is flowing.

---

## Universal Commands

### Workflow Control

```toon
workflow_commands[7]{command,description}:
  approve / yes,Accept and continue
  reject: <reason>,Reject with feedback
  modify: <changes>,Adjust deliverables
  skip,Skip current phase
  done,Complete workflow
  pause,Save and pause
  stop,Cancel workflow
```

### Phase Navigation

```toon
nav_commands[5]{command,description}:
  status,Show progress
  skip <phase>,Skip specific phase
  force <phase>,Jump to phase
  back,Go back one phase
  restart,Start over
```

### Speed Commands

```toon
speed_commands[6]{command,description}:
  skip brainstorming,Skip requirement analysis
  skip design,Skip design phase
  skip ui,Skip UI Breakdown
  skip tests,Skip test writing
  force implementation,Jump to coding
  force complete,End immediately
```

---

## Error Guidance

When errors occur, show recovery options: `fix`, `show failures`, `skip test: <name>`, `force continue`, `rollback`.

---

## Non-Workflow Interactions

Still provide guidance: follow-up questions, `/run <task>`, `/run <issue>` (auto-detects bugfix), `/run <target>` (auto-detects refactor).

---

**Rule:** next-step-guidance
**Priority:** CRITICAL
