#!/usr/bin/env bash
# Aura Frog Conflict Detection — L2 (Syntactic / function-overlap)
#
# Spec §21.2: function/region overlap. Triggers when L1 finds file overlap.
# For each overlapping file, regex-extract function/class/def declarations
# and check if proposed task and sibling target the same symbols.
#
# Inputs:
#   --files <a,b,c>          — files with L1 overlap (focus scope)
#   --task-functions <map>   — task: comma-separated function names per file
#                               format: "file1=fn1,fn2;file2=fn3"
#   --siblings-functions ... — same shape; sibling node functions
#
# Output (JSON):
#   {"layer":"L2","overlap":true,"confidence":0.85,"functions":["src/auth.py:verify_token"]}
#   {"layer":"L2","overlap":false,"confidence":0.85}
#
# Exit codes: 0 no overlap / 1 overlap / 2 error
#
# Heuristic: lower confidence than L1 (0.85 vs 1.0) since regex on function
# names is sometimes wrong (overloaded names, comments-in-code, etc.).

set -e

FILES=""
TASK_FNS=""
SIB_FNS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --files)              FILES="$2"; shift 2 ;;
    --task-functions)     TASK_FNS="$2"; shift 2 ;;
    --siblings-functions) SIB_FNS="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [ -z "$FILES" ]; then
  echo '{"layer":"L2","overlap":false,"confidence":0.85,"reason":"no_files_in_scope"}'
  exit 0
fi

# Helper: regex-extract function/class/def names from a file
extract_symbols() {
  local file="$1"
  [ ! -f "$file" ] && return
  # Cover common languages: js/ts (function|const|class), py (def|class), go (func), rust (fn)
  grep -hoE '^[[:space:]]*(export[[:space:]]+)?(async[[:space:]]+)?(function|class|def|fn|func|const|let|var)[[:space:]]+[a-zA-Z_$][a-zA-Z0-9_$]*' "$file" 2>/dev/null \
    | sed -E 's/.*[[:space:]]+([a-zA-Z_$][a-zA-Z0-9_$]*).*/\1/' \
    | sort -u
}

# Build symbol maps from filesystem (when caller didn't pass them)
declare -A TASK_SYMS
declare -A SIB_SYMS

if [ -n "$TASK_FNS" ]; then
  IFS=';' read -ra ENTRIES <<< "$TASK_FNS"
  for entry in "${ENTRIES[@]}"; do
    F="${entry%%=*}"
    TASK_SYMS["$F"]="${entry#*=}"
  done
fi

if [ -n "$SIB_FNS" ]; then
  IFS=';' read -ra ENTRIES <<< "$SIB_FNS"
  for entry in "${ENTRIES[@]}"; do
    F="${entry%%=*}"
    SIB_SYMS["$F"]="${entry#*=}"
  done
fi

OVERLAPPING=()

IFS=',' read -ra FILE_LIST <<< "$FILES"
for file in "${FILE_LIST[@]}"; do
  file_trim=$(echo "$file" | xargs)
  [ -z "$file_trim" ] && continue

  # Use provided maps if available, else extract from filesystem
  if [ -n "${TASK_SYMS[$file_trim]:-}" ]; then
    TASK_SET=$(echo "${TASK_SYMS[$file_trim]}" | tr ',' '\n' | sort -u)
  elif [ -f "$file_trim" ]; then
    TASK_SET=$(extract_symbols "$file_trim")
  else
    continue
  fi

  if [ -n "${SIB_SYMS[$file_trim]:-}" ]; then
    SIB_SET=$(echo "${SIB_SYMS[$file_trim]}" | tr ',' '\n' | sort -u)
  elif [ -f "$file_trim" ]; then
    SIB_SET=$(extract_symbols "$file_trim")
  else
    continue
  fi

  [ -z "$TASK_SET" ] || [ -z "$SIB_SET" ] && continue

  COMMON=$(comm -12 <(echo "$TASK_SET") <(echo "$SIB_SET"))
  if [ -n "$COMMON" ]; then
    while IFS= read -r sym; do
      [ -n "$sym" ] && OVERLAPPING+=("${file_trim}:${sym}")
    done <<< "$COMMON"
  fi
done

if [ "${#OVERLAPPING[@]}" -eq 0 ]; then
  echo '{"layer":"L2","overlap":false,"confidence":0.85}'
  exit 0
fi

UNIQUE_FNS=$(printf '%s\n' "${OVERLAPPING[@]}" | sort -u | sed 's/.*/"&"/' | paste -sd ',' -)

cat <<EOF
{"layer":"L2","overlap":true,"confidence":0.85,"functions":[${UNIQUE_FNS}]}
EOF

exit 1
