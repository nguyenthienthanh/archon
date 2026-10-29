#!/bin/bash

# Archon OS Integration Setup Script
# Interactive setup for Jira, Confluence, Slack, and Figma integrations

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
CLAUDE_DIR="."
ENVRC_FILE="$CLAUDE_DIR/.envrc"
ENVRC_TEMPLATE="$CLAUDE_DIR/.envrc.template"
PROJECT_ENVRC=".envrc"
GITIGNORE="$CLAUDE_DIR/.gitignore"

echo -e "${BLUE}🚀 Archon OS Integration Setup${NC}"
echo "======================================"
echo ""

# Phase 1: Prerequisites Check
echo -e "${BLUE}Phase 1: Checking Prerequisites...${NC}"
echo ""

# Check shell
CURRENT_SHELL=$(basename "$SHELL")
echo -e "✅ Shell: ${GREEN}$CURRENT_SHELL${NC}"

# Check direnv
if command -v direnv &> /dev/null; then
  echo -e "✅ direnv: ${GREEN}Installed${NC}"
  DIRENV_INSTALLED=true
else
  echo -e "❌ direnv: ${RED}Not installed${NC}"
  DIRENV_INSTALLED=false
fi

# Check existing .envrc
if [ -f "$ENVRC_FILE" ]; then
  echo -e "⚠️  .envrc: ${YELLOW}Already exists${NC}"
  read -p "Overwrite existing configuration? (yes/no): " OVERWRITE
  if [ "$OVERWRITE" != "yes" ]; then
    echo "Setup cancelled."
    exit 0
  fi
else
  echo -e "ℹ️  .envrc: ${BLUE}Not found (will create)${NC}"
fi

echo ""

# Phase 2: Install direnv (if needed)
if [ "$DIRENV_INSTALLED" = false ]; then
  echo -e "${BLUE}Phase 2: Install direnv${NC}"
  echo ""
  echo "direnv allows automatic loading of environment variables"
  echo "when you enter the project directory."
  echo ""
  read -p "Install direnv? (yes/skip): " INSTALL_DIRENV
  
  if [ "$INSTALL_DIRENV" = "yes" ]; then
    echo ""
    echo "Installing direnv..."
    
    # Detect OS and install
    if [[ "$OSTYPE" == "darwin"* ]]; then
      # macOS
      if command -v brew &> /dev/null; then
        brew install direnv
      else
        echo -e "${RED}Error: Homebrew not found. Please install Homebrew first.${NC}"
        exit 1
      fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
      # Linux
      if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y direnv
      elif command -v pacman &> /dev/null; then
        sudo pacman -S direnv
      elif command -v yum &> /dev/null; then
        sudo yum install -y direnv
      else
        echo -e "${RED}Error: Package manager not found${NC}"
        exit 1
      fi
    else
      echo -e "${RED}Error: Unsupported OS${NC}"
      exit 1
    fi
    
    echo -e "${GREEN}✅ direnv installed${NC}"
    
    # Add hook to shell config
    echo ""
    echo "Adding direnv hook to shell config..."
    
    if [ "$CURRENT_SHELL" = "zsh" ]; then
      SHELL_RC="$HOME/.zshrc"
      HOOK_CMD='eval "$(direnv hook zsh)"'
    elif [ "$CURRENT_SHELL" = "bash" ]; then
      SHELL_RC="$HOME/.bashrc"
      HOOK_CMD='eval "$(direnv hook bash)"'
    else
      echo -e "${YELLOW}Warning: Unknown shell. Please add direnv hook manually.${NC}"
      SHELL_RC=""
    fi
    
    if [ -n "$SHELL_RC" ]; then
      if ! grep -q "direnv hook" "$SHELL_RC"; then
        echo "$HOOK_CMD" >> "$SHELL_RC"
        echo -e "${GREEN}✅ direnv hook added to $SHELL_RC${NC}"
      else
        echo -e "${YELLOW}ℹ️  direnv hook already in $SHELL_RC${NC}"
      fi
    fi
    
    # Reload shell config
    if [ -n "$SHELL_RC" ]; then
      source "$SHELL_RC"
    fi
  else
    echo "Skipping direnv installation."
    echo -e "${YELLOW}Note: You'll need to install direnv manually for auto-loading.${NC}"
  fi
