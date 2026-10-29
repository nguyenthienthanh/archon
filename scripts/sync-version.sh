#!/bin/bash
# Aura Frog Version Sync Script
# Purpose: Synchronize version numbers across all configuration files
#
# SINGLE SOURCE OF TRUTH: archon-os/.claude-plugin/plugin.json
#
# Usage:
#   ./scripts/sync-version.sh           # Sync all files to current version
#   ./scripts/sync-version.sh 1.4.0     # Bump to new version and sync
#   ./scripts/sync-version.sh patch     # Auto-increment patch (1.3.2 -> 1.3.3)
#   ./scripts/sync-version.sh minor     # Auto-increment minor (1.3.2 -> 1.4.0)
#   ./scripts/sync-version.sh major     # Auto-increment major (1.3.2 -> 2.0.0)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PLUGIN_DIR="$PROJECT_ROOT/archon-os"

# Single source of truth
SOURCE_FILE="$PLUGIN_DIR/.claude-plugin/plugin.json"

# Version pattern (ERE, used with `sed -E` — portable across BSD and GNU sed).
# Prerelease suffix allows dots/digits: 3.8.0-alpha.7 is this project's scheme
# (same regex as archon-os/scripts/release.sh).
VERSION_PATTERN='[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?'

# Count of files actually modified — the script FAILS if this stays 0
# (a silent no-op sync is how versions drift).
CHANGED_COUNT=0

# Portable in-place sed: BSD needs `sed -i ''`, GNU needs `sed -i` — instead
# of feature-detecting, write to a temp file and move it into place.
sed_inplace() {
  local file=$1
  shift
  local tmp="$file.sedtmp"
  sed -E "$@" "$file" > "$tmp" && mv "$tmp" "$file"
}

# All files that need version updates
declare -a JSON_FILES=(
  "$PLUGIN_DIR/.claude-plugin/plugin.json"
  "$PROJECT_ROOT/.claude-plugin/marketplace.json"
)

# Only files that still carry the plugin version
# (most files had version footers removed to avoid sync issues)
declare -a MD_FILES=(
  # Legacy bridge: carries the version in its canonical-instructions comment.
  # (It was listed twice here; the second entry did the same substitutions over
  # an already-substituted file.)
  "$PLUGIN_DIR/CLAUDE.md"
  # Root README: nav line, what's-new heading, sample `/af status` output
  "$PROJECT_ROOT/README.md"
  # Dropped: "$PROJECT_ROOT/.claude/CLAUDE.md" — does not exist in this repo.
  # Dropped: "$HOME/.claude/CLAUDE.md" — a release script has no business
  # rewriting a contributor's personal config, and that file carries no version
  # (it is a one-line @AGENTS.md pointer), so the entry only left a stray .bak
  # in their home directory.
)

declare -a YAML_FILES=(
  "$PLUGIN_DIR/ccpm-config.yaml"
)

print_header() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "📦 Archon OS Version Sync Script"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

# Get current version from plugin.json (single source of truth)
get_current_version() {
  if [ -f "$SOURCE_FILE" ]; then
    grep -o '"version": *"[^"]*"' "$SOURCE_FILE" | head -1 | sed 's/"version": *"\([^"]*\)"/\1/'
  else
    echo "1.0.0"
  fi
}

# Calculate next version based on bump type
calculate_next_version() {
  local current=$1
  local bump_type=$2

  local major minor patch
  IFS='.' read -r major minor patch <<< "${current%%-*}"  # Remove suffix like -beta

  case "$bump_type" in
    major)
      echo "$((major + 1)).0.0"
      ;;
    minor)
      echo "${major}.$((minor + 1)).0"
      ;;
    patch)
      echo "${major}.${minor}.$((patch + 1))"
      ;;
  esac
}

# Validate version format
validate_version() {
  local version=$1
  if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]]; then
    print_error "Invalid version format: $version"
    print_info "Expected format: X.Y.Z or X.Y.Z-suffix (e.g., 1.0.0, 1.0.0-beta, 3.8.0-alpha.7)"
    exit 1
  fi
}

# Update JSON files
update_json_version() {
  local file=$1
  local new_version=$2

  if [ ! -f "$file" ]; then
    print_warning "File not found: $file (skipping)"
    return
  fi

  cp "$file" "$file.bak"

  # Update all "version": "x.x.x" patterns in JSON
  sed_inplace "$file" "s/\"version\": *\"$VERSION_PATTERN\"/\"version\": \"$new_version\"/g"

  if diff -q "$file" "$file.bak" > /dev/null; then
    print_warning "No changes: $(basename "$file")"
    rm "$file.bak"
  else
    print_success "Updated: $(basename "$file")"
    CHANGED_COUNT=$((CHANGED_COUNT + 1))
    rm "$file.bak"
  fi
}

