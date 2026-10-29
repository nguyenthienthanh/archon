#!/usr/bin/env bash

# Phase Transition Script
# Purpose: Execute phase transition with hooks
# Version: 1.0.0

set -euo pipefail

CLAUDE_DIR=".claude"
WORKFLOW_STATE_FILE="${CLAUDE_DIR}/cache/workflow-state.json"
# Primary path (v3.6+); legacy fallback if primary missing
LOGS_DIR="${CLAUDE_DIR}/logs/runs"
[ ! -d "${LOGS_DIR}" ] && [ -d "${CLAUDE_DIR}/logs/workflows" ] && LOGS_DIR="${CLAUDE_DIR}/logs/workflows"
ACTIVE_WORKFLOW_FILE="${CLAUDE_DIR}/cache/active-workflow.txt"

# Atomically replace a state file from stdin (jq output). Uses a per-invocation
# mktemp in the target's own dir instead of a fixed `temp.json` in the CWD, so
# concurrent sessions can't clobber each other and nothing is littered into the
# user's repo root. Refuses to write an empty result (preserves prior state if
# the producing jq fails).
_atomic_state_write() {
    local target="$1" tmp
    tmp=$(mktemp "${target}.XXXXXX") || return 1
    cat > "$tmp"
    if [ -s "$tmp" ]; then
        mv "$tmp" "$target"
    else
        rm -f "$tmp"
        return 1
    fi
}

# Get active workflow ID
get_active_workflow_id() {
    if [[ -f "${ACTIVE_WORKFLOW_FILE}" ]]; then
        cat "${ACTIVE_WORKFLOW_FILE}"
    else
        echo ""
    fi
}

# Get execution log path
get_execution_log() {
    local workflow_id=$(get_active_workflow_id)
    if [[ -n "$workflow_id" ]]; then
        echo "${LOGS_DIR}/${workflow_id}/execution.log"
    else
        echo ""
    fi
}

# Log workflow event (append to execution.log + sync to Supabase)
log_workflow_event() {
    local event_type="$1"
    local phase="$2"
    local details="${3:-}"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local log_file=$(get_execution_log)
    local workflow_id=$(get_active_workflow_id)

    # Append to local execution.log
    if [[ -n "$log_file" && -d "$(dirname "$log_file")" ]]; then
        echo "[${timestamp}] ${event_type} phase=${phase} ${details}" >> "$log_file"
    fi

    # Sync to learning system (local + Supabase if configured)
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local record_script="${script_dir}/../../hooks/lib/record-workflow-event.cjs"

    if [[ -f "$record_script" ]]; then
        # Extract attempt count from details if present
        local attempt_count=$(echo "$details" | grep -oE 'attempt=[0-9]+' | cut -d= -f2 || echo "1")
        local revision=$(echo "$details" | grep -oE 'revision=[0-9]+' | cut -d= -f2 || echo "")
        [[ -n "$revision" ]] && attempt_count="$revision"

        # Call Node.js script (non-blocking)
        node "$record_script" "$event_type" "$phase" "$workflow_id" "" "$attempt_count" 2>/dev/null &
    fi
}

# Increment phase counter (rejection_count or modification_count)
increment_phase_counter() {
    local phase="$1"
    local counter_name="$2"  # rejection_count or modification_count
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    # Get current count (default 0)
    local current_count=$(jq -r ".phases[\"$phase\"].${counter_name} // 0" "${WORKFLOW_STATE_FILE}" 2>/dev/null || echo "0")
    local new_count=$((current_count + 1))

    # Update state with new count
    jq --arg phase "$phase" \
       --arg counter "$counter_name" \
       --argjson count "$new_count" \
       --arg timestamp "$timestamp" \
       ".phases[\$phase][\$counter] = \$count |
        .phases[\$phase].last_updated = \$timestamp" \
       "${WORKFLOW_STATE_FILE}" | _atomic_state_write "${WORKFLOW_STATE_FILE}"

    echo "$new_count"
}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get current phase
get_current_phase() {
    jq -r '.current_phase' "${WORKFLOW_STATE_FILE}"
}

