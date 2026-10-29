> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Immutable Workflow — Approved Phases Are Append-Only

**Priority:** CRITICAL
**Applies To:** All phase deliverables in `.claude/logs/runs/{run-id}/`

---

## Core Principle

**Once a phase is approved, its deliverables are frozen. Downstream phases may read them but not modify them. To change past decisions, explicitly reopen the phase — don't silently edit.**

This prevents "rewriting history" where later phases quietly invalidate earlier approvals.

---

## Why Immutable

- **Audit trail integrity** — the final workflow reflects real decisions, not revisions
- **Approval gate validity** — if P3 silently modifies P1's spec, the user's P1 approval was meaningless
- **Cross-review protection** — Phase 4 reviewer can trust Phase 3 output didn't retroactively change
- **Handoff safety** — resuming from a checkpoint uses the state as approved, not as rewritten

---

## The Rules

### 1. Approved phase deliverables: READ-ONLY

After user types `approve` at a gate:
- Files in `.claude/logs/runs/{id}/phase-{N}/` are frozen
- State marker: `phases[N].status = "approved"` + timestamp
- Any agent attempting to Write to that directory fails with: "Phase {N} is approved — use `/run reopen {N}` to unfreeze"

### 2. Pending phase deliverables: mutable within phase

During the current phase (before approval), the active agent may freely edit its own deliverables. On approval → freeze.

### 3. Reopening a past phase — explicit action required

User command: `/run reopen <phase-number>`

Effects:
- Phase status: `approved` → `reopened`
- All downstream approved phases also flip to `reopened` (can't keep P5 approved if P1 changes)
- Workflow state records the reopen + timestamp + reason
- User must re-approve each reopened phase

### 4. Modify vs Reopen (distinction)

| Action | Effect |
|--------|--------|
| `/run modify <changes>` | Modifies **current** phase only, before approval. Fine. |
| `/run reopen <phase>` | Unfreezes a past approved phase. Destructive of downstream approvals. |

---

## Enforcement Points

### At the orchestrator level (`run-orchestrator` skill)

Before every Write to `.claude/logs/runs/{id}/phase-{N}/`:
1. Check `phases[N].status`
2. If `approved` and current phase != N → refuse Write, escalate to user
3. If `approved` and current phase == N → we shouldn't be editing past phase, flag

### At the hook level

`hooks/phase-checkpoint.cjs` already creates git-commit checkpoints per phase. Leverage this:
- Git tag: `phase-N-approved-{timestamp}`
- Any edit touching a file in the tagged checkpoint path triggers a guard check

### At the rule level

This rule tells Claude the policy. Compliance depends on orchestrator respecting it. Future hook enhancement can hard-enforce.

---

## Legitimate Reopen Reasons

| Situation | Action |
|-----------|--------|
| User realized Phase 1 requirement was wrong | `/run reopen 1` then re-approve |
| Security review in P4 revealed P1 design flaw | `/run reopen 1` — security takes priority |
| Test failure in P4 traced back to P2 test gap | `/run reopen 2` — tests need expansion |
| Minor wording fix in approved doc | **Don't reopen — leave it.** Post-workflow edits are outside Aura Frog's audit scope. |

---

## Anti-Patterns (catch yourself)

- "I'll just quietly update phase 1's requirements to match what I built" → NO. Reopen or accept.
- "Reviewer found an issue — let me edit phase 3 and keep going" → NO. Reopen phase 3.
- "I'll delete the approved file and write a new one" → same as edit, same rule applies.

---

## Tie-Ins

- `rules/core/approval-gates.md` — approval is what triggers the freeze
- `rules/workflow/workflow-deliverables.md` — what each phase must produce (and then freeze)
- `rules/workflow/cross-review-workflow.md` — reviewer trusts the frozen state
- `skills/run-orchestrator/SKILL.md` — enforces the reopen ceremony
- `skills/session-continuation/SKILL.md` — handoff/resume respects frozen state
- `hooks/phase-checkpoint.cjs` — git-level checkpoint infrastructure
