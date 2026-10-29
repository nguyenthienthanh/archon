#!/usr/bin/env bash
# Aura Frog Pre-flight: secret-pattern detector
# Scans content (Edit/Write payloads) for credentials being committed accidentally.
#
# Exit codes: 0 pass / 1 warn / 2 fail
#
# Usage:
#   check-secret-patterns.sh "<content string>"
#   cat file.txt | check-secret-patterns.sh --stdin

set -e

CONTENT=""
if [ "$1" = "--stdin" ]; then
  CONTENT=$(cat)
elif [ -n "$1" ]; then
  CONTENT="$*"
fi

[ -z "$CONTENT" ] && exit 0

# Hard-fail patterns — high-confidence secrets
HARD_PATTERNS=(
  'AKIA[0-9A-Z]{16}'                                  # AWS access key
  'aws_secret_access_key[[:space:]]*=[[:space:]]*[A-Za-z0-9/+=]{40}' # AWS secret
  'AIza[0-9A-Za-z_\-]{35}'                            # Google API key
  'ya29\.[0-9A-Za-z_\-]+'                             # Google OAuth
  'sk-[A-Za-z0-9]{32,}'                               # OpenAI / Anthropic-shaped
  'sk-ant-[A-Za-z0-9_\-]{40,}'                        # Anthropic
  'ghp_[A-Za-z0-9]{36}'                               # GitHub personal token
  'gho_[A-Za-z0-9]{36}'                               # GitHub OAuth token
  'ghs_[A-Za-z0-9]{36}'                               # GitHub server token
  'github_pat_[A-Za-z0-9_]{82}'                       # GitHub fine-grained
  'glpat-[A-Za-z0-9_\-]{20}'                          # GitLab PAT
  'xox[baprs]-[A-Za-z0-9-]{10,}'                      # Slack token
  '-----BEGIN[[:space:]]+(RSA|OPENSSH|EC|DSA|PGP)[[:space:]]+PRIVATE[[:space:]]+KEY-----'  # Private key
)

for pat in "${HARD_PATTERNS[@]}"; do
  if echo "$CONTENT" | grep -qE "$pat" 2>/dev/null; then
    # Don't echo the matched secret; just the pattern label
    echo "preflight:secrets FAIL: high-confidence credential pattern detected" >&2
    echo "  pattern class: $(echo "$pat" | head -c 30)..." >&2
    exit 2
  fi
done

# Warn patterns — heuristic; may be example values
WARN_PATTERNS=(
  '(password|passwd)[[:space:]]*[:=][[:space:]]*"[^"<>\$\{]{8,}"'
  '(api[_-]?key|apikey|secret)[[:space:]]*[:=][[:space:]]*"[A-Za-z0-9_\-]{16,}"'
  '(token|bearer)[[:space:]]*[:=][[:space:]]*"[A-Za-z0-9_\.\-]{20,}"'
  'eyJ[A-Za-z0-9_\-]{20,}\.eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}'  # JWT
)

for pat in "${WARN_PATTERNS[@]}"; do
  if echo "$CONTENT" | grep -qE "$pat" 2>/dev/null; then
    echo "preflight:secrets WARN: heuristic credential pattern; verify it's a placeholder/test value" >&2
    exit 1
  fi
done

exit 0
