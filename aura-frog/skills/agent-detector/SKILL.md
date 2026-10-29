---
name: agent-detector
description: "CRITICAL: MUST run for EVERY message. Detects agent, complexity, AND model automatically. Without this, tasks route to wrong agents and use wrong models, degrading quality and wasting tokens."
autoInvoke: true
priority: highest
model: haiku
triggers:
  - "every message"
  - "always first"
allowed-tools: NONE
user-invocable: false
---

# Agent Detector

**Runs FIRST for every message.**

## Complexity

```toon
complexity[4]{level,criteria,approach}:
  Quick,"Single file / simple fix / clear scope","Direct implementation"
  Standard,"2-5 files / feature / some unknowns","Scout then implement"
  Deep,"6+ files / architecture / vague scope","run-orchestrator"
  Project,"Multi-feature / multi-session / weight ≥ 3 on bridge heuristic AND no active plan","/archon-os:plan bootstrap then per-task /run anchored"
```

## Model Selection

Inherit the session model for all substantive work. Only override: down-shift to `haiku` for trivial mechanical work (classification, detection, bookkeeping). Never force-upgrade to a named model. See `rules/core/small-to-large-routing.md`.

## Host Skills First

Before routing to a plugin skill/agent, check the host index (`🧩 Host extensions` from session-start, or the session's skill listing). A matching **user/project skill wins** over a plugin skill — invoke it via the Skill tool. Host rules (`~/.claude/rules/`, `.claude/rules/`) override plugin rules on conflict. See `rules/workflow/priority-hierarchy.md`.

## Detection (priority order)

Task content > explicit tech (+60) > intent keywords (+50) > project context (+40) > file patterns (+20).
Scoring: Primary ≥80 (leads), Secondary 50-79, Optional 30-49, Skip <30. **tester:** always secondary unless explicit test request.

Cache: `.claude/cache/agent-detection-cache.json` (reuse within workflow; invalidate on new workflow / phase 1 / user override).

**Detail (Project-level heuristic, signal weights, model rationale):** `skills/agent-detector/reference.md` — load on demand only.
