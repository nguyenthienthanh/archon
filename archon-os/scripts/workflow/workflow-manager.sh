#!/usr/bin/env bash

# Workflow Manager
# Purpose: Manage multiple workflow states
# Version: 1.0.0

set -euo pipefail

# Script directory (for relative paths)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Detect CLAUDE_DIR - prioritize project's .claude directory
if [ -d ".claude" ]; then
  CLAUDE_DIR=".claude"
elif [ -d "$(pwd)/.claude" ]; then
  CLAUDE_DIR="$(pwd)/.claude"
else
  # Fallback to plugin's directory if no project .claude exists
  CLAUDE_DIR="${PLUGIN_DIR}"
fi

# Set up paths
LOGS_DIR="${CLAUDE_DIR}/logs"
WORKFLOWS_DIR="${LOGS_DIR}/workflows"
ACTIVE_WORKFLOW_FILE="${CLAUDE_DIR}/active-workflow.txt"

# Ensure directories exist
mkdir -p "${LOGS_DIR}" "${WORKFLOWS_DIR}" 2>/dev/null || true

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Debug mode (set DEBUG=1 to enable)
debug() {
  if [[ "${DEBUG:-0}" == "1" ]]; then
    echo -e "${BLUE}[DEBUG]${NC} $1" >&2
  fi
}

debug "SCRIPT_DIR: $SCRIPT_DIR"
debug "PLUGIN_DIR: $PLUGIN_DIR"
debug "CLAUDE_DIR: $CLAUDE_DIR"
debug "LOGS_DIR: $LOGS_DIR"
debug "WORKFLOWS_DIR: $WORKFLOWS_DIR"

# Get active workflow ID
get_active_workflow() {
    if [[ -f "${ACTIVE_WORKFLOW_FILE}" ]]; then
        cat "${ACTIVE_WORKFLOW_FILE}"
    else
        echo ""
    fi
}

# Set active workflow
set_active_workflow() {
    local workflow_id="$1"
    echo "$workflow_id" > "${ACTIVE_WORKFLOW_FILE}"
}

# Get workflow state file path
get_workflow_state_file() {
    local workflow_id="$1"
    echo "${WORKFLOWS_DIR}/${workflow_id}/workflow-state.json"
}

# Load workflow state
load_workflow_state() {
    local workflow_id="${1:-$(get_active_workflow)}"
    
    if [[ -z "$workflow_id" ]]; then
        echo -e "${RED}❌ No active workflow${NC}" >&2
        return 1
    fi
    
    local state_file=$(get_workflow_state_file "$workflow_id")
    
    if [[ ! -f "$state_file" ]]; then
        echo -e "${RED}❌ Workflow state not found: $workflow_id${NC}" >&2
        return 1
    fi
    
    cat "$state_file"
}

# Save workflow state
save_workflow_state() {
    local workflow_id="$1"
    local state_json="$2"
    
    local state_file=$(get_workflow_state_file "$workflow_id")
    echo "$state_json" > "$state_file"
}

