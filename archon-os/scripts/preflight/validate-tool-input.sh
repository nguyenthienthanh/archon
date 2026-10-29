#!/usr/bin/env bash
# Aura Frog Pre-flight: tool input shape sanity
# Sniff CLAUDE_TOOL_NAME + CLAUDE_TOOL_ARGS env vars; warn on common shape errors.
#
# Exit codes: 0 pass / 1 warn / 2 fail
#
# Usage:
#   validate-tool-input.sh

set -e

# jq parses CLAUDE_TOOL_ARGS below. Without it on PATH, every field read returns
# empty and the "missing <field>" FAILs would fire on perfectly valid input —
# blocking EVERY tool call. Degrade gracefully (like the rest of the repo's
# jq-optional scripts): skip shape validation when jq is unavailable.
command -v jq >/dev/null 2>&1 || exit 0

TOOL="${CLAUDE_TOOL_NAME:-}"
ARGS="${CLAUDE_TOOL_ARGS:-}"

[ -z "$TOOL" ] && exit 0

case "$TOOL" in
  Read)
    if [ -n "$ARGS" ]; then
      FP=$(echo "$ARGS" | jq -r '.file_path // ""' 2>/dev/null || echo "")
      [ -z "$FP" ] && {
        echo "preflight:tool-input FAIL: Read tool missing file_path" >&2
        exit 2
      }
      [[ "$FP" != /* ]] && {
        echo "preflight:tool-input WARN: Read file_path '$FP' is relative; absolute path is required by Read tool" >&2
        exit 1
      }
    fi
    ;;
  Edit)
    if [ -n "$ARGS" ]; then
      OLD=$(echo "$ARGS" | jq -r '.old_string // ""' 2>/dev/null || echo "")
      NEW=$(echo "$ARGS" | jq -r '.new_string // ""' 2>/dev/null || echo "")
      [ -z "$OLD" ] && {
        echo "preflight:tool-input FAIL: Edit tool missing old_string" >&2
        exit 2
      }
      [ "$OLD" = "$NEW" ] && {
        echo "preflight:tool-input WARN: Edit old_string == new_string (no-op edit)" >&2
        exit 1
      }
    fi
    ;;
  Bash)
    if [ -n "$ARGS" ]; then
      CMD=$(echo "$ARGS" | jq -r '.command // ""' 2>/dev/null || echo "")
      [ -z "$CMD" ] && {
        echo "preflight:tool-input FAIL: Bash tool missing command" >&2
        exit 2
      }
    fi
    ;;
  Write)
    if [ -n "$ARGS" ]; then
      FP=$(echo "$ARGS" | jq -r '.file_path // ""' 2>/dev/null || echo "")
      [ -z "$FP" ] && {
        echo "preflight:tool-input FAIL: Write tool missing file_path" >&2
        exit 2
      }
    fi
    ;;
esac

exit 0
