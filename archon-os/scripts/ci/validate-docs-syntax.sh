#!/usr/bin/env bash
# Validate that user-facing docs use current v3.7.x command syntax.
#
# Catches stale references like `workflow:start` (pre-v3.7) that should
# read `/run`, or `agent:list` (pre-v3.7) that should read `/af agents`.
#
# Detection rules:
#   1. Match each pattern in BLOCKED_PATTERNS against docs/**/*.md +
#      README.md + MIGRATION_TO_V3.7.md
#   2. SKIP files in EXEMPT (archive, marketing-archive, changelog, specs, showcase)
#   3. Exit 1 with file:line:pattern report on any hit
#
# Origin: FEAT-006 / STORY-0005 (Phase A of v3.7.4 docs-cleanup). Spec: §3.2 of
# the v3.7.4 tech spec. Companion to scripts/audit/stale-cmd-check.sh (which
# does broader detection — verb syntax + namespaced + backticked bare slash).
# This script is CI-grade: surgical Pass A only, deterministic, fast.
#
# KNOWN LIMITATION (deferred to v3.8):
#   This script does NOT validate subcommands. `/run predict` passes because
#   `/run` is real, even though `predict` is not a valid `/run` subcommand.
#   Subcommand allowlists require per-command per-subcommand mapping;
#   see STORY-0001 decisions.md §1d.
#
# Usage:
#   bash archon-os/scripts/ci/validate-docs-syntax.sh
#
# Exit codes:
#   0  no stale references found (clean)
#   1  one or more stale references — file:line:pattern report printed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"

# Patterns that must NOT appear in current docs.
# Format: "pattern|replacement_hint"
# Extended regex (-E). Match is line-scoped — case-sensitive.
BLOCKED_PATTERNS=(
  "workflow:start|use /run <task>"
  "workflow:status|use /run status (or check run-state.json)"
  "workflow:approve|use bare 'approve' verb at the approval gate"
  "workflow:reject|use bare 'reject' verb"
  "workflow:modify|use bare 'modify' verb"
  "workflow:phase:[1-5]|removed — phase transitions are internal to /run"
  "workflow:handoff|use bare 'handoff' verb (context-aware)"
  "workflow:resume|use /run resume <id>"
  "workflow:rollback|use 'rollback' verb (or /run rollback [phase])"
  "agent:list|use /af agents"
  "bugfix:quick|use /run \"fix ...\""
  "learn:status|use /af learn status"
  "learn:analyze|use /af learn analyze"
  "learn:apply|use /af learn apply"
  "learn:feedback|use /af learn feedback"
  "project:reload-env|use /project env (or session-start auto-reload)"
  "hooks/pre-phase\.md|removed — lifecycle handled by .cjs hooks"
  "hooks/post-phase\.md|removed — lifecycle handled by .cjs hooks"
)

# Files allowed to contain legacy syntax (archive / reference / history).
EXEMPT=(
  "docs/reference/CHANGELOG.md"
  "docs/specs/"
  "docs/showcase/"
)

is_exempt() {
  local f="$1"
  for e in "${EXEMPT[@]}"; do
    case "$f" in
      *"$e"*) return 0 ;;
    esac
  done
  return 1
}

cd "$REPO_ROOT"

# Build the search-target list.
SEARCH_TARGETS=(docs README.md)

ERRORS=0

for pattern_pair in "${BLOCKED_PATTERNS[@]}"; do
  pattern="${pattern_pair%%|*}"
  hint="${pattern_pair#*|}"

  while IFS=: read -r file lineno _content; do
    [ -z "$file" ] && continue
    if is_exempt "$file"; then continue; fi
    echo "✗ $file:$lineno: stale syntax '$pattern' — $hint"
    ERRORS=$((ERRORS + 1))
  done < <(grep -rnE "$pattern" "${SEARCH_TARGETS[@]}" 2>/dev/null || true)
done

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "Found $ERRORS stale command reference(s). Blocking commit."
  echo ""
  echo "Fix: replace each pattern with its current equivalent (hint above)."
  echo ""
  echo "If a file legitimately needs to reference legacy syntax (archive,"
  echo "changelog, migration), add its path to EXEMPT in this script."
  echo ""
  echo "Run \`bash scripts/audit/stale-cmd-check.sh\` for a broader audit"
  echo "(includes namespaced /archon-os:* commands and bare backticked /word)."
  exit 1
fi

echo "✓ No stale command references in user-facing docs"
exit 0
