#!/usr/bin/env bash
# Token budget check for plan-loader's always-loaded context.
# Acceptance criterion from spec §28.2 Milestone A — must be ≤ 13,500 tokens.
#
# Usage: bash archon-os/scripts/plans/check-token-budget.sh [.claude/plans/ path]
#
# Estimate: 1 line ≈ 4/3 tokens (per spec §1, measure-performance.sh convention)

set -euo pipefail

PLANS_DIR="${1:-.claude/plans}"
HARD_LIMIT=13500

if [ ! -d "$PLANS_DIR" ]; then
    echo "ℹ No plan tree → 0 token cost (silent exit OK)"
    exit 0
fi

# Compute lines that plan-loader would always load:
#   - mission.md (full, if exists)
#   - active T1 (full, if active.json points to one)
#   - active T2 (full, if active.json points to one)
#   - active T3 + T4 (just metadata, not full body — but we count summary)
#   - active.json itself

TOTAL_LINES=0

count_file() {
    local f="$1"
    if [ -f "$f" ]; then
        local lines=$(wc -l < "$f")
        TOTAL_LINES=$((TOTAL_LINES + lines))
    fi
}

# active.json
count_file "$PLANS_DIR/active.json"

# mission.md
count_file "$PLANS_DIR/mission.md"

# Read active.json to find active T1, T2
ACTIVE_FILE="$PLANS_DIR/active.json"
if [ -f "$ACTIVE_FILE" ]; then
    INIT_ID=$(grep -oE '"initiative":\s*"[^"]*"' "$ACTIVE_FILE" | sed 's/.*"\([^"]*\)"/\1/')
    FEAT_ID=$(grep -oE '"feature":\s*"[^"]*"' "$ACTIVE_FILE" | sed 's/.*"\([^"]*\)"/\1/')

    if [ -n "$INIT_ID" ] && [ "$INIT_ID" != "null" ]; then
        count_file "$PLANS_DIR/initiatives/$INIT_ID.md"
    fi

    if [ -n "$FEAT_ID" ] && [ "$FEAT_ID" != "null" ]; then
        count_file "$PLANS_DIR/features/$FEAT_ID/feature.md"
    fi
fi

# Estimate tokens (1 line ≈ 4/3 tokens)
TOKENS=$(awk -v l="$TOTAL_LINES" 'BEGIN { printf "%d\n", l * 4 / 3 }')

echo "Plan-loader always-loaded context:"
echo "  Lines: $TOTAL_LINES"
echo "  Tokens (estimate): $TOKENS"
echo "  Budget: $HARD_LIMIT (Milestone A target ≤ 13,500)"
echo ""

if [ "$TOKENS" -gt "$HARD_LIMIT" ]; then
    echo "✗ Token budget EXCEEDED ($TOKENS > $HARD_LIMIT)"
    echo "  Apply auto-degradation per spec §9.1:"
    echo "    1. Skip permanent-memory summary (-150 tokens)"
    echo "    2. Skip mission body (-50 tokens)"
    echo "    3. Load only active.json (saves remainder)"
    exit 1
fi

UTILIZATION=$(awk -v t="$TOKENS" -v l="$HARD_LIMIT" 'BEGIN { printf "%d", (t * 100) / l }')
echo "✓ Token budget OK ($TOKENS / $HARD_LIMIT, ${UTILIZATION}% utilization)"
exit 0
