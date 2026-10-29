#!/usr/bin/env bash
# Maintain the two-sided run ↔ feature link.
#
# Two operations:
#   link    — Register a run against a feature (writes both ends):
#             a) Sets run-state.json#feature_id + #feature_slug
#             b) Appends to feature.md `## Runs` section
#   unlink  — Mark a run as `discarded` in feature.md (does not delete the run)
#   list    — List runs registered under a feature
#
# Usage:
#   link-run.sh link <RUN_ID> <FEATURE_INPUT> [--anchor TASK-ID] [--status in_progress|done|discarded]
#   link-run.sh unlink <RUN_ID> <FEATURE_INPUT>
#   link-run.sh list <FEATURE_INPUT>
#
# Exit codes:
#   0 success
#   2 run or feature not found
#   5 bad input

set -euo pipefail

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

PLANS_DIR=$(plans_dir "")
RUNS_DIR="${RUNS_DIR:-.claude/logs/runs}"

SUBCMD="${1:-}"
[ -n "$SUBCMD" ] || { echo "usage: link-run.sh link|unlink|list ..." >&2; exit 5; }
shift

case "$SUBCMD" in
    link)
        RUN_ID="${1:-}"
        FEATURE_INPUT="${2:-}"
        [ -n "$RUN_ID" ] && [ -n "$FEATURE_INPUT" ] || { echo "usage: link <RUN_ID> <FEATURE_INPUT>" >&2; exit 5; }
        shift 2 || true

        ANCHOR_TASK=""
        STATUS="in_progress"
        while [ $# -gt 0 ]; do
            case "$1" in
                --anchor) ANCHOR_TASK="$2"; shift 2 ;;
                --status) STATUS="$2"; shift 2 ;;
                *) shift ;;
            esac
        done

        RUN_STATE_FILE="${RUNS_DIR}/${RUN_ID}/run-state.json"
        [ -f "$RUN_STATE_FILE" ] || { echo "run-state.json not found at ${RUN_STATE_FILE}" >&2; exit 2; }

        FEATURE_ID=$(resolve_id "$PLANS_DIR" "$FEATURE_INPUT") || {
            echo "feature not found: ${FEATURE_INPUT}" >&2; exit 2;
        }
        FEATURE_FILE=$(resolve_file "$PLANS_DIR" "$FEATURE_INPUT")
        FEATURE_DIR=$(dirname "$FEATURE_FILE")
        FEATURE_SLUG=$(basename "$FEATURE_DIR")

        NOW=$(now_utc)

        # Side 1: run-state.json
        if command -v python3 >/dev/null 2>&1; then
            python3 - "$RUN_STATE_FILE" "$FEATURE_ID" "$FEATURE_SLUG" "$ANCHOR_TASK" "$NOW" <<'PYEOF'
import json, sys
path, fid, slug, anchor, now = sys.argv[1:6]
with open(path) as f:
    data = json.load(f)
data["feature_id"] = fid
data["feature_slug"] = slug
data["feature_linked_at"] = now
if anchor:
    data.setdefault("anchor", {})
    data["anchor"]["task_id"] = anchor
with open(path, "w") as f:
    json.dump(data, f, indent=2)
