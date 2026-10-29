#!/usr/bin/env bash
# Compress a completed T2 (or higher) into a summary + archive originals.
#
# Usage:
#   archive-feature.sh <NODE_ID> [--summary-text "<inline summary>"] [--force]
#                                [--plans-dir <path>] [--dry-run]
#
# Exit codes:
#   0 success
#   2 not found / not done
#   3 has incomplete descendants
#   4 validation failed
#   5 bad input

set -euo pipefail

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

PLANS_DIR=""  # resolved below via plans_dir
NODE_INPUT=""
SUMMARY_TEXT=""
FORCE=0
DRY_RUN=0

while [ $# -gt 0 ]; do
    case "$1" in
        --summary-text) SUMMARY_TEXT="$2"; shift 2 ;;
        --summary-text=*) SUMMARY_TEXT="${1#--summary-text=}"; shift ;;
        --force) FORCE=1; shift ;;
        --plans-dir) PLANS_DIR="$2"; shift 2 ;;
        --plans-dir=*) PLANS_DIR="${1#--plans-dir=}"; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -*) echo "unknown flag: $1" >&2; exit 5 ;;
        *) NODE_INPUT="$1"; shift ;;
    esac
done

PLANS_DIR=$(plans_dir "$PLANS_DIR")

[ -n "$NODE_INPUT" ] || { echo "usage: archive-feature.sh <NODE_ID>" >&2; exit 5; }

NODE_ID=$(resolve_id "$PLANS_DIR" "$NODE_INPUT") || { echo "not found: $NODE_INPUT" >&2; exit 2; }
NODE_FILE=$(resolve_file "$PLANS_DIR" "$NODE_INPUT")
TIER=$(get_field "$NODE_FILE" "tier")
STATUS=$(get_field "$NODE_FILE" "status")

[ "$STATUS" = "done" ] || { echo "${NODE_ID} status=${STATUS} — only 'done' nodes can archive" >&2; exit 2; }
case "$TIER" in
    0|1|2|3) ;;
    *) echo "${NODE_ID} tier=${TIER} — only T0–T3 can archive (T4 is too granular)" >&2; exit 2 ;;
esac

# Walk descendants and ensure all are done|discarded|archived.
collect_all() {
    local id="$1"
    local f; f=$(resolve_file "$PLANS_DIR" "$id" 2>/dev/null || true)
    [ -z "$f" ] && return
    echo "${id}	${f}"
    local children; children=$(get_list "$f" "children" | tr -d ' "'"'"'' || true)
    while IFS= read -r c; do
        [ -z "$c" ] && continue
        collect_all "$c"
    done <<< "$children"
}

ALL=$(collect_all "$NODE_ID" | sort -u)
INCOMPLETE=""
while IFS=$'\t' read -r id f; do
    [ -z "$id" ] && continue
    s=$(get_field "$f" "status")
    case "$s" in
        done|discarded|archived) ;;
        *) INCOMPLETE="${INCOMPLETE} ${id}(${s})" ;;
    esac
done <<< "$ALL"

if [ -n "$INCOMPLETE" ] && [ "$FORCE" != "1" ]; then
    echo "incomplete descendants: ${INCOMPLETE} — use --force to archive anyway" >&2
    exit 3
fi

ARCHIVE_DIR="${PLANS_DIR}/archive"
mkdir -p "$ARCHIVE_DIR"
NOW=$(now_utc)

if [ "$DRY_RUN" = "1" ]; then
    echo "DRY RUN — would write ${ARCHIVE_DIR}/${NODE_ID}.summary.md and move originals"
    exit 0
fi

# Compute stats.
TOTAL=$(printf '%s\n' "$ALL" | grep -c '^' || true)
DONE=0; DISC=0
while IFS=$'\t' read -r id f; do
    [ -z "$id" ] && continue
    s=$(get_field "$f" "status")
    [ "$s" = "done" ] && DONE=$((DONE+1))
    [ "$s" = "discarded" ] && DISC=$((DISC+1))
done <<< "$ALL"

# v3.7.3+: consolidate into `archive/{ID}_{slug}/` containing `summary.md` +
# `original/`. Replaces pre-v3.7.3 layout of `archive/{ID}.summary.md` +
# `archive/{ID}.original/` (two siblings).
INTENT=$(get_field "$NODE_FILE" "intent")
PARENT=$(get_field "$NODE_FILE" "parent")
INTENT_SLUG=$(slugify "$INTENT")
[ -z "$INTENT_SLUG" ] && INTENT_SLUG="unnamed"
ARCHIVE_NODE_DIR="${ARCHIVE_DIR}/${NODE_ID}_${INTENT_SLUG}"
mkdir -p "$ARCHIVE_NODE_DIR"
SUMMARY_FILE="${ARCHIVE_NODE_DIR}/summary.md"
ORIG_DIR="${ARCHIVE_NODE_DIR}/original"
VIOLATIONS_BEFORE=$(tree_violation_count "$PLANS_DIR")
CKPT=$(save_checkpoint "$PLANS_DIR" "$NODE_ID" "$NODE_FILE")

cat > "$SUMMARY_FILE" <<EOF
---
id: ${NODE_ID}
tier: ${TIER}
parent: ${PARENT}
status: archived
archived_at: ${NOW}
intent: "${INTENT}"
total_nodes: ${TOTAL}
done_nodes: ${DONE}
discarded_nodes: ${DISC}
---

# Archive summary for ${NODE_ID}

${SUMMARY_TEXT:-(Inline summary — replace with epic-summarizer output when available.)}

## Subtree node list

EOF
while IFS=$'\t' read -r id f; do
    [ -z "$id" ] && continue
    intent=$(get_field "$f" "intent")
    status=$(get_field "$f" "status")
    echo "- **${id}** [${status}] — ${intent}" >> "$SUMMARY_FILE"
done <<< "$ALL"

# Move originals — preserve in archive/<id>_<slug>/original/ for audit.
mkdir -p "$ORIG_DIR"
while IFS=$'\t' read -r id f; do
    [ -z "$id" ] && continue
    cp "$f" "${ORIG_DIR}/$(basename "$f")"
done <<< "$ALL"

# Mark target as archived (don't delete files yet — keep tree intact).
set_field "$NODE_FILE" "status" "archived"
set_field "$NODE_FILE" "archived_at" "$NOW"
bump_revision "$NODE_FILE" >/dev/null

if ! require_no_regression "$PLANS_DIR" "$VIOLATIONS_BEFORE"; then
    echo "see ${PLANS_DIR}/checkpoints/ — restore via /archon-os:plan undo" >&2
    exit 4
fi

EVENT="{\"ts\":\"${NOW}\",\"verb\":\"archive\",\"target\":\"${NODE_ID}\",\"summary\":\"${SUMMARY_FILE}\",\"orig_count\":${TOTAL},\"checkpoint\":\"${CKPT}\"}"
append_history "$PLANS_DIR" "$EVENT"

echo "archived: ${NODE_ID} → ${SUMMARY_FILE} (${TOTAL} nodes, originals in ${ORIG_DIR})"
