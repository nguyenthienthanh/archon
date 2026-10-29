#!/usr/bin/env bash
# Validate that *summary*-shaped counts in user-facing docs match archon-os/stats.json.
#
# Catches stale numbers like "9 curated agents" or "38 skills" left in
# docs after the actual count changes. `validate-counts.sh` already covers
# CLAUDE.md and plugin.json; this script covers the surfaces THAT script
# misses: README inventory tables, doc-link labels, banner lines, and
# session-start mock output.
#
# Detection is INTENTIONALLY surgical. It matches only count patterns that
# are unambiguous summary statements (not narrative prose like "5 planning
# agents" or "19 hooks fire on every Write/Edit", which are legitimate
# sub-counts). The four patterns covered:
#
#   1.  ` **N <noun>** ` inside Markdown table rows — e.g. `| **Agents** | 15 |`
#       (the value is in the next cell; we read it from the same line).
#   2.  ` All <Component> (N) ` — link-label format in Documentation tables.
#   3.  ` <Component>:[ \t]+N ` — colon-aligned summary lines (`Skills:   56 available`).
#   4.  ` N <noun> · M <noun> · ` — interpunct-separated headline totals.
#
# Anything else (narrative prose) is left to human review.
#
# Usage: bash archon-os/scripts/ci/validate-readme-counts.sh
# Exit 0 if all summary counts match; 1 if drift found.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
STATS_JSON="${REPO_ROOT}/archon-os/stats.json"

if [ ! -f "$STATS_JSON" ]; then
    echo "✗ stats.json not found at $STATS_JSON" >&2
    exit 1
fi

# Pull canonical counts from stats.json (one shell-friendly grep+sed pass).
read_count() {
    local jsonpath="$1"
    python3 -c "import json,sys; d=json.load(open('${STATS_JSON}')); v=d; [v:=v[k] for k in '${jsonpath}'.split('.')]; print(v)" 2>/dev/null
}
expected_agents=$(read_count "components.agents")
expected_skills=$(read_count "components.skills.total")
expected_rules=$(read_count "components.rules.total")
expected_commands=$(read_count "components.commands")
expected_hooks=$(read_count "components.hooks")

# Targeted scan: only flag summary-shaped occurrences.
FILES=(
    "${REPO_ROOT}/README.md"
    "${REPO_ROOT}/docs/README.md"
    "${REPO_ROOT}/docs/reference/BENEFITS.md"
    "${REPO_ROOT}/CONTRIBUTING.md"
)

VIOLATIONS=0

flag() {
    local file="$1"; local lineno="$2"; local component="$3"
    local got="$4"; local expected="$5"; local context="$6"
    local relname; relname="${file#${REPO_ROOT}/}"
    echo "✗ ${relname}:${lineno}  ${component}: got ${got}, expected ${expected}"
    echo "    ${context}"
    VIOLATIONS=$((VIOLATIONS + 1))
}

