#!/usr/bin/env bash
# Freeze a plan node + cascade to descendants.
#
# Usage:
#   freeze-branch.sh <NODE_ID> [--reason "<text>"] [--conflict CONFLICT-ID]
#                              [--force] [--plans-dir <path>] [--dry-run]
#
# Exit codes:
#   0 success
#   2 not found
#   3 invalid state (done/archived, or already frozen)
#   4 validation failed
#   5 bad input

set -euo pipefail

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

PLANS_DIR=""  # resolved below via plans_dir
NODE_INPUT=""
REASON=""
CONFLICT_ID=""
FORCE=0
DRY_RUN=0

while [ $# -gt 0 ]; do
    case "$1" in
        --reason) REASON="$2"; shift 2 ;;
        --reason=*) REASON="${1#--reason=}"; shift ;;
        --conflict) CONFLICT_ID="$2"; shift 2 ;;
        --conflict=*) CONFLICT_ID="${1#--conflict=}"; shift ;;
        --force) FORCE=1; shift ;;
        --plans-dir) PLANS_DIR="$2"; shift 2 ;;
        --plans-dir=*) PLANS_DIR="${1#--plans-dir=}"; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -*) echo "unknown flag: $1" >&2; exit 5 ;;
        *) NODE_INPUT="$1"; shift ;;
    esac
done

PLANS_DIR=$(plans_dir "$PLANS_DIR")

[ -n "$NODE_INPUT" ] || { echo "usage: freeze-branch.sh <NODE_ID> [--reason ...]" >&2; exit 5; }

NODE_ID=$(resolve_id "$PLANS_DIR" "$NODE_INPUT") || { echo "not found: $NODE_INPUT" >&2; exit 2; }
NODE_FILE=$(resolve_file "$PLANS_DIR" "$NODE_INPUT")
STATUS=$(get_field "$NODE_FILE" "status")

case "$STATUS" in
    done|archived) echo "${NODE_ID} status=${STATUS} — cannot freeze terminal state" >&2; exit 3 ;;
    frozen) echo "${NODE_ID} already frozen — no-op" >&2; exit 3 ;;
esac

[ -n "$REASON" ] || REASON="manual freeze (no reason provided)"

# Walk descendants by recursive children[] lookup.
collect_descendants() {
    local id="$1"
    local f
    f=$(resolve_file "$PLANS_DIR" "$id" 2>/dev/null || true)
    [ -z "$f" ] && return
    local children
    children=$(get_list "$f" "children" | tr -d ' "'"'"'' || true)
    while IFS= read -r c; do
        [ -z "$c" ] && continue
        echo "$c"
        collect_descendants "$c"
    done <<< "$children"
}

DESCENDANTS=$(collect_descendants "$NODE_ID" | sort -u || true)

if [ "$DRY_RUN" = "1" ]; then
    echo "DRY RUN — would freeze ${NODE_ID} and ${DESCENDANTS:-(no descendants)}"
    exit 0
fi

NOW=$(now_utc)
VIOLATIONS_BEFORE=$(tree_violation_count "$PLANS_DIR")
CKPT=$(save_checkpoint "$PLANS_DIR" "$NODE_ID" "$NODE_FILE")
TOUCHED="${NODE_ID}"

freeze_one() {
    local id="$1"
    local f; f=$(resolve_file "$PLANS_DIR" "$id" 2>/dev/null || true)
    [ -z "$f" ] && return
    local st; st=$(get_field "$f" "status")
    case "$st" in done|archived|frozen) return ;; esac

    save_checkpoint "$PLANS_DIR" "$id" "$f" >/dev/null
    set_field "$f" "status" "frozen"
    set_field "$f" "freeze_reason" "$REASON"
    set_field "$f" "frozen_at" "$NOW"
    [ "$id" != "$NODE_ID" ] && set_field "$f" "frozen_by_ancestor" "$NODE_ID"
    [ -n "$CONFLICT_ID" ] && set_field "$f" "conflict_id" "$CONFLICT_ID"
    bump_revision "$f" >/dev/null
}

freeze_one "$NODE_ID"
while IFS= read -r d; do
    [ -z "$d" ] && continue
    freeze_one "$d"
    TOUCHED="${TOUCHED} ${d}"
done <<< "$DESCENDANTS"

if ! require_no_regression "$PLANS_DIR" "$VIOLATIONS_BEFORE"; then
    echo "checkpoints saved at ${PLANS_DIR}/checkpoints/ — restore via /archon-os:plan undo" >&2
    exit 4
fi

EVENT="{\"ts\":\"${NOW}\",\"verb\":\"freeze\",\"target\":\"${NODE_ID}\",\"reason\":\"${REASON//\"/\\\"}\",\"conflict_id\":\"${CONFLICT_ID}\",\"cascade\":\"${TOUCHED}\",\"checkpoint\":\"${CKPT}\"}"
append_history "$PLANS_DIR" "$EVENT"

echo "frozen: ${TOUCHED}"
