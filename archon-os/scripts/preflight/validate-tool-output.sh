#!/usr/bin/env bash
# Aura Frog Pre-flight: tool output sanity
# Lightweight checks on tool output (post-execution). Verifies output isn't
# obviously corrupt or hostile (e.g., terminal control sequences, JSON
# claiming to be JSON but malformed).
#
# Exit codes: 0 pass / 1 warn / 2 fail
#
# Usage:
#   validate-tool-output.sh
#   echo "$OUTPUT" | validate-tool-output.sh --stdin

set -e

OUTPUT=""
if [ "$1" = "--stdin" ]; then
  OUTPUT=$(cat)
elif [ -n "$CLAUDE_TOOL_OUTPUT" ]; then
  OUTPUT="$CLAUDE_TOOL_OUTPUT"
fi

[ -z "$OUTPUT" ] && exit 0

# Reject ANSI escape sequences in suspicious volume (potential prompt injection)
ANSI_COUNT=$(echo "$OUTPUT" | grep -cE $'\x1b\[' 2>/dev/null || echo 0)
if [ "$ANSI_COUNT" -gt 50 ]; then
  echo "preflight:tool-output WARN: high volume of ANSI escapes ($ANSI_COUNT) — possible terminal injection" >&2
  exit 1
fi

# Reject prompt-injection attempt phrases in tool output
INJECTION_PATTERNS=(
  'IGNORE[[:space:]]+(ALL|PREVIOUS)[[:space:]]+INSTRUCTIONS'
  'SYSTEM[[:space:]]*:[[:space:]]*you[[:space:]]+are'
  '\[\[?ASSISTANT\]?\]'
  '\<\|im_start\|\>'
  '\<\|im_end\|\>'
)
for pat in "${INJECTION_PATTERNS[@]}"; do
  if echo "$OUTPUT" | grep -iqE "$pat" 2>/dev/null; then
    echo "preflight:tool-output WARN: possible prompt-injection phrase in tool output ($pat) — review before acting" >&2
    exit 1
  fi
done

# If the tool advertised JSON output (via tool name convention or args) but it
# doesn't parse, warn — could be partial output or wrapped error
if [ "${CLAUDE_TOOL_NAME:-}" = "WebFetch" ] || echo "${CLAUDE_TOOL_ARGS:-}" | grep -q '"format":[[:space:]]*"json"'; then
  if ! echo "$OUTPUT" | jq empty >/dev/null 2>&1; then
    echo "preflight:tool-output WARN: tool advertised JSON but output didn't parse" >&2
    exit 1
  fi
fi

exit 0
