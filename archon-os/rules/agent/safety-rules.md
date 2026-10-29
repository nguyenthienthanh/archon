> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Safety Rules - External System Interactions

**Purpose:** Prevent accidental writes to external systems

---

## Core Principle

**NEVER write to external systems without explicit user confirmation. Read-only operations are safe.**

---

## Confirmation Required

These operations require showing a confirmation prompt and waiting for user response:

```toon
confirm_required[5]{system,operations}:
  JIRA,"Status updates, comments, subtasks"
  Confluence,"Page creation, updates"
  Slack,Notifications
  Linear,Issue updates
  Git,"Commits, pushes"
```

Confirmation format: show action + target + details, then wait for "confirm" or "cancel".

---

## Safe (No Confirmation)

Read-only: fetch JIRA tickets, read Confluence pages, list Linear issues, git status/log/diff.

---

## Forbidden (Never Auto-Execute)

Delete JIRA tickets, delete Confluence pages, force push, delete branches, modify production data, run production migrations.

If user requests these: warn about risks, require explicit "I understand" confirmation.

---

## API Keys & Tokens

- Store in environment variables / .envrc (never in code, config files, or git)
- Mask in logs, never show full tokens in UI
- Redact in error messages and stack traces

---

## Approval Gates

```toon
phase_gates[5]{phase,gate}:
  Phase 1 (Understand + Design),APPROVAL REQUIRED
  Phase 2 (Test RED),Auto-continue (auto-stop if tests pass)
  Phase 3 (Build GREEN),APPROVAL REQUIRED
  Phase 4 (Refactor + Review),Auto-continue (auto-stop on security/test issues)
  Phase 5 (Finalize),Auto (read-only)
```

Before generating/modifying code: show affected files, describe changes, estimate impact, request approval.

---

## Error Handling

- Log errors (sanitized, no sensitive data)
- Show user-friendly message
- Don't throw — allow workflow to continue
- For multi-step operations: rollback completed steps on failure

---

## Emergency Stop

User types "stop", "cancel", or "abort" → immediately halt all operations, rollback pending changes.

---
