#!/usr/bin/env bash

# Save Deliverable Script
# Purpose: Save phase deliverables (markdown files) to workflow logs
# Version: 1.0.0
#
# Usage:
#   bash save-deliverable.sh <phase> <filename> <content>
#   bash save-deliverable.sh <phase> <filename> --file <source-file>
#   bash save-deliverable.sh <phase> <filename> --stdin
#
# Examples:
#   bash save-deliverable.sh 1 requirements.md "# Requirements\n..."
#   bash save-deliverable.sh 2 technical-plan.md --file /tmp/plan.md
#   echo "# Content" | bash save-deliverable.sh 3 design-review.md --stdin

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
WORKFLOWS_DIR="${LOGS_DIR}/workflows"
CONTEXTS_DIR="${LOGS_DIR}/contexts"
ACTIVE_WORKFLOW_FILE="${CLAUDE_DIR}/active-workflow.txt"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get active workflow ID
get_active_workflow() {
    if [[ -f "${ACTIVE_WORKFLOW_FILE}" ]]; then
        cat "${ACTIVE_WORKFLOW_FILE}"
    else
        echo ""
    fi
}

# Get phase directory name
get_phase_dir_name() {
    local phase="$1"
    case $phase in
        1) echo "01-requirements-analysis" ;;
        2) echo "02-technical-planning" ;;
        3) echo "03-design-review" ;;
        4) echo "04-test-planning" ;;
        5) echo "05-tdd-implementation" ;;
        6) echo "06-code-review" ;;
        7) echo "07-qa-validation" ;;
        8) echo "08-documentation" ;;
        9) echo "09-notification" ;;
        *) echo "unknown-phase" ;;
    esac
}

# Get phase display name
get_phase_name() {
    case $1 in
        1) echo "Understand + Design" ;;
        2) echo "Test RED" ;;
        3) echo "Build GREEN" ;;
        4) echo "Refactor + Review" ;;
        5) echo "Finalize" ;;
        *) echo "Unknown Phase" ;;
    esac
}

# Add deliverable to workflow state
add_deliverable_to_state() {
    local workflow_id="$1"
    local phase="$2"
    local filename="$3"
    local filepath="$4"

    local state_file="${WORKFLOWS_DIR}/${workflow_id}/workflow-state.json"

    if [[ ! -f "$state_file" ]]; then
        echo -e "${YELLOW}Warning: Workflow state not found${NC}" >&2
        return 0
    fi

    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    # Add deliverable to phase
    jq --arg phase "$phase" \
       --arg filename "$filename" \
       --arg filepath "$filepath" \
       --arg timestamp "$timestamp" \
       '.phases[$phase].deliverables += [{
           "filename": $filename,
           "filepath": $filepath,
           "created_at": $timestamp
       }]' \
       "$state_file" > temp.json && mv temp.json "$state_file"
}

# Log to execution log
log_deliverable() {
    local workflow_id="$1"
    local phase="$2"
    local filename="$3"

    local log_file="${WORKFLOWS_DIR}/${workflow_id}/execution.log"

    if [[ -f "$log_file" ]]; then
        echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] DELIVERABLE phase=$phase file=$filename" >> "$log_file"
    fi
}

# Save deliverable
save_deliverable() {
    local phase="$1"
    local filename="$2"
    local content=""
    local source_mode="content"

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

    # Get active workflow
    local workflow_id=$(get_active_workflow)

    if [[ -z "$workflow_id" ]]; then
        echo -e "${RED}Error: No active workflow. Run workflow:init first.${NC}" >&2
        exit 1
    fi

    # Validate phase
    if [[ ! "$phase" =~ ^[1-9]$ ]]; then
        echo -e "${RED}Error: Invalid phase number (1-9): $phase${NC}" >&2
        exit 1
    fi

    # Ensure filename ends with .md
    if [[ ! "$filename" =~ \.md$ ]]; then
        filename="${filename}.md"
    fi

    # Get phase directory (store in workflows, not contexts)
    local phase_dir_name=$(get_phase_dir_name "$phase")
    local phase_name=$(get_phase_name "$phase")
    local deliverables_dir="${WORKFLOWS_DIR}/${workflow_id}/deliverables/${phase_dir_name}"

    # Create directory if needed
    mkdir -p "$deliverables_dir"

    # Full filepath
    local filepath="${deliverables_dir}/${filename}"

    # Check if file exists
    if [[ -f "$filepath" ]]; then
        echo -e "${YELLOW}Warning: Overwriting existing file: $filename${NC}"
    fi

    # Write content
    echo -e "$content" > "$filepath"

    # Update workflow state
    add_deliverable_to_state "$workflow_id" "$phase" "$filename" "$filepath"

    # Log
    log_deliverable "$workflow_id" "$phase" "$filename"

    # Output
    echo -e "${GREEN}✅ Saved deliverable:${NC}"
    echo "   Workflow: ${workflow_id}"
    echo "   Phase: ${phase} - ${phase_name}"
    echo "   File: ${filename}"
    echo "   Path: ${filepath}"
}

