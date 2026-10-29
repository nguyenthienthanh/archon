#!/usr/bin/env bash
# Aura Frog Pre-flight: YAML frontmatter validation
# Verifies plan/skill/agent/rule/command markdown files have required frontmatter.
#
# Exit codes: 0 pass / 1 warn / 2 fail
#
# Usage:
#   validate-frontmatter.sh <file.md>

set -e

FILE="$1"
[ -z "$FILE" ] && exit 0
[ ! -f "$FILE" ] && exit 0
[[ ! "$FILE" =~ \.md$ ]] && exit 0

# Skip README/CHANGELOG/CLAUDE.md/spec docs
case "$(basename "$FILE")" in
  README.md|CHANGELOG.md|CLAUDE.md|MIGRATION_*.md) exit 0 ;;
esac

# Skip if file has no frontmatter at all (some files are intentionally bare)
HEAD=$(head -1 "$FILE")
[ "$HEAD" != "---" ] && exit 0

# Extract frontmatter (between first two `---` lines)
FM=$(awk '/^---$/{c++; next} c==1 {print} c==2 {exit}' "$FILE")
[ -z "$FM" ] && {
  echo "preflight:frontmatter WARN: $FILE has frontmatter delimiter but no content" >&2
  exit 1
}

# Determine file type from path
TYPE=""
case "$FILE" in
  */agents/*.md|*/agents/reference/*.md) TYPE="agent" ;;
  */skills/*/SKILL.md) TYPE="skill" ;;
  */rules/*/*.md) TYPE="rule" ;;
  */commands/*.md) TYPE="command" ;;
  */.claude/plans/*) TYPE="plan" ;;
esac

# Required fields per type
case "$TYPE" in
  agent)
    for field in name description; do
      echo "$FM" | grep -qE "^${field}:" || {
        echo "preflight:frontmatter FAIL: $FILE missing required field '$field' for agent" >&2
        exit 2
      }
    done
    ;;
  skill)
    for field in name description; do
      echo "$FM" | grep -qE "^${field}:" || {
        echo "preflight:frontmatter FAIL: $FILE missing required field '$field' for skill" >&2
        exit 2
      }
    done
    # Skills MUST have user-invocable: false (per CLAUDE.md architecture rule)
    echo "$FM" | grep -qE '^user-invocable:[[:space:]]*false' || {
      echo "preflight:frontmatter WARN: $FILE skill missing 'user-invocable: false' (Commands-vs-Skills architecture rule)" >&2
      exit 1
    }
    ;;
  plan)
    for field in id tier status intent; do
      echo "$FM" | grep -qE "^${field}:" || {
        echo "preflight:frontmatter FAIL: $FILE missing required field '$field' for plan node" >&2
        exit 2
      }
    done
    ;;
  *)
    # Other types — just verify frontmatter parses (no required fields enforced)
    ;;
esac

exit 0