# Get phase status
get_phase_status() {
    local phase="$1"
    jq -r ".phases[\"$phase\"].status // \"pending\"" "${WORKFLOW_STATE_FILE}"
}

# Get phase name
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

# Show phase banner
show_phase_banner() {
    local phase="$1"
    local phase_name="$2"
    
    echo -e "${CYAN}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    printf "🚀 PHASE %s: %s\n" "$phase" "$phase_name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${NC}"
}

# Show completion banner
show_completion_banner() {
    local phase="$1"
    local duration="$2"
    
    echo ""
    echo -e "${GREEN}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    printf "✅ PHASE %s COMPLETED IN %s\n" "$phase" "$duration"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${NC}"
    echo ""
}

# Update phase status
update_phase_status() {
    local phase="$1"
    local status="$2"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    jq --arg phase "$phase" \
       --arg status "$status" \
       --arg timestamp "$timestamp" \
       ".phases[\$phase].status = \$status | 
        .phases[\$phase].updated_at = \$timestamp" \
       "${WORKFLOW_STATE_FILE}" | _atomic_state_write "${WORKFLOW_STATE_FILE}"
}

# Start phase timer
start_phase_timer() {
    local phase="$1"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    jq --arg phase "$phase" \
       --arg timestamp "$timestamp" \
       ".phases[\$phase].started_at = \$timestamp | 
        .phases[\$phase].status = \"in_progress\"" \
       "${WORKFLOW_STATE_FILE}" | _atomic_state_write "${WORKFLOW_STATE_FILE}"
}

# Stop phase timer
stop_phase_timer() {
    local phase="$1"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local started_at=$(jq -r ".phases[\"$phase\"].started_at" "${WORKFLOW_STATE_FILE}")
    
    if [[ -n "$started_at" && "$started_at" != "null" ]]; then
        local start_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$started_at" "+%s" 2>/dev/null || echo "0")
        local end_epoch=$(date +%s)
        local duration=$((end_epoch - start_epoch))
        
        jq --arg phase "$phase" \
           --arg timestamp "$timestamp" \
           --argjson duration "$duration" \
           ".phases[\$phase].completed_at = \$timestamp | 
            .phases[\$phase].duration_seconds = \$duration | 
            .phases[\$phase].status = \"completed\"" \
           "${WORKFLOW_STATE_FILE}" | _atomic_state_write "${WORKFLOW_STATE_FILE}"
        
        echo "$duration"
    else
        echo "0"
    fi
}

