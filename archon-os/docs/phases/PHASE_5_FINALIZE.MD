# Phase 5: Finalize - Detailed Guidelines

**Phase:** 5/5 - Finalize
**Duration:** 30-60 minutes
**Agents:** pm-operations-orchestrator
**Deliverables:** Updated documentation, CHANGELOG entry, notification sent, workflow summary

---

## Goal

Generate documentation, send notifications, and close the workflow. This phase auto-completes (no approval gate).

---

## Step-by-Step Process

### Step 1: Generate Documentation (15 min)

Update all relevant documentation to reflect the changes made during the workflow:

- Update or create component/module documentation
- Update API docs if endpoints changed
- Update README if public-facing behavior changed
- Ensure inline code comments are accurate

**Output:** All documentation files updated and consistent with implementation.

---

### Step 2: Update CHANGELOG (5 min)

Add an entry under the current version section:

```markdown
## [version] - YYYY-MM-DD

### Added
- **Feature Name** - Brief description

### Updated
- **Component** - What changed

### Fixed
- **Bug** - What was fixed
```

Group entries by: Added, Updated, Fixed, Removed.

---

### Step 3: Send Notifications (5 min)

If Slack is configured (`SLACK_BOT_TOKEN` in `.envrc`), send a workflow completion notification:

```markdown
Workflow Complete: [task description]
- Phase 1-5 completed successfully
- Files changed: [count]
- Tests: [pass/fail count]
- Coverage: [percentage]
```

If Slack is not configured, skip silently.

---

### Step 4: Create Workflow Summary (10 min)

Generate a concise summary of the entire workflow:

```markdown
## Workflow Summary

**Task:** [description]
**Duration:** [total time]
**Agent:** [primary agent]

### Phases Completed
- Phase 1: Understand + Design - DONE
- Phase 2: Test RED - DONE
- Phase 3: Build GREEN - DONE
- Phase 4: Refactor + Review - DONE
- Phase 5: Finalize - DONE

### Key Deliverables
- [list of files created/modified]
- [test coverage achieved]
- [documentation updated]
```

Mark workflow state as **complete**.

---

## Success Criteria

- [ ] All documentation updated and consistent
- [ ] CHANGELOG entry added
- [ ] Notifications sent (if Slack configured)
- [ ] Workflow state marked complete
- [ ] Workflow summary generated

---

## Notes

- This phase has **no approval gate** -- it auto-completes after all steps finish.
- If documentation generation fails, log the error and continue with remaining steps.
- Workflow metrics are saved to `.claude/learning/metrics.json` for the learning system.

---

**Phase 5 Complete! Workflow finished.**
