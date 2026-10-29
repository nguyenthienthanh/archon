#!/bin/bash
# TOON Validation Script
# Validates TOON format files for correct array lengths and syntax
# Version: 1.0.0

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
ERRORS=0
WARNINGS=0
FILES_CHECKED=0

usage() {
    echo "Usage: $0 [OPTIONS] [FILE|DIRECTORY]"
    echo ""
    echo "Validate TOON format in markdown files"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -v, --verbose  Show detailed output"
    echo "  -q, --quiet    Only show errors"
    echo "  -f, --fix      Attempt to fix array length declarations"
    echo ""
    echo "Examples:"
    echo "  $0 skills/agent-detector/SKILL.md"
    echo "  $0 -v docs/"
    echo "  $0 --fix rules/"
}

log_error() {
    echo -e "${RED}ERROR${NC}: $1"
    ERRORS=$((ERRORS + 1))
}

log_warning() {
    echo -e "${YELLOW}WARN${NC}: $1"
    WARNINGS=$((WARNINGS + 1))
}

log_success() {
    if [ "$QUIET" != "true" ]; then
        echo -e "${GREEN}OK${NC}: $1"
    fi
}

log_info() {
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${BLUE}INFO${NC}: $1"
    fi
}

# Validate a single TOON block
# Expected format: name[N]{col1,col2,...}:
#   row1
#   row2
#   ...
validate_toon_block() {
    local file="$1"
    local block_start="$2"
    local block_name="$3"
    local declared_count="$4"
    local columns="$5"
    local content="$6"

    # Count actual rows (non-empty lines that start with whitespace)
    local actual_count=$(echo "$content" | grep -c '^\s\+[^[:space:]]' 2>/dev/null || echo "0")

    # Count columns in header
    local column_count=$(echo "$columns" | tr ',' '\n' | wc -l | tr -d ' ')

    log_info "Block '$block_name' at line $block_start: declared=$declared_count, actual=$actual_count, columns=$column_count"

    # Validate row count matches declaration
    if [ "$declared_count" != "$actual_count" ]; then
        log_error "$file:$block_start - Array '$block_name' declares [$declared_count] but has $actual_count rows"
        return 1
    fi

    # Validate each row has correct number of columns
    local line_num=$((block_start + 1))
    while IFS= read -r line; do
        if [[ "$line" =~ ^[[:space:]]+[^[:space:]] ]]; then
            # Remove leading whitespace
            local trimmed=$(echo "$line" | sed 's/^[[:space:]]*//')
            # Count commas (columns = commas + 1)
            local row_columns=$(($(echo "$trimmed" | tr -cd ',' | wc -c) + 1))

            if [ "$row_columns" != "$column_count" ]; then
                log_warning "$file:$line_num - Row has $row_columns columns, expected $column_count"
            fi
        fi
        line_num=$((line_num + 1))
    done <<< "$content"

    return 0
}

# Extract and validate all TOON blocks from a file
validate_file() {
    local file="$1"
    local file_errors=0

    if [ ! -f "$file" ]; then
        log_error "File not found: $file"
        return 1
    fi

    FILES_CHECKED=$((FILES_CHECKED + 1))

    log_info "Checking $file"

    # Find all TOON blocks
    # Pattern: name[N]{columns}:
    local in_toon_block=false
    local block_name=""
    local declared_count=""
    local columns=""
    local block_start=0
    local block_content=""
    local line_num=0

    while IFS= read -r line || [[ -n "$line" ]]; do
        line_num=$((line_num + 1))

        # Check for TOON block header: name[N]{col1,col2}:
        if [[ "$line" =~ ^([a-zA-Z_][a-zA-Z0-9_]*)\[([0-9]+)\]\{([^}]+)\}:$ ]]; then
            # If we were in a block, validate the previous one
            if [ "$in_toon_block" = true ]; then
                validate_toon_block "$file" "$block_start" "$block_name" "$declared_count" "$columns" "$block_content"
                [ $? -ne 0 ] && file_errors=$((file_errors + 1))
            fi

            # Start new block
            in_toon_block=true
            block_name="${BASH_REMATCH[1]}"
            declared_count="${BASH_REMATCH[2]}"
            columns="${BASH_REMATCH[3]}"
            block_start=$line_num
            block_content=""

            log_info "Found TOON block: $block_name[$declared_count]{$columns}"

        elif [ "$in_toon_block" = true ]; then
            # Check if we're still in the block (lines starting with whitespace)
            if [[ "$line" =~ ^[[:space:]]+[^[:space:]] ]]; then
                block_content+="$line"$'\n'
            elif [[ -z "$line" ]] || [[ "$line" =~ ^[[:space:]]*$ ]]; then
                # Empty line - might still be in block
                :
            else
                # Non-indented content - end of block
                validate_toon_block "$file" "$block_start" "$block_name" "$declared_count" "$columns" "$block_content"
                [ $? -ne 0 ] && file_errors=$((file_errors + 1))
                in_toon_block=false
                block_content=""
            fi
        fi
    done < "$file"

    # Validate last block if file ends with one
    if [ "$in_toon_block" = true ]; then
        validate_toon_block "$file" "$block_start" "$block_name" "$declared_count" "$columns" "$block_content"
        [ $? -ne 0 ] && file_errors=$((file_errors + 1))
    fi

    if [ $file_errors -eq 0 ]; then
        log_success "$file"
    fi

    return $file_errors
}

