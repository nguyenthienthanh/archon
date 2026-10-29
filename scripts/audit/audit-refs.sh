#!/usr/bin/env bash
#
# audit-refs.sh — reference-integrity gate for the Archon OS plugin.
#
# Runs the zero-orphan + zero-dead-link + user-invocable checks that used to
# live inline in .claude/CLAUDE.md. Run BEFORE any commit that touches
# agents/ · skills/ · rules/ · commands/ · hooks/.
#
#   ./scripts/audit/audit-refs.sh        # from repo root
#
# Exit 0 = clean. Exit 1 = at least one violation (do NOT commit).
#
# See docs/reference/MAINTENANCE.md for the full maintainer contract.

set -uo pipefail

# Resolve repo root from this script's location, then operate inside archon-os/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT/archon-os" || { echo "FATAL: archon-os/ not found"; exit 1; }

fail=0

echo "▶ Orphan rules (rule with zero inbound references)…"
# Match PATH-SHAPED references (the repo's citation style is
# 'rules/workflow/checkpoint-discipline.md' or without the extension), NOT
# bare basenames: an unanchored substring grep let rules named after common
# words ('verification', 'estimation', 'git-workflow') stay unauditable —
# prose or same-named skill docs kept the count nonzero forever.
while IFS= read -r rulepath; do
  ref="${rulepath%.md}"
  # Alive iff the rule's path appears (with or without .md), terminated by a
  # non-name character or end-of-line so 'rules/core/naming' can't be
  # satisfied by 'rules/core/naming-conventions.md'.
  count=$(grep -rE --include="*.md" "${ref}(\.md)?([^A-Za-z0-9_-]|\$)" . \
            --exclude-dir=rules --exclude-dir=.git 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" = "0" ]; then
    echo "  ORPHAN: $rulepath"
    fail=1
  fi
done < <(find rules -name "*.md" ! -name "README.md")

echo "▶ Dead links (referenced path that does not exist)…"
while IFS= read -r path; do
  # Skip prose enumerations like "(agents/skills/rules)" — the regex fragments
  # them, producing a token whose 2nd segment is itself a component dir name.
  case "$path" in
    */agents|*/skills|*/rules|*/commands|*/hooks|*/workflows|*/phases|*/metrics|*/observer|*/feedback) continue ;;
  esac
  # A reference is alive if the dir, the file, or the file+'.md' exists.
  # (Refs are written both as 'agents/architect' and 'agents/architect.md'.)
  if [ ! -e "$path" ] && [ ! -d "$path" ] && [ ! -e "$path.md" ]; then
    echo "  DEAD: $path"
    fail=1
  fi
done < <(grep -rhoE '(~/\.claude/)?(rules/[a-z]+|skills/[a-z-]+|agents/[a-z-]+)' --include="*.md" . \
           | grep -v '^~/' | sort -u)

echo "▶ Dead file references (path with an extension that does not exist)…"
# The check above only sees narrow component/dir refs. This one catches refs
# written WITH an explicit file extension (rules/core/x.md, scripts/plans/y.sh)
# — the class the old regex truncated to a dir and reported "alive". Skips:
# glob/variable tokens, doc templates (NNN / service-name / -description), and an
# allowlist of intentional refs to not-yet-created / removed / example files
# (each documented as 'future' / 'removed' / example in its source line).
# docs/specs/*V3.7.0* = the authoritative V3.7.0 design spec, cited by section
# across core files; it lives outside the shipped repo (never committed), so the
# citations stay as provenance and resolve if the spec is added later.
ALLOW_MISSING='^(scripts/jira-fetch\.sh|scripts/preflight/install-opa\.sh|scripts/reproduce-bug\.sh|hooks/recursion-guard\.cjs|agents/observer\.md|docs/specs/ARCHON_V3\.7\.0_TECH_SPEC\.md|docs/specs/V3\.7\.0_DECISIONS\.md)$'
while IFS= read -r ref; do
  case "$ref" in
    *'*'*|*'$'*|*'{'*) continue ;;                     # glob / variable
    *NNN*|*service-name*|*-description*) continue ;;   # doc templates
  esac
  echo "$ref" | grep -qE "$ALLOW_MISSING" && continue  # intentional missing
  # scripts/ and docs/ live at the repo root, one level above archon-os/.
  if [ ! -e "$ref" ] && [ ! -e "../$ref" ]; then
    echo "  DEAD FILE: $ref"
    fail=1
  fi
done < <(grep -rhoE '(~/\.claude/)?(rules|skills|agents|commands|hooks|scripts|docs)/[A-Za-z0-9_./-]+\.(md|sh|cjs|js|json|ya?ml)' \
           --include="*.md" . | grep -v '^~/' | sed -E 's/[.,:;)]+$//' | sort -u)

echo "▶ Skills missing 'user-invocable: false'…"
for f in skills/*/SKILL.md; do
  [ -e "$f" ] || continue
  grep -q "user-invocable: false" "$f" || { echo "  MISSING: $f"; fail=1; }
done

if [ "$fail" = "0" ]; then
  echo "✓ Reference integrity clean — zero orphans, zero dead links, all skills flagged."
else
  echo "✗ Reference integrity FAILED — fix the above before committing."
fi
exit "$fail"
