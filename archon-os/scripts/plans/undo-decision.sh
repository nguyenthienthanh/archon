#!/usr/bin/env bash
# Restore the latest checkpoint for a node (LIFO undo).
#
# Usage:
#   undo-decision.sh [<NODE_ID>] [--dry-run] [--list] [--force]
#                                [--plans-dir <path>]
#
# With no NODE_ID: walks active.task → active.story → active.feature → active.initiative.
# Picks the deepest non-null.
#
# Exit codes:
#   0 success / no-op
#   2 no checkpoint exists
#   4 validation failed after restore
#   5 bad input

set -euo pipefail

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

PLANS_DIR=""  # resolved below via plans_dir
NODE_INPUT=""
DRY_RUN=0
LIST=0
FORCE=0

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=1; shift ;;
        --list) LIST=1; shift ;;
        --force) FORCE=1; shift ;;
        --plans-dir) PLANS_DIR="$2"; shift 2 ;;
        --plans-dir=*) PLANS_DIR="${1#--plans-dir=}"; shift ;;
        -*) echo "unknown flag: $1" >&2; exit 5 ;;
        *) NODE_INPUT="$1"; shift ;;
    esac
done

PLANS_DIR=$(plans_dir "$PLANS_DIR")

# Default target — active path, deepest non-null.
if [ -z "$NODE_INPUT" ]; then
    for f in task story feature initiative; do
        val=$(read_active_field "$PLANS_DIR" "$f" 2>/dev/null || true)
        [ -n "$val" ] && NODE_INPUT="$val" && break
    done
    [ -n "$NODE_INPUT" ] || { echo "no active node — pass NODE_ID" >&2; exit 5; }
fi

NODE_ID=$(resolve_id "$PLANS_DIR" "$NODE_INPUT" 2>/dev/null || true)
# undo may target a node whose file we deleted — fall back to literal ID.
[ -z "$NODE_ID" ] && NODE_ID="${NODE_INPUT}"

# v3.7.3+ co-located checkpoints: each node folder has its own checkpoints/ subdir.
# Find it via the node's resolved file path. Fall back to legacy global location
# for nodes whose file we can't resolve (e.g. archived).
NODE_FILE=$(resolve_file "$PLANS_DIR" "$NODE_ID" 2>/dev/null || true)
if [ -n "$NODE_FILE" ]; then
    CKPT_DIR="$(dirname "$NODE_FILE")/checkpoints"
else
    CKPT_DIR="${PLANS_DIR}/checkpoints/${NODE_ID}_legacy"
fi

# Legacy fallback: pre-v3.7.3 stored at ${PLANS_DIR}/checkpoints/{ID}.{ISO}.json (flat).
LEGACY_CKPT_DIR="${PLANS_DIR}/checkpoints"

if [ -d "$CKPT_DIR" ]; then
    MATCHES=$(ls -1 "${CKPT_DIR}"/*.json 2>/dev/null | sort || true)
fi
if [ -z "${MATCHES:-}" ] && [ -d "$LEGACY_CKPT_DIR" ]; then
    MATCHES=$(ls -1 "${LEGACY_CKPT_DIR}/${NODE_ID}".*.json 2>/dev/null | sort || true)
fi
[ -z "${MATCHES:-}" ] && { echo "no checkpoint for ${NODE_ID}" >&2; exit 2; }

if [ "$LIST" = "1" ]; then
    printf '%s\n' "$MATCHES"
    exit 0
fi

LATEST=$(printf '%s\n' "$MATCHES" | tail -1)
NODE_FILE_FROM_CKPT=$(grep -oE '"node_file":[[:space:]]*"[^"]+"' "$LATEST" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
BODY_B64=$(grep -oE '"node_state_before_b64":[[:space:]]*"[^"]*"' "$LATEST" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')

[ -n "$NODE_FILE_FROM_CKPT" ] || { echo "checkpoint ${LATEST} is malformed" >&2; exit 2; }

if [ "$DRY_RUN" = "1" ]; then
    echo "DRY RUN — would restore ${NODE_ID} from $(basename "$LATEST")"
    exit 0
fi

NOW=$(now_utc)
VIOLATIONS_BEFORE=$(tree_violation_count "$PLANS_DIR")
if [ -n "$BODY_B64" ]; then
    echo "$BODY_B64" | base64 -d > "${NODE_FILE_FROM_CKPT}.tmp.$$"
    mv "${NODE_FILE_FROM_CKPT}.tmp.$$" "$NODE_FILE_FROM_CKPT"
fi

# Move the consumed checkpoint to .consumed so LIFO advances.
mv "$LATEST" "${LATEST}.consumed"

if ! require_no_regression "$PLANS_DIR" "$VIOLATIONS_BEFORE"; then
    echo "manual fix required" >&2
    exit 4
fi

EVENT="{\"ts\":\"${NOW}\",\"verb\":\"undo\",\"target\":\"${NODE_ID}\",\"checkpoint_consumed\":\"$(basename "$LATEST")\"}"
append_history "$PLANS_DIR" "$EVENT"

echo "restored: ${NODE_ID} from $(basename "$LATEST")"
