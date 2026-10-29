#!/usr/bin/env bash
# project-refresh-incremental.sh - Incremental project context refresh
#
# Only regenerates context files when relevant source files have changed.
# Uses git diff to detect changes since last refresh.
#
# Usage:
#   ./project-refresh-incremental.sh              # Incremental refresh
#   ./project-refresh-incremental.sh --full        # Force full refresh
#
# @version 1.0.0

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Walk up from PWD looking for .claude/ or .git/ marker (matches
# hooks/lib/hook-runtime.cjs#findProjectRoot semantics).
find_project_root() {
    if [ -n "${AF_PROJECT_ROOT:-}" ]; then echo "$AF_PROJECT_ROOT"; return; fi
    local d="${1:-$PWD}"
    while [ "$d" != "/" ] && [ -n "$d" ]; do
        if [ -d "$d/.claude" ] || [ -d "$d/.git" ]; then echo "$d"; return; fi
        d=$(dirname "$d")
    done
    echo "${1:-$PWD}"
}
PROJECT_ROOT="${PROJECT_ROOT:-$(find_project_root)}"
CONTEXT_DIR="${PROJECT_ROOT}/.claude/project-contexts"
CACHE_DIR="${PROJECT_ROOT}/.claude/cache"
STAMP_FILE="${CACHE_DIR}/last-refresh-stamp"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Ensure cache dir exists
mkdir -p "$CACHE_DIR"

# Check for --full flag
FORCE_FULL=false
if [[ "${1:-}" == "--full" ]]; then
  FORCE_FULL=true
fi

# Get last refresh timestamp
LAST_REFRESH=""
if [[ -f "$STAMP_FILE" ]] && [[ "$FORCE_FULL" == "false" ]]; then
  LAST_REFRESH=$(cat "$STAMP_FILE")
fi

# Detect project name
PROJECT_NAME=$(basename "$PROJECT_ROOT")
PROJECT_CONTEXT_DIR="${CONTEXT_DIR}/${PROJECT_NAME}"

echo -e "${GREEN}🔄 Incremental Project Refresh${NC}"
echo "   Project: $PROJECT_NAME"

if [[ -z "$LAST_REFRESH" ]] || [[ "$FORCE_FULL" == "true" ]]; then
  echo -e "${YELLOW}   Mode: Full refresh (no previous stamp or --full)${NC}"
  CHANGED_FILES="all"
else
  echo "   Mode: Incremental (since $(date -r "$STAMP_FILE" '+%Y-%m-%d %H:%M' 2>/dev/null || echo 'last refresh'))"
  # Get changed files since last refresh
  CHANGED_FILES=$(git diff --name-only "$LAST_REFRESH" HEAD 2>/dev/null || echo "all")
  if [[ -z "$CHANGED_FILES" ]]; then
    # Also check untracked/unstaged
    CHANGED_FILES=$(git diff --name-only 2>/dev/null || echo "")
    if [[ -z "$CHANGED_FILES" ]]; then
      echo -e "${GREEN}   ✓ No changes detected. Skipping refresh.${NC}"
      exit 0
    fi
  fi
fi

# Determine which generators to run
RUN_REPO_MAP=false
RUN_FILE_REGISTRY=false
RUN_ARCHITECTURE=false
RUN_CONVENTIONS=false

if [[ "$CHANGED_FILES" == "all" ]]; then
  RUN_REPO_MAP=true
  RUN_FILE_REGISTRY=true
  RUN_ARCHITECTURE=true
  RUN_CONVENTIONS=true
else
  # Check which categories of files changed
  if echo "$CHANGED_FILES" | grep -qE '(package\.json|Cargo\.toml|go\.mod|pyproject\.toml|composer\.json|pubspec\.yaml)'; then
    RUN_FILE_REGISTRY=true
    RUN_ARCHITECTURE=true
  fi

  # New/deleted files → repo map needs update
  NEW_FILES=$(git diff --name-only --diff-filter=A "$LAST_REFRESH" HEAD 2>/dev/null || echo "")
  DELETED_FILES=$(git diff --name-only --diff-filter=D "$LAST_REFRESH" HEAD 2>/dev/null || echo "")
  if [[ -n "$NEW_FILES" ]] || [[ -n "$DELETED_FILES" ]]; then
    RUN_REPO_MAP=true
    RUN_FILE_REGISTRY=true
  fi

  # Source file changes → architecture might change
  if echo "$CHANGED_FILES" | grep -qE '\.(ts|tsx|js|jsx|py|go|rs|php|dart|vue|svelte)$'; then
    RUN_ARCHITECTURE=true
  fi

  # Config/style changes → conventions
  if echo "$CHANGED_FILES" | grep -qE '(\.eslintrc|\.prettierrc|tsconfig|\.editorconfig|\.env)'; then
    RUN_CONVENTIONS=true
  fi
fi

# Run generators
GENERATORS_RUN=0

if [[ "$RUN_REPO_MAP" == "true" ]] && [[ -f "$SCRIPT_DIR/repo-map-gen.sh" ]]; then
  echo "   → Regenerating repo-map.md..."
  bash "$SCRIPT_DIR/repo-map-gen.sh" 2>/dev/null && GENERATORS_RUN=$((GENERATORS_RUN + 1)) || true
fi

if [[ "$RUN_FILE_REGISTRY" == "true" ]] && [[ -f "$SCRIPT_DIR/file-registry-gen.sh" ]]; then
  echo "   → Regenerating file-registry.yaml..."
  bash "$SCRIPT_DIR/file-registry-gen.sh" 2>/dev/null && GENERATORS_RUN=$((GENERATORS_RUN + 1)) || true
fi

if [[ "$RUN_ARCHITECTURE" == "true" ]] && [[ -f "$SCRIPT_DIR/architecture-gen.sh" ]]; then
  echo "   → Regenerating architecture.md..."
  bash "$SCRIPT_DIR/architecture-gen.sh" 2>/dev/null && GENERATORS_RUN=$((GENERATORS_RUN + 1)) || true
fi

if [[ "$RUN_CONVENTIONS" == "true" ]] && [[ -f "$SCRIPT_DIR/context-compress.sh" ]]; then
  echo "   → Regenerating conventions.md..."
  bash "$SCRIPT_DIR/context-compress.sh" 2>/dev/null && GENERATORS_RUN=$((GENERATORS_RUN + 1)) || true
fi

# Clear session cache (force session-start to re-detect)
SESSION_CACHE="${CACHE_DIR}/session-start-cache.json"
if [[ -f "$SESSION_CACHE" ]]; then
  rm -f "$SESSION_CACHE"
  echo "   → Cleared session cache"
fi

# Update stamp
git rev-parse HEAD > "$STAMP_FILE" 2>/dev/null || date +%s > "$STAMP_FILE"

echo -e "${GREEN}   ✓ Refresh complete. $GENERATORS_RUN generator(s) ran.${NC}"
