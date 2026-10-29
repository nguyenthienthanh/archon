#!/bin/bash

# Script: discover-agents.sh
# Purpose: Discover and list all available agents (global + project-specific)
# Output: JSON with agent metadata and scores

set -e

PLUGIN_DIR="${HOME}/plugins/archon-os"
PROJECT_DIR="."

echo "{"
echo '  "agents": ['

# Find global agents
if [ -d "$PLUGIN_DIR/agents" ]; then
  for agent in "$PLUGIN_DIR/agents"/*.md; do
    if [ -f "$agent" ]; then
      name=$(basename "$agent" .md)
      priority=$(grep -m 1 "Priority:" "$agent" | awk '{print $3}')
      role=$(grep -m 1 "Role:" "$agent" | awk '{print $3}')
      
      echo "    {"
      echo "      \"name\": \"$name\","
      echo "      \"priority\": $priority,"
      echo "      \"role\": \"$role\","
      echo "      \"source\": \"global\","
      echo "      \"path\": \"$agent\""
      echo "    },"
    fi
  done
fi

# Find project-specific agents (+25 bonus)
if [ -d "$PROJECT_DIR/agents" ]; then
  for agent in "$PROJECT_DIR/agents"/*.md; do
    if [ -f "$agent" ]; then
      name=$(basename "$agent" .md)
      priority=$(grep -m 1 "Priority:" "$agent" | awk '{print $3}')
      role=$(grep -m 1 "Role:" "$agent" | awk '{print $3}')
      bonus_priority=$((priority + 25))
      
      echo "    {"
      echo "      \"name\": \"$name\","
      echo "      \"priority\": $bonus_priority,"
      echo "      \"role\": \"$role\","
      echo "      \"source\": \"project\","
      echo "      \"bonus\": 25,"
      echo "      \"path\": \"$agent\""
      echo "    }"
    fi
  done
fi

echo "  ]"
echo "}"

