#!/bin/bash
#
# visual-test.sh
# Main visual test runner for pixel-perfect testing
#
# Usage: ./visual-test.sh [options]
#
# Options:
#   --spec=<name>       Run specific spec only
#   --update-baseline   Update baseline with current snapshots
#   --web-only          Run web tests only
#   --pdf-only          Run PDF tests only
#   --ci                CI mode (exit 1 on any failure)
#   --verbose           Verbose output
#
# Version: 1.0.0

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default paths
VISUAL_PATH=".claude/visual"
CONFIG_PATH="$VISUAL_PATH/config.json"
SPEC_PATH="$VISUAL_PATH/spec"
SNAPSHOTS_PATH="$VISUAL_PATH/snapshots"

# Options
SPEC_FILTER=""
UPDATE_BASELINE=false
WEB_ONLY=false
PDF_ONLY=false
CI_MODE=false
VERBOSE=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --spec=*)
            SPEC_FILTER="${arg#*=}"
            ;;
        --update-baseline)
            UPDATE_BASELINE=true
            ;;
        --web-only)
            WEB_ONLY=true
            ;;
        --pdf-only)
            PDF_ONLY=true
            ;;
        --ci)
            CI_MODE=true
            ;;
        --verbose)
            VERBOSE=true
            ;;
        --help)
            echo "Visual Test Runner - Pixel Perfect Testing"
            echo ""
            echo "Usage: ./visual-test.sh [options]"
            echo ""
            echo "Options:"
            echo "  --spec=<name>       Run specific spec only"
            echo "  --update-baseline   Update baseline with current snapshots"
            echo "  --web-only          Run web tests only"
            echo "  --pdf-only          Run PDF tests only"
            echo "  --ci                CI mode (exit 1 on any failure)"
            echo "  --verbose           Verbose output"
            exit 0
            ;;
    esac
done

# Check visual structure exists
if [ ! -d "$VISUAL_PATH" ]; then
    echo -e "${RED}Visual testing not initialized.${NC}"
    echo -e "Run: ${CYAN}./scripts/visual/init-claude-visual.sh${NC}"
    exit 1
fi

# Load config
if [ -f "$CONFIG_PATH" ]; then
    WEB_THRESHOLD=$(jq -r '.thresholds.web // 0.5' "$CONFIG_PATH")
    PDF_THRESHOLD=$(jq -r '.thresholds.pdf // 1.0' "$CONFIG_PATH")
    MAX_ATTEMPTS=$(jq -r '.maxAttempts // 5' "$CONFIG_PATH")
else
    WEB_THRESHOLD=0.5
    PDF_THRESHOLD=1.0
    MAX_ATTEMPTS=5
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Visual Pixel-Perfect Test Runner    ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "  Config: $CONFIG_PATH"
echo "  Web Threshold: ${WEB_THRESHOLD}%"
echo "  PDF Threshold: ${PDF_THRESHOLD}%"
echo ""

# Find spec files
if [ -n "$SPEC_FILTER" ]; then
    SPECS=$(find "$SPEC_PATH" -name "${SPEC_FILTER}.spec.json" 2>/dev/null)
else
    SPECS=$(find "$SPEC_PATH" -name "*.spec.json" 2>/dev/null)
fi

if [ -z "$SPECS" ]; then
    echo -e "${YELLOW}No spec files found in $SPEC_PATH${NC}"
    exit 0
fi

# Counters
TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

# Test results array
declare -a RESULTS

