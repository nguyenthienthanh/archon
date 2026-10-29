#!/bin/bash
# =============================================================================
# Aura Frog - Design System Detection Script
# =============================================================================
# Detects the design system used in a project by analyzing:
# 1. package.json dependencies
# 2. Configuration files
# 3. Import patterns in source code
#
# Usage: bash detect-design-system.sh [project-path]
# Returns: Design system name or "unknown"
# =============================================================================

set -e

PROJECT_PATH="${1:-.}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detection result
DESIGN_SYSTEM="unknown"
CONFIDENCE="low"

echo -e "${BLUE}🔍 Detecting design system in: ${PROJECT_PATH}${NC}"
echo "=================================================="

# -----------------------------------------------------------------------------
# Step 1: Check package.json
# -----------------------------------------------------------------------------
detect_from_package_json() {
    local pkg_file="$PROJECT_PATH/package.json"

    if [ ! -f "$pkg_file" ]; then
        echo -e "${YELLOW}⚠️  No package.json found${NC}"
        return
    fi

    echo -e "\n${BLUE}📦 Checking package.json...${NC}"

    # Read dependencies (both deps and devDeps)
    local all_deps=$(cat "$pkg_file" | grep -E '"(@mui|antd|tailwindcss|@chakra-ui|@mantine|nativewind|bootstrap|react-bootstrap|@radix-ui|@headlessui)' || true)

    # Priority order detection
    if echo "$all_deps" | grep -q '"@mui/material"'; then
        DESIGN_SYSTEM="material-ui"
        CONFIDENCE="high"
        echo -e "${GREEN}✓ Found: @mui/material → Material UI${NC}"
    elif echo "$all_deps" | grep -q '"antd"'; then
        DESIGN_SYSTEM="ant-design"
        CONFIDENCE="high"
        echo -e "${GREEN}✓ Found: antd → Ant Design${NC}"
    elif echo "$all_deps" | grep -q '"@chakra-ui/react"'; then
        DESIGN_SYSTEM="chakra-ui"
        CONFIDENCE="high"
        echo -e "${GREEN}✓ Found: @chakra-ui/react → Chakra UI${NC}"
    elif echo "$all_deps" | grep -q '"@mantine/core"'; then
        DESIGN_SYSTEM="mantine"
        CONFIDENCE="high"
        echo -e "${GREEN}✓ Found: @mantine/core → Mantine${NC}"
    elif echo "$all_deps" | grep -q '"nativewind"'; then
        DESIGN_SYSTEM="nativewind"
        CONFIDENCE="high"
        echo -e "${GREEN}✓ Found: nativewind → NativeWind${NC}"
    elif echo "$all_deps" | grep -q '"bootstrap"' || echo "$all_deps" | grep -q '"react-bootstrap"'; then
        DESIGN_SYSTEM="bootstrap"
        CONFIDENCE="high"
        echo -e "${GREEN}✓ Found: bootstrap → Bootstrap${NC}"
    elif echo "$all_deps" | grep -q '"@headlessui/react"'; then
        DESIGN_SYSTEM="headless-ui"
        CONFIDENCE="medium"
        echo -e "${GREEN}✓ Found: @headlessui/react → Headless UI${NC}"
    elif echo "$all_deps" | grep -q '"@radix-ui/react-'; then
        DESIGN_SYSTEM="radix-ui"
        CONFIDENCE="medium"
        echo -e "${GREEN}✓ Found: @radix-ui → Radix UI${NC}"
    elif echo "$all_deps" | grep -q '"tailwindcss"'; then
        # Check for shadcn/ui
        if [ -f "$PROJECT_PATH/components.json" ]; then
            DESIGN_SYSTEM="shadcn-ui"
            CONFIDENCE="high"
            echo -e "${GREEN}✓ Found: tailwindcss + components.json → shadcn/ui${NC}"
        else
            DESIGN_SYSTEM="tailwind-css"
            CONFIDENCE="high"
            echo -e "${GREEN}✓ Found: tailwindcss → Tailwind CSS${NC}"
        fi
    fi
}

