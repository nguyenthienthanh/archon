#!/bin/bash
#
# init-claude-visual.sh
# Initialize .claude/visual/ folder structure for visual pixel-perfect testing
#
# Usage: ./init-claude-visual.sh [project-path]
#
# Version: 1.0.0

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Project path (default: current directory)
PROJECT_PATH="${1:-.}"
VISUAL_PATH="$PROJECT_PATH/.claude/visual"

echo -e "${BLUE}Initializing visual testing structure...${NC}"

# Create directory structure
mkdir -p "$VISUAL_PATH/design"
mkdir -p "$VISUAL_PATH/spec"
mkdir -p "$VISUAL_PATH/tokens"
mkdir -p "$VISUAL_PATH/snapshots/baseline"
mkdir -p "$VISUAL_PATH/snapshots/current"
mkdir -p "$VISUAL_PATH/snapshots/diff"
mkdir -p "$VISUAL_PATH/tests"

echo -e "${GREEN}Created folder structure:${NC}"
echo "  .claude/visual/"
echo "  ├── design/           # Reference images"
echo "  ├── spec/             # DesignSpec JSON files"
echo "  ├── tokens/           # Design tokens"
echo "  ├── snapshots/"
echo "  │   ├── baseline/     # Approved snapshots"
echo "  │   ├── current/      # Test run snapshots"
echo "  │   └── diff/         # Diff images"
echo "  ├── tests/            # Visual test files"
echo "  └── config.json       # Visual testing config"

# Create default config.json
cat > "$VISUAL_PATH/config.json" << 'EOF'
{
  "$schema": "https://aura-frog.dev/schemas/visual-config.json",
  "version": "1.0.0",
  "thresholds": {
    "web": 0.5,
    "pdf": 1.0
  },
  "maxAttempts": 5,
  "render": {
    "web": {
      "defaultViewport": {
        "width": 1280,
        "height": 720
      },
      "disableAnimations": true,
      "waitForSelector": "body"
    },
    "pdf": {
      "format": "A4",
      "printBackground": true,
      "margin": {
        "top": "24mm",
        "right": "24mm",
        "bottom": "24mm",
        "left": "24mm"
      }
    }
  },
  "snapshot": {
    "format": "png",
    "scale": 1,
    "compression": "none"
  }
}
EOF

echo -e "${GREEN}Created config.json${NC}"

# Create example design tokens
cat > "$VISUAL_PATH/tokens/design-tokens.json" << 'EOF'
{
  "$schema": "https://aura-frog.dev/schemas/design-tokens.json",
  "font": {
    "family": {
      "primary": "Inter",
      "secondary": "Source Code Pro"
    },
    "size": {
      "xs": "12px",
      "sm": "14px",
      "base": "16px",
      "lg": "18px",
      "xl": "20px",
      "2xl": "24px"
    },
    "weight": {
      "normal": 400,
      "medium": 500,
      "semibold": 600,
      "bold": 700
    },
    "lineHeight": {
      "tight": 1.25,
      "normal": 1.5,
      "relaxed": 1.75
    }
  },
  "color": {
    "primary": "#3B82F6",
    "secondary": "#6366F1",
    "success": "#10B981",
    "warning": "#F59E0B",
    "error": "#EF4444",
    "background": {
      "primary": "#FFFFFF",
      "secondary": "#F3F4F6",
      "tertiary": "#E5E7EB"
    },
    "text": {
      "primary": "#111827",
      "secondary": "#6B7280",
      "muted": "#9CA3AF",
      "inverse": "#FFFFFF"
    },
    "border": {
      "default": "#E5E7EB",
      "dark": "#D1D5DB"
    }
  },
  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px",
    "2xl": "48px"
  },
  "divider": {
    "color": "#E5E7EB",
    "width": "1px",
    "style": "solid"
  },
  "borderRadius": {
    "none": "0",
    "sm": "4px",
    "md": "8px",
    "lg": "12px",
    "full": "9999px"
  },
  "shadow": {
    "sm": "0 1px 2px rgba(0,0,0,0.05)",
    "md": "0 4px 6px rgba(0,0,0,0.1)",
    "lg": "0 10px 15px rgba(0,0,0,0.1)"
  }
}
EOF

echo -e "${GREEN}Created example design-tokens.json${NC}"

# Create example spec file
cat > "$VISUAL_PATH/spec/example.spec.json" << 'EOF'
{
  "$schema": "https://aura-frog.dev/schemas/design-spec.json",
  "id": "example-component",
  "viewport": {
    "width": 1280,
    "height": 720
  },
  "frozen": [
    "height",
    "font-size",
    "divider-thickness"
  ],
  "flexible": [
    "text-content",
    "responsive-width"
  ],
  "tokens": "../tokens/design-tokens.json",
  "referenceImage": "../design/example.png",
  "url": "http://localhost:3000/example",
  "renderType": "web"
}
EOF

echo -e "${GREEN}Created example.spec.json${NC}"

# Create .gitignore for snapshots
cat > "$VISUAL_PATH/snapshots/.gitignore" << 'EOF'
# Ignore current snapshots (regenerated on each test run)
current/

# Ignore diff images (regenerated on each comparison)
diff/

# Keep baseline snapshots (approved reference images)
!baseline/
EOF

echo -e "${GREEN}Created snapshots/.gitignore${NC}"

# Summary
echo ""
echo -e "${GREEN}Visual testing structure initialized successfully!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Add reference images to .claude/visual/design/"
echo "  2. Create DesignSpec files in .claude/visual/spec/"
echo "  3. Customize tokens in .claude/visual/tokens/design-tokens.json"
echo "  4. Run: npm run claude:visual-test"
echo ""
echo -e "${BLUE}See: archon-os/skills/visual-pixel-perfect/SKILL.md for full guide${NC}"