# Run tests for each spec
for SPEC_FILE in $SPECS; do
    SPEC_NAME=$(basename "$SPEC_FILE" .spec.json)
    RENDER_TYPE=$(jq -r '.renderType // "web"' "$SPEC_FILE")

    # Skip based on filter
    if [ "$WEB_ONLY" = true ] && [ "$RENDER_TYPE" = "pdf" ]; then
        ((SKIPPED++))
        continue
    fi
    if [ "$PDF_ONLY" = true ] && [ "$RENDER_TYPE" = "web" ]; then
        ((SKIPPED++))
        continue
    fi

    ((TOTAL++))

    echo -e "${CYAN}Testing: $SPEC_NAME ($RENDER_TYPE)${NC}"

    # Get paths from spec
    URL=$(jq -r '.url // ""' "$SPEC_FILE")
    REF_IMAGE=$(jq -r '.referenceImage // ""' "$SPEC_FILE")
    VIEWPORT_W=$(jq -r '.viewport.width // 1280' "$SPEC_FILE")
    VIEWPORT_H=$(jq -r '.viewport.height // 720' "$SPEC_FILE")

    # Resolve reference image path (relative to spec file)
    SPEC_DIR=$(dirname "$SPEC_FILE")
    if [ -n "$REF_IMAGE" ]; then
        BASELINE="$SPEC_DIR/$REF_IMAGE"
    else
        BASELINE="$SNAPSHOTS_PATH/baseline/${SPEC_NAME}.png"
    fi

    CURRENT="$SNAPSHOTS_PATH/current/${SPEC_NAME}.png"
    DIFF="$SNAPSHOTS_PATH/diff/${SPEC_NAME}-diff.png"

    # Select threshold
    if [ "$RENDER_TYPE" = "pdf" ]; then
        THRESHOLD=$PDF_THRESHOLD
    else
        THRESHOLD=$WEB_THRESHOLD
    fi

    # Check baseline exists
    if [ ! -f "$BASELINE" ]; then
        echo -e "  ${YELLOW}No baseline found: $BASELINE${NC}"
        if [ "$UPDATE_BASELINE" = true ] && [ -f "$CURRENT" ]; then
            echo -e "  ${GREEN}Creating baseline from current snapshot${NC}"
            mkdir -p "$(dirname "$BASELINE")"
            cp "$CURRENT" "$BASELINE"
            ((PASSED++))
            RESULTS+=("$SPEC_NAME:BASELINE_CREATED")
        else
            echo -e "  ${YELLOW}SKIPPED - Create baseline first${NC}"
            ((SKIPPED++))
            RESULTS+=("$SPEC_NAME:NO_BASELINE")
        fi
        echo ""
        continue
    fi

    # Check current snapshot exists
    if [ ! -f "$CURRENT" ]; then
        echo -e "  ${YELLOW}No current snapshot: $CURRENT${NC}"
        echo -e "  ${YELLOW}Render snapshot first using Playwright/Puppeteer${NC}"
        ((SKIPPED++))
        RESULTS+=("$SPEC_NAME:NO_SNAPSHOT")
        echo ""
        continue
    fi

    # Run comparison
    set +e
    "$SCRIPT_DIR/snapshot-compare.sh" "$BASELINE" "$CURRENT" "$DIFF" "$THRESHOLD"
    COMPARE_RESULT=$?
    set -e

    if [ $COMPARE_RESULT -eq 0 ]; then
        ((PASSED++))
        RESULTS+=("$SPEC_NAME:PASS")
    elif [ $COMPARE_RESULT -eq 1 ]; then
        ((FAILED++))
        RESULTS+=("$SPEC_NAME:FAIL")

        if [ "$UPDATE_BASELINE" = true ]; then
            echo -e "  ${YELLOW}Updating baseline...${NC}"
            cp "$CURRENT" "$BASELINE"
            echo -e "  ${GREEN}Baseline updated${NC}"
        fi
    else
        ((FAILED++))
        RESULTS+=("$SPEC_NAME:ERROR")
    fi

    echo ""
done

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}              Summary                  ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "  Total:   $TOTAL"
echo -e "  ${GREEN}Passed:  $PASSED${NC}"
echo -e "  ${RED}Failed:  $FAILED${NC}"
echo -e "  ${YELLOW}Skipped: $SKIPPED${NC}"
echo ""

# Detailed results
if [ "$VERBOSE" = true ]; then
    echo "Results:"
    for result in "${RESULTS[@]}"; do
        NAME="${result%%:*}"
        STATUS="${result##*:}"
        case $STATUS in
            PASS)
                echo -e "  ${GREEN}$NAME${NC}"
                ;;
            FAIL)
                echo -e "  ${RED}$NAME${NC}"
                ;;
            *)
                echo -e "  ${YELLOW}$NAME ($STATUS)${NC}"
                ;;
        esac
    done
    echo ""
fi

# Exit code
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Visual tests failed!${NC}"
    if [ "$CI_MODE" = true ]; then
        exit 1
    fi
    exit 1
else
    echo -e "${GREEN}All visual tests passed!${NC}"
    exit 0
fi
