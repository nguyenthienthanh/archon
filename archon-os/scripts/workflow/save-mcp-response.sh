#!/usr/bin/env bash

# Save MCP Response Script
# Purpose: Save MCP server responses (JIRA, Figma, etc.) to logs for reference
# Version: 1.0.0
#
# Usage:
#   bash save-mcp-response.sh <mcp-type> <identifier> <content>
#   bash save-mcp-response.sh <mcp-type> <identifier> --file <source-file>
#   bash save-mcp-response.sh <mcp-type> <identifier> --stdin
#
# Examples:
#   bash save-mcp-response.sh jira PROJ-123 "# PROJ-123\n..."
#   bash save-mcp-response.sh figma abc123 --file /tmp/figma-response.json
#   echo '{"data":...}' | bash save-mcp-response.sh jira PROJ-456 --stdin

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Detect CLAUDE_DIR - prioritize project's .claude directory
if [ -d ".claude" ]; then
  CLAUDE_DIR=".claude"
elif [ -d "$(pwd)/.claude" ]; then
  CLAUDE_DIR="$(pwd)/.claude"
else
  CLAUDE_DIR="${PLUGIN_DIR}"
fi

LOGS_DIR="${CLAUDE_DIR}/logs"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Supported MCP types
SUPPORTED_TYPES=("jira" "figma" "confluence" "slack" "context7")

# Convert JIRA JSON to TOON format
json_to_toon() {
    local json="$1"
    local mcp_type="$2"

    case "$mcp_type" in
        jira)
            # Extract JIRA fields using jq
            if command -v jq &> /dev/null; then
                local key=$(echo "$json" | jq -r '.key // "UNKNOWN"')
                local summary=$(echo "$json" | jq -r '.fields.summary // "No summary"')
                local status=$(echo "$json" | jq -r '.fields.status.name // "Unknown"')
                local priority=$(echo "$json" | jq -r '.fields.priority.name // "None"')
                local assignee=$(echo "$json" | jq -r '.fields.assignee.displayName // "Unassigned"')
                local reporter=$(echo "$json" | jq -r '.fields.reporter.displayName // "Unknown"')
                local created=$(echo "$json" | jq -r '.fields.created // ""' | cut -d'T' -f1)
                local updated=$(echo "$json" | jq -r '.fields.updated // ""' | cut -d'T' -f1)
                local issuetype=$(echo "$json" | jq -r '.fields.issuetype.name // "Task"')
                local description=$(echo "$json" | jq -r '.fields.description.content[0].content[0].text // .fields.description // "No description"' 2>/dev/null | head -c 500)
                local labels=$(echo "$json" | jq -r '.fields.labels | join(", ") // ""')
                local components=$(echo "$json" | jq -r '.fields.components | map(.name) | join(", ") // ""')

                cat <<EOF
# ${key}: ${summary}

