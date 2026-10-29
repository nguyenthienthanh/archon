#!/bin/bash
#
# snapshot-compare.sh
# Compare two images using Pixelmatch and output diff
#
# Usage: ./snapshot-compare.sh <baseline> <current> [output] [threshold]
#
# Arguments:
#   baseline   - Path to baseline image
#   current    - Path to current snapshot
#   output     - Path to save diff image (default: snapshots/diff/<name>.png)
#   threshold  - Max mismatch percentage (default: 0.5 for web)
#
# Output:
#   Exit code 0: PASS (diff within threshold)
#   Exit code 1: FAIL (diff exceeds threshold)
#   Exit code 2: ERROR (file not found, etc.)
#
# Version: 1.0.0

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Arguments
BASELINE="$1"
CURRENT="$2"
OUTPUT="${3:-}"
THRESHOLD="${4:-0.5}"

if [ -z "$BASELINE" ] || [ -z "$CURRENT" ]; then
    echo -e "${RED}Usage: ./snapshot-compare.sh <baseline> <current> [output] [threshold]${NC}"
    exit 2
fi

# Check files exist
if [ ! -f "$BASELINE" ]; then
    echo -e "${RED}Baseline not found: $BASELINE${NC}"
    echo "Create baseline first by approving a snapshot."
    exit 2
fi

if [ ! -f "$CURRENT" ]; then
    echo -e "${RED}Current snapshot not found: $CURRENT${NC}"
    echo "Render snapshot first using Playwright or Puppeteer."
    exit 2
fi

# Default output path
if [ -z "$OUTPUT" ]; then
    BASENAME=$(basename "$CURRENT" .png)
    OUTPUT="$(dirname "$CURRENT")/../diff/${BASENAME}-diff.png"
fi

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT")"

echo -e "${BLUE}Comparing snapshots...${NC}"
echo "  Baseline: $BASELINE"
echo "  Current:  $CURRENT"
echo "  Output:   $OUTPUT"
echo "  Threshold: ${THRESHOLD}%"

# Create temporary Node.js script for Pixelmatch
TEMP_SCRIPT=$(mktemp /tmp/pixelmatch-XXXXXX.js)

cat > "$TEMP_SCRIPT" << NODESCRIPT
const fs = require('fs');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const baseline = PNG.sync.read(fs.readFileSync('${BASELINE}'));
const current = PNG.sync.read(fs.readFileSync('${CURRENT}'));

const { width, height } = baseline;

// Check dimensions match
if (current.width !== width || current.height !== height) {
  console.error(JSON.stringify({
    error: 'DIMENSION_MISMATCH',
    baseline: { width, height },
    current: { width: current.width, height: current.height }
  }));
  process.exit(2);
}

const diff = new PNG({ width, height });

const numDiffPixels = pixelmatch(
  baseline.data,
  current.data,
  diff.data,
  width,
  height,
  {
    threshold: 0.1,
    includeAA: false,
    alpha: 0.1
  }
);

// Save diff image
fs.writeFileSync('${OUTPUT}', PNG.sync.write(diff));

const totalPixels = width * height;
const mismatchPercent = (numDiffPixels / totalPixels) * 100;
const threshold = parseFloat('${THRESHOLD}');
const pass = mismatchPercent <= threshold;

// Output JSON result
console.log(JSON.stringify({
  mismatchPixels: numDiffPixels,
  totalPixels,
  mismatchPercent: mismatchPercent.toFixed(4),
  threshold,
  pass,
  diffImage: '${OUTPUT}',
  dimensions: { width, height }
}));

process.exit(pass ? 0 : 1);
NODESCRIPT

# Run comparison
set +e
RESULT=$(node "$TEMP_SCRIPT" 2>&1)
EXIT_CODE=$?
set -e

# Cleanup
rm -f "$TEMP_SCRIPT"

# Parse and display result
if [ $EXIT_CODE -eq 2 ]; then
    echo -e "${RED}Error during comparison:${NC}"
    echo "$RESULT"
    exit 2
fi

# Extract values from JSON
MISMATCH_PCT=$(echo "$RESULT" | jq -r '.mismatchPercent')
MISMATCH_PX=$(echo "$RESULT" | jq -r '.mismatchPixels')
PASS=$(echo "$RESULT" | jq -r '.pass')

if [ "$PASS" = "true" ]; then
    echo ""
    echo -e "${GREEN}PASS${NC} - Diff: ${MISMATCH_PCT}% (${MISMATCH_PX} pixels)"
    echo -e "${GREEN}Visual test passed!${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}FAIL${NC} - Diff: ${MISMATCH_PCT}% (${MISMATCH_PX} pixels)"
    echo -e "${RED}Exceeds threshold of ${THRESHOLD}%${NC}"
    echo ""
    echo -e "${YELLOW}Diff image saved to: $OUTPUT${NC}"
    echo -e "${YELLOW}Review the diff and fix visual issues.${NC}"
    exit 1
fi
