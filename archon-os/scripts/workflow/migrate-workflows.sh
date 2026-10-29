#!/usr/bin/env bash

# Migrate Existing Workflows Script
# Purpose: Move workflows from old structure to new organized structure
# Version: 1.0.0

set -euo pipefail

CLAUDE_DIR="."
OLD_CONTEXT_DIR="${CLAUDE_DIR}/context"
NEW_LOGS_DIR="${CLAUDE_DIR}/logs"
NEW_WORKFLOWS_DIR="${NEW_LOGS_DIR}/workflows"
NEW_CONTEXTS_DIR="${NEW_LOGS_DIR}/contexts"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔄 Migrating Workflows to New Structure${NC}"
echo ""

# Create new directory structure
echo -e "${BLUE}📁 Creating new directory structure...${NC}"
mkdir -p "${NEW_LOGS_DIR}"
mkdir -p "${NEW_WORKFLOWS_DIR}"
mkdir -p "${NEW_CONTEXTS_DIR}"
echo -e "${GREEN}✓${NC} Directories created"

# Check if old context directory exists
if [[ ! -d "${OLD_CONTEXT_DIR}" ]]; then
    echo -e "${YELLOW}⚠️  No existing workflows found in ${OLD_CONTEXT_DIR}${NC}"
    exit 0
fi

# Count existing workflows
WORKFLOW_COUNT=$(find "${OLD_CONTEXT_DIR}" -maxdepth 1 -type d | tail -n +2 | wc -l | tr -d ' ')

if [[ ${WORKFLOW_COUNT} -eq 0 ]]; then
    echo -e "${YELLOW}⚠️  No workflows to migrate${NC}"
    exit 0
fi

echo -e "${BLUE}📦 Found ${WORKFLOW_COUNT} workflow(s) to migrate${NC}"
echo ""

# Migrate each workflow
for workflow_dir in "${OLD_CONTEXT_DIR}"/*/ ; do
    if [[ ! -d "$workflow_dir" ]]; then
        continue
    fi
    
    workflow_id=$(basename "$workflow_dir")
    
    echo -e "${BLUE}  Processing: ${workflow_id}${NC}"
    
    # Create new structure for this workflow
    mkdir -p "${NEW_CONTEXTS_DIR}/${workflow_id}"
    mkdir -p "${NEW_WORKFLOWS_DIR}/${workflow_id}"
    
    # Move deliverables to contexts
    if [[ -d "${workflow_dir}/deliverables" ]]; then
        echo -e "    ${GREEN}→${NC} Moving deliverables..."
        cp -r "${workflow_dir}/deliverables" "${NEW_CONTEXTS_DIR}/${workflow_id}/"
    fi
    
    # Move logs to workflows
    if [[ -d "${workflow_dir}/logs" ]]; then
        echo -e "    ${GREEN}→${NC} Moving logs..."
        cp -r "${workflow_dir}/logs"/* "${NEW_WORKFLOWS_DIR}/${workflow_id}/" 2>/dev/null || true
    fi
    
    # Move task context
    if [[ -f "${workflow_dir}/task-context.md" ]]; then
        echo -e "    ${GREEN}→${NC} Moving task context..."
        cp "${workflow_dir}/task-context.md" "${NEW_CONTEXTS_DIR}/${workflow_id}/README.md"
    fi
    
    # Create execution log if doesn't exist
    if [[ ! -f "${NEW_WORKFLOWS_DIR}/${workflow_id}/execution.log" ]]; then
        echo -e "    ${GREEN}→${NC} Creating execution log..."
        cat > "${NEW_WORKFLOWS_DIR}/${workflow_id}/execution.log" <<EOF
[$(date -u +%Y-%m-%dT%H:%M:%SZ)] WORKFLOW_MIGRATED workflow_id=${workflow_id}
[$(date -u +%Y-%m-%dT%H:%M:%SZ)] MIGRATED_FROM old_path=${workflow_dir}
[$(date -u +%Y-%m-%dT%H:%M:%SZ)] MIGRATED_TO contexts=${NEW_CONTEXTS_DIR}/${workflow_id} logs=${NEW_WORKFLOWS_DIR}/${workflow_id}
EOF
    fi
    
    echo -e "    ${GREEN}✓${NC} Migrated"
    echo ""
done

echo ""
echo -e "${GREEN}✅ Migration Complete!${NC}"
echo ""
echo -e "${BLUE}📊 Summary:${NC}"
echo "   Migrated: ${WORKFLOW_COUNT} workflow(s)"
echo "   New structure:"
echo "   - Contexts: ${NEW_CONTEXTS_DIR}/"
echo "   - Logs: ${NEW_WORKFLOWS_DIR}/"
echo ""
echo -e "${YELLOW}📝 Note:${NC}"
echo "   Old workflows are preserved in ${OLD_CONTEXT_DIR}/"
echo "   You can safely delete them after verifying the migration"
echo ""
echo -e "${BLUE}🗑️  To clean up old workflows:${NC}"
echo "   rm -rf ${OLD_CONTEXT_DIR}/*"
echo ""

