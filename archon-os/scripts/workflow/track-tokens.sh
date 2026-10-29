#!/usr/bin/env bash

# Token Tracking Script
# Purpose: Track and display token usage for workflows
# Version: 1.0.0

set -euo pipefail

WORKFLOW_STATE="workflow-state.json"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Display token usage for current workflow
show_token_usage() {
    if [[ ! -f "$WORKFLOW_STATE" ]]; then
        echo -e "${RED}❌ No active workflow${NC}"
        exit 1
    fi

    echo -e "${BLUE}📊 Token Usage Report${NC}"
    echo ""

    # Read workflow state
    local workflow_id=$(jq -r '.workflow_id' "$WORKFLOW_STATE")
    local workflow_name=$(jq -r '.workflow_name // .workflow_id' "$WORKFLOW_STATE")
    local total_tokens=$(jq -r '.total_tokens_used // 0' "$WORKFLOW_STATE")
    local remaining=$(jq -r '.total_tokens_remaining // 1000000' "$WORKFLOW_STATE")

    echo -e "${BLUE}Workflow:${NC} $workflow_name"
    echo -e "${BLUE}ID:${NC} $workflow_id"
    echo ""

    # Calculate percentage
    local percent=$((total_tokens * 100 / 1000000))
    
    # Progress bar
    local bar_length=50
    local filled=$((percent * bar_length / 100))
    local bar=""
    for ((i=0; i<filled; i++)); do bar="${bar}█"; done
    for ((i=filled; i<bar_length; i++)); do bar="${bar}░"; done

    echo -e "${BLUE}Total Usage:${NC}"
    echo -e "  ${bar} ${percent}%"
    echo -e "  Used: ${GREEN}$(printf "%'d" $total_tokens)${NC} tokens (~$((total_tokens / 1000))K)"
    echo -e "  Remaining: ${YELLOW}$(printf "%'d" $remaining)${NC} tokens (~$((remaining / 1000))K)"
    echo ""

    # Phase breakdown
    echo -e "${BLUE}Phase Breakdown:${NC}"
    echo ""

    for phase in {1..9}; do
        local phase_status=$(jq -r ".phases[\"$phase\"].status // \"pending\"" "$WORKFLOW_STATE")
        local phase_name=$(jq -r ".phases[\"$phase\"].name // \"Unknown\"" "$WORKFLOW_STATE")
        local phase_tokens=$(jq -r ".phases[\"$phase\"].tokens.phase_tokens // 0" "$WORKFLOW_STATE")

        if [[ "$phase_status" == "completed" ]]; then
            local icon="✅"
            local color="$GREEN"
        elif [[ "$phase_status" == "in_progress" ]]; then
            local icon="⏳"
            local color="$YELLOW"
        else
            local icon="⏸️"
            local color="$NC"
        fi

        if [[ $phase_tokens -gt 0 ]]; then
            printf "  ${icon} ${color}Phase %d: %-30s %'10d tokens (~%dK)${NC}\n" \
                   $phase "$phase_name" $phase_tokens $((phase_tokens / 1000))
        fi
    done

    echo ""

    # Warnings
    if [[ $percent -gt 80 ]]; then
        echo -e "${RED}⚠️  Warning: High token usage (${percent}%)${NC}"
        echo -e "   Consider completing workflow soon or starting new context"
    elif [[ $percent -gt 60 ]]; then
        echo -e "${YELLOW}⚠️  Notice: Moderate token usage (${percent}%)${NC}"
    fi

    echo ""
}

# Log token usage to file
log_token_usage() {
    local workflow_id=$(jq -r '.workflow_id' "$WORKFLOW_STATE" 2>/dev/null || echo "unknown")
    # Primary path (v3.6+); fall back to legacy logs/workflows
    local run_dir=".claude/logs/runs/$workflow_id"
    [[ ! -d "$run_dir" ]] && [[ -d ".claude/logs/workflows/$workflow_id" ]] && run_dir=".claude/logs/workflows/$workflow_id"
    [[ ! -d "$run_dir" ]] && [[ -d "logs/workflows/$workflow_id" ]] && run_dir="logs/workflows/$workflow_id"

    if [[ ! -d "$run_dir" ]]; then
        return
    fi
    local log_file="$run_dir/tokens.log"

    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local total_tokens=$(jq -r '.total_tokens_used // 0' "$WORKFLOW_STATE")
    
    echo "[$timestamp] TOKENS total=$total_tokens" >> "$log_file"
}

# Estimate tokens from text
estimate_tokens() {
    local text="$1"
    local chars=${#text}
    
    # Rough estimate: ~4 characters per token
    local estimated=$((chars / 4))
    
    echo "$estimated"
}

# Main
main() {
    case "${1:-show}" in
        show|status)
            show_token_usage
            ;;
        log)
            log_token_usage
            ;;
        estimate)
            if [[ -z "${2:-}" ]]; then
                echo "Usage: $0 estimate <text>"
                exit 1
            fi
            estimated=$(estimate_tokens "$2")
            echo "Estimated tokens: ~$estimated"
            ;;
        *)
            echo "Usage: $0 {show|log|estimate <text>}"
            echo ""
            echo "Commands:"
            echo "  show      - Display token usage report"
            echo "  log       - Log current token usage"
            echo "  estimate  - Estimate tokens from text"
            exit 1
            ;;
    esac
}

main "$@"

