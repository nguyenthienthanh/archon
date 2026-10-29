#!/bin/bash
#
# Aura Frog - Supabase Learning System Setup
#
# Usage:
#   ./scripts/supabase/setup.sh           # Run setup
#   ./scripts/supabase/setup.sh --check   # Check if schema exists
#   ./scripts/supabase/setup.sh --help    # Show help
#
# Prerequisites:
#   1. Run bootstrap.sql in Supabase SQL Editor first
#   2. Set environment variables in .envrc:
#      - SUPABASE_URL
#      - SUPABASE_SECRET_KEY
#

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Help
show_help() {
  echo ""
  echo "🐸 Aura Frog - Supabase Learning System Setup"
  echo ""
  echo "Usage:"
  echo "  ./scripts/supabase/setup.sh           Run schema setup"
  echo "  ./scripts/supabase/setup.sh --check   Check if schema exists"
  echo "  ./scripts/supabase/setup.sh --help    Show this help"
  echo ""
  echo "Prerequisites:"
  echo "  1. Run bootstrap.sql in Supabase SQL Editor:"
  echo "     ${DIM}File: scripts/supabase/bootstrap.sql${NC}"
  echo ""
  echo "  2. Set environment variables:"
  echo "     ${DIM}export SUPABASE_URL=\"https://your-project.supabase.co\"${NC}"
  echo "     ${DIM}export SUPABASE_SECRET_KEY=\"your-secret-key\"${NC}"
  echo ""
}

# Check environment
check_env() {
  local missing=0

  if [ -z "$SUPABASE_URL" ]; then
    echo -e "${RED}❌ SUPABASE_URL is not set${NC}"
    missing=1
  fi

  if [ -z "$SUPABASE_SECRET_KEY" ]; then
    echo -e "${RED}❌ SUPABASE_SECRET_KEY is not set${NC}"
    missing=1
  fi

  if [ $missing -eq 1 ]; then
    echo ""
    echo -e "${YELLOW}Set these in your .envrc and run: source .envrc${NC}"
    exit 1
  fi

  echo -e "${GREEN}✓${NC} Environment configured"
  echo -e "${DIM}  URL: $SUPABASE_URL${NC}"
}

# Check if exec_sql function exists
check_bootstrap() {
  echo -e "\n${CYAN}Checking exec_sql function...${NC}"

  response=$(curl -s -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
    -H "apikey: ${SUPABASE_SECRET_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"query": "SELECT 1"}' \
    -w "\n%{http_code}" 2>/dev/null)

  http_code=$(echo "$response" | tail -n1)

  if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓${NC} exec_sql function exists"
    return 0
  else
    echo -e "${RED}❌${NC} exec_sql function not found"
    echo ""
    echo -e "${YELLOW}Run bootstrap.sql in Supabase SQL Editor first:${NC}"
    echo -e "${DIM}  File: scripts/supabase/bootstrap.sql${NC}"
    echo ""
    echo "Or copy this SQL:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cat "$SCRIPT_DIR/bootstrap.sql"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    return 1
  fi
}

# Check if schema already exists
check_schema() {
  echo -e "\n${CYAN}Checking existing schema...${NC}"

  response=$(curl -s -X GET \
    "${SUPABASE_URL}/rest/v1/af_feedback?limit=1" \
    -H "apikey: ${SUPABASE_SECRET_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
    -w "\n%{http_code}" 2>/dev/null)

  http_code=$(echo "$response" | tail -n1)

  if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓${NC} Schema already exists"
    return 0
  else
    echo -e "${DIM}  Schema not found - will create${NC}"
    return 1
  fi
}

# Execute a single SQL statement
exec_sql() {
  local sql="$1"
  local escaped_sql=$(echo "$sql" | sed 's/"/\\"/g' | tr '\n' ' ')

  response=$(curl -s -X POST \
    "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
    -H "apikey: ${SUPABASE_SECRET_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$escaped_sql\"}" \
    -w "\n%{http_code}" 2>/dev/null)

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "200" ]; then
    return 0
  else
    echo "$body"
    return 1
  fi
}

# Run the setup
run_setup() {
  echo -e "\n${CYAN}Running schema setup...${NC}"

  # Use Node.js script for complex SQL parsing
  if command -v node &> /dev/null; then
    node "$SCRIPT_DIR/setup-schema.cjs"
  else
    echo -e "${RED}❌ Node.js is required for schema setup${NC}"
    echo -e "${YELLOW}Alternatively, run schema.sql manually in Supabase SQL Editor${NC}"
    exit 1
  fi
}

# Main
main() {
  case "${1:-}" in
    --help|-h)
      show_help
      exit 0
      ;;
    --check)
      echo -e "\n🐸 ${CYAN}Aura Frog - Learning System Check${NC}\n"
      check_env
      check_bootstrap && check_schema
      exit 0
      ;;
    *)
      echo -e "\n🐸 ${CYAN}Aura Frog - Learning System Setup${NC}\n"
      check_env
      check_bootstrap || exit 1
      check_schema || run_setup
      echo -e "\n${GREEN}✅ Learning system ready!${NC}"
      echo -e "${DIM}Run /learn:status to verify${NC}\n"
      ;;
  esac
}

main "$@"
