#!/usr/bin/env bash

# Bridges legacy AF_* / AURA_FROG_* variables onto their ARCHON_* names (v4 rebrand).
. "$(dirname "${BASH_SOURCE[0]}")/lib/env-compat.sh"

# Archon OS — CLI Dashboard
#
# Terse one-screen view of plan tree, active task, conflicts, freezes,
# token budget, MCP usage, pre-flight bypass count.
#
# Usage:
#   bash scripts/dashboard.sh                # static one-shot
#   bash scripts/dashboard.sh --live         # refresh every 5s
#   bash scripts/dashboard.sh --json         # machine-readable JSON
#   bash scripts/dashboard.sh --section <n>  # plan|active|conflicts|memory|mcp|preflight
#
# Read-only — never mutates state.

set -e

LIVE=""
JSON=""
SECTION=""
for arg in "$@"; do
  case "$arg" in
    --live) LIVE=true ;;
    --json) JSON=true ;;
    --section) shift; SECTION="$1" ;;
  esac
done

# Resolve project root (walk up from PWD looking for .claude/ or .git/ marker).
# Matches hooks/lib/hook-runtime.cjs#findProjectRoot.
find_project_root() {
    if [ -n "$ARCHON_PROJECT_ROOT" ]; then echo "$ARCHON_PROJECT_ROOT"; return; fi
    local d="${1:-$PWD}"
    while [ "$d" != "/" ] && [ -n "$d" ]; do
        if [ -d "$d/.claude" ] || [ -d "$d/.git" ]; then echo "$d"; return; fi
        d=$(dirname "$d")
    done
    echo "${1:-$PWD}"
}
PROJECT_ROOT=$(find_project_root)
PLANS_DIR="${PROJECT_ROOT}/.claude/plans"
MEMORY_DIR="${PROJECT_ROOT}/.claude/memory"
# Resolution order matches hooks/lib/security-dir.cjs and _lib.sh#security_dir —
# this script only READS mcp-audit.jsonl, so it has to land wherever
# mcp-call-gate.cjs decided to write it.
if [ -n "${ARCHON_SECURITY_DIR:-}" ]; then
  SECURITY_DIR="${ARCHON_SECURITY_DIR}"
elif [ -d "${PROJECT_ROOT}/.claude/security" ]; then
  SECURITY_DIR="${PROJECT_ROOT}/.claude/security"
else
  SECURITY_DIR="${PROJECT_ROOT}/.aura/security"
fi
LOGS_DIR="${PROJECT_ROOT}/.claude/logs"

# ---------- helpers ----------

count_status() {
  local status="$1"
  find "$PLANS_DIR" -name '*.md' ! -name 'README.md' 2>/dev/null \
    | xargs grep -lE "^status:[[:space:]]*${status}\\b" 2>/dev/null \
    | wc -l | tr -d ' '
}

count_tier() {
  local tier="$1"
  find "$PLANS_DIR" -name '*.md' ! -name 'README.md' 2>/dev/null \
    | xargs grep -lE "^tier:[[:space:]]*${tier}\\b" 2>/dev/null \
    | wc -l | tr -d ' '
}

# ---------- sections ----------

section_plan() {
  if [ ! -d "$PLANS_DIR" ]; then
    echo "Plan tree: not initialized — run /archon-os:plan"
    return
  fi
  local total t0 t1 t2 t3 t4
  total=$(find "$PLANS_DIR" -name '*.md' ! -name 'README.md' 2>/dev/null | wc -l | tr -d ' ')
  t0=$(count_tier 0)
  t1=$(count_tier 1)
  t2=$(count_tier 2)
  t3=$(count_tier 3)
  t4=$(count_tier 4)
  local active_path=""
  if [ -f "$PLANS_DIR/active.json" ]; then
    active_path=$(jq -r '.active | "\(.mission // "—") → \(.initiative // "—") → \(.feature // "—") → \(.story // "—") → \(.task // "—")"' "$PLANS_DIR/active.json" 2>/dev/null || echo "—")
  fi
  echo "Plan tree (${total} nodes)"
  echo "  Tier counts: T0=${t0}, T1=${t1}, T2=${t2}, T3=${t3}, T4=${t4}"
  echo "  Active path: ${active_path}"
  echo "  Status: planned=$(count_status planned), active=$(count_status active), done=$(count_status done), frozen=$(count_status frozen), blocked=$(count_status blocked)"
}

