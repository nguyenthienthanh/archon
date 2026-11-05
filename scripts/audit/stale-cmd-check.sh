#!/usr/bin/env bash
# Stale-command audit for docs/**/*.md
#
# Three detection passes:
#   A. Pre-v3.7 verb syntax (workflow:start, agent:list, bugfix:quick, learn:*,
#      project:reload-env, hooks/pre-phase.md, hooks/post-phase.md). Definitive
#      removals — flag every occurrence.
#   B. /archon-os:<word> references — verify <word> exists at archon-os/commands/<word>.md
#      (these are namespaced slash commands; unambiguous).
#   C. Bare slash commands in markdown inline-code (backtick-quoted /<word>) —
#      verify <word> exists. Restricting to backtick context avoids ~99% of path
#      false positives like /scripts, /Users, /auth.
#
# Output: TSV file<TAB>line<TAB>pattern<TAB>reason, sorted unique.
# Exit codes: 0 if zero findings; 1 otherwise.
#
# Flags:
#   --json    JSON output for tooling
#   --count   numeric total only
#   --quiet   suppress headers, just print findings

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# EXEMPT paths — archive / historical / spec content allowed to reference old syntax.
EXEMPT_SUBSTR=(
  "docs/showcase/"
  "docs/marketing/README.pre-v3.7.2-rewrite.md"
  "docs/marketing/USAGE_GUIDE.pre-v3.7.md"
  "docs/reference/CHANGELOG.md"
  "docs/specs/"
)

is_exempt() {
  local f="$1"
  for g in "${EXEMPT_SUBSTR[@]}"; do
    case "$f" in
      *"$g"*) return 0 ;;
    esac
  done
  return 1
}

# Build canonical slash-command set from archon-os/commands/*.md +
# Claude Code built-ins (compact, clear, help, init, model, etc. — primitives
# the runtime provides, not plugin commands).
declare -A CANONICAL
while IFS= read -r f; do
  name="$(basename "$f" .md)"
  [ "$name" = "README" ] && continue
  CANONICAL["$name"]=1
done < <(find archon-os/commands -maxdepth 1 -name '*.md' 2>/dev/null)

# Claude Code built-in slash commands (per docs.claude.com/claude-code).
CLAUDE_BUILTINS=(
  clear compact config cost doctor exit fast help init logout memory
  model permissions plugin quit resume save status verbose version vim
)
for b in "${CLAUDE_BUILTINS[@]}"; do
  CANONICAL["$b"]=1
done

# Pre-v3.7 verb-syntax patterns (extended regex per row).
BLOCKED_PATTERNS=(
  "workflow:start|use /run <task>"
  "workflow:status|use /run status (or check run-state.json)"
  "workflow:approve|use bare 'approve' verb at gate"
  "workflow:reject|use bare 'reject' verb"
  "workflow:modify|use bare 'modify' verb"
  "workflow:phase:[1-5]|removed — handled inside /run"
  "workflow:handoff|use bare 'handoff' verb (context-aware action)"
  "workflow:resume|use /run resume <id>"
  "workflow:rollback|use 'rollback' verb (or /run rollback [phase])"
  "agent:list|use /archon agents"
  "bugfix:quick|use /run \"fix ...\""
  "learn:status|use /archon learn status"
  "learn:analyze|use /archon learn analyze"
  "learn:apply|use /archon learn apply"
  "learn:feedback|use /archon learn feedback"
  "project:reload-env|use /project env (or session-start auto-reload)"
  "hooks/pre-phase\.md|removed — lifecycle is in .cjs hooks"
  "hooks/post-phase\.md|removed — lifecycle is in .cjs hooks"
)

OUTPUT_MODE="text"
case "${1:-}" in
  --json)  OUTPUT_MODE="json" ;;
  --count) OUTPUT_MODE="count" ;;
  --quiet) OUTPUT_MODE="quiet" ;;
esac

declare -a FINDINGS
HITS=0

emit() {
  FINDINGS+=("$1"$'\t'"$2"$'\t'"$3"$'\t'"$4")
  HITS=$((HITS + 1))
}

# ---- Pass A: pre-v3.7 verb-syntax patterns ----
for pattern_pair in "${BLOCKED_PATTERNS[@]}"; do
  pattern="${pattern_pair%%|*}"
  hint="${pattern_pair#*|}"

  while IFS=: read -r f lineno _content; do
    [ -z "$f" ] && continue
    is_exempt "$f" && continue
    emit "$f" "$lineno" "$pattern" "$hint"
  done < <(grep -rnE "$pattern" docs/ 2>/dev/null || true)
