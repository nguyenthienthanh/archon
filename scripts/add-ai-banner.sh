#!/usr/bin/env bash
# Add the AI-consumed banner to every skill / rule that doesn't have one.
#
# Banner text per spec §8.2 — placed AFTER any YAML frontmatter, BEFORE first H1.
# If a file already contains the marker string "AI-consumed reference." the file
# is skipped (idempotent).
#
# Usage:
#   bash scripts/add-ai-banner.sh           # apply
#   bash scripts/add-ai-banner.sh --dry-run # report only

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

BANNER='> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.'

ADDED=0
SKIPPED=0

# Process a file: insert banner after frontmatter (if any), else at top.
process_file() {
  local f="$1"
  # Skip if already has the banner marker
  if grep -q "AI-consumed reference" "$f" 2>/dev/null; then
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  if [ $DRY_RUN -eq 1 ]; then
    echo "WOULD ADD: $f"
    ADDED=$((ADDED + 1))
    return
  fi

  # Detect frontmatter (first line "---" + close at second "---")
  local has_frontmatter=0
  if head -1 "$f" 2>/dev/null | grep -q '^---$'; then
    has_frontmatter=1
  fi

  local tmp
  tmp=$(mktemp)

  if [ $has_frontmatter -eq 1 ]; then
    # Find the second "---" line number
    local fm_end
    fm_end=$(awk '/^---$/{c++; if (c==2) {print NR; exit}}' "$f")
    if [ -z "$fm_end" ]; then
      echo "✗ $f: opens with --- but no closing --- found; skipping" >&2
      SKIPPED=$((SKIPPED + 1))
      rm "$tmp"
      return
    fi
    # Print frontmatter + blank + banner + blank + rest
    head -n "$fm_end" "$f" > "$tmp"
    printf '\n%s\n\n' "$BANNER" >> "$tmp"
    tail -n +$((fm_end + 1)) "$f" >> "$tmp"
  else
    # No frontmatter — banner at top
    printf '%s\n\n' "$BANNER" > "$tmp"
    cat "$f" >> "$tmp"
  fi

  mv "$tmp" "$f"
  echo "added: $f"
  ADDED=$((ADDED + 1))
}

# Skills
while IFS= read -r f; do
  process_file "$f"
done < <(find archon-os/skills -maxdepth 2 -name 'SKILL.md' -type f | sort)

# Rules (exclude READMEs)
while IFS= read -r f; do
  process_file "$f"
done < <(find archon-os/rules -name '*.md' ! -name 'README.md' -type f | sort)

echo ""
echo "Summary:"
echo "  Banner added : $ADDED"
echo "  Skipped      : $SKIPPED (already had banner OR malformed frontmatter)"

[ $DRY_RUN -eq 1 ] && echo "  (dry-run: no files changed)"