# -----------------------------------------------------------------------------
# Step 2: Check config files
# -----------------------------------------------------------------------------
detect_from_config_files() {
    echo -e "\n${BLUE}📁 Checking config files...${NC}"

    # Tailwind config
    if [ -f "$PROJECT_PATH/tailwind.config.js" ] || [ -f "$PROJECT_PATH/tailwind.config.ts" ]; then
        echo -e "${GREEN}✓ Found: tailwind.config.js${NC}"
        if [ "$DESIGN_SYSTEM" = "unknown" ]; then
            if [ -f "$PROJECT_PATH/components.json" ]; then
                DESIGN_SYSTEM="shadcn-ui"
                CONFIDENCE="high"
            else
                DESIGN_SYSTEM="tailwind-css"
                CONFIDENCE="high"
            fi
        fi
    fi

    # shadcn/ui config
    if [ -f "$PROJECT_PATH/components.json" ]; then
        echo -e "${GREEN}✓ Found: components.json (shadcn/ui)${NC}"
        if [ "$DESIGN_SYSTEM" = "tailwind-css" ]; then
            DESIGN_SYSTEM="shadcn-ui"
            CONFIDENCE="high"
        fi
    fi

    # NativeWind config
    if [ -f "$PROJECT_PATH/nativewind.config.js" ] || [ -f "$PROJECT_PATH/nativewind.config.ts" ]; then
        echo -e "${GREEN}✓ Found: nativewind.config.js${NC}"
        if [ "$DESIGN_SYSTEM" = "unknown" ] || [ "$DESIGN_SYSTEM" = "tailwind-css" ]; then
            DESIGN_SYSTEM="nativewind"
            CONFIDENCE="high"
        fi
    fi
}

# -----------------------------------------------------------------------------
# Step 3: Check import patterns (if still unknown)
# -----------------------------------------------------------------------------
detect_from_imports() {
    if [ "$DESIGN_SYSTEM" != "unknown" ]; then
        return
    fi

    echo -e "\n${BLUE}🔎 Checking import patterns...${NC}"

    # Look for common import patterns in src/
    local src_dir="$PROJECT_PATH/src"
    if [ ! -d "$src_dir" ]; then
        src_dir="$PROJECT_PATH/app"
    fi

    if [ -d "$src_dir" ]; then
        # MUI imports
        if grep -rq "from '@mui/" "$src_dir" 2>/dev/null; then
            DESIGN_SYSTEM="material-ui"
            CONFIDENCE="medium"
            echo -e "${GREEN}✓ Found MUI imports${NC}"
        # Ant Design imports
        elif grep -rq "from 'antd" "$src_dir" 2>/dev/null; then
            DESIGN_SYSTEM="ant-design"
            CONFIDENCE="medium"
            echo -e "${GREEN}✓ Found Ant Design imports${NC}"
        # Chakra imports
        elif grep -rq "from '@chakra-ui/" "$src_dir" 2>/dev/null; then
            DESIGN_SYSTEM="chakra-ui"
            CONFIDENCE="medium"
            echo -e "${GREEN}✓ Found Chakra UI imports${NC}"
        # shadcn imports
        elif grep -rq 'from "@/components/ui/' "$src_dir" 2>/dev/null; then
            DESIGN_SYSTEM="shadcn-ui"
            CONFIDENCE="medium"
            echo -e "${GREEN}✓ Found shadcn/ui imports${NC}"
        fi
    fi
}

# -----------------------------------------------------------------------------
# Run detection
# -----------------------------------------------------------------------------
detect_from_package_json
detect_from_config_files
detect_from_imports

# -----------------------------------------------------------------------------
# Output result
# -----------------------------------------------------------------------------
echo ""
echo "=================================================="
if [ "$DESIGN_SYSTEM" = "unknown" ]; then
    echo -e "${YELLOW}⚠️  Design System: Unknown${NC}"
    echo -e "${YELLOW}   Could not detect a design system.${NC}"
    echo ""
    echo "Recommendations:"
    echo "  - For React/Next.js: shadcn/ui, MUI, or Chakra UI"
    echo "  - For Vue: Ant Design Vue or Tailwind"
    echo "  - For React Native: NativeWind"
else
    echo -e "${GREEN}✅ Design System: ${DESIGN_SYSTEM}${NC}"
    echo -e "${GREEN}   Confidence: ${CONFIDENCE}${NC}"
    echo ""
    echo "Skill file: skills/design-system-library/${DESIGN_SYSTEM}.md"
fi
echo "=================================================="

# Return the design system for scripting
echo ""
echo "DESIGN_SYSTEM=${DESIGN_SYSTEM}"
echo "CONFIDENCE=${CONFIDENCE}"