# Update Markdown files
update_md_version() {
  local file=$1
  local new_version=$2

  if [ ! -f "$file" ]; then
    print_warning "File not found: $file (skipping)"
    return
  fi

  cp "$file" "$file.bak"

  # Dots are regex metacharacters; escape them before matching a literal version.
  local cur_esc
  cur_esc=$(printf '%s' "$CURRENT_VERSION" | sed -E 's/[.]/\\./g')

  # Update various version patterns in markdown
  sed_inplace "$file" \
    -e "s/\*\*Version:\*\* $VERSION_PATTERN/\*\*Version:\*\* $new_version/g" \
    -e "s/Version: $VERSION_PATTERN/Version: $new_version/g" \
    -e "s/\*\*System:\*\* Archon OS v$VERSION_PATTERN/\*\*System:\*\* Archon OS v$new_version/g" \
    -e "s/\*\*Plugin:\*\* Archon OS v$VERSION_PATTERN/\*\*Plugin:\*\* Archon OS v$new_version/g" \
    -e "s/ARCHON OS v$VERSION_PATTERN/ARCHON OS v$new_version/g" \
    -e "s/Archon OS v$VERSION_PATTERN/Archon OS v$new_version/g" \
    -e "s/see AGENTS\.md \(v$VERSION_PATTERN\)/see AGENTS.md (v$new_version)/g" \
    -e "s/v$cur_esc highlights/v$new_version highlights/g"

  if diff -q "$file" "$file.bak" > /dev/null; then
    print_warning "No changes: $(basename "$file")"
    rm "$file.bak"
  else
    print_success "Updated: $(basename "$file")"
    CHANGED_COUNT=$((CHANGED_COUNT + 1))
    rm "$file.bak"
  fi
}

# Update YAML files
update_yaml_version() {
  local file=$1
  local new_version=$2

  if [ ! -f "$file" ]; then
    print_warning "File not found: $file (skipping)"
    return
  fi

  cp "$file" "$file.bak"

  sed_inplace "$file" \
    -e "s/version: '$VERSION_PATTERN'/version: '$new_version'/" \
    -e "s/# Version: $VERSION_PATTERN/# Version: $new_version/"

  if diff -q "$file" "$file.bak" > /dev/null; then
    print_warning "No changes: $(basename "$file")"
    rm "$file.bak"
  else
    print_success "Updated: $(basename "$file")"
    CHANGED_COUNT=$((CHANGED_COUNT + 1))
    rm "$file.bak"
  fi
}

# Main execution
main() {
  print_header

  CURRENT_VERSION=$(get_current_version)
  print_info "Current version: $CURRENT_VERSION (from plugin.json)"

  # Determine target version
  if [ -n "$1" ]; then
    case "$1" in
      major|minor|patch)
        NEW_VERSION=$(calculate_next_version "$CURRENT_VERSION" "$1")
        print_info "Bump type: $1"
        ;;
      *)
        NEW_VERSION="$1"
        ;;
    esac
  else
    echo ""
    echo "Usage:"
    echo "  ./scripts/sync-version.sh patch     # $CURRENT_VERSION -> $(calculate_next_version "$CURRENT_VERSION" "patch")"
    echo "  ./scripts/sync-version.sh minor     # $CURRENT_VERSION -> $(calculate_next_version "$CURRENT_VERSION" "minor")"
    echo "  ./scripts/sync-version.sh major     # $CURRENT_VERSION -> $(calculate_next_version "$CURRENT_VERSION" "major")"
    echo "  ./scripts/sync-version.sh 1.4.0     # Set specific version"
    echo ""
    read -p "Enter version or bump type: " INPUT

    if [ -z "$INPUT" ]; then
      print_info "No version specified. Exiting."
      exit 0
    fi

    case "$INPUT" in
      major|minor|patch)
        NEW_VERSION=$(calculate_next_version "$CURRENT_VERSION" "$INPUT")
        ;;
      *)
        NEW_VERSION="$INPUT"
        ;;
    esac
  fi

  # Validate version
  validate_version "$NEW_VERSION"

  echo ""
  print_info "Updating version: $CURRENT_VERSION -> $NEW_VERSION"
  echo ""

  # Update JSON files (explicit list)
  echo -e "${BLUE}JSON files:${NC}"
  for file in "${JSON_FILES[@]}"; do
    update_json_version "$file" "$NEW_VERSION"
  done

  # Update Markdown files (explicit list)
  echo ""
  echo -e "${BLUE}Markdown files (explicit):${NC}"
  for file in "${MD_FILES[@]}"; do
    update_md_version "$file" "$NEW_VERSION"
  done

  # Update YAML files
  echo ""
  echo -e "${BLUE}YAML files:${NC}"
  for file in "${YAML_FILES[@]}"; do
    update_yaml_version "$file" "$NEW_VERSION"
  done

  # Note: Version footers were removed from most files (v2.1.0+).
  # Only plugin.json, marketplace.json, CLAUDE.md and README.md carry the version now.

  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  if [ "$CHANGED_COUNT" -eq 0 ] && [ "$CURRENT_VERSION" != "$NEW_VERSION" ]; then
    # A bump that touched zero files means every sed pattern missed —
    # exactly the silent-no-op failure mode this script used to have on
    # macOS. Fail loudly instead of pretending it worked.
    print_error "Version sync FAILED: no files were updated ($CURRENT_VERSION -> $NEW_VERSION)"
    exit 1
  fi
  print_success "Version sync complete! $CURRENT_VERSION -> $NEW_VERSION ($CHANGED_COUNT file(s) updated)"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  echo ""
  print_info "Next steps:"
  echo "  1. Review changes: git diff"
  echo "  2. Update CHANGELOG.md with new version entry"
  echo "  3. Commit: git commit -am \"chore: Bump version to $NEW_VERSION\""
  echo "  4. Tag: git tag v$NEW_VERSION"
  echo ""
}

# Run main function
main "$@"
