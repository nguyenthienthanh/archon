#!/usr/bin/env bash

# Workflow Status Script
# Purpose: Display current workflow status
# Version: 1.0.0

set -euo pipefail

CLAUDE_DIR="."
WORKFLOW_STATE_FILE="${CLAUDE_DIR}/workflow-state.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Check if workflow exists
if [[ ! -f "${WORKFLOW_STATE_FILE}" ]]; then
    echo -e "${RED}No active workflow found.${NC}"
    echo ""
    echo "Initialize a workflow first:"
    echo "  ./scripts/workflow/init-workflow.sh 'Your task description'"
    exit 1
fi

# Load workflow state
WORKFLOW_ID=$(jq -r '.workflow_id' "${WORKFLOW_STATE_FILE}")
STATUS=$(jq -r '.status' "${WORKFLOW_STATE_FILE}")
CURRENT_PHASE=$(jq -r '.current_phase' "${WORKFLOW_STATE_FILE}")
TASK=$(jq -r '.context.task' "${WORKFLOW_STATE_FILE}")
CREATED_AT=$(jq -r '.created_at' "${WORKFLOW_STATE_FILE}")

# Get phase name
get_phase_name() {
    case $1 in
        1) echo "Understand + Design" ;;
        2) echo "Test RED" ;;
        3) echo "Build GREEN" ;;
        4) echo "Refactor + Review" ;;
        5) echo "Finalize" ;;
        *) echo "Unknown" ;;
    esac
}

# Get status icon
get_status_icon() {
    case $1 in
        pending) echo "⏸️" ;;
        in_progress) echo "🔄" ;;
        completed) echo "✅" ;;
        approved) echo "✅" ;;
        rejected) echo "❌" ;;
        *) echo "❓" ;;
    esac
}

# Format duration
format_duration() {
    local seconds="$1"
    
    if [[ -z "$seconds" || "$seconds" == "null" ]]; then
        echo "N/A"
        return
    fi
    
    local hours=$((seconds / 3600))
    local minutes=$(((seconds % 3600) / 60))
    local secs=$((seconds % 60))
    
    if [[ $hours -gt 0 ]]; then
        printf "%dh %dm" $hours $minutes
    elif [[ $minutes -gt 0 ]]; then
        printf "%dm %ds" $minutes $secs
    else
        printf "%ds" $secs
    fi
}

# Show banner
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}📋 WORKFLOW STATUS${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Workflow info
echo -e "${BLUE}📋 Workflow Information:${NC}"
echo "   ID: ${WORKFLOW_ID}"
echo "   Status: ${STATUS}"
echo "   Created: ${CREATED_AT}"
echo ""

# Task
echo -e "${BLUE}🎯 Task:${NC}"
echo "   ${TASK}"
echo ""

# Current phase
echo -e "${BLUE}📍 Current Phase:${NC}"
CURRENT_PHASE_NAME=$(get_phase_name "$CURRENT_PHASE")
echo "   Phase ${CURRENT_PHASE}: ${CURRENT_PHASE_NAME}"
echo ""

# Agents
echo -e "${BLUE}🤖 Active Agents:${NC}"
jq -r '.context.agents[]' "${WORKFLOW_STATE_FILE}" | while read -r agent; do
    echo "   - ${agent}"
done
echo ""

# Phase progress
echo -e "${BLUE}📊 Phase Progress:${NC}"
echo ""

for i in {1..9}; do
    PHASE_NAME=$(get_phase_name "$i")
    PHASE_STATUS=$(jq -r ".phases[\"$i\"].status // \"pending\"" "${WORKFLOW_STATE_FILE}")
    ICON=$(get_status_icon "$PHASE_STATUS")
    DURATION=$(jq -r ".phases[\"$i\"].duration_seconds // null" "${WORKFLOW_STATE_FILE}")
    
    # Highlight current phase
    if [[ $i -eq $CURRENT_PHASE ]]; then
        echo -e "${YELLOW}→ ${ICON} Phase ${i}: ${PHASE_NAME} (${PHASE_STATUS})${NC}"
    else
        echo "  ${ICON} Phase ${i}: ${PHASE_NAME} (${PHASE_STATUS})"
    fi
    
    # Show duration if available
    if [[ -n "$DURATION" && "$DURATION" != "null" ]]; then
        echo "     Duration: $(format_duration $DURATION)"
    fi

    # Show deliverables count
    DELIVERABLES_COUNT=$(jq -r ".phases[\"$i\"].deliverables | length" "${WORKFLOW_STATE_FILE}" 2>/dev/null || echo "0")
    if [[ $DELIVERABLES_COUNT -gt 0 ]]; then
        echo "     Deliverables: ${DELIVERABLES_COUNT} file(s)"
    fi

    # Show rejection/modification counts if any
    REJECTION_COUNT=$(jq -r ".phases[\"$i\"].rejection_count // 0" "${WORKFLOW_STATE_FILE}" 2>/dev/null || echo "0")
    MODIFICATION_COUNT=$(jq -r ".phases[\"$i\"].modification_count // 0" "${WORKFLOW_STATE_FILE}" 2>/dev/null || echo "0")
    if [[ $REJECTION_COUNT -gt 0 || $MODIFICATION_COUNT -gt 0 ]]; then
        local history_parts=()
        if [[ $REJECTION_COUNT -gt 0 ]]; then
            history_parts+=("${REJECTION_COUNT} rejection(s)")
        fi
        if [[ $MODIFICATION_COUNT -gt 0 ]]; then
            history_parts+=("${MODIFICATION_COUNT} revision(s)")
        fi
        echo -e "     ${YELLOW}History: ${history_parts[*]}${NC}"
    fi

    echo ""
done

# Summary
COMPLETED_PHASES=$(jq '[.phases[] | select(.status == "approved")] | length' "${WORKFLOW_STATE_FILE}")
TOTAL_PHASES=9
PROGRESS_PERCENT=$(( (COMPLETED_PHASES * 100) / TOTAL_PHASES ))

echo "─────────────────────────────────────────────────────────────"
echo ""
echo -e "${GREEN}Progress: ${COMPLETED_PHASES}/${TOTAL_PHASES} phases (${PROGRESS_PERCENT}%)${NC}"
echo ""

# Next action
case "$STATUS" in
    initialized|in_progress)
        echo -e "${YELLOW}⏭️  Next Action:${NC}"
        echo "   Continue with Phase ${CURRENT_PHASE}: ${CURRENT_PHASE_NAME}"
        echo "   Run: ./scripts/workflow/phase-transition.sh ${CURRENT_PHASE}"
        ;;
    completed)
        echo -e "${GREEN}🎉 Workflow Complete!${NC}"
        ;;
    cancelled)
        echo -e "${RED}❌ Workflow Cancelled${NC}"
        echo "   Resume: ./scripts/workflow/phase-transition.sh ${CURRENT_PHASE}"
        ;;
esac

echo ""

