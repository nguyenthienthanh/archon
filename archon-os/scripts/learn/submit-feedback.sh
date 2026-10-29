#!/bin/bash
#
# Aura Frog - Submit Manual Feedback
# Usage: ./scripts/learn/submit-feedback.sh [type] [message] [severity]
#
# Types: success, correction, agent-issue, workflow-issue, suggestion
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check environment
check_env() {
  if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SECRET_KEY" ]; then
    echo -e "${RED}Error: Learning system not configured${NC}"
    echo ""
    echo "Set these in your .envrc:"
    echo "  export SUPABASE_URL=\"https://your-project.supabase.co\""
    echo "  export SUPABASE_SECRET_KEY=\"your-secret-key\""
    echo "  export AF_LEARNING_ENABLED=\"true\""
    echo ""
    echo "Then run: source .envrc"
    exit 1
  fi

  if [ "$AF_LEARNING_ENABLED" != "true" ]; then
    echo -e "${YELLOW}Warning: AF_LEARNING_ENABLED is not 'true'${NC}"
    echo "Set: export AF_LEARNING_ENABLED=\"true\""
  fi
}

# Map feedback type to database type
map_type() {
  case "$1" in
    success) echo "approval" ;;
    correction) echo "correction" ;;
    agent-issue) echo "agent_override" ;;
    workflow-issue) echo "rejection" ;;
    suggestion) echo "suggestion" ;;
    *) echo "$1" ;;
  esac
}

# Submit feedback to Supabase
submit_feedback() {
  local feedback_type="$1"
  local message="$2"
  local severity="${3:-3}"
  local context="${4:-{}}"

  local db_type=$(map_type "$feedback_type")
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Build JSON payload
  local payload=$(cat <<EOF
{
  "feedback_type": "$db_type",
  "reason": "$message",
  "rating": $severity,
  "metadata": $context,
  "created_at": "$timestamp"
}
EOF
)

  # Make request
  response=$(curl -s -w "\n%{http_code}" \
    -X POST "${SUPABASE_URL}/rest/v1/af_feedback" \
    -H "apikey: ${SUPABASE_SECRET_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$payload")

  # Parse response
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo -e "${GREEN}Feedback submitted successfully${NC}"
    echo "$body" | head -c 200
    return 0
  else
    echo -e "${RED}Failed to submit feedback (HTTP $http_code)${NC}"
    echo "$body"
    return 1
  fi
}

# Interactive mode
interactive_mode() {
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}📝 Submit Feedback${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "What type of feedback?"
  echo ""
  echo "  1. ✅ Success      - Something worked well"
  echo "  2. ❌ Correction   - Had to fix something"
  echo "  3. 🤖 Agent Issue  - Wrong agent selected"
  echo "  4. 🔄 Workflow     - Workflow/phase problem"
  echo "  5. 💡 Suggestion   - General improvement idea"
  echo ""
  read -p "Select (1-5): " type_choice

  case "$type_choice" in
    1) feedback_type="success" ;;
    2) feedback_type="correction" ;;
    3) feedback_type="agent-issue" ;;
    4) feedback_type="workflow-issue" ;;
    5) feedback_type="suggestion" ;;
    *) echo "Invalid choice"; exit 1 ;;
  esac

  echo ""
  read -p "Describe your feedback: " message

  severity=3
  if [ "$feedback_type" = "correction" ] || [ "$feedback_type" = "workflow-issue" ]; then
    echo ""
    read -p "Severity (1=minor, 5=critical) [3]: " sev_input
    severity="${sev_input:-3}"
  fi

  echo ""
  echo -e "${BLUE}Submitting feedback...${NC}"
  submit_feedback "$feedback_type" "$message" "$severity"
}

# Help
show_help() {
  echo "Aura Frog - Submit Manual Feedback"
  echo ""
  echo "Usage:"
  echo "  ./scripts/learn/submit-feedback.sh                    # Interactive mode"
  echo "  ./scripts/learn/submit-feedback.sh TYPE MESSAGE       # Quick submit"
  echo "  ./scripts/learn/submit-feedback.sh TYPE MSG SEVERITY  # With severity"
  echo ""
  echo "Types:"
  echo "  success        Report something that worked well"
  echo "  correction     Report when you had to fix AI output"
  echo "  agent-issue    Report wrong agent selection"
  echo "  workflow-issue Report workflow/phase problems"
  echo "  suggestion     General improvement idea"
  echo ""
  echo "Examples:"
  echo "  ./scripts/learn/submit-feedback.sh success \"TDD approach was perfect\""
  echo "  ./scripts/learn/submit-feedback.sh correction \"Had to simplify API\" 3"
  echo ""
}

# Main
main() {
  check_env

  if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    show_help
    exit 0
  fi

  if [ -z "$1" ]; then
    interactive_mode
  else
    feedback_type="$1"
    message="${2:-No message provided}"
    severity="${3:-3}"
    submit_feedback "$feedback_type" "$message" "$severity"
  fi
}

main "$@"
