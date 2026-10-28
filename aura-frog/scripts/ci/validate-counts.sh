#!/bin/bash
set -e

# =============================================================================
# validate-counts.sh - Validate component counts across documentation
# =============================================================================
# Counts actual files and compares against documented counts in CLAUDE.md
# and plugin.json. Reports mismatches with a summary table.
#
# Usage: bash scripts/validate-counts.sh
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Resolve base directory (aura-frog/aura-frog/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

DOC_FILE="$BASE_DIR/AGENTS.md"
if [ ! -f "$DOC_FILE" ] || ! grep -q "Resources" "$DOC_FILE" 2>/dev/null; then
  DOC_FILE="$BASE_DIR/CLAUDE.md"
fi
CLAUDE_MD="$DOC_FILE"
PLUGIN_JSON="$BASE_DIR/.claude-plugin/plugin.json"

MISMATCHES=0

# -----------------------------------------------------------------------------
# Count actual files
# -----------------------------------------------------------------------------

# Agents: .md files in agents/ excluding README.md
ACTUAL_AGENTS=$(find "$BASE_DIR/agents" -maxdepth 1 -name '*.md' ! -name 'README.md' | wc -l | tr -d ' ')

# Skills: SKILL.md files under skills/
ACTUAL_SKILLS=$(find "$BASE_DIR/skills" -name 'SKILL.md' | wc -l | tr -d ' ')

# Rules: .md files in rules/ excluding README.md
ACTUAL_RULES=$(find "$BASE_DIR/rules" -name '*.md' ! -name 'README.md' | wc -l | tr -d ' ')

# Commands: .md files in commands/ and commands/*/ excluding README.md
ACTUAL_COMMANDS=$(find "$BASE_DIR/commands" -name '*.md' ! -name 'README.md' | wc -l | tr -d ' ')

# Hooks: .cjs files in hooks/ (not in hooks/lib/)
ACTUAL_HOOKS=$(find "$BASE_DIR/hooks" -maxdepth 1 -name '*.cjs' | wc -l | tr -d ' ')

# -----------------------------------------------------------------------------
# Extract expected counts from CLAUDE.md's Resources TOON block — the declared
# single source ("Component counts: see **Resources** below (single source)").
# Format:  Agents (15),agents/
#
# HISTORY: this script used to parse counts out of the "**Purpose:**" line.
# When that line dropped its inline numbers, extract_count silently returned
# "?" and check_match treated "?" as a non-failing "??" status — so agents/
# skills/commands were simply not validated anymore. A missing count marker
# is now a HARD FAILURE, never a silent skip.
# -----------------------------------------------------------------------------

extract_count() {
  local component="$1"   # capitalized TOON row label, e.g. "Agents"
  grep -oE "${component} \(([0-9]+)\)" "$CLAUDE_MD" 2>/dev/null | head -1 | grep -oE '[0-9]+' || echo "MISSING"
}

EXPECTED_AGENTS=$(extract_count "Agents")
EXPECTED_SKILLS=$(extract_count "Skills")
EXPECTED_RULES=$(extract_count "Rules")
EXPECTED_COMMANDS=$(extract_count "Commands")
EXPECTED_HOOKS=$(extract_count "Hooks")

# Cross-check: plugin.json's description also carries counts ("15 agents,
# ... 60 skills, 24 commands, 50 hooks, 72 rules"). Any count present there
# must agree with the actual file counts too.
plugin_json_count() {
  local word="$1"   # lowercase, e.g. "agents"
  grep -oE "[0-9]+ ${word}" "$PLUGIN_JSON" 2>/dev/null | head -1 | grep -oE '[0-9]+' || echo ""
}

# -----------------------------------------------------------------------------
# Compare and build table
# -----------------------------------------------------------------------------

check_match() {
  local component="$1"
  local actual="$2"
  local expected="$3"

  if [ "$expected" = "MISSING" ]; then
    # No count marker found where counts are supposed to live — that means
    # the source moved (again) and this validator went blind. Fail loudly.
    STATUS="${RED}NO MARKER${NC}"
    MISMATCHES=$((MISMATCHES + 1))
  elif [ "$actual" -eq "$expected" ] 2>/dev/null; then
    STATUS="${GREEN}OK${NC}"
  else
    STATUS="${RED}MISMATCH${NC}"
    MISMATCHES=$((MISMATCHES + 1))
  fi

  printf "  ${BOLD}%-12s${NC} %6s %10s    %b\n" "$component" "$actual" "$expected" "$STATUS"
}

echo ""
echo -e "${CYAN}${BOLD}=======================================${NC}"
echo -e "${CYAN}${BOLD}  Component Count Validator${NC}"
echo -e "${CYAN}${BOLD}=======================================${NC}"
echo ""
echo -e "  ${BOLD}Base:${NC} $BASE_DIR"
echo ""
printf "  ${BOLD}%-12s${NC} %6s %10s    %s\n" "Component" "Actual" "Expected" "Status"
echo "  -----------------------------------------------"

check_match "Agents"   "$ACTUAL_AGENTS"   "$EXPECTED_AGENTS"
check_match "Skills"   "$ACTUAL_SKILLS"   "$EXPECTED_SKILLS"
check_match "Rules"    "$ACTUAL_RULES"    "$EXPECTED_RULES"
check_match "Commands" "$ACTUAL_COMMANDS" "$EXPECTED_COMMANDS"
check_match "Hooks"    "$ACTUAL_HOOKS"    "$EXPECTED_HOOKS"

echo ""
echo -e "  ${BOLD}plugin.json description cross-check:${NC}"
for pair in "agents:$ACTUAL_AGENTS" "skills:$ACTUAL_SKILLS" "rules:$ACTUAL_RULES" "commands:$ACTUAL_COMMANDS" "hooks:$ACTUAL_HOOKS"; do
  word="${pair%%:*}"
  actual="${pair##*:}"
  pj=$(plugin_json_count "$word")
  if [ -z "$pj" ]; then
    printf "  %-12s (not mentioned — skipped)\n" "$word"
  elif [ "$pj" -eq "$actual" ] 2>/dev/null; then
    printf "  %-12s %s    ${GREEN}OK${NC}\n" "$word" "$pj"
  else
    printf "  %-12s says %s, actual %s    ${RED}MISMATCH${NC}\n" "$word" "$pj" "$actual"
    MISMATCHES=$((MISMATCHES + 1))
  fi
done

echo ""

if [ "$MISMATCHES" -gt 0 ]; then
  echo -e "  ${RED}${BOLD}$MISMATCHES mismatch(es) found.${NC} Update docs to match actual counts."
  echo ""
  exit 1
else
  echo -e "  ${GREEN}${BOLD}All counts match.${NC}"
  echo ""
  exit 0
fi
