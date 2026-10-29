#!/usr/bin/env bash
# Reverse a freeze. Cascade to descendants by default; --partial keeps them frozen.
#
# Usage:
#   thaw-branch.sh <NODE_ID> [--partial] [--discard]
#                            [--grant-replan-budget N] [--force]
#                            [--plans-dir <path>] [--dry-run]
#
# Exit codes:
#   0 success
#   2 not found / not frozen
#   3 blocker (conflict) still active
#   4 validation failed
#   5 bad input

set -euo pipefail

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

PLANS_DIR=""  # resolved below via plans_dir
NODE_INPUT=""
PARTIAL=0
DISCARD=0
GRANT_BUDGET=""
FORCE=0
DRY_RUN=0

while [ $# -gt 0 ]; do
    case "$1" in
        --partial) PARTIAL=1; shift ;;
        --discard) DISCARD=1; shift ;;
        --grant-replan-budget) GRANT_BUDGET="$2"; shift 2 ;;
        --grant-replan-budget=*) GRANT_BUDGET="${1#--grant-replan-budget=}"; shift ;;
        --force) FORCE=1; shift ;;
        --plans-dir) PLANS_DIR="$2"; shift 2 ;;
        --plans-dir=*) PLANS_DIR="${1#--plans-dir=}"; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -*) echo "unknown flag: $1" >&2; exit 5 ;;
        *) NODE_INPUT="$1"; shift ;;
    esac
done

PLANS_DIR=$(plans_dir "$PLANS_DIR")

[ -n "$NODE_INPUT" ] || { echo "usage: thaw-branch.sh <NODE_ID> [--partial|--discard]" >&2; exit 5; }

NODE_ID=$(resolve_id "$PLANS_DIR" "$NODE_INPUT") || { echo "not found: $NODE_INPUT" >&2; exit 2; }
NODE_FILE=$(resolve_file "$PLANS_DIR" "$NODE_INPUT")
STATUS=$(get_field "$NODE_FILE" "status")

[ "$STATUS" = "frozen" ] || { echo "${NODE_ID} not frozen (status=${STATUS})" >&2; exit 2; }

CONFLICT_ID=$(get_field "$NODE_FILE" "conflict_id")
if [ -n "$CONFLICT_ID" ] && [ "$FORCE" != "1" ]; then
    # Check the conflict log — refuse if any other participant is still active.
    CONFLICTS_LOG="${PLANS_DIR}/conflicts.jsonl"
    if [ -f "$CONFLICTS_LOG" ]; then
        LATEST=$(grep -F "\"conflict_id\":\"${CONFLICT_ID}\"" "$CONFLICTS_LOG" | tail -1)
        RESOLUTION=$(echo "$LATEST" | grep -oE '"resolution":[[:space:]]*"[^"]+"' | sed 's/.*"\([^"]*\)"$/\1/' || true)
        if [ -z "$RESOLUTION" ] || [ "$RESOLUTION" = "null" ]; then
            echo "blocker ${CONFLICT_ID} still open — resolve via /archon-os:plan-conflicts resolve ${CONFLICT_ID}, or pass --force" >&2
            exit 3
        fi
    fi
fi

if [ "$DRY_RUN" = "1" ]; then
    echo "DRY RUN — would thaw ${NODE_ID}$( [ "$PARTIAL" = "0" ] && echo " + descendants" )"
    [ "$DISCARD" = "1" ] && echo "  (--discard: status will be 'discarded', not 'planned')"
    exit 0
fi

NOW=$(now_utc)
NEW_STATUS="planned"
[ "$DISCARD" = "1" ] && NEW_STATUS="discarded"

VIOLATIONS_BEFORE=$(tree_violation_count "$PLANS_DIR")
CKPT=$(save_checkpoint "$PLANS_DIR" "$NODE_ID" "$NODE_FILE")
TOUCHED="${NODE_ID}"

# Clear freeze metadata + set status. Cannot delete YAML fields easily — set to empty.
thaw_one() {
    local id="$1"
    local f; f=$(resolve_file "$PLANS_DIR" "$id" 2>/dev/null || true)
    [ -z "$f" ] && return
    save_checkpoint "$PLANS_DIR" "$id" "$f" >/dev/null
    set_field "$f" "status" "$NEW_STATUS"
    set_field "$f" "freeze_reason" ""
    set_field "$f" "frozen_at" ""
    set_field "$f" "frozen_by_ancestor" ""
    [ -n "$GRANT_BUDGET" ] && {
        local cur; cur=$(get_field "$f" "replan_budget")
        [ -z "$cur" ] && cur=0
        set_field "$f" "replan_budget" "$((cur + GRANT_BUDGET))"
    }
    bump_revision "$f" >/dev/null
}

thaw_one "$NODE_ID"
if [ "$PARTIAL" = "0" ]; then
    collect_descendants() {
        local id="$1"
        local f; f=$(resolve_file "$PLANS_DIR" "$id" 2>/dev/null || true)
        [ -z "$f" ] && return
        local children; children=$(get_list "$f" "children" | tr -d ' "'"'"'' || true)
        while IFS= read -r c; do
            [ -z "$c" ] && continue
            local cf; cf=$(resolve_file "$PLANS_DIR" "$c" 2>/dev/null || true)
            [ -z "$cf" ] && continue
            local cs; cs=$(get_field "$cf" "status")
            if [ "$cs" = "frozen" ]; then
                echo "$c"
                collect_descendants "$c"
            fi
        done <<< "$children"
    }
    DESCENDANTS=$(collect_descendants "$NODE_ID" | sort -u || true)
    while IFS= read -r d; do
        [ -z "$d" ] && continue
        thaw_one "$d"
        TOUCHED="${TOUCHED} ${d}"
    done <<< "$DESCENDANTS"
fi

if ! require_no_regression "$PLANS_DIR" "$VIOLATIONS_BEFORE"; then
    echo "checkpoints under ${PLANS_DIR}/checkpoints/ — restore via /archon-os:plan undo" >&2
    exit 4
fi

EVENT="{\"ts\":\"${NOW}\",\"verb\":\"thaw\",\"target\":\"${NODE_ID}\",\"partial\":${PARTIAL},\"discard\":${DISCARD},\"new_status\":\"${NEW_STATUS}\",\"touched\":\"${TOUCHED}\",\"checkpoint\":\"${CKPT}\"}"
append_history "$PLANS_DIR" "$EVENT"

echo "thawed: ${TOUCHED} → ${NEW_STATUS}"
