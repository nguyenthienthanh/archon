#!/usr/bin/env bash
# KG-2.2 — Promote a durable learned pattern into the active plan tree as a new
# `node_type: pattern` LEAF.
#
# A pattern node is INERT to the tiered T0–T4 machinery: it carries no `tier`,
# no `children`, no `depends_on`, and no `test_ref`, and it is DELIBERATELY not
# added to its parent's children[] — so next-task/expand/DAG scanning never see
# it. It exists purely as user-approved learned memory hanging off a Feature
# (T2) or the mission root. See rules/core/plan-trust-policy.md § Pattern Nodes.
#
# GATED: this is a NO-OP unless AF_KG_PROMOTE=true. Default behavior and the
# on-disk plan format are unchanged unless the gate is explicitly opened.
#
# Usage:
#   AF_KG_PROMOTE=true promote-pattern.sh "<pattern title / body>" \
#       [--parent <PARENT-ID>]   (default: mission root MISSION)
#       [--source <epic/session>] (provenance string)
#       [--confidence <0..1>]      (default: 0.5)
#       [--plans-dir <path>]
#       [--dry-run]
#
# Exit codes:
#   0  success (or gated no-op, or dry-run)
#   2  parent not found
#   4  validation failed after write (pattern file rolled back)
#   5  bad input (body missing)

set -euo pipefail

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

PLANS_DIR=""
BODY=""
PARENT_INPUT=""
SOURCE=""
CONFIDENCE="0.5"
DRY_RUN=0

while [ $# -gt 0 ]; do
    case "$1" in
        --parent) PARENT_INPUT="$2"; shift 2 ;;
        --parent=*) PARENT_INPUT="${1#--parent=}"; shift ;;
        --source) SOURCE="$2"; shift 2 ;;
        --source=*) SOURCE="${1#--source=}"; shift ;;
        --confidence) CONFIDENCE="$2"; shift 2 ;;
        --confidence=*) CONFIDENCE="${1#--confidence=}"; shift ;;
        --plans-dir) PLANS_DIR="$2"; shift 2 ;;
        --plans-dir=*) PLANS_DIR="${1#--plans-dir=}"; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -*) echo "unknown flag: $1" >&2; exit 5 ;;
        *) [ -z "$BODY" ] && BODY="$1" || BODY="${BODY} $1"; shift ;;
    esac
done

PLANS_DIR=$(plans_dir "$PLANS_DIR")

# ------------------------------------------------------------------
# GATE — off by default. Nothing is written, no counter is minted, the tree is
# untouched, unless AF_KG_PROMOTE=true.
# ------------------------------------------------------------------
if [ "${AF_KG_PROMOTE:-}" != "true" ]; then
    echo "ℹ pattern promotion is OFF (KG-2.2). Set AF_KG_PROMOTE=true to enable."
    echo "  No changes made — default plan format is unchanged."
    exit 0
fi

[ -n "$BODY" ] || { echo "usage: promote-pattern.sh \"<pattern body>\" [--parent ID]" >&2; exit 5; }

if [ ! -d "$PLANS_DIR" ]; then
    echo "✗ Plan tree not found at ${PLANS_DIR}" >&2
    exit 2
fi

# ------------------------------------------------------------------
# Resolve parent. Default is the mission root so a pattern can attach with no
# explicit Feature. Parent existence is re-checked by INVARIANT 1 after write.
# ------------------------------------------------------------------
if [ -n "$PARENT_INPUT" ]; then
    PARENT_ID=$(resolve_id "$PLANS_DIR" "$PARENT_INPUT") || {
        echo "✗ parent not found: ${PARENT_INPUT}" >&2
        exit 2
    }
else
    # Mission root — resolve by its canonical id, fall back to literal MISSION.
    PARENT_ID=$(resolve_id "$PLANS_DIR" "MISSION" 2>/dev/null || echo "MISSION")
    [ -n "$PARENT_ID" ] || PARENT_ID="MISSION"
fi

# ------------------------------------------------------------------
# Ensure a PAT counter exists in .counters.json. Existing trees predate this
# key, so add it (value 0) on first use rather than failing. Best-effort; if
# .counters.json is absent we fall through and next_counter errors cleanly.
# ------------------------------------------------------------------
SLUG=$(slugify "$BODY")
[ -z "$SLUG" ] && SLUG="pattern"

# Dry-run reports the plan WITHOUT minting an id or touching .counters.json
# (mirrors expand-node.sh, which never mints on --dry-run). The concrete PAT-N
# is only allocated on a real run below.
if [ "$DRY_RUN" = "1" ]; then
    cat <<EOF
