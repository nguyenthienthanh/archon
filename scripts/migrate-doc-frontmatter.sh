#!/usr/bin/env bash
# One-shot migration: add frontmatter to every docs/**/*.md that doesn't have it.
#
# Defaults per directory (matches validate-doc-maturity.sh expectations):
#   docs/getting-started/*  → status: current, audience: first-time
#   docs/architecture/*     → status: reference, audience: power-user
#   docs/guides/*           → status: needs_review, audience: active-user
#   docs/operations/*       → status: current, audience: active-user
#   docs/reference/*        → status: reference, audience: contributor
#   docs/marketing/*        → status: archive, audience: contributor
#   docs/showcase/*         → SKIPPED (exempt)
#   docs/specs/*            → SKIPPED (exempt)
#   docs root *.md          → status: current, audience: active-user
#
# Idempotent: files that already have frontmatter are skipped.
#
# Usage:
#   bash scripts/migrate-doc-frontmatter.sh           # apply
#   bash scripts/migrate-doc-frontmatter.sh --dry-run # report only

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Read current version
VERSION=$(python3 -c "import json; print(json.load(open('archon-os/stats.json'))['version'])" 2>/dev/null || echo "3.7.4")
VERSION_TAG="v${VERSION}"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

# Map a file path to its (status, audience) defaults.
defaults_for() {
  local f="$1"
  case "$f" in
    docs/getting-started/*) echo "current first-time" ;;
    docs/architecture/*)    echo "reference power-user" ;;
    docs/guides/*)          echo "needs_review active-user" ;;
    docs/operations/*)      echo "current active-user" ;;
    docs/reference/*)       echo "reference contributor" ;;
    docs/marketing/*pre-v*) echo "archive contributor" ;;
    docs/marketing/*)       echo "current active-user" ;;
    docs/showcase/*)        echo "SKIP" ;;
    docs/specs/*)           echo "SKIP" ;;
    docs/*.md)              echo "current active-user" ;;
    *)                      echo "SKIP" ;;
  esac
}

ADDED=0
SKIPPED_HAS=0
SKIPPED_EXEMPT=0

while IFS= read -r f; do
  defaults=$(defaults_for "$f")
  if [ "$defaults" = "SKIP" ]; then
    SKIPPED_EXEMPT=$((SKIPPED_EXEMPT + 1))
    continue
  fi

  # Skip if frontmatter already exists
  if head -1 "$f" 2>/dev/null | grep -q '^---$'; then
    SKIPPED_HAS=$((SKIPPED_HAS + 1))
    continue
  fi

  status="${defaults%% *}"
  audience="${defaults#* }"

  if [ $DRY_RUN -eq 1 ]; then
    echo "WOULD ADD: $f (status=$status, audience=$audience)"
    ADDED=$((ADDED + 1))
    continue
  fi

  # Prepend frontmatter. Use a temp file for atomic write.
  tmp=$(mktemp)
  {
    printf '%s\n' "---"
    printf '%s\n' "last_aligned_with: $VERSION_TAG"
    printf '%s\n' "status: $status"
    printf '%s\n' "audience: $audience"
    printf '%s\n' "---"
    printf '\n'
    cat "$f"
  } > "$tmp"
  mv "$tmp" "$f"
  echo "added: $f (status=$status, audience=$audience)"
  ADDED=$((ADDED + 1))
done < <(find docs -name '*.md' -type f | sort)

echo ""
echo "Summary:"
echo "  Frontmatter added : $ADDED"
echo "  Already had       : $SKIPPED_HAS"
echo "  Exempt (skipped)  : $SKIPPED_EXEMPT"

[ $DRY_RUN -eq 1 ] && echo "  (dry-run: no files changed)"