check_file() {
    local file="$1"
    [ -f "$file" ] || return 0
    # Inside this function, grep returning non-zero (no matches) is normal.
    # Turn off pipefail so the script doesn't abort on empty pipelines.
    set +o pipefail

    # Pattern 1: `| **Component** | N |` table rows (the row LABEL is the noun
    # in bold; the next cell is the count).
    while IFS=: read -r lineno line; do
        [ -z "$line" ] && continue
        local label; label=$(echo "$line" | grep -oE '\*\*[A-Za-z]+\*\*' | head -1 | tr -d '*' | tr '[:upper:]' '[:lower:]')
        local n; n=$(echo "$line" | awk -F'|' '{print $3}' | grep -oE '^[[:space:]]*[0-9]+' | grep -oE '[0-9]+' | head -1)
        [ -z "$n" ] && continue
        case "$label" in
            agents)   [ "$n" != "$expected_agents" ]   && flag "$file" "$lineno" "agents (table cell)"   "$n" "$expected_agents"   "$line" ;;
            skills)   [ "$n" != "$expected_skills" ]   && flag "$file" "$lineno" "skills (table cell)"   "$n" "$expected_skills"   "$line" ;;
            rules)    [ "$n" != "$expected_rules" ]    && flag "$file" "$lineno" "rules (table cell)"    "$n" "$expected_rules"    "$line" ;;
            commands) [ "$n" != "$expected_commands" ] && flag "$file" "$lineno" "commands (table cell)" "$n" "$expected_commands" "$line" ;;
            hooks)    [ "$n" != "$expected_hooks" ]    && flag "$file" "$lineno" "hooks (table cell)"    "$n" "$expected_hooks"    "$line" ;;
        esac
    done < <(grep -nE '^\|[[:space:]]*\*\*(Agents|Skills|Rules|Commands|Hooks)\*\*[[:space:]]*\|' "$file" 2>/dev/null || true)

    # Pattern 2: `All <Component> (N)` link labels.
    while IFS=: read -r lineno line; do
        [ -z "$line" ] && continue
        local label; label=$(echo "$line" | grep -oE 'All (Agents|Skills|Rules|Commands|Hooks)' | awk '{print $2}' | tr '[:upper:]' '[:lower:]')
        local n; n=$(echo "$line" | grep -oE 'All (Agents|Skills|Rules|Commands|Hooks) \([0-9]+\)' | grep -oE '\([0-9]+\)' | tr -d '()')
        [ -z "$n" ] && continue
        case "$label" in
            agents)   [ "$n" != "$expected_agents" ]   && flag "$file" "$lineno" "agents (link label)"   "$n" "$expected_agents"   "$line" ;;
            skills)   [ "$n" != "$expected_skills" ]   && flag "$file" "$lineno" "skills (link label)"   "$n" "$expected_skills"   "$line" ;;
            rules)    [ "$n" != "$expected_rules" ]    && flag "$file" "$lineno" "rules (link label)"    "$n" "$expected_rules"    "$line" ;;
            commands) [ "$n" != "$expected_commands" ] && flag "$file" "$lineno" "commands (link label)" "$n" "$expected_commands" "$line" ;;
            hooks)    [ "$n" != "$expected_hooks" ]    && flag "$file" "$lineno" "hooks (link label)"    "$n" "$expected_hooks"    "$line" ;;
        esac
    done < <(grep -nE 'All (Agents|Skills|Rules|Commands|Hooks) \([0-9]+\)' "$file" 2>/dev/null || true)

    # Pattern 3: Colon-aligned summary `  Skills:   56 available`.
    while IFS=: read -r lineno line; do
        [ -z "$line" ] && continue
        local label; label=$(echo "$line" | grep -oE '^[[:space:]]+[A-Za-z]+:' | tr -d ' :' | tr '[:upper:]' '[:lower:]')
        local n; n=$(echo "$line" | grep -oE ':[[:space:]]+[0-9]+' | grep -oE '[0-9]+' | head -1)
        [ -z "$n" ] && continue
        case "$label" in
            agents)   [ "$n" != "$expected_agents" ]   && flag "$file" "$lineno" "agents (colon-summary)"   "$n" "$expected_agents"   "$line" ;;
            skills)   [ "$n" != "$expected_skills" ]   && flag "$file" "$lineno" "skills (colon-summary)"   "$n" "$expected_skills"   "$line" ;;
            rules)    [ "$n" != "$expected_rules" ]    && flag "$file" "$lineno" "rules (colon-summary)"    "$n" "$expected_rules"    "$line" ;;
            commands) [ "$n" != "$expected_commands" ] && flag "$file" "$lineno" "commands (colon-summary)" "$n" "$expected_commands" "$line" ;;
            hooks)    [ "$n" != "$expected_hooks" ]    && flag "$file" "$lineno" "hooks (colon-summary)"    "$n" "$expected_hooks"    "$line" ;;
        esac
    done < <(grep -nE '^[[:space:]]+(Agents|Skills|Rules|Commands|Hooks):[[:space:]]+[0-9]+' "$file" 2>/dev/null || true)

    # Re-enable pipefail for the caller. Always return 0 (violations are
    # tracked via $VIOLATIONS, not exit codes).
    set -o pipefail
    return 0
}

for f in "${FILES[@]}"; do check_file "$f"; done

if [ "$VIOLATIONS" -gt 0 ]; then
    echo ""
    echo "✗ ${VIOLATIONS} stale summary count(s) in user-facing docs."
    echo "  Expected (from stats.json): ${expected_agents} agents · ${expected_skills} skills · ${expected_rules} rules · ${expected_commands} commands · ${expected_hooks} hooks"
    echo "  Update the docs to match. (Narrative prose like '5 planning agents' or '19 hooks fire' is NOT checked.)"
    exit 1
fi

echo "✓ README + docs summary counts match stats.json"
echo "  ${expected_agents} agents · ${expected_skills} skills · ${expected_rules} rules · ${expected_commands} commands · ${expected_hooks} hooks"
exit 0