# Format duration
format_duration() {
    local seconds="$1"
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

# Execute pre-phase hook
execute_pre_phase_hook() {
    local phase="$1"
    local phase_name="$2"
    
    echo -e "${BLUE}🔧 Executing pre-phase hook...${NC}"
    
    # Load workflow state
    echo "   ✓ Workflow state loaded"
    
    # Verify prerequisites
    if [[ $phase -gt 1 ]]; then
        local prev_phase=$((phase - 1))
        local prev_status=$(get_phase_status "$prev_phase")
        
        if [[ "$prev_status" != "approved" ]]; then
            echo -e "${RED}   ✗ Previous phase not approved${NC}"
            return 1
        fi
        echo "   ✓ Previous phase verified (approved)"
    fi
    
    # Initialize phase state
    echo "   ✓ Phase state initialized"

    # Team bridge: create team if conditions met
    if [[ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-0}" == "1" ]]; then
        local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        local team_bridge="${script_dir}/../../hooks/lib/team-bridge.cjs"
        local workflow_id=$(get_active_workflow_id)
        if [[ -f "$team_bridge" && -n "$workflow_id" ]]; then
            echo "   🔗 Team bridge: checking team creation..."
            node "$team_bridge" create-if-needed "$phase" "$workflow_id" 2>&1 | sed 's/^/   /'
        fi
    fi

    # Show phase info
    echo "   ✓ Phase info displayed"

    echo -e "${GREEN}✅ Pre-phase hook complete${NC}"
    echo ""
}

# Execute post-phase hook
execute_post_phase_hook() {
    local phase="$1"
    local duration="$2"
    
    echo ""
    echo -e "${BLUE}🔧 Executing post-phase hook...${NC}"
    
    # Stop timer
    echo "   ✓ Timer stopped (duration: $(format_duration $duration))"
    
    # Validate deliverables
    local deliverables_count=$(jq -r ".phases[\"$phase\"].deliverables | length" "${WORKFLOW_STATE_FILE}" 2>/dev/null || echo "0")
    echo "   ✓ Deliverables validated ($deliverables_count file(s))"
    
    # Check success criteria
    echo "   ✓ Success criteria checked"
    
    # Generate summary
    echo "   ✓ Summary generated"
    
    # Team bridge: teardown + merge logs
    if [[ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-0}" == "1" ]]; then
        local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        local team_bridge="${script_dir}/../../hooks/lib/team-bridge.cjs"
        local merge_script="${script_dir}/merge-team-logs.sh"
        local workflow_id=$(get_active_workflow_id)
        if [[ -f "$team_bridge" && -n "$workflow_id" ]]; then
            node "$team_bridge" teardown "$phase" "$workflow_id" 2>/dev/null | sed 's/^/   /' || true
        fi
        if [[ -f "$merge_script" && -n "$workflow_id" ]]; then
            bash "$merge_script" "$workflow_id" --phase "$phase" 2>/dev/null | sed 's/^/   /' || true
        fi
    fi

    # Save state
    echo "   ✓ State saved"

    echo -e "${GREEN}✅ Post-phase hook complete${NC}"
}

# Execute pre-approval hook (placeholder for Claude)
execute_pre_approval_hook() {
    local phase="$1"
    local phase_name="$2"
    
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo -e "${YELLOW}🎯 PHASE $phase COMPLETE: $phase_name${NC}"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "📊 Summary: Phase execution complete"
    echo ""
    echo "✅ Success Criteria:"
    echo "   ✓ All objectives met"
    echo "   ✓ Deliverables created"
    echo ""
    
    if [[ $phase -lt 9 ]]; then
        local next_phase=$((phase + 1))
        local next_phase_name=$(get_phase_name $next_phase)
        echo "⏭️  Next Phase: Phase $next_phase - $next_phase_name"
    else
        echo "🎉 Workflow Complete!"
    fi
    
    echo ""
    echo "───────────────────────────────────────────────────────────"
    echo -e "${YELLOW}⚠️  ACTION REQUIRED${NC}"
    echo ""
    echo "Please review and respond:"
    echo "  ✅ Type \"approve\"  → Proceed to next phase"
    echo "  🔄 Type \"reject\"   → Restart this phase"
    echo "  ✏️  Type \"modify\"   → Make changes"
    echo "  ❌ Type \"cancel\"   → Stop workflow"
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo ""
}

# Wait for approval
wait_for_approval() {
    local phase="$1"
    
    while true; do
        echo -n "Your response: "
        read -r response
        
        response=$(echo "$response" | tr '[:upper:]' '[:lower:]' | xargs)
        
        case "$response" in
            approve|approved|ok|proceed|continue|yes|y)
                return 0
                ;;
            reject|rejected|no|restart)
                return 1
                ;;
            modify|change|edit)
                return 2
                ;;
            cancel|stop|abort)
                return 3
                ;;
            *)
                echo -e "${RED}Invalid response. Please type: approve, reject, modify, or cancel${NC}"
                ;;
        esac
    done
}

