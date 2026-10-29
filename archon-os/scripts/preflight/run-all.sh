#!/usr/bin/env bash
# Aura Frog Pre-flight: orchestrator
# Dispatches Tier 1 linters based on the tool context. Aggregates exit codes —
# returns the highest (most severe) exit from any linter.
#
# Exit codes:
#   0 — all pass
#   1 — at least one warn
#   2 — at least one fail (caller should block)
#
# Usage:
#   run-all.sh                   # auto-dispatch from CLAUDE_TOOL_NAME / CLAUDE_TOOL_ARGS
#   run-all.sh --files file.md   # validate-frontmatter for given files
#   run-all.sh --quiet           # only emit on non-zero

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QUIET=""
FILES=()
MAX_EXIT=0

# Proper flag parsing: `shift` inside a `for arg in "$@"` loop does not advance
# the iteration, so the old `--files) shift; FILES="$@"` captured the flag token
# itself (and any preceding flags). Use an explicit while/shift loop; --files
# consumes every following non-flag token.
while [ $# -gt 0 ]; do
  case "$1" in
    --quiet) QUIET="true"; shift ;;
    --files)
      shift
      while [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; do FILES+=("$1"); shift; done
      ;;
    *) shift ;;
  esac
done

aggregate() {
  local rc=$1
  if [ "$rc" -gt "$MAX_EXIT" ]; then
    MAX_EXIT=$rc
  fi
}

# Mode 1: explicit file list (manual / CI usage)
if [ "${#FILES[@]}" -gt 0 ]; then
  for f in "${FILES[@]}"; do
    set +e
    bash "$SCRIPT_DIR/validate-frontmatter.sh" "$f"
    aggregate $?
    set -e
  done
  exit "$MAX_EXIT"
fi

# Mode 2: auto-dispatch from tool context
TOOL="${CLAUDE_TOOL_NAME:-}"

# Always validate tool input shape if we have one
if [ -n "$TOOL" ]; then
  set +e
  bash "$SCRIPT_DIR/validate-tool-input.sh"
  aggregate $?
  set -e
fi

# Per-tool dispatch
case "$TOOL" in
  Bash)
    if [ -n "${CLAUDE_TOOL_INPUT:-}" ]; then
      set +e
      echo "$CLAUDE_TOOL_INPUT" | bash "$SCRIPT_DIR/check-command-allowlist.sh" --from-tool-input
      aggregate $?
      set -e
    elif [ -n "${CLAUDE_TOOL_ARGS:-}" ]; then
      CMD=$(echo "$CLAUDE_TOOL_ARGS" | jq -r '.command // ""' 2>/dev/null || echo "")
      if [ -n "$CMD" ]; then
        set +e
        echo "$CMD" | bash "$SCRIPT_DIR/check-command-allowlist.sh" --from-tool-input
        aggregate $?
        set -e
      fi
    fi
    ;;
  Read)
    if [ -n "${CLAUDE_TOOL_ARGS:-}" ]; then
      set +e
      echo "$CLAUDE_TOOL_ARGS" | bash "$SCRIPT_DIR/check-path-safety.sh" --from-tool-args
      aggregate $?
      set -e
    fi
    ;;
  Edit|Write)
    if [ -n "${CLAUDE_TOOL_ARGS:-}" ]; then
      set +e
      echo "$CLAUDE_TOOL_ARGS" | bash "$SCRIPT_DIR/check-path-safety.sh" --from-tool-args
      aggregate $?
      set -e

      # Secret-pattern check on Write content / Edit new_string
      CONTENT=$(echo "$CLAUDE_TOOL_ARGS" | jq -r '(.content // .new_string // "")' 2>/dev/null || echo "")
      if [ -n "$CONTENT" ]; then
        set +e
        echo "$CONTENT" | bash "$SCRIPT_DIR/check-secret-patterns.sh" --stdin
        aggregate $?
        set -e
      fi

      # Frontmatter validation if it's a markdown file
      FP=$(echo "$CLAUDE_TOOL_ARGS" | jq -r '.file_path // ""' 2>/dev/null || echo "")
      if [[ "$FP" == *.md ]] && [ -f "$FP" ]; then
        set +e
        bash "$SCRIPT_DIR/validate-frontmatter.sh" "$FP"
        aggregate $?
        set -e
      fi
    fi
    ;;
esac

if [ -z "$QUIET" ] && [ "$MAX_EXIT" -eq 0 ]; then
  : # silent on pass
fi

exit "$MAX_EXIT"
