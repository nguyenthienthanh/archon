#!/usr/bin/env bash

# Workflow TOON Export
# Purpose: Export workflow state in TOON format for token-efficient AI loading
# Version: 1.0.0

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source the manager for helper functions
source "${SCRIPT_DIR}/workflow-manager.sh" 2>/dev/null || true

# Detect CLAUDE_DIR
if [ -d ".claude" ]; then
    CLAUDE_DIR=".claude"
elif [ -d "$(pwd)/.claude" ]; then
    CLAUDE_DIR="$(pwd)/.claude"
else
    CLAUDE_DIR="${HOME}/.claude"
fi

# Primary path (v3.6+); fall back to legacy logs/workflows
WORKFLOWS_DIR="${CLAUDE_DIR}/logs/runs"
[ ! -d "${WORKFLOWS_DIR}" ] && [ -d "${CLAUDE_DIR}/logs/workflows" ] && WORKFLOWS_DIR="${CLAUDE_DIR}/logs/workflows"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

usage() {
    echo "Workflow TOON Export v1.0.0"
    echo ""
    echo "Usage: $0 <workflow-id> [output-file]"
    echo ""
    echo "Exports workflow state in TOON format for token-efficient AI context."
    echo "Saves ~35% tokens compared to JSON format."
    echo ""
    echo "Examples:"
    echo "  $0 add-auth-20251124"
    echo "  $0 add-auth-20251124 state.toon"
}

# Convert JSON state to TOON format
json_to_toon() {
    local json="$1"

    # Extract basic workflow info
    local id=$(echo "$json" | jq -r '.workflow_id // "unknown"')
    local name=$(echo "$json" | jq -r '.workflow_name // .workflow_id // "unknown"')
    local status=$(echo "$json" | jq -r '.status // "unknown"')
    local phase=$(echo "$json" | jq -r '.current_phase // 1')
    local created=$(echo "$json" | jq -r '.created_at // ""')
    local task=$(echo "$json" | jq -r '.context.task // "No task description"')

    # Get phase name
    local phase_names=("" "Requirements" "Tech Planning" "UI Breakdown" "Test Planning" "TDD Implementation" "Code Review" "QA Validation" "Documentation" "Notification")
    local phase_name="${phase_names[$phase]:-Unknown}"

    # Count arrays
    local agent_count=$(echo "$json" | jq -r '.context.agents | length // 0')
    local agents=$(echo "$json" | jq -r '.context.agents | join(",") // ""')

    cat << EOF
# Workflow State (TOON Format)
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Token savings: ~35% vs JSON

---

## Basic Info

\`\`\`toon
workflow:
  id: $id
  name: $name
  status: $status
  phase: $phase
  phase_name: $phase_name
  created: $created
  task: $task
\`\`\`

---

## Phases

\`\`\`toon
phases[9]{num,name,status}:
EOF

    # Output phases
    for i in {1..9}; do
        local pname="${phase_names[$i]}"
        local pstatus=$(echo "$json" | jq -r ".phases[\"$i\"].status // \"pending\"")
        echo "  $i,$pname,$pstatus"
    done

    cat << EOF
\`\`\`

---

## Agents

\`\`\`toon
agents[$agent_count]: $agents
\`\`\`

---

## Deliverables

\`\`\`toon
EOF

    # Count deliverables per phase
    for i in {1..9}; do
        local dcount=$(echo "$json" | jq -r ".phases[\"$i\"].deliverables | length // 0")
        if [ "$dcount" -gt 0 ]; then
            echo "phase_${i}_deliverables[$dcount]:"
            echo "$json" | jq -r ".phases[\"$i\"].deliverables[]" 2>/dev/null | while read -r d; do
                echo "  $d"
            done
        fi
    done

    cat << EOF
\`\`\`

---

**Format:** TOON v1.0
**Load full JSON:** \`workflow-manager.sh load $id\`
EOF
}

# Main
main() {
    local workflow_id="${1:-}"
    local output_file="${2:-}"

    if [ -z "$workflow_id" ]; then
        usage
        exit 1
    fi

    # Find workflow state file
    local state_file="${WORKFLOWS_DIR}/${workflow_id}/workflow-state.json"

    if [ ! -f "$state_file" ]; then
        echo -e "${RED}Error: Workflow not found: $workflow_id${NC}" >&2
        echo "Looking in: $state_file" >&2
        exit 1
    fi

    # Read JSON
    local json=$(cat "$state_file")

    # Convert to TOON
    local toon_output=$(json_to_toon "$json")

    if [ -n "$output_file" ]; then
        echo "$toon_output" > "$output_file"
        echo -e "${GREEN}Exported to: $output_file${NC}"
    else
        echo "$toon_output"
    fi
}

# Run if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