DRY RUN — would:
  • Mint the next PAT-NNNN id (PAT counter)
  • Write pattern leaf at: ${PLANS_DIR}/patterns/PAT-NNNN_${SLUG}/pattern.md
      parent: ${PARENT_ID}   node_type: pattern   status: learned
      confidence: ${CONFIDENCE}   source: ${SOURCE:-<none>}
  • NOT touch ${PARENT_ID}.children[] (patterns are inert side-leaves)
  • Run validate-plan-tree.sh; on any new violation, delete the file (rollback)
  • Append history.jsonl event=promote_pattern
EOF
    exit 0
fi

COUNTERS="${PLANS_DIR}/.counters.json"
if [ -f "$COUNTERS" ] && ! grep -q '"PAT"' "$COUNTERS"; then
    if command -v python3 >/dev/null 2>&1; then
        tmp="${COUNTERS}.tmp.$$"
        python3 - "$COUNTERS" "$tmp" <<'PYEOF'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
with open(src) as fh:
    data = json.load(fh)
data.setdefault("counters", {}).setdefault("PAT", 0)
with open(dst, "w") as fh:
    json.dump(data, fh, indent=2)
PYEOF
        mv "$tmp" "$COUNTERS"
    else
        # Pure-sed fallback: inject "PAT": 0 after the counters object opens.
        tmp="${COUNTERS}.tmp.$$"
        sed 's/\("counters"[[:space:]]*:[[:space:]]*{\)/\1\n    "PAT": 0,/' "$COUNTERS" > "$tmp"
        mv "$tmp" "$COUNTERS"
    fi
fi

NUM=$(next_counter "$PLANS_DIR" "PAT") || {
    echo "✗ could not mint PAT id (no .counters.json?)" >&2
    exit 5
}
PAT_ID=$(printf 'PAT-%04d' "$NUM")

# Pattern files live in their own patterns/ folder — OUTSIDE features/ — so they
# never sit in a Feature's story/task tree. validate-plan-tree.sh still finds
# them (any *.md not under archive/).
PAT_DIR="${PLANS_DIR}/patterns/${PAT_ID}_${SLUG}"
PAT_FILE="${PAT_DIR}/pattern.md"
NOW=$(now_utc)

# Baseline violation count BEFORE writing — so a tree that was already broken
# elsewhere doesn't wrongly blame (and roll back) this pattern write.
BEFORE=$(tree_violation_count "$PLANS_DIR")

mkdir -p "$PAT_DIR"

# Compose the pattern node. No tier / children / depends_on / test_ref by design.
SRC_LINE=""
[ -n "$SOURCE" ] && SRC_LINE="source: \"${SOURCE}\""$'\n'

CONTENT="---
id: ${PAT_ID}
parent: ${PARENT_ID}
node_type: pattern
status: learned
revision: 1
${SRC_LINE}confidence: ${CONFIDENCE}
created_at: ${NOW}
updated_at: ${NOW}
---

# Pattern: ${BODY}

${BODY}
"

atomic_write "$PAT_FILE" "$CONTENT"

# ------------------------------------------------------------------
# Validate the whole tree AFTER writing. A pattern must not introduce any
# invariant violation; if it does, roll back (delete the file + empty folder)
# and refuse. We compare against a pre-write baseline so a tree that was ALREADY
# broken elsewhere doesn't wrongly blame this write.
# ------------------------------------------------------------------
if ! require_no_regression "$PLANS_DIR" "$BEFORE" 2>/dev/null; then
    rm -f "$PAT_FILE"
    rmdir "$PAT_DIR" 2>/dev/null || true
    echo "✗ writing ${PAT_ID} introduced an invariant violation — rolled back the pattern file" >&2
    bash "${SCRIPT_DIR}/validate-plan-tree.sh" "$PLANS_DIR" >&2 || true
    exit 4
fi

EVENT="{\"ts\":\"${NOW}\",\"verb\":\"promote_pattern\",\"target\":\"${PAT_ID}\",\"parent\":\"${PARENT_ID}\",\"confidence\":\"${CONFIDENCE}\",\"source\":\"$(_json_escape "${SOURCE}")\"}"
append_history "$PLANS_DIR" "$EVENT"

cat <<EOF
✓ promoted pattern ${PAT_ID}
  file:       ${PAT_FILE}
  parent:     ${PARENT_ID}
  status:     learned   node_type: pattern   confidence: ${CONFIDENCE}
  note:       inert leaf — not in ${PARENT_ID}.children[]; invisible to T0–T4 scheduling.
EOF