section_active() {
  local latest_run
  latest_run=$(find "$LOGS_DIR/runs" -maxdepth 2 -name 'run-state.json' -print 2>/dev/null | head -1)
  if [ -z "$latest_run" ]; then
    echo "Active run: none"
    return
  fi
  local phase status flow tokens
  phase=$(jq -r '.current_phase // "?"' "$latest_run" 2>/dev/null)
  status=$(jq -r '.status // "?"' "$latest_run" 2>/dev/null)
  flow=$(jq -r '.flow // "?"' "$latest_run" 2>/dev/null)
  tokens=$(jq -r '.tokens_used // 0' "$latest_run" 2>/dev/null)
  echo "Active run: phase=${phase} · status=${status} · flow=${flow} · tokens=${tokens}"
}

section_conflicts() {
  local f="$PLANS_DIR/conflicts.jsonl"
  if [ ! -f "$f" ]; then
    echo "Conflicts: 0 open · 0 stale"
    return
  fi
  local open total
  total=$(wc -l < "$f" | tr -d ' ')
  open=$(jq -r 'select(.resolution == null) | .conflict_id' "$f" 2>/dev/null | sort -u | wc -l | tr -d ' ')
  echo "Conflicts: ${open} open / ${total} total events"
}

section_memory() {
  local f="$MEMORY_DIR/permanent_memory.md"
  if [ ! -f "$f" ]; then
    echo "Memory: not initialized"
    return
  fi
  local lines tokens epics
  lines=$(wc -l < "$f" | tr -d ' ')
  tokens=$((lines * 4 / 3))
  epics=$(grep -c '^## Epic:' "$f" 2>/dev/null || true)
  echo "Memory: ${epics} Epic(s) · ~${tokens} tokens / 8000 cap"
}

section_mcp() {
  local f="$SECURITY_DIR/mcp-audit.jsonl"
  if [ ! -f "$f" ]; then
    echo "MCP: audit not started"
    return
  fi
  local total blocked
  total=$(wc -l < "$f" | tr -d ' ')
  blocked=$(grep -c '"BLOCKED":true' "$f" 2>/dev/null || true)
  echo "MCP: ${total} calls audited · ${blocked} blocked"
}

section_preflight() {
  local f="$LOGS_DIR/.preflight-bypass-count"
  local n=0
  [ -f "$f" ] && n=$(cat "$f" 2>/dev/null || true)
  echo "Pre-flight: ${n} bypasses this session"
}

# ---------- main render ----------

render_static() {
  echo "Archon OS — Dashboard"
  echo "─────────────────────────────────────────────────────────────"
  if [ -n "$SECTION" ]; then
    "section_${SECTION}"
  else
    section_plan
    echo ""
    section_active
    echo ""
    section_conflicts
    echo ""
    section_memory
    echo ""
    section_mcp
    echo ""
    section_preflight
  fi
}

render_json() {
  local plan_total=$(find "$PLANS_DIR" -name '*.md' ! -name 'README.md' 2>/dev/null | wc -l | tr -d ' ')
  local conf_total=0; [ -f "$PLANS_DIR/conflicts.jsonl" ] && conf_total=$(wc -l < "$PLANS_DIR/conflicts.jsonl" | tr -d ' ')
  local mcp_total=0; [ -f "$SECURITY_DIR/mcp-audit.jsonl" ] && mcp_total=$(wc -l < "$SECURITY_DIR/mcp-audit.jsonl" | tr -d ' ')
  local mcp_blocked=0; [ -f "$SECURITY_DIR/mcp-audit.jsonl" ] && mcp_blocked=$(grep -c '"BLOCKED":true' "$SECURITY_DIR/mcp-audit.jsonl" 2>/dev/null || true)
  local bypass=0; [ -f "$LOGS_DIR/.preflight-bypass-count" ] && bypass=$(cat "$LOGS_DIR/.preflight-bypass-count" 2>/dev/null || true)
  cat <<EOF
{
  "version": "3.7.0-rc.1",
  "plan": { "total_nodes": ${plan_total} },
  "conflicts": { "total_events": ${conf_total} },
  "mcp": { "calls_audited": ${mcp_total}, "blocked": ${mcp_blocked} },
  "preflight": { "session_bypasses": ${bypass} }
}
EOF
}

if [ -n "$JSON" ]; then
  render_json
elif [ -n "$LIVE" ]; then
  while true; do
    clear
    render_static
    sleep 5
  done
else
  render_static
fi