\`\`\`toon
ticket[1]{key,summary,type,status,priority}:
  ${key},${summary},${issuetype},${status},${priority}

metadata[1]{assignee,reporter,created,updated}:
  ${assignee},${reporter},${created},${updated}

labels: ${labels:-none}
components: ${components:-none}
\`\`\`

## Description

${description}

---
**Fetched:** $(date '+%Y-%m-%d %H:%M:%S')
EOF
            else
                echo "# JIRA Ticket (raw)"
                echo ""
                echo "\`\`\`json"
                echo "$json" | head -100
                echo "\`\`\`"
            fi
            ;;
        figma)
            # Extract Figma fields
            if command -v jq &> /dev/null; then
                local name=$(echo "$json" | jq -r '.name // "Untitled"')
                local lastModified=$(echo "$json" | jq -r '.lastModified // ""' | cut -d'T' -f1)
                local version=$(echo "$json" | jq -r '.version // "unknown"')

                cat <<EOF
# Figma: ${name}

\`\`\`toon
design[1]{name,version,lastModified}:
  ${name},${version},${lastModified}
\`\`\`

---
**Fetched:** $(date '+%Y-%m-%d %H:%M:%S')
EOF
            else
                echo "$json"
            fi
            ;;
        *)
            # Default: just output as-is or convert to markdown
            echo "$json"
            ;;
    esac
}

# Always use .toon extension for structured data
get_extension() {
    echo "toon"
}

# Validate MCP type
validate_mcp_type() {
    local mcp_type="$1"

    for type in "${SUPPORTED_TYPES[@]}"; do
        if [[ "$mcp_type" == "$type" ]]; then
            return 0
        fi
    done

    return 1
}

# Sanitize filename
sanitize_filename() {
    local name="$1"
    # Remove special chars, keep alphanumeric, dash, underscore
    echo "$name" | sed 's/[^a-zA-Z0-9_-]/_/g'
}

# Save MCP response
save_mcp_response() {
    local mcp_type="$1"
    local identifier="$2"
    local content=""
    local source_mode="content"

    # Validate MCP type
    if ! validate_mcp_type "$mcp_type"; then
        echo -e "${RED}Error: Unsupported MCP type: $mcp_type${NC}" >&2
        echo "Supported types: ${SUPPORTED_TYPES[*]}" >&2
        exit 1
    fi

    # Parse content source
    if [[ "${3:-}" == "--file" ]]; then
        source_mode="file"
        local source_file="${4:-}"
        if [[ -z "$source_file" || ! -f "$source_file" ]]; then
            echo -e "${RED}Error: Source file not found: $source_file${NC}" >&2
            exit 1
        fi
        content=$(cat "$source_file")
    elif [[ "${3:-}" == "--stdin" ]]; then
        source_mode="stdin"
        content=$(cat)
    else
        content="${3:-}"
    fi

    if [[ -z "$content" ]]; then
        echo -e "${RED}Error: No content provided${NC}" >&2
        exit 1
    fi

    # Convert JSON to TOON format if content looks like JSON
    if [[ "$content" =~ ^\s*\{ ]]; then
        content=$(json_to_toon "$content" "$mcp_type")
    fi

    # Create MCP-specific logs directory
    local mcp_logs_dir="${LOGS_DIR}/${mcp_type}"
    mkdir -p "$mcp_logs_dir"

    # Sanitize identifier for filename
    local safe_id=$(sanitize_filename "$identifier")

    # Determine file extension
    local ext=$(get_extension)

    # Generate filename with timestamp
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local filename="${safe_id}_${timestamp}.${ext}"
    local filepath="${mcp_logs_dir}/${filename}"

    # Also create a "latest" symlink/copy for easy access
    local latest_file="${mcp_logs_dir}/${safe_id}_latest.${ext}"

    # Write content
    echo -e "$content" > "$filepath"

    # Update latest file
    cp "$filepath" "$latest_file"

    # Output
    echo -e "${GREEN}✅ Saved MCP response:${NC}"
    echo "   MCP: ${mcp_type}"
    echo "   ID: ${identifier}"
    echo "   File: ${filename}"
    echo "   Path: ${filepath}"
    echo "   Latest: ${latest_file}"
}

# List MCP responses
list_mcp_responses() {
    local mcp_type="${1:-all}"

    echo -e "${BLUE}📄 MCP Response Logs${NC}"
    echo ""

    if [[ "$mcp_type" == "all" ]]; then
        for type in "${SUPPORTED_TYPES[@]}"; do
            local type_dir="${LOGS_DIR}/${type}"
            if [[ -d "$type_dir" ]] && [[ -n "$(ls -A "$type_dir" 2>/dev/null)" ]]; then
                echo -e "${GREEN}${type}/${NC}"
                for file in "$type_dir"/*_latest.*; do
                    if [[ -f "$file" ]]; then
                        local fname=$(basename "$file")
                        local size=$(wc -c < "$file" | tr -d ' ')
                        echo "   📝 $fname ($size bytes)"
                    fi
                done
                echo ""
            fi
        done
    else
        if ! validate_mcp_type "$mcp_type"; then
            echo -e "${RED}Error: Unsupported MCP type: $mcp_type${NC}" >&2
            exit 1
        fi

        local type_dir="${LOGS_DIR}/${mcp_type}"
        echo -e "${GREEN}${mcp_type}/${NC}"

        if [[ -d "$type_dir" ]] && [[ -n "$(ls -A "$type_dir" 2>/dev/null)" ]]; then
            for file in "$type_dir"/*; do
                if [[ -f "$file" ]]; then
                    local fname=$(basename "$file")
                    local size=$(wc -c < "$file" | tr -d ' ')
                    echo "   📝 $fname ($size bytes)"
                fi
            done
        else
            echo "   (no responses saved)"
        fi
    fi
}

# Get latest response for an identifier
get_latest() {
    local mcp_type="$1"
    local identifier="$2"

    if ! validate_mcp_type "$mcp_type"; then
        echo -e "${RED}Error: Unsupported MCP type: $mcp_type${NC}" >&2
        exit 1
    fi

    local safe_id=$(sanitize_filename "$identifier")
    local type_dir="${LOGS_DIR}/${mcp_type}"

    # Try both extensions
    for ext in md json; do
        local latest_file="${type_dir}/${safe_id}_latest.${ext}"
        if [[ -f "$latest_file" ]]; then
            cat "$latest_file"
            return 0
        fi
    done

    echo -e "${RED}Error: No response found for ${mcp_type}/${identifier}${NC}" >&2
    return 1
}

# Show usage
show_usage() {
    cat <<EOF
Save MCP Response - Save MCP server responses to logs for reference

USAGE:
    bash $0 <command> [arguments]

COMMANDS:
    save <type> <id> <content>      Save content as MCP response
    save <type> <id> --file <src>   Save file as MCP response
    save <type> <id> --stdin        Save stdin as MCP response
    list [type]                     List saved responses
    get <type> <id>                 Get latest response for identifier
    help                            Show this help

MCP TYPES:
    jira        - JIRA tickets (PROJ-123)
    figma       - Figma designs (file-id)
    confluence  - Confluence pages (page-id)
    slack       - Slack messages
    context7    - Library documentation

EXAMPLES:
    # Save JIRA ticket
    bash $0 save jira PROJ-123 "# PROJ-123: Title\n\nDescription..."

    # Save Figma response from file
    bash $0 save figma abc123def --file /tmp/figma.json

    # Save from stdin (useful for piping MCP output)
    mcp_output | bash $0 save jira PROJ-456 --stdin

    # List all saved responses
    bash $0 list

    # List JIRA responses only
    bash $0 list jira

    # Get latest response for a ticket
    bash $0 get jira PROJ-123

OUTPUT LOCATION:
    .claude/logs/{mcp-type}/{identifier}_{timestamp}.{md|json}
    .claude/logs/{mcp-type}/{identifier}_latest.{md|json}

EOF
}

# Main
main() {
    local command="${1:-help}"

    case "$command" in
        save)
            if [[ $# -lt 3 ]]; then
                echo -e "${RED}Error: Missing arguments${NC}"
                echo "Usage: $0 save <type> <identifier> <content|--file|--stdin>"
                exit 1
            fi
            save_mcp_response "${2}" "${3}" "${4:-}" "${5:-}"
            ;;
        list)
            list_mcp_responses "${2:-all}"
            ;;
        get)
            if [[ $# -lt 3 ]]; then
                echo -e "${RED}Error: Missing arguments${NC}"
                echo "Usage: $0 get <type> <identifier>"
                exit 1
            fi
            get_latest "${2}" "${3}"
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            # Default: treat as save command
            if [[ $# -ge 2 ]]; then
                save_mcp_response "${1}" "${2}" "${3:-}" "${4:-}"
            else
                echo -e "${RED}Unknown command: $command${NC}"
                echo ""
                show_usage
                exit 1
            fi
            ;;
    esac
}

main "$@"
