#!/bin/bash
# Aura Frog Performance Measurement
# Outputs real, publishable numbers
#
# Usage: bash archon-os/scripts/measure-performance.sh [plugin-dir]

set -e
PLUGIN_DIR="${1:-archon-os}"

echo "🐸 Aura Frog Performance Report"
echo "================================"
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Version: $(grep '"version"' "$PLUGIN_DIR/.claude-plugin/plugin.json" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
echo ""

# 1. Context overhead (exact line counts)
echo "📦 Context Size (lines loaded at session start)"
echo "------------------------------------------------"
CLAUDE_MD=$(wc -l < "$PLUGIN_DIR/CLAUDE.md" | tr -d ' ')
RULES_CORE=$(cat "$PLUGIN_DIR/rules/core/"*.md 2>/dev/null | wc -l | tr -d ' ')
RULES_ALL=$(find "$PLUGIN_DIR/rules/" -name '*.md' ! -name 'README.md' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
AGENTS=$(cat "$PLUGIN_DIR/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')

AUTO_SKILLS=0
for dir in "$PLUGIN_DIR/skills/"*/; do
  s="$dir/SKILL.md"
  if [ -f "$s" ] && head -10 "$s" | grep -q "autoInvoke: true"; then
    lines=$(wc -l < "$s" | tr -d ' ')
    AUTO_SKILLS=$((AUTO_SKILLS + lines))
  fi
done

ALWAYS_LOADED=$((CLAUDE_MD + RULES_CORE + AGENTS + AUTO_SKILLS))
ALL_SKILLS_LINES=$(find "$PLUGIN_DIR/skills/" -name 'SKILL.md' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
TOTAL_POSSIBLE=$((CLAUDE_MD + RULES_ALL + AGENTS + ALL_SKILLS_LINES))

echo "  CLAUDE.md:           $CLAUDE_MD lines"
echo "  Rules (core only):   $RULES_CORE lines"
echo "  Rules (all 3 tiers): $RULES_ALL lines"
echo "  Agents (loaded):     $AGENTS lines"
echo "  Auto-invoke skills:  $AUTO_SKILLS lines"
echo "  ---"
echo "  ALWAYS LOADED:       $ALWAYS_LOADED lines"
echo "  TOTAL IF ALL LOADED: $TOTAL_POSSIBLE lines"
if [ "$TOTAL_POSSIBLE" -gt 0 ]; then
  echo "  SAVINGS:             $(( (TOTAL_POSSIBLE - ALWAYS_LOADED) * 100 / TOTAL_POSSIBLE ))% context reduction"
fi
echo ""

# 2. Token estimates
echo "🎯 Token Estimates (words x 1.33)"
echo "----------------------------------"
WORDS_LOADED=$(cat "$PLUGIN_DIR/CLAUDE.md" "$PLUGIN_DIR/rules/core/"*.md "$PLUGIN_DIR/agents/"*.md 2>/dev/null | wc -w | tr -d ' ')
for dir in "$PLUGIN_DIR/skills/"*/; do
  s="$dir/SKILL.md"
  if [ -f "$s" ] && head -10 "$s" | grep -q "autoInvoke: true"; then
    w=$(wc -w < "$s" | tr -d ' ')
    WORDS_LOADED=$((WORDS_LOADED + w))
  fi
done
TOKENS_LOADED=$((WORDS_LOADED * 4 / 3))

WORDS_ALL=$(find "$PLUGIN_DIR/" -name '*.md' ! -name 'README.md' -exec cat {} + 2>/dev/null | wc -w | tr -d ' ')
TOKENS_ALL=$((WORDS_ALL * 4 / 3))

echo "  Always-loaded:       ~${TOKENS_LOADED} tokens"
echo "  Everything:          ~${TOKENS_ALL} tokens"
echo "  Overhead ratio:      $(( TOKENS_LOADED * 100 / 200000 ))% of 200K context window"
echo ""

# 3. Component inventory
echo "📊 Component Inventory"
echo "----------------------"
AGENT_COUNT=$(ls "$PLUGIN_DIR/agents/"*.md 2>/dev/null | grep -v README | wc -l | tr -d ' ')
SKILL_COUNT=$(ls -d "$PLUGIN_DIR/skills/"*/ 2>/dev/null | wc -l | tr -d ' ')
AUTO_COUNT=0
for dir in "$PLUGIN_DIR/skills/"*/; do
  s="$dir/SKILL.md"
  [ -f "$s" ] && head -10 "$s" | grep -q "autoInvoke: true" && AUTO_COUNT=$((AUTO_COUNT + 1))
done
RULE_COUNT=$(find "$PLUGIN_DIR/rules/" -name '*.md' ! -name 'README.md' 2>/dev/null | wc -l | tr -d ' ')
CORE_COUNT=$(ls "$PLUGIN_DIR/rules/core/"*.md 2>/dev/null | wc -l | tr -d ' ')
AGENT_RULE_COUNT=$(ls "$PLUGIN_DIR/rules/agent/"*.md 2>/dev/null | wc -l | tr -d ' ')
WF_RULE_COUNT=$(ls "$PLUGIN_DIR/rules/workflow/"*.md 2>/dev/null | wc -l | tr -d ' ')
CMD_COUNT=$(find "$PLUGIN_DIR/commands/" -name '*.md' ! -name 'README.md' 2>/dev/null | wc -l | tr -d ' ')
HOOK_COUNT=$(ls "$PLUGIN_DIR/hooks/"*.cjs 2>/dev/null | wc -l | tr -d ' ')

echo "  Agents:     $AGENT_COUNT"
echo "  Skills:     $SKILL_COUNT ($AUTO_COUNT auto-invoke)"
echo "  Rules:      $RULE_COUNT ($CORE_COUNT core / $AGENT_RULE_COUNT agent / $WF_RULE_COUNT workflow)"
echo "  Commands:   $CMD_COUNT"
echo "  Hooks:      $HOOK_COUNT"
echo "  MCP:        6"
echo ""

# 4. Codebase size
echo "💻 Codebase"
echo "-----------"
CJS_LINES=$(find "$PLUGIN_DIR/" -name '*.cjs' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
MD_LINES=$(find "$PLUGIN_DIR/" -name '*.md' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
SH_LINES=$(find "$PLUGIN_DIR/" -name '*.sh' -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
TOTAL_FILES=$(find "$PLUGIN_DIR/" -type f 2>/dev/null | wc -l | tr -d ' ')

echo "  CJS (hooks):  $CJS_LINES lines"
echo "  Markdown:     $MD_LINES lines"
echo "  Shell:        $SH_LINES lines"
echo "  Total files:  $TOTAL_FILES"
echo ""

echo "================================"
echo "✅ Report complete"
