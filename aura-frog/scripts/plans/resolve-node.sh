#!/usr/bin/env bash
# Resolve a user-supplied node reference to a single node file path.
#
# Usage: bash aura-frog/scripts/plans/resolve-node.sh <input> [.claude/plans/ path]
#
# Input forms:
#   - Full ID:        FEAT-A | INIT-001 | TASK-00042 | STORY-0007 | MISSION
#   - Title substring (case-insensitive): "auth flow", "billing"
#   - Special tokens: --active  (active.task) | --feature (active.feature) | --story (active.story)
#
# Exit codes:
#   0  single match — prints "<NODE_ID>\t<file_path>" on stdout
#   1  multi-match  — prints all candidates as "<NODE_ID>\t<file_path>" (one per line)
#   2  no match     — prints nothing
#   3  bad input    — argv missing or plans dir missing

set -euo pipefail

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

INPUT="${1:-}"
PLANS_DIR=$(plans_dir "${2:-}")

if [ -z "${INPUT}" ]; then
    echo "usage: resolve-node.sh <input> [plans_dir]" >&2
    exit 3
fi

if [ ! -d "${PLANS_DIR}" ]; then
    echo "plans dir not found: ${PLANS_DIR}" >&2
    exit 3
fi

# ---- helpers ----

# ---- special tokens ----
case "${INPUT}" in
    --active|--task)
        ACTIVE_JSON="${PLANS_DIR}/active.json"
        [ -f "${ACTIVE_JSON}" ] || exit 2
        ID=$(grep -oE '"task"[[:space:]]*:[[:space:]]*"[^"]+"' "${ACTIVE_JSON}" | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true)
        [ -z "${ID}" ] || [ "${ID}" = "null" ] && exit 2
        INPUT="${ID}"
        ;;
    --feature)
        ACTIVE_JSON="${PLANS_DIR}/active.json"
        [ -f "${ACTIVE_JSON}" ] || exit 2
        ID=$(grep -oE '"feature"[[:space:]]*:[[:space:]]*"[^"]+"' "${ACTIVE_JSON}" | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true)
        [ -z "${ID}" ] || [ "${ID}" = "null" ] && exit 2
        INPUT="${ID}"
        ;;
    --story)
        ACTIVE_JSON="${PLANS_DIR}/active.json"
        [ -f "${ACTIVE_JSON}" ] || exit 2
        ID=$(grep -oE '"story"[[:space:]]*:[[:space:]]*"[^"]+"' "${ACTIVE_JSON}" | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true)
        [ -z "${ID}" ] || [ "${ID}" = "null" ] && exit 2
        INPUT="${ID}"
        ;;
    --initiative)
        ACTIVE_JSON="${PLANS_DIR}/active.json"
        [ -f "${ACTIVE_JSON}" ] || exit 2
        ID=$(grep -oE '"initiative"[[:space:]]*:[[:space:]]*"[^"]+"' "${ACTIVE_JSON}" | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true)
        [ -z "${ID}" ] || [ "${ID}" = "null" ] && exit 2
        INPUT="${ID}"
        ;;
esac

# ---- collect candidates ----
ALL_NODES=$(find "${PLANS_DIR}" -name '*.md' -not -path '*/archive/*' 2>/dev/null || true)
[ -z "${ALL_NODES}" ] && exit 2

# Pass 1: exact ID match (case-insensitive on the input; IDs in files are canonical case)
# Plan IDs are uppercase (MISSION, INIT-*, FEAT-*, STORY-*, TASK-*).
NORMALIZED_INPUT=$(echo "${INPUT}" | tr '[:lower:]' '[:upper:]')

EXACT_MATCHES=""
for f in ${ALL_NODES}; do
    id=$(get_field "$f" "id")
    [ -z "$id" ] && continue
    if [ "$id" = "${NORMALIZED_INPUT}" ]; then
        EXACT_MATCHES="${EXACT_MATCHES}${id}	${f}
"
    fi
done

EXACT_COUNT=$(printf '%s' "${EXACT_MATCHES}" | grep -c '^' || true)

if [ "${EXACT_COUNT}" = "1" ]; then
    printf '%s' "${EXACT_MATCHES}"
    exit 0
fi

if [ "${EXACT_COUNT}" -gt 1 ]; then
    printf '%s' "${EXACT_MATCHES}"
    exit 1
fi

# Pass 2: title (intent) substring match — only if Pass 1 had zero exact hits
SUBSTR_MATCHES=""
LOWER_INPUT=$(echo "${INPUT}" | tr '[:upper:]' '[:lower:]')

for f in ${ALL_NODES}; do
    intent=$(get_field "$f" "intent")
    [ -z "$intent" ] && continue
    lower_intent=$(echo "$intent" | tr '[:upper:]' '[:lower:]')
    case "$lower_intent" in
        *"${LOWER_INPUT}"*)
            id=$(get_field "$f" "id")
            [ -z "$id" ] && continue
            SUBSTR_MATCHES="${SUBSTR_MATCHES}${id}	${f}
"
            ;;
    esac
done

SUBSTR_COUNT=$(printf '%s' "${SUBSTR_MATCHES}" | grep -c '^' || true)

if [ "${SUBSTR_COUNT}" = "1" ]; then
    printf '%s' "${SUBSTR_MATCHES}"
    exit 0
fi

if [ "${SUBSTR_COUNT}" -gt 1 ]; then
    printf '%s' "${SUBSTR_MATCHES}"
    exit 1
fi

exit 2
