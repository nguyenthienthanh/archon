#!/bin/bash
# Session Handoff Generator
# Creates handoff documents for session transitions
# Version: 1.0.0

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Directories
STATE_DIR="${HOME}/.claude/state"
WORKFLOWS_DIR="${STATE_DIR}/workflows"
HANDOFF_DIR="${STATE_DIR}/temp"

mkdir -p "$HANDOFF_DIR"

usage() {
    echo "Session Handoff Generator v1.0.0"
    echo ""
    echo "Usage: $0 <command> <workflow-id>"
    echo ""
    echo "Commands:"
    echo "  create <id>     Create handoff document for workflow"
    echo "  show <id>       Display existing handoff"
    echo "  list            List all handoffs"
    echo "  clean           Remove old handoffs"
}

# Get phase name
get_phase_name() {
    local phase="$1"
    local names=("" "Understand + Design" "Test RED" "Build GREEN" "Refactor + Review" "Finalize")
    echo "${names[$phase]}"
}

# Calculate progress percentage
calc_progress() {
    local phase="$1"
    local total=5
    local completed=$((phase - 1))
    echo "$((completed * 100 / total))"
}

# Create handoff document
create_handoff() {
    local id="$1"
    local state_file="${WORKFLOWS_DIR}/${id}.json"

    if [ ! -f "$state_file" ]; then
        echo -e "${YELLOW}Warning: Workflow state not found. Creating basic handoff.${NC}"
        state_file=""
    fi

    local handoff_file="${HANDOFF_DIR}/handoff-${id}.md"
    local now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Get git info
    local branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    local last_commit=$(git log -1 --format="%h - %s" 2>/dev/null || echo "unknown")
    local uncommitted=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

    if [ -n "$state_file" ]; then
        # Extract from state file
        local task=$(jq -r '.workflow.name // "Unknown task"' "$state_file")
        local phase=$(jq -r '.workflow.phase // 1' "$state_file")
        local phase_name=$(jq -r '.workflow.phase_name // "Requirements"' "$state_file")
        local status=$(jq -r '.workflow.status // "unknown"' "$state_file")
        local tokens=$(jq -r '.workflow.tokens_used // 0' "$state_file")
        local progress=$(calc_progress "$phase")

        # Get completed phases
        local completed_phases=$(jq -r '.phases[] | select(.status == "completed") | "\(.num). \(.name)"' "$state_file" 2>/dev/null | tr '\n' ', ' | sed 's/,$//')

        # Get deliverables
        local deliverables=$(jq -r '.deliverables[] | "- \(.file) (\(.status))"' "$state_file" 2>/dev/null || echo "None recorded")

        # Get agents
        local agents=$(jq -r '.agents | join(", ")' "$state_file" 2>/dev/null || echo "Unknown")
    else
        local task="Unknown task"
        local phase=1
        local phase_name="Requirements"
        local status="unknown"
        local tokens=0
        local progress=0
        local completed_phases="None"
        local deliverables="None recorded"
        local agents="Unknown"
    fi

    cat > "$handoff_file" << EOF
# Session Handoff: ${id}

**Generated:** ${now}
**For:** Next Claude Code session

---

## Quick Context

- **Task:** ${task}
- **Phase:** ${phase} - ${phase_name}
- **Status:** ${status}
- **Progress:** ${progress}% (${phase}/5 phases)

---

## What's Done

${completed_phases:-"No phases completed yet"}

### Deliverables Created
${deliverables}

---

## Current State

### Git
- **Branch:** ${branch}
- **Last commit:** ${last_commit}
- **Uncommitted files:** ${uncommitted}

### Agents Used
${agents}

### Token Usage
- Previous session: ~${tokens} tokens
- This session starts fresh: 0 tokens

---

## Next Steps

EOF

    # Add phase-specific next steps
    case "$phase" in
        1) echo "1. Complete requirements gathering and design" >> "$handoff_file"
           echo "2. Get user approval on requirements and design" >> "$handoff_file"
           echo "3. Proceed to Phase 2 (Test RED)" >> "$handoff_file"
           ;;
        2) echo "1. Finalize test strategy and write failing tests" >> "$handoff_file"
           echo "2. Ensure all tests FAIL for correct reasons" >> "$handoff_file"
           echo "3. Proceed to Phase 3 (Build GREEN)" >> "$handoff_file"
           ;;
        3) echo "1. Continue TDD implementation" >> "$handoff_file"
           echo "2. Ensure tests pass (GREEN)" >> "$handoff_file"
           echo "3. Proceed to Phase 4 (Refactor + Review)" >> "$handoff_file"
           ;;
        4) echo "1. Refactor code, address review feedback" >> "$handoff_file"
           echo "2. Fix any security issues" >> "$handoff_file"
           echo "3. Proceed to Phase 5 (Finalize)" >> "$handoff_file"
           ;;
        5) echo "1. Complete documentation" >> "$handoff_file"
           echo "2. Send completion notifications" >> "$handoff_file"
           echo "3. Workflow complete!" >> "$handoff_file"
           ;;
    esac

    cat >> "$handoff_file" << EOF

---

## How to Resume

\`\`\`bash
# Load workflow state
bash scripts/workflow-state.sh get-toon ${id}

# Or view full JSON state
bash scripts/workflow-state.sh get ${id}
\`\`\`

Then tell Claude: "Resume workflow ${id} from Phase ${phase}"

---

## Files to Review

Check these files to understand current state:
\`\`\`bash
# Recent changes
git diff HEAD~3

# Uncommitted changes
git status

# Recent commits
git log --oneline -10
\`\`\`

---

**Tip:** Load the TOON state format for minimal token usage.
EOF

    echo -e "${GREEN}Handoff created:${NC} $handoff_file"
    echo ""
    cat "$handoff_file"
}

# Show existing handoff
show_handoff() {
    local id="$1"
    local handoff_file="${HANDOFF_DIR}/handoff-${id}.md"

    if [ ! -f "$handoff_file" ]; then
        echo -e "${YELLOW}Handoff not found. Creating new one...${NC}"
        create_handoff "$id"
        return
    fi

    cat "$handoff_file"
}

# List all handoffs
list_handoffs() {
    echo -e "${CYAN}Available Handoffs:${NC}"
    echo ""

    for f in "${HANDOFF_DIR}"/handoff-*.md; do
        if [ -f "$f" ]; then
            local id=$(basename "$f" | sed 's/handoff-//' | sed 's/.md//')
            local created=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$f" 2>/dev/null || stat -c "%y" "$f" 2>/dev/null | cut -d'.' -f1)
            echo "  - $id (created: $created)"
        fi
    done
}

# Clean old handoffs
clean_handoffs() {
    echo -e "${YELLOW}Cleaning handoffs older than 7 days...${NC}"
    find "$HANDOFF_DIR" -name "handoff-*.md" -mtime +7 -delete
    echo -e "${GREEN}Done${NC}"
}

# Main
case "${1:-}" in
    create)
        [ -z "$2" ] && { echo "Usage: $0 create <workflow-id>"; exit 1; }
        create_handoff "$2"
        ;;
    show)
        [ -z "$2" ] && { echo "Usage: $0 show <workflow-id>"; exit 1; }
        show_handoff "$2"
        ;;
    list)
        list_handoffs
        ;;
    clean)
        clean_handoffs
        ;;
    -h|--help|"")
        usage
        ;;
    *)
        echo "Unknown command: $1"
        usage
        exit 1
        ;;
esac
