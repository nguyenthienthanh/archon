#!/usr/bin/env bash
# portability-audit.sh — audit the plugin for non-portable / overly-specific content.
#
# Dimensions:
#   D1  region/company-specific tokens (PH/MY/FWD/personal identifiers)
#   D2  agent references not defined in agents/*.md
#   D3  hardcoded user/machine paths
#   D4  project-context assumptions (plugin must read the host project's
#       CLAUDE.md / README instead of assuming conventions)
#
# Exit: 0 clean · 1 findings
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLUGIN="$ROOT/archon-os"
FINDINGS=0

scan_dirs=(agents commands hooks rules skills scripts templates project-contexts docs)
include=(--include='*.md' --include='*.sh' --include='*.cjs' --include='*.js' --include='*.json' --include='*.py' --include='*.yaml' --include='*.yml')

section() { printf '\n== %s ==\n' "$1"; }
report() { # report <count> <label>
  if [ "$1" -gt 0 ]; then
    echo "✗ $1 hit(s): $2"
    FINDINGS=$((FINDINGS + $1))
  else
    echo "✓ clean: $2"
  fi
}

cd "$PLUGIN"

# ---------- D1: region / company / personal tokens ----------
section "D1 region/company/personal-specific tokens"
D1_PATTERN='philippines|malaysia|\bmanila\b|kuala lumpur|\bringgit\b|\bpeso\b|Asia/(Manila|Kuala_Lumpur)|\bFWD\b|vietlott|hk\.fwd\.com|22892[0-9]|2279[0-9][0-9]|739711739|kiyoshi|nguyenthanh\b|thien ?thanh nguyen|tuyet_mai'
# Allowlist: the plugin's own GitHub slug is legitimate.
hits=$(grep -rniE "$D1_PATTERN" "${include[@]}" "${scan_dirs[@]}" 2>/dev/null \
  | grep -v 'nguyenthienthanh/archon' || true)
count=$( [ -n "$hits" ] && echo "$hits" | wc -l | tr -d ' ' || echo 0 )
[ -n "$hits" ] && echo "$hits"
report "$count" "region/company/personal tokens"

# Bare region codes in prose contexts (PH, MY as country codes)
hits2=$(grep -rnE '\b(PH|MY)\b[- ]?(region|market|locale|country)|region[: ]+(PH|MY)\b' "${include[@]}" "${scan_dirs[@]}" 2>/dev/null || true)
count2=$( [ -n "$hits2" ] && echo "$hits2" | wc -l | tr -d ' ' || echo 0 )
[ -n "$hits2" ] && echo "$hits2"
report "$count2" "bare region-code usage (PH/MY)"

# ---------- D2: agent references not defined in agents/ ----------
section "D2 undefined agent references"
defined=$(find agents -maxdepth 1 -name '*.md' ! -name 'README.md' -exec basename {} .md \; | sort)
commands_list=$(find commands -maxdepth 1 -name '*.md' ! -name 'README.md' -exec basename {} .md \; | sort)
# Referenced ids: archon-os:<id> NOT preceded by '/' (slash form is a command, not an agent)
referenced=$(grep -rhoE '(^|[^/a-z-])archon-os:[a-z][a-z-]*[a-z]' \
    "${include[@]}" commands hooks rules skills agents scripts 2>/dev/null \
  | grep -oE 'archon-os:[a-z][a-z-]*[a-z]' | sed 's/archon-os://' | sort -u || true)
undef=0
for id in $referenced; do
  echo "$commands_list" | grep -qx "$id" && continue # command name, not an agent
  case "$id" in reference|foo) continue ;; esac      # namespace prefix / doc-comment example
  if ! echo "$defined" | grep -qx "$id"; then
    echo "✗ referenced but not defined in agents/: $id"
    grep -rlE "archon-os:$id\b" "${include[@]}" commands hooks rules skills agents scripts 2>/dev/null | sed 's/^/    /' | head -5
    undef=$((undef + 1))
  fi
done
report "$undef" "undefined agent ids"

# ---------- D3: hardcoded user/machine paths ----------
section "D3 hardcoded paths"
hits3=$(grep -rnE '/Users/[a-z][a-z0-9_-]+/|~/Projects/(SourceCode|Personal)|/home/[a-z]+/' "${include[@]}" "${scan_dirs[@]}" 2>/dev/null \
  | grep -vE '(\$HOME|example|<username>|your-user)' || true)
count3=$( [ -n "$hits3" ] && echo "$hits3" | wc -l | tr -d ' ' || echo 0 )
[ -n "$hits3" ] && echo "$hits3" | head -20
report "$count3" "hardcoded user/machine paths"

# ---------- D4: project-context discipline ----------
section "D4 project-context discipline (CLAUDE.md / README of host project)"
# The scanner/loader flows must instruct reading the host project's CLAUDE.md and README.
for probe in "CLAUDE.md" "README"; do
  if grep -rqiE "project.{0,20}$probe|$probe.{0,40}(project|repo)" \
      skills/project-context-loader skills/agent-detector agents/scanner.md 2>/dev/null; then
    echo "✓ scanner/loader references host-project $probe"
  else
    echo "✗ scanner/loader never instructs reading host-project $probe"
    FINDINGS=$((FINDINGS + 1))
  fi
done

section "RESULT"
if [ "$FINDINGS" -gt 0 ]; then
  echo "FAIL — $FINDINGS finding(s)"
  exit 1
fi
echo "PASS — portable"
