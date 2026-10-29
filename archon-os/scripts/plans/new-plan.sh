#!/usr/bin/env bash
# Create the .claude/plans/ skeleton for hierarchical planning (v3.7.3+).
# Idempotent — safe to re-run.
#
# Usage: bash archon-os/scripts/plans/new-plan.sh [project-root]
# If project-root not given, uses current working directory.
#
# Layout (v3.7.3+):
#   .claude/plans/
#     INDEX.md          — read me first
#     mission.md        — T0
#     initiatives/      — T1
#     features/         — T2 (each is {ID}_{slug}/ folder containing feature.md + stories/)
#     archive/          — compressed completed branches
#     traces/           — append-only event logs per T4
#     checkpoints/      — pre-mutation snapshots
#     history.jsonl     — append-only decision log
#     conflicts.jsonl   — append-only conflict log
#     active.json       — focus pointer
#     .counters.json    — ID counters

set -euo pipefail

PROJECT_ROOT="${1:-$(pwd)}"
CLAUDE_DIR="${PROJECT_ROOT}/.claude"
PLANS_DIR="${CLAUDE_DIR}/plans"
LEGACY_AURA_PLANS="${PROJECT_ROOT}/.aura/plans"

# Migration notice (informational only — we don't auto-move content).
if [ -d "${LEGACY_AURA_PLANS}" ] && [ ! -d "${PLANS_DIR}" ]; then
    cat >&2 <<EOF
ℹ Legacy .aura/plans/ detected at ${LEGACY_AURA_PLANS}
ℹ This script will initialize the new .claude/plans/ next to it.
ℹ Migrate your content manually with:
ℹ   mv .aura/plans .claude/plans
ℹ Or set AF_PLANS_DIR=.aura/plans to keep using the legacy location.
EOF
fi

# Idempotency: if already initialized, exit cleanly
if [ -f "${PLANS_DIR}/.counters.json" ] && [ -f "${PLANS_DIR}/active.json" ]; then
    echo "✓ .claude/plans/ already initialized at ${PLANS_DIR}"
    exit 0
fi

# v3.7.3+ uniform layout: every node is a folder. Mission is the singleton T0.
# Top-level archive/ still exists (for compressed completed branches). Top-level
# traces/ and checkpoints/ are gone — traces co-locate inside the task folder
# as `trace.jsonl`; checkpoints co-locate inside each node folder as
# `checkpoints/{ISO}.json`.
mkdir -p "${PLANS_DIR}/mission"
mkdir -p "${PLANS_DIR}/initiatives"
mkdir -p "${PLANS_DIR}/features"
mkdir -p "${PLANS_DIR}/archive"
mkdir -p "${CLAUDE_DIR}/memory/archive"
# MCP audit keeps its own directory, separate from plans. Resolution order
# matches hooks/lib/security-dir.cjs and _lib.sh#security_dir; .aura/security is
# still the default so an existing install's audit trail does not move.
if [ -n "${AF_SECURITY_DIR:-}" ]; then
    SECURITY_DIR="${AF_SECURITY_DIR}"
elif [ -d "${PROJECT_ROOT}/.claude/security" ]; then
    SECURITY_DIR="${PROJECT_ROOT}/.claude/security"
else
    SECURITY_DIR="${PROJECT_ROOT}/.aura/security"
fi
mkdir -p "${SECURITY_DIR}"

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# .counters.json — initialize ID counters
if [ ! -f "${PLANS_DIR}/.counters.json" ]; then
    cat > "${PLANS_DIR}/.counters.json" <<EOF
{
  "schema_version": 1,
  "updated_at": "${NOW}",
  "counters": {
    "INIT": 0,
    "FEAT": 0,
    "STORY": 0,
    "TASK": 0,
    "CONFLICT": 0,
    "DEC": 0
  }
}
EOF
fi

# active.json — initial focus pointer
if [ ! -f "${PLANS_DIR}/active.json" ]; then
    cat > "${PLANS_DIR}/active.json" <<EOF
{
  "schema_version": 1,
  "updated_at": "${NOW}",
  "active": {
    "mission": null,
    "initiative": null,
    "feature": null,
    "story": null,
    "task": null
  },
  "blocked": [],
  "frozen": [],
  "context_anchors": {}
}
EOF
fi

