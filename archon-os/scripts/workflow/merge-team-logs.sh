#!/usr/bin/env bash

# Merge Team Logs Script
# Purpose: Merge per-team JSONL logs into unified timeline
# Version: 1.0.0
#
# Usage:
#   merge-team-logs.sh <workflow-id> [--phase N] [--readable]
#
# Without --phase: merges ALL team logs → unified-timeline.jsonl
# With --phase N: merges only that phase's team → appends to execution.log
# With --readable: also generates unified-timeline.md (markdown table)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Resolve workflow logs directory
resolve_workflow_dir() {
    local workflow_id="$1"
    local candidates=(
        ".claude/logs/runs/${workflow_id}"
        ".claude/logs/workflows/${workflow_id}"
        "logs/runs/${workflow_id}"
        "logs/workflows/${workflow_id}"
    )

    for dir in "${candidates[@]}"; do
        if [[ -d "$dir" ]]; then
            echo "$dir"
            return 0
        fi
    done

    echo ""
    return 1
}

# Phase slug lookup
get_phase_slug() {
    local phase="$1"
    case "$phase" in
        1)  echo "01-requirements-analysis" ;;
        2)  echo "02-technical-planning" ;;
        3)  echo "03-design-review" ;;
        4)  echo "04-test-planning" ;;
        5)  echo "05-tdd-implementation" ;;
        5a) echo "05a-tdd-red" ;;
        5b) echo "05b-tdd-green" ;;
        5c) echo "05c-tdd-refactor" ;;
        6)  echo "06-code-review" ;;
        7)  echo "07-qa-validation" ;;
        8)  echo "08-documentation" ;;
        9)  echo "09-notification" ;;
        *)  echo "phase-${phase}" ;;
    esac
}

# Merge JSONL files sorted by timestamp
merge_jsonl_sorted() {
    local output_file="$1"
    shift
    local input_files=("$@")

    if [[ ${#input_files[@]} -eq 0 ]]; then
        return 0
    fi

    # Check if jq is available
    if ! command -v jq &>/dev/null; then
        # Fallback: simple cat + sort (lexicographic on ts field)
        cat "${input_files[@]}" 2>/dev/null | sort > "$output_file"
        return 0
    fi

    # Merge all files, sort by .ts field
    cat "${input_files[@]}" 2>/dev/null | jq -c '.' | jq -s 'sort_by(.ts)' | jq -c '.[]' > "$output_file"
}

# Generate readable markdown table from JSONL
generate_readable() {
    local input_file="$1"
    local output_file="$2"

    if ! command -v jq &>/dev/null; then
        echo "jq required for --readable output" >&2
        return 1
    fi

    {
        echo "# Unified Team Timeline"
        echo ""
        echo "| Timestamp | Agent | Action | Description |"
        echo "|-----------|-------|--------|-------------|"

        jq -r '
            "| " + .ts + " | " + (.agent // "system") + " | " + (.action // "-") + " | " + (.description // "-") + " |"
        ' "$input_file" 2>/dev/null
    } > "$output_file"
}

# Merge a single phase's team logs
merge_phase_logs() {
    local workflow_dir="$1"
    local phase="$2"
    local phase_slug=$(get_phase_slug "$phase")
    local team_dir="${workflow_dir}/teams/phase-${phase_slug}"

    if [[ ! -d "$team_dir" ]]; then
        echo "No team logs found for phase ${phase} (${team_dir})"
        return 0
    fi

    # Collect all JSONL files in the phase team directory
    local jsonl_files=()
    while IFS= read -r -d '' file; do
        jsonl_files+=("$file")
    done < <(find "$team_dir" -name '*.jsonl' -print0 2>/dev/null)

    if [[ ${#jsonl_files[@]} -eq 0 ]]; then
        echo "No JSONL files found in ${team_dir}"
        return 0
    fi

    # Create merged output
    local merged_file="${team_dir}/team-log-merged.jsonl"
    merge_jsonl_sorted "$merged_file" "${jsonl_files[@]}"

    # Append summary to execution.log
    local execution_log="${workflow_dir}/execution.log"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local event_count=$(wc -l < "$merged_file" 2>/dev/null | tr -d ' ')

    if [[ -f "$execution_log" ]]; then
        echo "[${timestamp}] TEAM_LOG_MERGED phase=${phase} events=${event_count} dir=teams/phase-${phase_slug}/" >> "$execution_log"
    fi

    echo "Merged ${event_count} events from phase ${phase} team logs"
}

# Merge ALL team logs into unified timeline
merge_all_logs() {
    local workflow_dir="$1"
    local readable="$2"
    local teams_dir="${workflow_dir}/teams"

    if [[ ! -d "$teams_dir" ]]; then
        echo "No teams directory found at ${teams_dir}"
        return 0
    fi

    # Collect all team-log.jsonl files across all phases
    local jsonl_files=()
    while IFS= read -r -d '' file; do
        jsonl_files+=("$file")
    done < <(find "$teams_dir" -name 'team-log.jsonl' -print0 2>/dev/null)

    if [[ ${#jsonl_files[@]} -eq 0 ]]; then
        echo "No team logs found"
        return 0
    fi

    # Merge into unified timeline
    local unified_file="${workflow_dir}/unified-timeline.jsonl"
    merge_jsonl_sorted "$unified_file" "${jsonl_files[@]}"

    local event_count=$(wc -l < "$unified_file" 2>/dev/null | tr -d ' ')
    echo -e "${GREEN}Merged ${event_count} events into unified-timeline.jsonl${NC}"

    # Generate readable version if requested
    if [[ "$readable" == "true" ]]; then
        local readable_file="${workflow_dir}/unified-timeline.md"
        generate_readable "$unified_file" "$readable_file"
        echo -e "${GREEN}Generated readable timeline: unified-timeline.md${NC}"
    fi

    # Record in execution.log
    local execution_log="${workflow_dir}/execution.log"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    if [[ -f "$execution_log" ]]; then
        echo "[${timestamp}] TEAM_LOG_MERGED scope=all events=${event_count}" >> "$execution_log"
    fi
}

# Main
main() {
    if [[ $# -lt 1 ]]; then
        echo -e "${RED}Usage: merge-team-logs.sh <workflow-id> [--phase N] [--readable]${NC}"
        echo ""
        echo "Options:"
        echo "  --phase N     Merge only phase N's team logs"
        echo "  --readable    Also generate unified-timeline.md"
        exit 1
    fi

    local workflow_id="$1"
    shift

    local phase=""
    local readable="false"

    # Parse options
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --phase)
                phase="$2"
                shift 2
                ;;
            --readable)
                readable="true"
                shift
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                exit 1
                ;;
        esac
    done

    # Resolve workflow directory
    local workflow_dir
    workflow_dir=$(resolve_workflow_dir "$workflow_id")

    if [[ -z "$workflow_dir" ]]; then
        echo -e "${RED}Workflow directory not found for: ${workflow_id}${NC}"
        exit 1
    fi

    if [[ -n "$phase" ]]; then
        merge_phase_logs "$workflow_dir" "$phase"
    else
        merge_all_logs "$workflow_dir" "$readable"
    fi
}

main "$@"