# List deliverables for a phase or all phases
list_deliverables() {
    local phase="${1:-all}"
    local workflow_id=$(get_active_workflow)

    if [[ -z "$workflow_id" ]]; then
        echo -e "${RED}Error: No active workflow${NC}" >&2
        exit 1
    fi

    local deliverables_dir="${WORKFLOWS_DIR}/${workflow_id}/deliverables"

    if [[ ! -d "$deliverables_dir" ]]; then
        echo -e "${YELLOW}No deliverables found${NC}"
        return 0
    fi

    echo -e "${BLUE}📄 Deliverables for workflow: ${workflow_id}${NC}"
    echo ""

    if [[ "$phase" == "all" ]]; then
        for i in {1..9}; do
            local phase_dir_name=$(get_phase_dir_name "$i")
            local phase_name=$(get_phase_name "$i")
            local phase_dir="${deliverables_dir}/${phase_dir_name}"

            if [[ -d "$phase_dir" ]] && [[ -n "$(ls -A "$phase_dir" 2>/dev/null)" ]]; then
                echo -e "${GREEN}Phase $i: $phase_name${NC}"
                for file in "$phase_dir"/*.md; do
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
        local phase_dir_name=$(get_phase_dir_name "$phase")
        local phase_name=$(get_phase_name "$phase")
        local phase_dir="${deliverables_dir}/${phase_dir_name}"

        echo -e "${GREEN}Phase $phase: $phase_name${NC}"

        if [[ -d "$phase_dir" ]] && [[ -n "$(ls -A "$phase_dir" 2>/dev/null)" ]]; then
            for file in "$phase_dir"/*.md; do
                if [[ -f "$file" ]]; then
                    local fname=$(basename "$file")
                    local size=$(wc -c < "$file" | tr -d ' ')
                    echo "   📝 $fname ($size bytes)"
                fi
            done
        else
            echo "   (no deliverables)"
        fi
    fi
}

# Show usage
show_usage() {
    cat <<EOF
Save Deliverable - Save phase deliverables to workflow logs

USAGE:
    bash $0 <command> [arguments]

COMMANDS:
    save <phase> <filename> <content>     Save content as deliverable
    save <phase> <filename> --file <src>  Save file as deliverable
    save <phase> <filename> --stdin       Save stdin as deliverable
    list [phase]                          List deliverables (all or specific phase)
    help                                  Show this help

PHASES:
    1 - Understand + Design
    2 - Test RED
    3 - Build GREEN
    4 - Refactor + Review
    5 - Finalize

EXAMPLES:
    # Save inline content
    bash $0 save 1 requirements.md "# Requirements\\n\\n- Feature 1\\n- Feature 2"

    # Save from file
    bash $0 save 2 technical-plan.md --file /tmp/plan.md

    # Save from stdin
    cat analysis.md | bash $0 save 1 analysis.md --stdin

    # List all deliverables
    bash $0 list

    # List phase 1 deliverables
    bash $0 list 1

OUTPUT LOCATION:
    .claude/logs/runs/{run-id}/deliverables/{phase}/   # v3.6+
    .claude/logs/workflows/{run-id}/deliverables/{phase}/   # legacy fallback

EOF
}

# Main
main() {
    local command="${1:-help}"

    case "$command" in
        save)
            if [[ $# -lt 3 ]]; then
                echo -e "${RED}Error: Missing arguments${NC}"
                echo "Usage: $0 save <phase> <filename> <content|--file|--stdin>"
                exit 1
            fi
            save_deliverable "${2}" "${3}" "${4:-}" "${5:-}"
            ;;
        list)
            list_deliverables "${2:-all}"
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            # Default: treat as save command for backwards compatibility
            if [[ $# -ge 2 ]]; then
                save_deliverable "${1}" "${2}" "${3:-}" "${4:-}"
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