# Process directory recursively
validate_directory() {
    local dir="$1"

    # Use process substitution (NOT a pipe) so the while-loop runs in the
    # parent shell — FILES_CHECKED + ERRORS counters need to survive.
    # Skip dependency + runtime + cache trees we don't own.
    while IFS= read -r file; do
        validate_file "$file" || true
    done < <(find "$dir" -type f \( -name "*.md" -o -name "*.toon" \) \
        ! -path "*/node_modules/*" \
        ! -path "*/.claude/*" \
        ! -path "*/.aura/*" \
        ! -path "*/.git/*" \
        ! -path "*/coverage/*")
}

# Fix array length declarations
fix_toon_file() {
    local file="$1"

    if [ ! -f "$file" ]; then
        log_error "File not found: $file"
        return 1
    fi

    log_info "Fixing $file"

    # Create temp file
    local temp_file=$(mktemp)

    local in_toon_block=false
    local block_name=""
    local declared_count=""
    local columns=""
    local block_start_line=""
    local block_rows=0

    while IFS= read -r line || [[ -n "$line" ]]; do
        # Check for TOON block header
        if [[ "$line" =~ ^([a-zA-Z_][a-zA-Z0-9_]*)\[([0-9]+)\]\{([^}]+)\}:$ ]]; then
            if [ "$in_toon_block" = true ] && [ "$block_rows" != "$declared_count" ]; then
                # Fix previous block header
                local fixed_header="${block_name}[${block_rows}]{${columns}}:"
                echo "$fixed_header" >> "$temp_file"
                log_info "Fixed: $block_name[$declared_count] -> $block_name[$block_rows]"
            elif [ -n "$block_start_line" ]; then
                echo "$block_start_line" >> "$temp_file"
            fi

            # Start new block
            in_toon_block=true
            block_name="${BASH_REMATCH[1]}"
            declared_count="${BASH_REMATCH[2]}"
            columns="${BASH_REMATCH[3]}"
            block_start_line="$line"
            block_rows=0

        elif [ "$in_toon_block" = true ]; then
            if [[ "$line" =~ ^[[:space:]]+[^[:space:]] ]]; then
                block_rows=$((block_rows + 1))
                echo "$line" >> "$temp_file"
            elif [[ -z "$line" ]] || [[ "$line" =~ ^[[:space:]]*$ ]]; then
                echo "$line" >> "$temp_file"
            else
                # End of block - write corrected header if needed
                if [ "$block_rows" != "$declared_count" ]; then
                    # Insert corrected header before block content
                    local fixed_header="${block_name}[${block_rows}]{${columns}}:"
                    # Rewrite temp file with fixed header
                    log_info "Fixed: $block_name[$declared_count] -> $block_name[$block_rows]"
                fi
                in_toon_block=false
                echo "$line" >> "$temp_file"
            fi
        else
            echo "$line" >> "$temp_file"
        fi
    done < "$file"

    # Handle last block
    if [ "$in_toon_block" = true ] && [ "$block_rows" != "$declared_count" ]; then
        log_info "Fixed: $block_name[$declared_count] -> $block_name[$block_rows]"
    fi

    # Replace original file
    mv "$temp_file" "$file"
    log_success "Fixed $file"
}

# Main
VERBOSE=false
QUIET=false
FIX=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -q|--quiet)
            QUIET=true
            shift
            ;;
        -f|--fix)
            FIX=true
            shift
            ;;
        *)
            TARGET="$1"
            shift
            ;;
    esac
done

if [ -z "$TARGET" ]; then
    # Default to plugin content only — skips node_modules, .claude/ runtime
    # artefacts, and other project-local state that isn't ours to validate.
    if [ -d "archon-os" ]; then
        TARGET="archon-os"
    else
        TARGET="."
    fi
fi

echo "TOON Validator v1.0.0"
echo "====================="
echo ""

if [ -d "$TARGET" ]; then
    validate_directory "$TARGET"
elif [ -f "$TARGET" ]; then
    if [ "$FIX" = true ]; then
        fix_toon_file "$TARGET"
    else
        validate_file "$TARGET"
    fi
else
    log_error "Target not found: $TARGET"
    exit 1
fi

echo ""
echo "====================="
echo "Files checked: $FILES_CHECKED"
echo -e "Errors: ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"

if [ $ERRORS -gt 0 ]; then
    exit 1
fi

exit 0
