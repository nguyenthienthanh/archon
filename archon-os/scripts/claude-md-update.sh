#!/bin/bash
# claude-md-update.sh - Update AURA-FROG section in project CLAUDE.md
# Preserves USER-CUSTOM sections and other project-specific content
#
# Usage: bash claude-md-update.sh [project-claude-md-path]
# Example: bash claude-md-update.sh /path/to/project/.claude/CLAUDE.md

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATE_PATH="$PLUGIN_DIR/templates/project-claude.md"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Get project CLAUDE.md path
if [ -n "$1" ]; then
    PROJECT_CLAUDE="$1"
else
    PROJECT_CLAUDE=".claude/CLAUDE.md"
fi

# Check if file exists
if [ ! -f "$PROJECT_CLAUDE" ]; then
    print_error "Project CLAUDE.md not found: $PROJECT_CLAUDE"
    exit 1
fi

if [ ! -f "$TEMPLATE_PATH" ]; then
    print_error "Template not found: $TEMPLATE_PATH"
    exit 1
fi

print_info "Updating AURA-FROG section in: $PROJECT_CLAUDE"

# Create backup
BACKUP_PATH="${PROJECT_CLAUDE}.backup.$(date +%Y%m%d%H%M%S)"
cp "$PROJECT_CLAUDE" "$BACKUP_PATH"
print_info "Backup created: $BACKUP_PATH"

# Extract sections from current file
BEFORE_AURA=$(sed -n '1,/<!-- AURA-FROG:START/p' "$PROJECT_CLAUDE" | sed '$d')
AFTER_AURA=$(sed -n '/<!-- AURA-FROG:END -->/,$p' "$PROJECT_CLAUDE" | sed '1d')

# Extract new AURA-FROG section from template
NEW_AURA=$(sed -n '/<!-- AURA-FROG:START/,/<!-- AURA-FROG:END -->/p' "$TEMPLATE_PATH")

# Check if sections were found
if [ -z "$NEW_AURA" ]; then
    print_error "Could not find AURA-FROG section in template"
    rm "$BACKUP_PATH"
    exit 1
fi

# If no AURA-FROG markers in project file, add them
if ! grep -q "AURA-FROG:START" "$PROJECT_CLAUDE"; then
    print_warning "No AURA-FROG markers found. Adding section after header..."

    # Get header (first 7 lines typically)
    HEADER=$(head -n 7 "$PROJECT_CLAUDE")
    REST=$(tail -n +8 "$PROJECT_CLAUDE")

    # Rebuild file
    {
        echo "$HEADER"
        echo ""
        echo "$NEW_AURA"
        echo ""
        echo "$REST"
    } > "$PROJECT_CLAUDE"
else
    # Rebuild file with new AURA-FROG section
    {
        echo "$BEFORE_AURA"
        echo "$NEW_AURA"
        echo "$AFTER_AURA"
    } > "$PROJECT_CLAUDE"
fi

# Update version in header
PLUGIN_VERSION=$(grep -m1 'Version:' "$PLUGIN_DIR/CLAUDE.md" | sed 's/.*v//' | tr -d ' ')
if [ -n "$PLUGIN_VERSION" ]; then
    sed -i.tmp "s/Aura Frog Version:.*/Aura Frog Version:** $PLUGIN_VERSION/" "$PROJECT_CLAUDE"
    rm -f "${PROJECT_CLAUDE}.tmp"
fi

# Show diff
print_info "Changes made:"
if command -v diff &> /dev/null; then
    diff "$BACKUP_PATH" "$PROJECT_CLAUDE" || true
fi

print_success "Updated AURA-FROG section successfully!"
print_info "User sections preserved (USER-CUSTOM and other content)"
print_info "Backup saved at: $BACKUP_PATH"

# Ask to remove backup
echo ""
read -p "Remove backup file? [y/N] " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm "$BACKUP_PATH"
    print_info "Backup removed"
fi
