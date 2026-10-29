---
last_aligned_with: v3.7.3
status: current
audience: first-time
---

# Your First Workflow — Interactive Tutorial

A step-by-step walkthrough of a complete Archon OS workflow. Follow along in your own project.

---

## Before You Start

- Archon OS installed (`/plugin list` shows aura-frog)
- A project with at least one source file
- Recommended: run `project:init` first

---

## Step 1: Start the Workflow

```
/run Add input validation to the login form
```

**Behind the scenes:**
1. `agent-detector` → selects `frontend` agent
2. `run-orchestrator` → begins Phase 1

**You see:** Phase 1 design with requirements, technical approach, and an approval gate.

**Why this matters:** Catches misunderstandings BEFORE any code is written.

---

## Step 2: Approve the Design

```
approve
```

**What happens:** Phase 2 auto-starts. Claude writes failing tests first (TDD RED).

```
5 tests, 0 passed, 5 failed (expected — TDD RED)
Continuing to Phase 3...
```

**Why this matters:** Tests written before code ensure you're testing behavior, not implementation.

---

## Step 3: Review Implementation

Phase 3 runs automatically. Claude writes minimal code to pass all tests.

```
Phase 3: Build GREEN — Approval Needed

5 tests, 5 passed

Options: approve / reject / modify
```

```
approve
```

**Why this matters:** You review WORKING code with passing tests.

---

## Step 4: Watch Auto-Complete

Phases 4 and 5 run automatically:

```
Phase 4: Refactor + Review [AUTO] — tests still passing
Phase 5: Finalize [AUTO] — coverage 87%, workflow complete

Total: 5 phases, 2 approvals
```

---

## What You Just Did

In 2 approvals:
1. Designed before coding
2. Tests written FIRST (TDD)
3. Implementation verified by tests
4. Code reviewed and refactored
5. Coverage verified

---

## Quick Reference

| You want to... | Command |
|----------------|---------|
| Build a feature | `/run "description"` |
| Fix a bug | `/run "fix description"` |
| Skip Phase 1 | `fasttrack: <specs>` |
| Check progress | `/run status` |
| Approve a phase | `approve` |
| Reject with feedback | `reject: reason` |
| Pause for later | `handoff` |
| Resume | `/run resume` |
| Undo a phase | `rollback <phase>` |
| See agents | `/af agents` |
| Update plugin | `plugin:update` |

---

