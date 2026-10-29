#!/usr/bin/env bash
# Aura Frog — MCP Input Sanitizer
#
# Strips Authorization headers, redacts token-shaped strings, truncates
# oversized fields. Reads JSON-shape input from stdin, outputs sanitized JSON.
#
# Usage:
#   echo '{"input":{"Authorization":"Bearer xyz","sql":"SELECT 1"}}' \
#     | bash scripts/security/sanitize-mcp-input.sh
#
# Exit codes: 0 always (best-effort; never blocks the call itself, only sanitizes
# what gets written to the audit log)

set -e

INPUT=$(cat)
[ -z "$INPUT" ] && { echo ""; exit 0; }

# Use jq if available — proper JSON manipulation
if command -v jq >/dev/null 2>&1; then
  echo "$INPUT" | jq '
    walk(
      if type == "object" then
        with_entries(
          if (.key | ascii_downcase) | test("authorization|x-api-key|token|secret|password|api[-_]?key|bearer") then
            .value = "[REDACTED]"
          elif (.value | type) == "string" then
            if (.value | length) > 1024 then
              .value = (.value[:1021] + "...")
            elif (.value | test("^Bearer\\s+[A-Za-z0-9._~+/=-]{20,}")) then
              .value = "[REDACTED]"
            elif (.value | test("(AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{32,}|sk-ant-[A-Za-z0-9_-]{40,}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})")) then
              .value = "[REDACTED]"
            else
              .
            end
          else
            .
          end
        )
      else
        .
      end
    )
  '
else
  # Fallback: basic sed-based sanitization
  echo "$INPUT" \
    | sed -E 's/"[Aa]uthorization"[[:space:]]*:[[:space:]]*"[^"]*"/"Authorization":"[REDACTED]"/g' \
    | sed -E 's/"[Bb]earer[[:space:]]+[A-Za-z0-9._~+\/=-]{20,}"/"[REDACTED]"/g' \
    | sed -E 's/(AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,})/[REDACTED]/g'
fi
