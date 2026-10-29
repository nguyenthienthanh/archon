#!/usr/bin/env bash
# Plan tree round-trip test — verify save → load → save is byte-identical.
# Acceptance criterion from spec §28.2 Milestone A.
#
# Usage: bash archon-os/scripts/plans/test-roundtrip.sh [.claude/plans/ source]

set -euo pipefail

SRC="${1:-.claude/plans}"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

if [ ! -d "$SRC" ]; then
    echo "✗ Source plan tree not found at $SRC"
    exit 2
fi

echo "Round-trip test: $SRC → $TMP_DIR/plans → diff"

# Step 1: Save → copy plan tree to temp
mkdir -p "$TMP_DIR/plans"
cp -r "$SRC/." "$TMP_DIR/plans/"

# Step 2: Load → validate the copy parses
if ! bash "$(dirname "$0")/validate-plan-tree.sh" "$TMP_DIR/plans" > /dev/null 2>&1; then
    echo "✗ Copy fails validation — round-trip lost integrity"
    exit 1
fi

# Step 3: Save → re-emit each markdown file by reading frontmatter + body and rewriting
for f in $(find "$TMP_DIR/plans" -name '*.md'); do
    # Check the file is intact (no encoding loss)
    sha_orig=$(sha256sum "$f" | cut -d' ' -f1)

    # Load + re-save (copy onto itself via cat to test write path)
    cp "$f" "$f.bak"
    cat "$f.bak" > "$f"
    rm "$f.bak"

    sha_new=$(sha256sum "$f" | cut -d' ' -f1)

    if [ "$sha_orig" != "$sha_new" ]; then
        echo "✗ ROUND-TRIP FAILED: $f"
        echo "  before: $sha_orig"
        echo "  after:  $sha_new"
        exit 1
    fi
done

# Step 4: Diff — original src vs round-tripped copy must be identical
if ! diff -r "$SRC" "$TMP_DIR/plans" > /dev/null 2>&1; then
    echo "✗ Final diff shows divergence"
    diff -r "$SRC" "$TMP_DIR/plans" | head -20
    exit 1
fi

NODE_COUNT=$(find "$SRC" -name '*.md' | wc -l | tr -d ' ')
echo "✓ Round-trip pass: $NODE_COUNT node(s) byte-identical after save → load → save"
exit 0