else
  echo -e "${GREEN}Phase 2: direnv already installed ✅${NC}"
fi

echo ""

# Phase 3: Interactive Configuration
echo -e "${BLUE}Phase 3: Configure Integrations${NC}"
echo ""
echo "I'll guide you through setting up each integration."
echo "You can skip any integration by typing 'skip'."
echo ""
read -p "Press Enter to continue..."
echo ""

# Initialize variables
JIRA_URL=""
JIRA_EMAIL=""
JIRA_API_TOKEN=""
JIRA_PROJECT_KEY=""
CONFLUENCE_URL=""
CONFLUENCE_EMAIL=""
CONFLUENCE_API_TOKEN=""
CONFLUENCE_SPACE_KEY=""
SLACK_BOT_TOKEN=""
SLACK_CHANNEL_ID=""
SLACK_WEBHOOK_URL=""
FIGMA_API_KEY=""
FIGMA_FILE_KEY=""

# 3.1: Jira Configuration
echo -e "${BLUE}### Jira Integration${NC}"
echo ""
read -p "Configure Jira? (yes/skip): " SETUP_JIRA

if [ "$SETUP_JIRA" = "yes" ]; then
  read -p "Jira URL (e.g., https://company.atlassian.net): " JIRA_URL
  read -p "Jira Email: " JIRA_EMAIL
  read -sp "Jira API Token (hidden): " JIRA_API_TOKEN
  echo ""
  read -p "Jira Project Key (e.g., PROJ, PROJ): " JIRA_PROJECT_KEY
  echo -e "${GREEN}✅ Jira configured!${NC}"
else
  echo "Skipping Jira configuration."
fi
echo ""

# 3.2: Confluence Configuration
echo -e "${BLUE}### Confluence Integration${NC}"
echo ""

if [ -n "$JIRA_URL" ]; then
  read -p "Use same credentials as Jira? (yes/no/skip): " USE_JIRA_CREDS
  if [ "$USE_JIRA_CREDS" = "yes" ]; then
    CONFLUENCE_URL="${JIRA_URL}/wiki"
    CONFLUENCE_EMAIL="$JIRA_EMAIL"
    CONFLUENCE_API_TOKEN="$JIRA_API_TOKEN"
    read -p "Confluence Space Key (e.g., TECH): " CONFLUENCE_SPACE_KEY
    echo -e "${GREEN}✅ Confluence configured!${NC}"
  elif [ "$USE_JIRA_CREDS" = "skip" ]; then
    echo "Skipping Confluence configuration."
  else
    read -p "Confluence URL: " CONFLUENCE_URL
    read -p "Confluence Email: " CONFLUENCE_EMAIL
    read -sp "Confluence API Token (hidden): " CONFLUENCE_API_TOKEN
    echo ""
    read -p "Confluence Space Key: " CONFLUENCE_SPACE_KEY
    echo -e "${GREEN}✅ Confluence configured!${NC}"
  fi
else
  read -p "Configure Confluence? (yes/skip): " SETUP_CONFLUENCE
  if [ "$SETUP_CONFLUENCE" = "yes" ]; then
    read -p "Confluence URL: " CONFLUENCE_URL
    read -p "Confluence Email: " CONFLUENCE_EMAIL
    read -sp "Confluence API Token (hidden): " CONFLUENCE_API_TOKEN
    echo ""
    read -p "Confluence Space Key: " CONFLUENCE_SPACE_KEY
    echo -e "${GREEN}✅ Confluence configured!${NC}"
  else
    echo "Skipping Confluence configuration."
  fi
fi
echo ""