PYEOF
        else
            echo "python3 required for run-state JSON mutation" >&2
            exit 5
        fi

        # Side 2: feature.md `## Runs` section
        if ! grep -qE '^## Runs' "$FEATURE_FILE"; then
            {
                echo ""
                echo "## Runs"
                echo ""
                echo "| Run | Status | Started | Anchor |"
                echo "|---|---|---|---|"
            } >> "$FEATURE_FILE"
        fi

        ANCHOR_DISPLAY="${ANCHOR_TASK:-—}"
        RUN_ID_RE=$(_re_escape "$RUN_ID")
        # Idempotency: replace existing row for this RUN_ID if present, else append.
        if grep -qE "^\|[[:space:]]*${RUN_ID_RE}[[:space:]]*\|" "$FEATURE_FILE"; then
            local_tmp=$(mktemp "${FEATURE_FILE}.XXXXXX")
            awk -v rid="$RUN_ID" -v rid_re="$RUN_ID_RE" -v st="$STATUS" -v at="$NOW" -v ad="$ANCHOR_DISPLAY" '
                BEGIN { rep = "| " rid " | " st " | " at " | " ad " |" }
                $0 ~ "^\\|[[:space:]]*" rid_re "[[:space:]]*\\|" { print rep; next }
                { print }
            ' "$FEATURE_FILE" > "$local_tmp"
            mv "$local_tmp" "$FEATURE_FILE"
        else
            echo "| ${RUN_ID} | ${STATUS} | ${NOW} | ${ANCHOR_DISPLAY} |" >> "$FEATURE_FILE"
        fi

        append_history "$PLANS_DIR" "{\"ts\":\"${NOW}\",\"verb\":\"link-run\",\"run_id\":\"${RUN_ID}\",\"feature_id\":\"${FEATURE_ID}\",\"status\":\"${STATUS}\",\"anchor\":\"${ANCHOR_TASK}\"}"

        echo "linked: ${RUN_ID} ↔ ${FEATURE_ID} (status: ${STATUS}${ANCHOR_TASK:+, anchor: $ANCHOR_TASK})"
        ;;
    unlink)
        RUN_ID="${1:-}"
        FEATURE_INPUT="${2:-}"
        [ -n "$RUN_ID" ] && [ -n "$FEATURE_INPUT" ] || { echo "usage: unlink <RUN_ID> <FEATURE_INPUT>" >&2; exit 5; }

        FEATURE_FILE=$(resolve_file "$PLANS_DIR" "$FEATURE_INPUT") || { echo "feature not found" >&2; exit 2; }
        NOW=$(now_utc)
        RUN_ID_RE=$(_re_escape "$RUN_ID")
        local_tmp=$(mktemp "${FEATURE_FILE}.XXXXXX")
        awk -v rid="$RUN_ID" -v rid_re="$RUN_ID_RE" -v at="$NOW" '
            $0 ~ "^\\|[[:space:]]*" rid_re "[[:space:]]*\\|" {
                # Replace status with "discarded" and update timestamp column.
                n = split($0, parts, "|")
                # Cells indexed 2..(n-1) — preserve cell 2 (RUN_ID), set cell 3 = "discarded", cell 4 = timestamp
                printf "|%s| discarded |%s|%s|\n", parts[2], at, parts[5]
                next
            }
            { print }
        ' "$FEATURE_FILE" > "$local_tmp"
        mv "$local_tmp" "$FEATURE_FILE"

        FEATURE_ID=$(get_field "$FEATURE_FILE" "id")
        append_history "$PLANS_DIR" "{\"ts\":\"${NOW}\",\"verb\":\"unlink-run\",\"run_id\":\"${RUN_ID}\",\"feature_id\":\"${FEATURE_ID}\"}"
        echo "unlinked: ${RUN_ID} (marked discarded in ${FEATURE_ID})"
        ;;
    list)
        FEATURE_INPUT="${1:-}"
        [ -n "$FEATURE_INPUT" ] || { echo "usage: list <FEATURE_INPUT>" >&2; exit 5; }
        FEATURE_FILE=$(resolve_file "$PLANS_DIR" "$FEATURE_INPUT") || { echo "feature not found" >&2; exit 2; }

        # Print every row in the `## Runs` table.
        awk '
            /^## Runs/ { in_runs=1; next }
            /^## / && in_runs { exit }
            in_runs && /^\| [A-Za-z0-9_.-]+ \|/ { print }
        ' "$FEATURE_FILE"
        ;;
    *)
        echo "unknown subcommand: $SUBCMD" >&2; exit 5 ;;
esac