done

# ---- Pass B: /archon-os:<word> references ----
# Namespaced — unambiguous, always a command invocation.
while IFS= read -r f; do
  is_exempt "$f" && continue
  while IFS=: read -r lineno content; do
    [ -z "$lineno" ] && continue
    while read -r match; do
      [ -z "$match" ] && continue
      cmd="${match#/archon-os:}"
      cmd="${cmd%%[^a-z0-9-]*}"  # truncate at first non-alphanum-dash
      [ -z "$cmd" ] && continue
      if [ -z "${CANONICAL[$cmd]:-}" ]; then
        emit "$f" "$lineno" "/archon-os:$cmd" "command not in archon-os/commands/"
      fi
    done < <(printf '%s\n' "$content" | grep -oE '/archon-os:[a-z][a-z0-9-]*' || true)
  done < <(grep -nE '/archon-os:[a-z]' "$f" 2>/dev/null || true)
done < <(find docs -name '*.md' -type f)

# ---- Pass C: bare /<word> in markdown inline-code ----
# Only inspect backtick-quoted tokens: `/word` or `/word ...` or `/word`
# This avoids matching paths and URLs.
while IFS= read -r f; do
  is_exempt "$f" && continue
  while IFS=: read -r lineno content; do
    [ -z "$lineno" ] && continue
    # Extract every backticked segment, then check those that start with /
    while read -r segment; do
      [ -z "$segment" ] && continue
      # Trim leading/trailing backticks
      segment="${segment#\`}"; segment="${segment%\`}"
      # Must start with /
      case "$segment" in
        /*) : ;;
        *) continue ;;
      esac
      # Strip arguments after first whitespace
      cmd="${segment#/}"
      cmd="${cmd%% *}"
      # Strip trailing colon/word-args (e.g. /run reason:)
      cmd="${cmd%%:*}"
      # Strip trailing punctuation
      cmd="${cmd%%[!a-zA-Z0-9-]*}"
      # Must be all lowercase letters / dashes / digits and ≥2 chars
      [ -z "$cmd" ] && continue
      [ ${#cmd} -lt 2 ] && continue
      case "$cmd" in
        *[![:alnum:]-]*) continue ;;
        [A-Z]*) continue ;;  # uppercase ⇒ likely an env var or constant
      esac
      # Skip the namespaced form (handled in Pass B)
      case "$cmd" in
        archon-os) continue ;;
      esac
      # Claude Code's OWN built-in commands. They are not in archon-os/commands/
      # and never will be, so checking them against the plugin's command set
      # reports a stale reference for a command that works fine. Docs legitimately
      # cite these when explaining how the plugin sits in the host.
      case "$cmd" in
        context|reload-plugins|plugin|compact|clear|model|init|resume|cost|doctor|login|logout|config|memory|vim|terminal-setup|bug|review|pr-comments|add-dir|agents|status|export|hooks|permissions|privacy-settings|release-notes|todos|upgrade|usage) continue ;;
      esac
      # Verify against canonical
      if [ -z "${CANONICAL[$cmd]:-}" ]; then
        emit "$f" "$lineno" "/$cmd" "bare slash-command not in archon-os/commands/"
      fi
    done < <(printf '%s\n' "$content" | grep -oE '`[^`]+`' || true)
  done < <(grep -n '`' "$f" 2>/dev/null || true)
done < <(find docs -name '*.md' -type f)

# ---- Output ----
print_findings() {
  printf '%s\n' "${FINDINGS[@]:-}" | sort -u
}

case "$OUTPUT_MODE" in
  count)
    echo "$HITS"
    ;;
  json)
    printf '['
    first=1
    while IFS=$'\t' read -r f l p r; do
      [ -z "$f" ] && continue
      [ $first -eq 0 ] && printf ','
      first=0
      printf '{"file":"%s","line":"%s","pattern":"%s","reason":"%s"}' "$f" "$l" "$p" "$r"
    done < <(print_findings)
    printf ']\n'
    ;;
  quiet)
    print_findings
    ;;
  *)
    if [ $HITS -eq 0 ]; then
      echo "OK — no stale-command references found in audited docs/ tree"
    else
      printf 'file\tline\tpattern\treason\n'
      print_findings
      echo ""
      echo "Total raw findings: $HITS (after sort -u dedup: $(print_findings | wc -l | tr -d ' '))"
    fi
    ;;
esac

[ $HITS -eq 0 ] && exit 0 || exit 1