# 3.3: Slack Configuration
echo -e "${BLUE}### Slack Integration${NC}"
echo ""
echo "Choose setup method:"
echo "1. Bot Token (recommended - more features)"
echo "2. Webhook URL (simpler - notifications only)"
echo "3. Skip"
read -p "Choice (1/2/3): " SLACK_CHOICE

if [ "$SLACK_CHOICE" = "1" ]; then
  read -sp "Slack Bot Token (starts with xoxb-): " SLACK_BOT_TOKEN
  echo ""
  read -p "Slack Channel ID (e.g., C1234567890): " SLACK_CHANNEL_ID
  echo -e "${GREEN}✅ Slack configured with bot token!${NC}"
elif [ "$SLACK_CHOICE" = "2" ]; then
  read -sp "Slack Webhook URL: " SLACK_WEBHOOK_URL
  echo ""
  echo -e "${GREEN}✅ Slack configured with webhook!${NC}"
else
  echo "Skipping Slack configuration."
fi
echo ""

# 3.4: Figma Configuration
echo -e "${BLUE}### Figma Integration${NC}"
echo ""
read -p "Configure Figma? (yes/skip): " SETUP_FIGMA

if [ "$SETUP_FIGMA" = "yes" ]; then
  read -sp "Figma Personal Access Token (starts with figd_): " FIGMA_API_KEY
  echo ""
  read -p "Default Figma File Key (optional, press Enter to skip): " FIGMA_FILE_KEY
  echo -e "${GREEN}✅ Figma configured!${NC}"
else
  echo "Skipping Figma configuration."
fi
echo ""

# Phase 4: Generate .envrc
echo -e "${BLUE}Phase 4: Generating configuration file...${NC}"
echo ""

# Create .envrc file
cat > "$ENVRC_FILE" << EOF
# .envrc - Archon OS Integration Configuration
# Auto-generated by setup:integrations
# Date: $(date +%Y-%m-%d)
# DO NOT COMMIT THIS FILE

# ============================================
# Jira Integration
# ============================================
export JIRA_BASE_URL="$JIRA_URL"
export JIRA_URL="$JIRA_URL"
export JIRA_EMAIL="$JIRA_EMAIL"
export JIRA_API_TOKEN="$JIRA_API_TOKEN"
export JIRA_PROJECT_KEY="$JIRA_PROJECT_KEY"
export JIRA_DEFAULT_PRIORITY="Medium"

# ============================================
# Confluence Integration
# ============================================
export CONFLUENCE_BASE_URL="$CONFLUENCE_URL"
export CONFLUENCE_URL="$CONFLUENCE_URL"
export CONFLUENCE_EMAIL="$CONFLUENCE_EMAIL"
export CONFLUENCE_API_TOKEN="$CONFLUENCE_API_TOKEN"
export CONFLUENCE_SPACE_KEY="$CONFLUENCE_SPACE_KEY"
export CONFLUENCE_DEFAULT_LABELS="aura-frog,generated,documentation"

# ============================================
# Slack Integration
# ============================================
export SLACK_BOT_TOKEN="$SLACK_BOT_TOKEN"
export SLACK_CHANNEL_ID="$SLACK_CHANNEL_ID"
export SLACK_WEBHOOK_URL="$SLACK_WEBHOOK_URL"
export SLACK_MENTION_DEV="@developer-team"
export SLACK_MENTION_QA="@qa-team"
export SLACK_MENTION_PM="@pm-team"

# ============================================
# Figma Integration
# ============================================
export FIGMA_API_TOKEN="$FIGMA_API_KEY"
export FIGMA_API_KEY="$FIGMA_API_KEY"
export FIGMA_FILE_KEY="$FIGMA_FILE_KEY"
export FIGMA_MCP_ENABLED="true"

# ============================================
# Archon OS Configuration
# ============================================
export AURA_FROG_AUTO_APPROVE="true"
export AURA_FROG_DEFAULT_COVERAGE="80"
export AURA_FROG_TDD_ENFORCE="true"
export AURA_FROG_AUTO_NOTIFY="true"
export AURA_FROG_TOKEN_WARNING="150000"
EOF

