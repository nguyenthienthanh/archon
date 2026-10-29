#!/usr/bin/env bash
# Validate doc maturity frontmatter (per FEAT-006 STORY-0007 / spec §7.2).
#
# Every docs/**/*.md must have YAML frontmatter with required fields:
#   last_aligned_with: v<major>.<minor>.<patch>
#   status: current | reference | needs_review | archive
#   audience: first-time | active-user | power-user | contributor
#   estimated_reading_time: <optional, "N minutes">
#
# Rules:
#   1. Frontmatter MUST exist (block delimited by lines of "---")
#   2. status=current docs must have last_aligned_with within 2 minor
#      versions of the current plugin version (archon-os/stats.json#version)
#   3. status=needs_review emits a WARNING (non-blocking)
#   4. status=archive must be under docs/marketing/ OR have "pre-v" in filename
#   5. status=reference has no staleness check (timeless architecture content)
#   6. docs/showcase/ is exempt entirely (sample output, not "doc" per se)
#   7. docs/specs/ is exempt (spec content; may quote old syntax intentionally)
#
# Usage:
#   bash archon-os/scripts/ci/validate-doc-maturity.sh
#
# Exit codes:
#   0  all docs valid; warnings allowed
#   1  one or more errors — fix before commit

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
STATS_JSON="${REPO_ROOT}/archon-os/stats.json"

if [ ! -f "$STATS_JSON" ]; then
  echo "✗ stats.json not found at $STATS_JSON" >&2
  exit 1
fi

# Read current plugin version from stats.json
CURRENT_VER=$(python3 -c "import json; print(json.load(open('${STATS_JSON}'))['version'])" 2>/dev/null)
if [ -z "$CURRENT_VER" ]; then
  echo "✗ Could not parse version from stats.json" >&2
  exit 1
fi

IFS=. read -ra V <<< "$CURRENT_VER"
CUR_MAJOR=${V[0]}
CUR_MINOR=${V[1]}

cd "$REPO_ROOT"

EXEMPT_DIRS=(
  "docs/showcase/"
  "docs/specs/"
)

is_exempt() {
  local f="$1"
  for d in "${EXEMPT_DIRS[@]}"; do
    case "$f" in
      *"$d"*) return 0 ;;
    esac
  done
  return 1
}

ERRORS=0
WARNINGS=0

while IFS= read -r f; do
  is_exempt "$f" && continue

  # Check frontmatter exists (first line "---")
  if ! head -1 "$f" 2>/dev/null | grep -q '^---$'; then
    echo "✗ $f: missing frontmatter"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Extract frontmatter block (between first and second "---")
  fm=$(awk '/^---$/{c++; next} c==1{print}' "$f" 2>/dev/null)

  status=$(echo "$fm" | grep '^status:' | head -1 | awk '{print $2}' | tr -d '"')
  aligned=$(echo "$fm" | grep '^last_aligned_with:' | head -1 | awk '{print $2}' | tr -d '"')

  if [ -z "$status" ]; then
    echo "✗ $f: missing 'status' field in frontmatter"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  if [ -z "$aligned" ]; then
    echo "✗ $f: missing 'last_aligned_with' field in frontmatter"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  case "$status" in
    current)
      # Parse aligned version (strip leading v)
      ver_clean="${aligned#v}"
      IFS=. read -ra A <<< "$ver_clean"
      a_major=${A[0]:-0}
      a_minor=${A[1]:-0}

      # Reject malformed versions
      if [ -z "${A[1]:-}" ]; then
        echo "✗ $f: last_aligned_with='$aligned' is not in vN.M.P form"
        ERRORS=$((ERRORS + 1))
        continue
      fi

      diff=$(( (CUR_MAJOR - a_major) * 100 + (CUR_MINOR - a_minor) ))
      if [ "$diff" -gt 2 ]; then
        echo "⚠ $f: status=current but last_aligned_with=$aligned (current=$CURRENT_VER, diff=$diff minor versions)"
        WARNINGS=$((WARNINGS + 1))
      fi
      ;;
    needs_review)
      echo "⚠ $f: status=needs_review (last aligned with $aligned)"
      WARNINGS=$((WARNINGS + 1))
      ;;
    archive)
      # Archive docs must live under docs/marketing/ OR have "pre-v" in filename
      if [[ "$f" != *"docs/marketing/"* ]] && [[ "$f" != *"pre-v"* ]]; then
        echo "✗ $f: status=archive must be under docs/marketing/ or have 'pre-v' in filename"
        ERRORS=$((ERRORS + 1))
      fi
      ;;
    reference)
      # No staleness check — timeless content (architecture deep-dives, reference materials)
      ;;
    *)
      echo "✗ $f: invalid status '$status' (must be: current | reference | needs_review | archive)"
      ERRORS=$((ERRORS + 1))
      ;;
  esac
done < <(find docs -name '*.md' -type f)

echo ""
if [ $ERRORS -gt 0 ]; then
  echo "Found $ERRORS error(s) and $WARNINGS warning(s) in doc maturity. Block commit."
  exit 1
fi

echo "✓ Doc maturity: $WARNINGS doc(s) flagged for review (non-blocking)"
exit 0
