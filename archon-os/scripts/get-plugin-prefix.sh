#!/usr/bin/env bash
# Archon OS — plugin prefix lookup
#
# Single source of truth for the plugin's namespace prefix used by the Agent
# tool's `subagent_type` parameter. Reads the `name` field from
# `<plugin>/.claude-plugin/plugin.json` instead of hardcoding the literal
# hardcoded plugin-name string in skills/rules/docs.
#
# Why: forks, renames, and redistributions can change the plugin's name. By
# deriving the prefix at runtime, skills/rules stay fork-safe — only
# plugin.json + marketplace.json need updating on rename.
#
# Usage:
#   prefix=$(bash scripts/get-plugin-prefix.sh)
#   # subagent_type for an agent: "${prefix}:architect"
#
#   # From a hook with CLAUDE_PLUGIN_ROOT in scope:
#   prefix=$(bash "${CLAUDE_PLUGIN_ROOT}/scripts/get-plugin-prefix.sh")
#
# Exit codes: 0 always (prints "" if plugin.json unreadable — caller decides)

set -e

# Resolve plugin.json path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_JSON="${SCRIPT_DIR}/../.claude-plugin/plugin.json"

if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json" ]; then
  PLUGIN_JSON="${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json"
fi

if [ ! -f "$PLUGIN_JSON" ]; then
  exit 0
fi

# Prefer jq if available (correct JSON parsing); fall back to grep
if command -v jq >/dev/null 2>&1; then
  jq -r '.name // ""' "$PLUGIN_JSON" 2>/dev/null
else
  grep -E '"name"[[:space:]]*:[[:space:]]*"[^"]+"' "$PLUGIN_JSON" \
    | head -1 \
    | sed -E 's/.*"name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/'
fi
