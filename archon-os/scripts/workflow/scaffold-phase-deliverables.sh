#!/usr/bin/env bash
# scaffold-phase-deliverables.sh — Create skeleton markdown files for a run phase.
#
# Why: workflow-deliverables.md mandates that each phase produce specific files
# (REQUIREMENTS.md, TECH_SPEC.md, TEST_PLAN.md, …). Before this script, those
# files were never auto-created — runs left .claude/logs/runs/<id>/ empty
# except for run-state.json. The orchestrator's "deliverables[]" array
# tracked metadata but no actual artefacts hit disk.
#
# Usage:
#   bash scaffold-phase-deliverables.sh <run-id> <phase>
#   bash scaffold-phase-deliverables.sh <run-id> all       # scaffold all 5 phases
#
# Behaviour:
#   - Idempotent: never overwrites an existing file (so users' work is safe
#     when called again on phase re-entry / resume).
#   - Copies from archon-os/templates/ when a matching template exists.
#   - Falls back to a minimal skeleton (front-matter + TODO sections) when
#     no template is available.
#   - Always succeeds (exit 0); errors are printed to stderr but don't block
#     the orchestrator.
#
# Exit codes:
#   0 — success (some files may already exist; that's fine)
#   1 — bad args (missing run-id / phase / unknown phase number)

set -euo pipefail

RUN_ID="${1:-}"
PHASE_ARG="${2:-}"

if [ -z "$RUN_ID" ] || [ -z "$PHASE_ARG" ]; then
  echo "Usage: $0 <run-id> <phase|all>" >&2
  echo "  phase ∈ {1,2,3,4,5} or 'all'" >&2
  exit 1
fi

# Find plugin templates dir. CLAUDE_PLUGIN_ROOT is set by the runtime; the
# script-relative fallback handles local-dev invocation.
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$PLUGIN_ROOT" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi
TEMPLATES="${PLUGIN_ROOT}/templates"

RUN_DIR=".claude/logs/runs/${RUN_ID}"
if [ ! -d "$RUN_DIR" ]; then
  echo "[scaffold] Run dir not found: $RUN_DIR" >&2
  echo "[scaffold] Create run-state.json first (run-orchestrator Step 0)." >&2
  exit 1
fi

scaffold_one() {
  local phase="$1"
  local filename="$2"
  local template_basename="$3"   # may be empty → fall back to minimal skeleton
  local target="${RUN_DIR}/${filename}"

  if [ -f "$target" ]; then
    return 0  # idempotent — don't trash user's work
  fi

  mkdir -p "$(dirname "$target")"

  if [ -n "$template_basename" ] && [ -f "${TEMPLATES}/${template_basename}" ]; then
    cp "${TEMPLATES}/${template_basename}" "$target"
  else
    # Minimal fallback: enough structure to be a real deliverable, not a stub.
    local title
    title="$(echo "$filename" | sed 's/\.md$//' | tr '[:upper:]_' '[:lower:] ')"
    cat > "$target" <<EOF
# ${title^}

> **Run:** \`${RUN_ID}\`
> **Phase:** ${phase}
> **Status:** TODO — fill in during Phase ${phase}.

---

## Overview

_Brief summary of what this deliverable captures._

## Details

_Fill in._

## Decisions / Tradeoffs

_Capture non-obvious choices and why they were made._

## Open Questions

_List anything that needs follow-up._
EOF
  fi
  echo "  + ${filename}"
}

scaffold_phase() {
  local phase="$1"
  echo "[scaffold] Phase ${phase} → ${RUN_DIR}/"
  case "$phase" in
    1)
      scaffold_one 1 "REQUIREMENTS.md"          "requirements.md"
      scaffold_one 1 "TECH_SPEC.md"             "tech-spec-toon.md"
      scaffold_one 1 "TECH_SPEC_CONFLUENCE.md"  "confluence-page.md"
      scaffold_one 1 "DESIGN_DECISIONS.md"      "decision-record.md"
      scaffold_one 1 "LLD.md"                   "lld.md"
      ;;
    2)
      scaffold_one 2 "TEST_PLAN.md"             "test-plan-toon.md"
      scaffold_one 2 "TEST_CASES.md"            "test-cases.md"
      ;;
    3)
      scaffold_one 3 "IMPLEMENTATION_NOTES.md"  "implementation-notes.md"
      scaffold_one 3 "FILES_CHANGED.md"         "files-changed.md"
      ;;
    4)
      scaffold_one 4 "CODE_REVIEW.md"           "code-review.md"
      scaffold_one 4 "REFACTOR_LOG.md"          "refactor-analysis.md"
      ;;
    5)
      scaffold_one 5 "QA_REPORT.md"             "qa-report.md"
      scaffold_one 5 "IMPLEMENTATION_SUMMARY.md" "implementation-summary.md"
      scaffold_one 5 "CHANGELOG_ENTRY.md"       "changelog-entry.md"
      ;;
    *)
      echo "[scaffold] Unknown phase: $phase (expected 1-5)" >&2
      exit 1
      ;;
  esac
}

if [ "$PHASE_ARG" = "all" ]; then
  for p in 1 2 3 4 5; do
    scaffold_phase "$p"
  done
else
  scaffold_phase "$PHASE_ARG"
fi

echo "[scaffold] Done. Run-state untouched; only new .md files created."