# List all workflows
list_workflows() {
    if [[ ! -d "${WORKFLOWS_DIR}" ]]; then
        echo -e "${YELLOW}No workflows found${NC}"
        return
    fi
    
    local active_id=$(get_active_workflow)
    
    echo -e "${BLUE}📋 All Workflows:${NC}"
    echo ""
    
    for workflow_dir in "${WORKFLOWS_DIR}"/*/ ; do
        if [[ ! -d "$workflow_dir" ]]; then
            continue
        fi
        
        local workflow_id=$(basename "$workflow_dir")
        local state_file="${workflow_dir}/workflow-state.json"
        
        if [[ ! -f "$state_file" ]]; then
            continue
        fi
        
        local workflow_name=$(jq -r '.workflow_name // .workflow_id' "$state_file" 2>/dev/null || echo "$workflow_id")
        local status=$(jq -r '.status // "unknown"' "$state_file" 2>/dev/null || echo "unknown")
        local current_phase=$(jq -r '.current_phase // 0' "$state_file" 2>/dev/null || echo "0")
        local created_at=$(jq -r '.created_at // "unknown"' "$state_file" 2>/dev/null || echo "unknown")
        
        # Mark active workflow
        local active_marker=""
        if [[ "$workflow_id" == "$active_id" ]]; then
            active_marker=" ${GREEN}[ACTIVE]${NC}"
        fi
        
        # Status icon
        local status_icon="⏸️"
        if [[ "$status" == "completed" ]]; then
            status_icon="✅"
        elif [[ "$status" == "in_progress" ]]; then
            status_icon="⏳"
        elif [[ "$status" == "error" ]]; then
            status_icon="❌"
        fi
        
        echo -e "${status_icon} ${BLUE}${workflow_name}${NC}${active_marker}"
        echo "   ID: ${workflow_id}"
        echo "   Phase: ${current_phase}/5 | Status: ${status}"
        echo "   Created: ${created_at}"
        echo ""
    done
}

# Switch to workflow
switch_workflow() {
    local workflow_id="$1"
    
    local state_file=$(get_workflow_state_file "$workflow_id")
    
    if [[ ! -f "$state_file" ]]; then
        echo -e "${RED}❌ Workflow not found: $workflow_id${NC}"
        return 1
    fi
    
    set_active_workflow "$workflow_id"
    
    local workflow_name=$(jq -r '.workflow_name // .workflow_id' "$state_file")
    echo -e "${GREEN}✅ Switched to workflow: ${workflow_name}${NC}"
    echo "   ID: ${workflow_id}"
}

# Delete workflow
delete_workflow() {
    local workflow_id="$1"
    local force="${2:-false}"
    
    local workflow_dir="${WORKFLOWS_DIR}/${workflow_id}"
    local context_dir="${LOGS_DIR}/contexts/${workflow_id}"
    
    if [[ ! -d "$workflow_dir" ]]; then
        echo -e "${RED}❌ Workflow not found: $workflow_id${NC}"
        return 1
    fi
    
    # Check if active
    local active_id=$(get_active_workflow)
    if [[ "$workflow_id" == "$active_id" ]] && [[ "$force" != "true" ]]; then
        echo -e "${YELLOW}⚠️  Cannot delete active workflow${NC}"
        echo "   Switch to another workflow first or use --force"
        return 1
    fi
    
    # Confirm deletion
    if [[ "$force" != "true" ]]; then
        echo -e "${YELLOW}⚠️  Delete workflow: $workflow_id?${NC}"
        read -p "   This will delete all logs and deliverables. Continue? (y/N) " confirm
        if [[ "$confirm" != "y" ]] && [[ "$confirm" != "Y" ]]; then
            echo "Cancelled"
            return 0
        fi
    fi
    
    # Delete
    rm -rf "$workflow_dir"
    if [[ -d "$context_dir" ]]; then
        rm -rf "$context_dir"
    fi
    
    # Clear active if this was active
    if [[ "$workflow_id" == "$active_id" ]]; then
        rm -f "${ACTIVE_WORKFLOW_FILE}"
    fi
    
    echo -e "${GREEN}✅ Workflow deleted: $workflow_id${NC}"
}

# Archive workflow
archive_workflow() {
    local workflow_id="$1"
    local archive_dir="${CLAUDE_DIR}/archive"
    
    mkdir -p "$archive_dir"
    
    local workflow_dir="${WORKFLOWS_DIR}/${workflow_id}"
    local context_dir="${LOGS_DIR}/contexts/${workflow_id}"
    local archive_file="${archive_dir}/${workflow_id}.tar.gz"
    
    if [[ ! -d "$workflow_dir" ]]; then
        echo -e "${RED}❌ Workflow not found: $workflow_id${NC}"
        return 1
    fi
    
    echo -e "${BLUE}📦 Archiving workflow: $workflow_id${NC}"
    
    # Create archive
    tar -czf "$archive_file" \
        -C "${LOGS_DIR}" \
        "workflows/${workflow_id}" \
        "contexts/${workflow_id}" 2>/dev/null || true
    
    echo -e "${GREEN}✅ Archived to: $archive_file${NC}"
    
    # Ask to delete
    read -p "   Delete original? (y/N) " confirm
    if [[ "$confirm" == "y" ]] || [[ "$confirm" == "Y" ]]; then
        delete_workflow "$workflow_id" "true"
    fi
}

# Save deliverable (wrapper)
save_deliverable() {
    local phase="$1"
    local filename="$2"
    shift 2
    local content="$@"

    bash "${SCRIPT_DIR}/save-deliverable.sh" save "$phase" "$filename" "$content"
}

# List deliverables (wrapper)
list_deliverables() {
    local phase="${1:-all}"
    bash "${SCRIPT_DIR}/save-deliverable.sh" list "$phase"
}

# Save MCP response (wrapper)
save_mcp_response() {
    local mcp_type="$1"
    local identifier="$2"
    shift 2
    bash "${SCRIPT_DIR}/save-mcp-response.sh" save "$mcp_type" "$identifier" "$@"
}

# List MCP responses (wrapper)
list_mcp_responses() {
    local mcp_type="${1:-all}"
    bash "${SCRIPT_DIR}/save-mcp-response.sh" list "$mcp_type"
}

# Get MCP response (wrapper)
get_mcp_response() {
    local mcp_type="$1"
    local identifier="$2"
    bash "${SCRIPT_DIR}/save-mcp-response.sh" get "$mcp_type" "$identifier"
}

# Show usage
show_usage() {
    cat <<EOF
Workflow Manager - Manage multiple Aura Frog workflows

USAGE:
    bash $0 <command> [arguments]

COMMANDS:
    list                           List all workflows
    active                         Show active workflow
    switch <workflow-id>           Switch to workflow
    load <workflow-id>             Load workflow state
    delete <workflow-id>           Delete workflow
    archive <workflow-id>          Archive workflow
    save <phase> <file> <content>  Save deliverable (markdown)
    deliverables [phase]           List deliverables
    mcp-save <type> <id> <content> Save MCP response (jira, figma, etc.)
    mcp-list [type]                List MCP responses
    mcp-get <type> <id>            Get latest MCP response
    help                           Show this help

EXAMPLES:
    # List all workflows
    bash $0 list

    # Switch workflow
    bash $0 switch AUTH-456

    # Save a deliverable
    bash $0 save 1 requirements.md "# Requirements\n- Feature 1"

    # List deliverables
    bash $0 deliverables
    bash $0 deliverables 1

    # Save MCP response (JIRA ticket)
    bash $0 mcp-save jira PROJ-123 "# PROJ-123: Title\n..."

    # List all MCP responses
    bash $0 mcp-list
    bash $0 mcp-list jira

    # Get latest JIRA response
    bash $0 mcp-get jira PROJ-123

    # Archive completed workflow
    bash $0 archive AUTH-456

LOCATION:
    Runs:         .claude/logs/runs/   (v3.6+, legacy: .claude/logs/workflows/)
    Deliverables: .claude/logs/runs/{id}/deliverables/
    MCP Logs:     .claude/logs/{jira|figma|confluence|slack}/
    Active:       .claude/cache/active-workflow.txt
EOF
}

# Main
main() {
    local command="${1:-list}"
    
    case "$command" in
        list)
            list_workflows
            ;;
        active)
            local active_id=$(get_active_workflow)
            if [[ -z "$active_id" ]]; then
                echo -e "${YELLOW}No active workflow${NC}"
            else
                echo -e "${GREEN}Active workflow: $active_id${NC}"
            fi
            ;;
        switch)
            if [[ -z "${2:-}" ]]; then
                echo -e "${RED}Error: workflow-id required${NC}"
                echo "Usage: $0 switch <workflow-id>"
                exit 1
            fi
            switch_workflow "$2"
            ;;
        load)
            if [[ -z "${2:-}" ]]; then
                load_workflow_state
            else
                load_workflow_state "$2"
            fi
            ;;
        delete)
            if [[ -z "${2:-}" ]]; then
                echo -e "${RED}Error: workflow-id required${NC}"
                echo "Usage: $0 delete <workflow-id>"
                exit 1
            fi
            delete_workflow "$2" "${3:-false}"
            ;;
        archive)
            if [[ -z "${2:-}" ]]; then
                echo -e "${RED}Error: workflow-id required${NC}"
                echo "Usage: $0 archive <workflow-id>"
                exit 1
            fi
            archive_workflow "$2"
            ;;
        save)
            if [[ -z "${2:-}" ]] || [[ -z "${3:-}" ]]; then
                echo -e "${RED}Error: phase and filename required${NC}"
                echo "Usage: $0 save <phase> <filename> <content|--file|--stdin>"
                exit 1
            fi
            save_deliverable "$2" "$3" "${4:-}" "${5:-}"
            ;;
        deliverables)
            list_deliverables "${2:-all}"
            ;;
        mcp-save)
            if [[ -z "${2:-}" ]] || [[ -z "${3:-}" ]]; then
                echo -e "${RED}Error: type and identifier required${NC}"
                echo "Usage: $0 mcp-save <type> <identifier> <content|--file|--stdin>"
                exit 1
            fi
            save_mcp_response "$2" "$3" "${4:-}" "${5:-}"
            ;;
        mcp-list)
            list_mcp_responses "${2:-all}"
            ;;
        mcp-get)
            if [[ -z "${2:-}" ]] || [[ -z "${3:-}" ]]; then
                echo -e "${RED}Error: type and identifier required${NC}"
                echo "Usage: $0 mcp-get <type> <identifier>"
                exit 1
            fi
            get_mcp_response "$2" "$3"
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            echo -e "${RED}Unknown command: $command${NC}"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

main "$@"

