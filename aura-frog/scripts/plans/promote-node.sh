#!/usr/bin/env bash
# Bubble a T4 (Task) discovery up to T2 (Feature) or T1 (Initiative).
#
# Usage:
#   promote-node.sh "<note>" [--to <TARGET-ID>] [--source <SOURCE-ID>]
#                            [--plans-dir <path>] [--dry-run]
#
# Default source: active.task. Default target: source's parent's parent (T4 → T2).
#
# Exit codes:
#   0 success
#   2 source/target not found
#   3 invalid promotion path (target must be ancestor)
#   4 validation failed
#   5 bad input (note missing)

set -euo pipefail

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

PLANS_DIR=""  # resolved below via plans_dir
NOTE=""
TARGET_INPUT=""
SOURCE_INPUT=""
DRY_RUN=0

while [ $# -gt 0 ]; do
    case "$1" in
        --to) TARGET_INPUT="$2"; shift 2 ;;
        --to=*) TARGET_INPUT="${1#--to=}"; shift ;;
        --source) SOURCE_INPUT="$2"; shift 2 ;;
        --source=*) SOURCE_INPUT="${1#--source=}"; shift ;;
        --plans-dir) PLANS_DIR="$2"; shift 2 ;;
        --plans-dir=*) PLANS_DIR="${1#--plans-dir=}"; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -*) echo "unknown flag: $1" >&2; exit 5 ;;
        *) [ -z "$NOTE" ] && NOTE="$1" || NOTE="${NOTE} $1"; shift ;;
    esac
done

PLANS_DIR=$(plans_dir "$PLANS_DIR")

[ -n "$NOTE" ] || { echo "usage: promote-node.sh \"<note>\" [--to TARGET]" >&2; exit 5; }

# Resolve source.
if [ -n "$SOURCE_INPUT" ]; then
    SOURCE_ID=$(resolve_id "$PLANS_DIR" "$SOURCE_INPUT") || { echo "source not found: $SOURCE_INPUT" >&2; exit 2; }
else
    SOURCE_ID=$(read_active_field "$PLANS_DIR" "task" 2>/dev/null || true)
    [ -n "$SOURCE_ID" ] || { echo "no active task — set --source explicitly" >&2; exit 2; }
fi
SOURCE_FILE=$(resolve_file "$PLANS_DIR" "$SOURCE_ID")

# Resolve target: default = source's parent's parent (T4 → T2 by default).
if [ -n "$TARGET_INPUT" ]; then
    TARGET_ID=$(resolve_id "$PLANS_DIR" "$TARGET_INPUT") || { echo "target not found: $TARGET_INPUT" >&2; exit 2; }
else
    PARENT_ID=$(get_field "$SOURCE_FILE" "parent")
    [ -n "$PARENT_ID" ] || { echo "${SOURCE_ID} has no parent — nowhere to promote" >&2; exit 3; }
    PARENT_FILE=$(resolve_file "$PLANS_DIR" "$PARENT_ID")
    GP_ID=$(get_field "$PARENT_FILE" "parent")
    [ -n "$GP_ID" ] || { echo "${SOURCE_ID} parent ${PARENT_ID} has no grandparent — nowhere to promote" >&2; exit 3; }
    TARGET_ID="$GP_ID"
fi
TARGET_FILE=$(resolve_file "$PLANS_DIR" "$TARGET_ID")

NOW=$(now_utc)
DISCOVERY_LINE="${SOURCE_ID}@${NOW}: ${NOTE}"

if [ "$DRY_RUN" = "1" ]; then
    echo "DRY RUN — would append discovery to ${TARGET_ID}: ${DISCOVERY_LINE}"
    exit 0
fi

VIOLATIONS_BEFORE=$(tree_violation_count "$PLANS_DIR")
CKPT=$(save_checkpoint "$PLANS_DIR" "$TARGET_ID" "$TARGET_FILE")

# Append a line to the target node's body under '## Discoveries' section.
# If section doesn't exist, create it at end of file.
if grep -qE '^## Discoveries' "$TARGET_FILE"; then
    # Insert after the heading.
    tmp="${TARGET_FILE}.tmp.$$"
    awk -v line="- ${DISCOVERY_LINE}" '
        /^## Discoveries/ { print; printf "%s\n", line; next }
        { print }
    ' "$TARGET_FILE" > "$tmp"
    mv "$tmp" "$TARGET_FILE"
else
    {
        echo ""
        echo "## Discoveries"
        echo ""
        echo "- ${DISCOVERY_LINE}"
    } >> "$TARGET_FILE"
fi

NEW_REV=$(bump_revision "$TARGET_FILE")

if ! require_no_regression "$PLANS_DIR" "$VIOLATIONS_BEFORE"; then
    echo "restore via /archon-os:plan undo" >&2
    exit 4
fi

EVENT="{\"ts\":\"${NOW}\",\"verb\":\"promote\",\"source\":\"${SOURCE_ID}\",\"target\":\"${TARGET_ID}\",\"note\":\"$(_json_escape "$NOTE")\",\"revision\":${NEW_REV},\"checkpoint\":\"${CKPT}\"}"
append_history "$PLANS_DIR" "$EVENT"

echo "promoted: ${SOURCE_ID} → ${TARGET_ID} (rev ${NEW_REV})"
