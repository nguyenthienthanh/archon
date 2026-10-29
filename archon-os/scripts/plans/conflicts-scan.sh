#!/usr/bin/env bash
# Inspect / scan the conflicts log.
#
# Usage:
#   conflicts-scan.sh list [--open]
#   conflicts-scan.sh show <CONFLICT-ID>
#   conflicts-scan.sh resolve <CONFLICT-ID> <choice>
#   conflicts-scan.sh history
#   conflicts-scan.sh check         # invoke L1+L2 detector hook (if present)
#
# Choice for `resolve`:
#   accept-proposed | accept-blocker | sequential <which-first> | freeze-both | escalate
#
# Exit codes:
#   0 success
#   2 conflict-id not found
#   3 detector not available
#   5 bad input

set -euo pipefail

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

PLANS_DIR=""  # resolved below via plans_dir
SUBCMD="${1:-}"
[ -n "$SUBCMD" ] || { echo "usage: conflicts-scan.sh list|show|resolve|history|check ..." >&2; exit 5; }
shift || true

# Support --plans-dir anywhere in remaining argv (both `--plans-dir X` and `--plans-dir=X`).
ARGS=()
SKIP_NEXT=0
for i in $(seq 1 $#); do
    a="${!i}"
    if [ "$SKIP_NEXT" = "1" ]; then SKIP_NEXT=0; continue; fi
    case "$a" in
        --plans-dir=*) PLANS_DIR="${a#--plans-dir=}" ;;
        --plans-dir)
            # Peek next arg.
            next_i=$((i + 1))
            PLANS_DIR="${!next_i}"
            SKIP_NEXT=1
            ;;
        *) ARGS+=("$a") ;;
    esac
done

PLANS_DIR=$(plans_dir "$PLANS_DIR")
if [ ${#ARGS[@]} -gt 0 ]; then
    set -- "${ARGS[@]}"
else
    set --
fi

CONFLICTS_LOG="${PLANS_DIR}/conflicts.jsonl"
touch "$CONFLICTS_LOG"

case "$SUBCMD" in
    list)
        OPEN_ONLY=0
        for a in "$@"; do [ "$a" = "--open" ] && OPEN_ONLY=1; done
        # Fold: latest record per conflict_id wins.
        awk -F'"conflict_id":"' 'NF>1 { id=$2; sub(/".*/, "", id); rec[id]=$0 } END { for (k in rec) print rec[k] }' \
            "$CONFLICTS_LOG" | sort | while IFS= read -r line; do
            [ -z "$line" ] && continue
            id=$(echo "$line" | grep -oE '"conflict_id":"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
            res=$(echo "$line" | grep -oE '"resolution":[[:space:]]*"[^"]+"' | sed 's/.*"\([^"]*\)"$/\1/' || true)
            level=$(echo "$line" | grep -oE '"level":[[:space:]]*"[^"]+"' | sed 's/.*"\([^"]*\)"$/\1/' || true)
            participants=$(echo "$line" | grep -oE '"participants":\[[^]]*\]' || true)
            state="open"
            [ -n "$res" ] && [ "$res" != "null" ] && state="resolved"
            [ "$OPEN_ONLY" = "1" ] && [ "$state" != "open" ] && continue
            printf '%s  [%s]  %s  %s\n' "$id" "$state" "${level:-?}" "$participants"
        done
        ;;
    show)
        CID="${1:-}"
        [ -n "$CID" ] || { echo "usage: conflicts-scan.sh show <CONFLICT-ID>" >&2; exit 5; }
        MATCHES=$(grep -F "\"conflict_id\":\"${CID}\"" "$CONFLICTS_LOG" || true)
        [ -z "$MATCHES" ] && { echo "no conflict ${CID}" >&2; exit 2; }
        echo "$MATCHES"
        ;;
    resolve)
        CID="${1:-}"; CHOICE="${2:-}"
        [ -n "$CID" ] && [ -n "$CHOICE" ] || { echo "usage: conflicts-scan.sh resolve <CONFLICT-ID> <choice>" >&2; exit 5; }
        case "$CHOICE" in
            accept-proposed|accept-blocker|sequential|freeze-both|escalate) ;;
            *) echo "unknown choice '$CHOICE'" >&2; exit 5 ;;
        esac
        grep -qF "\"conflict_id\":\"${CID}\"" "$CONFLICTS_LOG" || { echo "no conflict ${CID}" >&2; exit 2; }
        NOW=$(now_utc)
        REC="{\"ts\":\"${NOW}\",\"conflict_id\":\"${CID}\",\"resolution\":\"${CHOICE}\",\"resolved_by\":\"user\"}"
        printf '%s\n' "$REC" >> "$CONFLICTS_LOG"
        append_history "$PLANS_DIR" "{\"ts\":\"${NOW}\",\"verb\":\"conflicts.resolve\",\"target\":\"${CID}\",\"choice\":\"${CHOICE}\"}"
        echo "resolved: ${CID} → ${CHOICE}"
        ;;
    history)
        cat "$CONFLICTS_LOG"
        ;;
    check)
        # Delegate to conflict-detector hook if available.
        DETECTOR="${CLAUDE_PLUGIN_ROOT:-$(dirname "$SCRIPT_DIR")/..}/hooks/conflict-detector.cjs"
        if [ ! -f "$DETECTOR" ]; then
            echo "conflict-detector hook not found at ${DETECTOR}" >&2
            exit 3
        fi
        node "$DETECTOR" --scan-now --plans-dir "$PLANS_DIR" 2>&1 || true
        ;;
    *)
        echo "unknown subcommand: $SUBCMD" >&2; exit 5 ;;
esac
