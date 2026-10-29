#!/bin/bash
# Response Save - Save command output with summary
# Part of MCP Response Analyzer pattern
# Version: 1.0.0

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Directories (user-isolated with secure permissions)
ARCHON_TMP_BASE="${TMPDIR:-/tmp}/archon-$(id -u)"
RESPONSE_DIR="${ARCHON_TMP_BASE}/responses"
SUMMARY_DIR="${ARCHON_TMP_BASE}/summaries"

mkdir -p "$RESPONSE_DIR" "$SUMMARY_DIR"
chmod 700 "$ARCHON_TMP_BASE" "$RESPONSE_DIR" "$SUMMARY_DIR" 2>/dev/null || true

usage() {
    echo "Response Save v1.0.0"
    echo ""
    echo "Usage: $0 <command> [label]"
    echo ""
    echo "Executes command, saves output to temp, generates summary."
    echo ""
    echo "Examples:"
    echo "  $0 'npm test' test-results"
    echo "  $0 'find . -name \"*.ts\"' ts-files"
    echo "  $0 'git log --oneline -50' git-history"
}

# Generate summary based on content type
generate_summary() {
    local file="$1"
    local label="$2"
    local lines=$(wc -l < "$file" | tr -d ' ')
    local size=$(du -h "$file" | cut -f1)

    echo "## Response Summary: $label"
    echo ""
    echo "- **File:** $(basename "$file")"
    echo "- **Size:** $size"
    echo "- **Lines:** $lines"
    echo ""

    # Detect content type and summarize accordingly
    if grep -q "PASS\|FAIL\|Tests:" "$file" 2>/dev/null; then
        # Test output
        echo "### Test Results"
        local passed=$(grep -c "PASS" "$file" 2>/dev/null || echo "0")
        local failed=$(grep -c "FAIL" "$file" 2>/dev/null || echo "0")
        echo "- Passed: $passed"
        echo "- Failed: $failed"
        echo ""
        if [ "$failed" -gt 0 ]; then
            echo "### Failed Tests"
            echo "\`\`\`"
            grep -A2 "FAIL" "$file" | head -20
            echo "\`\`\`"
        fi

    elif grep -q "error\|Error\|ERROR" "$file" 2>/dev/null; then
        # Error output
        echo "### Errors Found"
        local error_count=$(grep -ci "error" "$file" 2>/dev/null || echo "0")
        echo "- Error count: $error_count"
        echo ""
        echo "### Sample Errors"
        echo "\`\`\`"
        grep -i "error" "$file" | head -10
        echo "\`\`\`"

    elif head -1 "$file" | grep -q "^\[{" 2>/dev/null; then
        # JSON array
        echo "### JSON Array"
        local count=$(jq '. | length' "$file" 2>/dev/null || echo "unknown")
        echo "- Items: $count"
        echo ""
        echo "### Sample (first 3)"
        echo "\`\`\`json"
        jq '.[:3]' "$file" 2>/dev/null | head -20
        echo "\`\`\`"

    elif head -1 "$file" | grep -q "^{" 2>/dev/null; then
        # JSON object
        echo "### JSON Object"
        echo "- Keys: $(jq 'keys | join(", ")' "$file" 2>/dev/null || echo "unknown")"
        echo ""
        echo "### Structure"
        echo "\`\`\`json"
        jq 'keys' "$file" 2>/dev/null | head -20
        echo "\`\`\`"

    else
        # Generic text
        echo "### Content Preview"
        echo "\`\`\`"
        head -20 "$file"
        if [ "$lines" -gt 20 ]; then
            echo "... ($((lines - 20)) more lines)"
        fi
        echo "\`\`\`"
    fi

    echo ""
    echo "---"
    echo "**Full output:** \`$file\`"
}

# Main
if [ -z "$1" ]; then
    usage
    exit 1
fi

COMMAND="$1"
LABEL="${2:-output}"
TIMESTAMP=$(date +%s)
OUTPUT_FILE="${RESPONSE_DIR}/${LABEL}-${TIMESTAMP}.txt"
SUMMARY_FILE="${SUMMARY_DIR}/${LABEL}-${TIMESTAMP}.md"

echo -e "${CYAN}Executing:${NC} $COMMAND"
echo ""

# Execute command and save output
eval "$COMMAND" > "$OUTPUT_FILE" 2>&1 || true

# Generate summary
generate_summary "$OUTPUT_FILE" "$LABEL" > "$SUMMARY_FILE"

# Display summary
echo -e "${GREEN}Saved to:${NC} $OUTPUT_FILE"
echo ""
echo -e "${YELLOW}Summary:${NC}"
cat "$SUMMARY_FILE"
echo ""
echo -e "${CYAN}To view full output:${NC}"
echo "  cat $OUTPUT_FILE"