echo -e "${GREEN}✅ Configuration file created: $ENVRC_FILE${NC}"

# Update .gitignore
if [ ! -f "$GITIGNORE" ]; then
  touch "$GITIGNORE"
fi

if ! grep -q "^.envrc$" "$GITIGNORE"; then
  echo ".envrc" >> "$GITIGNORE"
  echo ".envrc.local" >> "$GITIGNORE"
  echo "*.env" >> "$GITIGNORE"
  echo -e "${GREEN}✅ Updated $GITIGNORE${NC}"
fi

echo ""

# Phase 5: Verify environment configuration
echo -e "${BLUE}Phase 5: Verifying environment configuration...${NC}"
echo ""

if [ "$PROJECT_ENVRC" != "$ENVRC_FILE" ] && [ -f "$PROJECT_ENVRC" ]; then
  CCPM_LOADER="
# Archon OS Integration (auto-generated)
if [ -f \"$ENVRC_FILE\" ]; then
  source_env \"$ENVRC_FILE\"
fi"
  if ! grep -q "source_env \"$ENVRC_FILE\"" "$PROJECT_ENVRC"; then
    echo "$CCPM_LOADER" >> "$PROJECT_ENVRC"
    echo -e "${GREEN}✅ Updated $PROJECT_ENVRC to load Archon OS config${NC}"
  else
    echo -e "${YELLOW}ℹ️  $PROJECT_ENVRC already loads Archon OS config${NC}"
  fi
else
  echo -e "${GREEN}✅ $ENVRC_FILE is ready and self-contained.${NC}"
fi

echo ""

# Phase 6: Allow direnv
echo -e "${BLUE}Phase 6: Allowing direnv...${NC}"
echo ""

if command -v direnv &> /dev/null; then
  direnv allow .
  echo -e "${GREEN}✅ direnv allowed${NC}"
  echo ""
  echo "Reloading environment variables..."
  eval "$(direnv export $CURRENT_SHELL)"
  echo -e "${GREEN}✅ Environment variables loaded${NC}"
else
  echo -e "${YELLOW}⚠️  direnv not found. Variables won't auto-load.${NC}"
  echo "To load manually, run: source .envrc"
fi

echo ""

# Phase 7: Test Integrations
echo -e "${BLUE}Phase 7: Testing Integrations...${NC}"
echo ""

if [ -f "scripts/test-integrations.sh" ]; then
  bash scripts/test-integrations.sh
else
  echo -e "${YELLOW}⚠️  Test script not found. Skipping integration tests.${NC}"
fi

echo ""

# Phase 8: Summary
echo -e "${GREEN}======================================"
echo "✅ Setup Complete!"
echo "======================================${NC}"
echo ""
echo "Configuration saved to:"
echo "  - ${BLUE}$ENVRC_FILE${NC} (secrets - git-ignored)"
echo "  - ${BLUE}$PROJECT_ENVRC${NC} (loader - can commit)"
echo ""
echo "Configured integrations:"
[ -n "$JIRA_URL" ] && echo "  ✅ Jira ($JIRA_PROJECT_KEY)"
[ -n "$CONFLUENCE_URL" ] && echo "  ✅ Confluence ($CONFLUENCE_SPACE_KEY)"
[ -n "$SLACK_BOT_TOKEN" ] || [ -n "$SLACK_WEBHOOK_URL" ] && echo "  ✅ Slack"
[ -n "$FIGMA_API_KEY" ] && echo "  ✅ Figma"
echo ""
echo "Next steps:"
echo "  1. Restart your terminal or run: source ~/.${CURRENT_SHELL}rc"
echo "  2. Try: ${BLUE}workflow:start PROJ-1234${NC}"
echo "  3. Try: ${BLUE}bugfix \"Bug description\"${NC}"
echo ""
echo "🎉 You're ready to use Archon OS with integrations!"

