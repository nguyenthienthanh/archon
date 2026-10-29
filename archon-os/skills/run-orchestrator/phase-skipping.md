# Skill: Smart Phase Skipping

**Category:** Workflow Optimization
**Used By:** lead, run-orchestrator

---

## Overview

Intelligently skip workflow phases that don't apply to the current task context.

---

## 1. Phase Skip Rules

| Condition | Skip Phases | Reason |
|-----------|-------------|--------|
| Backend-only task | (none - no UI phase to skip) | All 5 phases apply |
| Prototype/POC requested | Phase 2, Phase 4 | Quick validation |
| "No tests" explicitly stated | Phase 2 | User preference |
| Bug fix (small) | Phase 4 | Direct fix + test |
| Documentation only | Phase 2, 3, 4 | No code changes |
| Config change only | Phase 2, 4 | Simple update |

---

## 2. Detection Logic

### Backend-Only Indicators
```
Keywords: API, endpoint, service, database, migration, cron, queue
File patterns: /services/, /api/, /models/, /migrations/
No mention of: UI, screen, component, page, form, button
```

### Prototype Indicators
```
Keywords: POC, prototype, spike, experiment, quick test
Phrases: "just want to try", "proof of concept", "see if it works"
```

### Bug Fix Indicators
```
Keywords: bug, fix, broken, not working, error, crash
Scope: Single file, specific function, known cause
```

---

## 3. Skip Confirmation Format

When skipping phases, always confirm with user:

```markdown
## Phase Skip Recommendation

Based on your task: **[task description]**

**Detected context:** Backend-only API endpoint

**Proposed workflow:**
- Phase 1: Understand + Design ✅
- Phase 2: Test RED ✅
- Phase 3: Build GREEN ✅
- Phase 4: Refactor + Review ✅
- Phase 5: Finalize ✅

**Approve this workflow?** (or request changes)
```

---

## 4. Skip Combinations

### Full Workflow (Default)
All 5 phases - complex features

### Quick Prototype
```
Phase 1 → Phase 3 → Phase 5
Skip: Phase 2 (Tests), Phase 4 (Refactor + Review)
```

### Bug Fix
```
Phase 1 (brief) → Phase 2 → Phase 3 → Phase 5
Skip: Phase 4 (Refactor + Review)
```

### Documentation Only
```
Phase 1 → Phase 5
Skip: Phase 2, 3, 4 (no code changes)
```

### Config/Environment
```
Phase 1 → Phase 3 → Phase 5
Skip: Phase 2 (Tests), Phase 4 (Refactor + Review)
```

---

## 5. Override Rules

User can always override:
- "Include tests" → Re-enable Phase 2
- "Full workflow" → No skipping
- "Skip review" → Skip Phase 4 (not recommended)

---

## 6. Decision Tree

```
Is this a prototype/POC?
├── Yes → Skip Phase 2, Phase 4
└── No → Continue

Is this a simple bug fix?
├── Yes → Skip Phase 4
└── No → Continue

Is this documentation only?
├── Yes → Jump to Phase 5
└── No → Full workflow
```

---

## 7. Logging Skipped Phases

```markdown
## Workflow Log

**Task:** Add user authentication API
**Skipped Phases:**
- Phase 4 (Refactor + Review): Deferred to tech debt sprint

**Rationale:** Clean implementation, no refactoring needed
```

---

## Best Practices

### Do's
- Confirm skip decisions with user
- Log skipped phases with reasons
- Allow user override
- Maintain minimum quality (Phase 4)
- Re-evaluate if scope changes

### Don'ts
- Skip Phase 1 (always understand first)
- Skip Phase 4 for production code
- Auto-skip without user awareness
- Skip tests without explicit request
- Skip documentation for public APIs

---