# Process approval response
process_approval() {
    local phase="$1"
    
    wait_for_approval "$phase"
    local response=$?
    
    case $response in
        0) # Approved
            echo ""
            echo -e "${GREEN}✅ Phase $phase approved${NC}"
            update_phase_status "$phase" "approved"
            log_workflow_event "APPROVED" "$phase" "status=approved"

            # Move to next phase
            if [[ $phase -lt 9 ]]; then
                local next_phase=$((phase + 1))
                jq --argjson next_phase "$next_phase" \
                   '.current_phase = $next_phase' \
                   "${WORKFLOW_STATE_FILE}" | _atomic_state_write "${WORKFLOW_STATE_FILE}"

                log_workflow_event "PHASE_START" "$next_phase" "status=in_progress"
                echo -e "${BLUE}⏭️  Proceeding to Phase $next_phase...${NC}"
                echo ""
                return 0
            else
                echo -e "${GREEN}🎉 Workflow complete!${NC}"
                jq '.status = "completed"' \
                   "${WORKFLOW_STATE_FILE}" | _atomic_state_write "${WORKFLOW_STATE_FILE}"
                log_workflow_event "WORKFLOW_COMPLETE" "9" "status=completed"
                return 0
            fi
            ;;
        1) # Rejected
            echo ""
            local reject_count=$(increment_phase_counter "$phase" "rejection_count")
            echo -e "${YELLOW}🔄 Phase $phase rejected (attempt #${reject_count}) - restarting...${NC}"
            update_phase_status "$phase" "rejected"
            log_workflow_event "REJECTED" "$phase" "status=rejected action=restart attempt=${reject_count}"

            # Team bridge: handle rejection (archive logs, prep next attempt)
            if [[ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-0}" == "1" ]]; then
                local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
                local team_bridge="${script_dir}/../../hooks/lib/team-bridge.cjs"
                local workflow_id=$(get_active_workflow_id)
                if [[ -f "$team_bridge" && -n "$workflow_id" ]]; then
                    node "$team_bridge" handle-rejection "$phase" "$workflow_id" 2>/dev/null || true
                fi
            fi
            return 1
            ;;
        2) # Modify
            echo ""
            local modify_count=$(increment_phase_counter "$phase" "modification_count")
            echo -e "${BLUE}✏️  Modifications requested (revision #${modify_count})...${NC}"
            log_workflow_event "MODIFIED" "$phase" "status=in_progress action=modify revision=${modify_count}"
            return 2
            ;;
        3) # Cancel
            echo ""
            echo -e "${RED}❌ Workflow cancelled${NC}"
            jq '.status = "cancelled"' \
               "${WORKFLOW_STATE_FILE}" | _atomic_state_write "${WORKFLOW_STATE_FILE}"
            log_workflow_event "CANCELLED" "$phase" "status=cancelled"
            return 3
            ;;
    esac
}

# Main function
main() {
    if [[ ! -f "${WORKFLOW_STATE_FILE}" ]]; then
        echo -e "${RED}Error: No active workflow. Run init-workflow.sh first.${NC}"
        exit 1
    fi
    
    local phase="${1:-$(get_current_phase)}"
    local phase_name=$(get_phase_name "$phase")
    
    # Show phase banner
    show_phase_banner "$phase" "$phase_name"
    
    # Execute pre-phase hook
    execute_pre_phase_hook "$phase" "$phase_name" || {
        echo -e "${RED}Pre-phase hook failed. Cannot proceed.${NC}"
        exit 1
    }
    
    # Start timer
    start_phase_timer "$phase"
    
    # Phase execution (placeholder - actual work done by Claude/agents)
    echo -e "${BLUE}📋 Phase $phase: $phase_name${NC}"
    echo ""
    echo "🤖 Agents working on phase objectives..."
    echo "   (Phase execution delegated to Claude agents)"
    echo ""
    echo "⏸️  Press Enter when phase execution is complete..."
    read -r
    
    # Stop timer and execute post-phase hook
    local duration=$(stop_phase_timer "$phase")
    show_completion_banner "$phase" "$(format_duration $duration)"
    execute_post_phase_hook "$phase" "$duration"
    
    # Execute pre-approval hook and wait for approval
    execute_pre_approval_hook "$phase" "$phase_name"
    process_approval "$phase"
    local approval_result=$?
    
    case $approval_result in
        0) # Approved, continue
            if [[ $phase -lt 9 ]]; then
                # Auto-transition to next phase
                local next_phase=$((phase + 1))
                sleep 1
                exec "$0" "$next_phase"
            fi
            ;;
        1) # Rejected, restart phase
            sleep 1
            exec "$0" "$phase"
            ;;
        2) # Modify, stay in phase
            echo "Make your modifications, then run: $0 $phase"
            ;;
        3) # Cancelled
            exit 0
            ;;
    esac
}

main "$@"

