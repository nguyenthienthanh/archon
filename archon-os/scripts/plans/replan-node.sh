#!/usr/bin/env bash
# Force replan of a node. Increment revision, decrement replan_budget,
# mark descendants discarded, snapshot to checkpoints/.
#
# Usage:
#   replan-node.sh <NODE_ID> [--reason "<text>"] [--avoid <path-or-id>]
#                            [--force] [--plans-dir <path>] [--dry-run]
#
# Exit codes:
#   0 success
#   2 not found
#   3 replan budget exhausted (override with --force)
#   4 validation failed
#   5 bad input

set -euo pipefail

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

PLANS_DIR=""  # resolved below via plans_dir
NODE_INPUT=""
REASON=""
AVOID=""
FORCE=0
DRY_RUN=0

while [ $# -gt 0 ]; do
    case "$1" in
        --reason) REASON="$2"; shift 2 ;;
        --reason=*) REASON="${1#--reason=}"; shift ;;
        --avoid) AVOID="$2"; shift 2 ;;
        --avoid=*) AVOID="${1#--avoid=}"; shift ;;
        --force) FORCE=1; shift ;;
        --plans-dir) PLANS_DIR="$2"; shift 2 ;;
        --plans-dir=*) PLANS_DIR="${1#--plans-dir=}"; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -*) echo "unknown flag: $1" >&2; exit 5 ;;
        *) NODE_INPUT="$1"; shift ;;
    esac
done

PLANS_DIR=$(plans_dir "$PLANS_DIR")

[ -n "$NODE_INPUT" ] || { echo "usage: replan-node.sh <NODE_ID>" >&2; exit 5; }

NODE_ID=$(resolve_id "$PLANS_DIR" "$NODE_INPUT") || { echo "not found: $NODE_INPUT" >&2; exit 2; }
NODE_FILE=$(resolve_file "$PLANS_DIR" "$NODE_INPUT")

BUDGET=$(get_field "$NODE_FILE" "replan_budget")
COUNT=$(get_field "$NODE_FILE" "replan_count")
[ -z "$BUDGET" ] && BUDGET=3
[ -z "$COUNT" ] && COUNT=0

if [ "$COUNT" -ge "$BUDGET" ] && [ "$FORCE" != "1" ]; then
    echo "${NODE_ID}: replan_count=${COUNT} >= replan_budget=${BUDGET} — pass --force or grant more budget via thaw" >&2
    exit 3
fi

NOW=$(now_utc)
[ -n "$REASON" ] || REASON="manual replan"

if [ "$DRY_RUN" = "1" ]; then
    echo "DRY RUN — would replan ${NODE_ID}, discard descendants, count → $((COUNT + 1))/${BUDGET}"
    exit 0
fi

VIOLATIONS_BEFORE=$(tree_violation_count "$PLANS_DIR")
CKPT=$(save_checkpoint "$PLANS_DIR" "$NODE_ID" "$NODE_FILE")

# Mark descendants discarded.
collect_descendants() {
    local id="$1"
    local f; f=$(resolve_file "$PLANS_DIR" "$id" 2>/dev/null || true)
    [ -z "$f" ] && return
    local children; children=$(get_list "$f" "children" | tr -d ' "'"'"'' || true)
    while IFS= read -r c; do
        [ -z "$c" ] && continue
        echo "$c"
        collect_descendants "$c"
    done <<< "$children"
}

DESCENDANTS=$(collect_descendants "$NODE_ID" | sort -u)
while IFS= read -r d; do
    [ -z "$d" ] && continue
    df=$(resolve_file "$PLANS_DIR" "$d" 2>/dev/null || true)
    [ -z "$df" ] && continue
    save_checkpoint "$PLANS_DIR" "$d" "$df" >/dev/null
    set_field "$df" "status" "discarded"
    bump_revision "$df" >/dev/null
done <<< "$DESCENDANTS"

# Mutate target.
NEW_REV=$(bump_revision "$NODE_FILE")
set_field "$NODE_FILE" "replan_count" "$((COUNT + 1))"
set_field "$NODE_FILE" "last_replan_at" "$NOW"
set_field "$NODE_FILE" "last_replan_reason" "$REASON"
[ -n "$AVOID" ] && set_field "$NODE_FILE" "replan_avoid" "$AVOID"

if ! require_no_regression "$PLANS_DIR" "$VIOLATIONS_BEFORE"; then
    echo "checkpoints saved — restore via /archon-os:plan undo" >&2
    exit 4
fi

EVENT="{\"ts\":\"${NOW}\",\"verb\":\"replan\",\"target\":\"${NODE_ID}\",\"reason\":\"${REASON//\"/\\\"}\",\"avoid\":\"${AVOID}\",\"revision\":${NEW_REV},\"replan_count\":$((COUNT + 1)),\"checkpoint\":\"${CKPT}\"}"
append_history "$PLANS_DIR" "$EVENT"

echo "replanned: ${NODE_ID} (rev ${NEW_REV}, count $((COUNT + 1))/${BUDGET})"
echo "  descendants discarded: $(echo "$DESCENDANTS" | grep -c '^' || echo 0)"
