#!/bin/bash

# Script: generate-report.sh
# Purpose: Generate workflow summary report

set -e

CONTEXT_DIR="logs/contexts"
OUTPUT_FILE="workflow-report.md"

if [ ! -d "$CONTEXT_DIR" ]; then
  echo "❌ No workflow contexts found"
  exit 1
fi

echo "# Workflow Summary Report" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "Generated: $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Count workflows
total=$(find "$CONTEXT_DIR" -name "*.json" | wc -l)
echo "## Overview" >> "$OUTPUT_FILE"
echo "- Total Workflows: $total" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# List recent workflows
echo "## Recent Workflows" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

find "$CONTEXT_DIR" -name "*.json" -type f | head -10 | while read -r context; do
  id=$(basename "$context" .json)
  feature=$(jq -r '.featureName' "$context" 2>/dev/null || echo "Unknown")
  phase=$(jq -r '.currentPhase' "$context" 2>/dev/null || echo "0")
  started=$(jq -r '.startedAt' "$context" 2>/dev/null || echo "Unknown")
  
  echo "### Workflow: $feature" >> "$OUTPUT_FILE"
  echo "- ID: $id" >> "$OUTPUT_FILE"
  echo "- Phase: $phase/5" >> "$OUTPUT_FILE"
  echo "- Started: $started" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
done

echo "✅ Report generated: $OUTPUT_FILE"