# mission/mission.md — T0 stub (singleton; lives in its own folder for layout
# uniformity with T1-T4. Room for related docs: VISION.md, VALUES.md, etc.).
if [ ! -f "${PLANS_DIR}/mission/mission.md" ]; then
    cat > "${PLANS_DIR}/mission/mission.md" <<EOF
---
id: MISSION
tier: 0
intent: "Edit this — describe what your project exists to do."
created_at: ${NOW}
updated_at: ${NOW}
---

# Mission

(Edit me. State the project's reason for existing in 1–3 sentences.)
EOF
fi

# Touch append-only logs so they exist (top-level — these are global infra,
# not per-node state). Per-task trace.jsonl files are created on demand by
# tool-call-tracer.cjs inside each task folder.
touch "${PLANS_DIR}/history.jsonl"
touch "${PLANS_DIR}/conflicts.jsonl"
touch "${PLANS_DIR}/conflict_cache.jsonl"
touch "${SECURITY_DIR}/mcp-audit.jsonl"

# INDEX.md — read-me-first for the plans directory.
if [ ! -f "${PLANS_DIR}/INDEX.md" ]; then
    cat > "${PLANS_DIR}/INDEX.md" <<'EOF'
# `.claude/plans/` — Hierarchical Plan Tree

This directory holds your project's plan tree. **Every node is a folder.** Per-node aux files (checkpoints, traces, per-feature deliverables) co-locate inside the node's folder.

```
.claude/plans/
├── INDEX.md                                ← you are here
├── active.json                             ← focus pointer (mission/initiative/feature/story/task)
├── .counters.json                          ← ID counters (INIT, FEAT, STORY, TASK, etc.)
├── history.jsonl                           ← append-only decision log
├── conflicts.jsonl                         ← append-only conflict log
├── mission/                                ← T0: project's reason for existing
│   ├── mission.md                          ← spec
│   └── checkpoints/                        ← (optional) pre-mutation snapshots
├── initiatives/                            ← T1 (OPTIONAL): multi-feature efforts
│   └── {ID}_{slug}/                        ← e.g. INIT-001_q1-rollout/
│       ├── initiative.md                   ← spec + status + children[FEAT-*]
│       ├── ROADMAP.md                      ← (optional) per-initiative deliverable
│       └── checkpoints/
├── features/                               ← T2: user-facing capabilities
│   └── {ID}_{slug}/                        ← e.g. FEAT-A_oauth-flow/ or JIRA-1234_login-redesign/
│       ├── feature.md                      ← spec + status + runs[] link
│       ├── REQUIREMENTS.md                 ← (optional) /run Phase 1 deliverable
│       ├── DESIGN.md                       ← (optional) /run Phase 1 deliverable
│       ├── checkpoints/
│       ├── subfeatures/                    ← (optional) T2 recursion — group siblings under parent feature
│       │   └── {ID}_{slug}/                ← e.g. FEAT-A_core-combat-mvp/ nested under FEAT-001
│       │       ├── feature.md              ← parent: <PARENT_FEAT_ID>, tier: 2
│       │       └── stories/...
│       └── stories/
│           └── {ID}_{slug}/                ← e.g. STORY-0001_login-form/
│               ├── story.md
│               ├── checkpoints/
│               └── tasks/
│                   └── {ID}_{slug}/        ← e.g. TASK-00042_password-input/
│                       ├── task.md         ← spec
│                       ├── trace.jsonl     ← per-task forensic event log
│                       └── checkpoints/    ← per-task snapshots
└── archive/                                ← compressed completed branches
    └── {ID}_{slug}/
        ├── summary.md
        └── original/                       ← preserves the pre-archive subtree
```

## Naming convention

Every node is a folder named `{ID}_{kebab-slug}` containing a `<tier>.md` file (e.g. `feature.md`, `story.md`). The slug is `slugify(intent)`, capped at 50 chars.

| Tier | ID prefix | Folder name | Spec file |
|---|---|---|---|
| T0 | `MISSION` (singleton) | `mission/` (no slug — only one mission) | `mission.md` |
| T1 | `INIT-NNN` (optional) | `initiatives/{ID}_{slug}/` | `initiative.md` |
| T2 | `FEAT-N` or ticket-ID | `features/{ID}_{slug}/` (top-level) OR `features/<PARENT>/subfeatures/{ID}_{slug}/` (nested) | `feature.md` |
| T3 | `STORY-NNNN` | `features/<feature-path>/stories/{ID}_{slug}/` | `story.md` |
| T4 | `TASK-NNNNN` | `features/<feature-path>/stories/<story>/tasks/{ID}_{slug}/` | `task.md` |

If a JIRA / Linear / GitHub ticket ID is attached to a feature, use it as the prefix (e.g. `JIRA-1234_login-redesign/`). Otherwise plan-orchestrator mints `FEAT-N`.

**Initiative tier is optional.** Small / solo-dev projects often skip T1 entirely — features can have `parent: MISSION` directly. Larger efforts use T1 to group features by quarter / OKR / theme. Use whichever fits.

**Subfeatures (T2 recursion).** When a feature is too coarse for one decomposition pass, split it into child features instead of stories. The child sits at `features/<parent-folder>/subfeatures/{ID}_{slug}/feature.md` with `parent: <PARENT_FEAT_ID>` in its frontmatter. Use this when 5+ stories would belong to one feature — promoting some of those story-groups into subfeatures keeps the tree readable.

## How to read a node folder

1. Start with the spec file (`mission.md` / `initiative.md` / `feature.md` / `story.md` / `task.md`).
2. Check the frontmatter: `id`, `tier`, `parent`, `status`, `intent`, `children: [...]`, `revision`.
3. For feature folders: if `## Runs` section is non-empty, scroll there to see `/run` invocations and their run-state.json paths.
4. Per-node aux dirs:
   - `checkpoints/` — pre-mutation snapshots (each file is `{ISO8601}.json`). Drives `/archon-os:plan undo`.
   - `trace.jsonl` (task folders only) — append-only Claude tool-call events. Source of `/archon-os:trace`.
5. Per-feature deliverables (`REQUIREMENTS.md`, `DESIGN.md`, `TEST_PLAN.md`) are scaffolded by `/run` Phase 1 when a Standard/Deep run anchors to the feature.
6. Walk into child folders for decomposition (`stories/`, `tasks/`).

## Commands

```bash
/archon-os:plan                          # bootstrap T0/T1/T2 (interview)
/archon-os:plan expand FEAT-A            # decompose one tier down
/archon-os:plan next                     # claim next ready T4
/archon-os:plan status                   # render tree
/run feature: FEAT-A "task description"  # anchor a new run to this feature
/run resume FEAT-A                       # list + resume runs under this feature
```

## Run ↔ Feature linking

Two-sided:

* `run-state.json` carries `feature_id` and `feature_slug` so a run knows its feature.
* `feature.md` body has a `## Runs` section listing every `/run` invocation that anchored here.

Update both ends through `run-orchestrator` (writes both on Step 0b) and `scripts/plans/link-run.sh` (helper invoked when a run starts or finishes).

## Legacy location

Pre-v3.7.3 used `.aura/plans/`. If you have content there, migrate via:

```bash
mv .aura/plans .claude/plans
```

Or override via `AF_PLANS_DIR=.aura/plans` to keep using the old location. The legacy fallback is removed in v4.0.

---

Generated by `archon-os/scripts/plans/new-plan.sh`. Edit freely.
EOF
fi

echo "✓ Plan skeleton initialized at ${PLANS_DIR}"
echo "  INDEX.md, mission/mission.md, active.json, .counters.json created"
echo ""
echo "Next steps:"
echo "  1. Read ${PLANS_DIR}/INDEX.md to understand the layout"
echo "  2. Edit ${PLANS_DIR}/mission/mission.md to describe your project"
echo "  3. Run /archon-os:plan to interview-bootstrap T1 (Initiative) and T2 (Feature)"
