#!/usr/bin/env bash
# Aura Frog Conflict Detection — L1 (Lexical / file-overlap)
#
# Spec §21.2: file-set intersection. Always run. p95 <100ms.
# Compares proposed task's `artifacts[].path` against pending-confirm sibling
# tasks' artifact lists. Returns conflict info if intersection is non-empty.
#
# Inputs (env or args):
#   --task <node-id>        — node to dispatch (proposed)
#   --siblings <id1,id2,...> — pending-confirm sibling node IDs to check against
#   --task-artifacts <a,b,c> — bypass file lookup; comma-separated paths
#   --siblings-artifacts ... — bypass; map of <id>=<a,b,c>; semi-separated
#
# Output (stdout, JSON):
#   {"layer":"L1","overlap":true,"confidence":1.0,"files":["src/auth.py"],"with":["TASK-00120"]}
#   {"layer":"L1","overlap":false,"confidence":1.0}
#
# Exit codes:
#   0 — no conflict (empty intersection)
#   1 — conflict detected (overlap found)
#   2 — error (bad input, missing files)
#
# Performance budget: target <100ms (no LLM, no network)

set -e

TASK_ID=""
SIBLINGS=""
TASK_ARTIFACTS=""
SIBLINGS_ARTIFACTS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --task)               TASK_ID="$2"; shift 2 ;;
    --siblings)           SIBLINGS="$2"; shift 2 ;;
    --task-artifacts)     TASK_ARTIFACTS="$2"; shift 2 ;;
    --siblings-artifacts) SIBLINGS_ARTIFACTS="$2"; shift 2 ;;
    *) shift ;;
  esac
done

PLANS_DIR="${PWD}/.claude/plans"

# Helper: extract artifact paths from a node file
get_artifacts() {
  local node_id="$1"
  local file
  file=$(find "$PLANS_DIR" -name "${node_id}.md" 2>/dev/null | head -1)
  if [ -z "$file" ]; then
    file=$(find "$PLANS_DIR" -path "*/tasks/${node_id}.md" 2>/dev/null | head -1)
  fi
  [ -z "$file" ] && { echo ""; return; }
  awk '/^---$/{c++; next} c==1' "$file" \
    | awk '
        /^artifacts:[[:space:]]*$/ { flag=1; next }
        flag && /^[a-zA-Z_][a-zA-Z0-9_-]*:/ { flag=0 }
        flag && /^[[:space:]]+- *path:/ { print }
      ' \
    | sed -E 's/.*path:[[:space:]]*([^[:space:]]+).*/\1/' \
    | sort -u
}

# Resolve task artifacts
if [ -z "$TASK_ARTIFACTS" ] && [ -n "$TASK_ID" ]; then
  TASK_ARTS=$(get_artifacts "$TASK_ID")
else
  TASK_ARTS=$(echo "$TASK_ARTIFACTS" | tr ',' '\n' | sort -u)
fi

if [ -z "$TASK_ARTS" ]; then
  echo '{"layer":"L1","overlap":false,"confidence":1.0,"reason":"task_has_no_artifacts"}'
  exit 0
fi

# Build sibling artifact map; check intersection per sibling
OVERLAPPING_SIBLINGS=()
ALL_OVERLAP_FILES=()

if [ -n "$SIBLINGS_ARTIFACTS" ]; then
  IFS=';' read -ra ENTRIES <<< "$SIBLINGS_ARTIFACTS"
  for entry in "${ENTRIES[@]}"; do
    SIB_ID="${entry%%=*}"
    SIB_ARTS=$(echo "${entry#*=}" | tr ',' '\n' | sort -u)
    OVERLAP=$(comm -12 <(echo "$TASK_ARTS") <(echo "$SIB_ARTS"))
    if [ -n "$OVERLAP" ]; then
      OVERLAPPING_SIBLINGS+=("$SIB_ID")
      while IFS= read -r line; do [ -n "$line" ] && ALL_OVERLAP_FILES+=("$line"); done <<< "$OVERLAP"
    fi
  done
elif [ -n "$SIBLINGS" ]; then
  IFS=',' read -ra SIB_IDS <<< "$SIBLINGS"
  for SIB_ID in "${SIB_IDS[@]}"; do
    SIB_ARTS=$(get_artifacts "$SIB_ID")
    [ -z "$SIB_ARTS" ] && continue
    OVERLAP=$(comm -12 <(echo "$TASK_ARTS") <(echo "$SIB_ARTS"))
    if [ -n "$OVERLAP" ]; then
      OVERLAPPING_SIBLINGS+=("$SIB_ID")
      while IFS= read -r line; do [ -n "$line" ] && ALL_OVERLAP_FILES+=("$line"); done <<< "$OVERLAP"
    fi
  done
fi

if [ "${#OVERLAPPING_SIBLINGS[@]}" -eq 0 ]; then
  echo '{"layer":"L1","overlap":false,"confidence":1.0}'
  exit 0
fi

# Dedupe arrays for output
UNIQUE_FILES=$(printf '%s\n' "${ALL_OVERLAP_FILES[@]}" | sort -u | sed 's/.*/"&"/' | paste -sd ',' -)
UNIQUE_SIBS=$(printf '%s\n' "${OVERLAPPING_SIBLINGS[@]}" | sort -u | sed 's/.*/"&"/' | paste -sd ',' -)

cat <<EOF
{"layer":"L1","overlap":true,"confidence":1.0,"files":[${UNIQUE_FILES}],"with":[${UNIQUE_SIBS}]}
EOF

exit 1
