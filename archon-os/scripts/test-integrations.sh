#!/bin/bash

# Aura Frog Integration Test Script
# Tests connections to Jira, Confluence, Slack, and Figma

set -e

echo "🧪 Aura Frog Integration Tests"
echo "=========================="
echo ""

PASSED=0
FAILED=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test Jira
echo -n "Testing Jira connection... "
if [ -z "$JIRA_URL" ] || [ -z "$JIRA_EMAIL" ] || [ -z "$JIRA_API_TOKEN" ]; then
  echo -e "${YELLOW}⚠️  SKIPPED${NC} (not configured)"
else
  if curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
    -H "Accept: application/json" \
    "$JIRA_URL/rest/api/3/myself" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PASSED${NC}"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAILED${NC}"
    echo "   Check JIRA_URL, JIRA_EMAIL, and JIRA_API_TOKEN"
    ((FAILED++))
  fi
fi

# Test Confluence
echo -n "Testing Confluence connection... "
if [ -z "$CONFLUENCE_URL" ] || [ -z "$CONFLUENCE_EMAIL" ] || [ -z "$CONFLUENCE_API_TOKEN" ]; then
  echo -e "${YELLOW}⚠️  SKIPPED${NC} (not configured)"
else
  if [ -z "$CONFLUENCE_SPACE_KEY" ]; then
    echo -e "${YELLOW}⚠️  SKIPPED${NC} (CONFLUENCE_SPACE_KEY not set)"
  else
    if curl -s -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" \
      -H "Accept: application/json" \
      "$CONFLUENCE_URL/rest/api/space/$CONFLUENCE_SPACE_KEY" > /dev/null 2>&1; then
      echo -e "${GREEN}✅ PASSED${NC}"
      ((PASSED++))
    else
      echo -e "${RED}❌ FAILED${NC}"
      echo "   Check CONFLUENCE_URL, CONFLUENCE_SPACE_KEY, and CONFLUENCE_API_TOKEN"
      ((FAILED++))
    fi
  fi
fi

# Test Slack (Webhook)
echo -n "Testing Slack webhook... "
if [ -z "$SLACK_WEBHOOK_URL" ]; then
  echo -e "${YELLOW}⚠️  SKIPPED${NC} (not configured)"
else
  RESPONSE=$(curl -s -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d '{"text":"Aura Frog integration test ✅"}')
  
  if [ "$RESPONSE" = "ok" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
    echo "   Check your Slack channel for test message"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAILED${NC}"
    echo "   Check SLACK_WEBHOOK_URL"
    ((FAILED++))
  fi
fi

# Test Slack (Bot Token)
echo -n "Testing Slack bot token... "
if [ -z "$SLACK_BOT_TOKEN" ]; then
  echo -e "${YELLOW}⚠️  SKIPPED${NC} (not configured)"
else
  if curl -s -X POST "https://slack.com/api/auth.test" \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    | grep -q '"ok":true'; then
    echo -e "${GREEN}✅ PASSED${NC}"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAILED${NC}"
    echo "   Check SLACK_BOT_TOKEN"
    ((FAILED++))
  fi
fi

# Test Figma
echo -n "Testing Figma connection... "
if [ -z "$FIGMA_API_KEY" ]; then
  echo -e "${YELLOW}⚠️  SKIPPED${NC} (not configured)"
else
  if curl -s -H "X-Figma-Token: $FIGMA_API_KEY" \
    "https://api.figma.com/v1/me" \
    | grep -q '"email"'; then
    echo -e "${GREEN}✅ PASSED${NC}"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAILED${NC}"
    echo "   Check FIGMA_API_KEY"
    ((FAILED++))
  fi
fi

# Summary
echo ""
echo "=========================="
echo "Test Summary"
echo "=========================="
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Failed: $FAILED${NC}"
else
  echo "Failed: $FAILED"
fi
echo ""

# Check environment variables
echo "Environment Variables:"
echo "----------------------"
echo "JIRA_URL:              ${JIRA_URL:-Not set}"
echo "JIRA_EMAIL:            ${JIRA_EMAIL:-Not set}"
echo "JIRA_API_TOKEN:        ${JIRA_API_TOKEN:+***configured***}"
echo "CONFLUENCE_URL:        ${CONFLUENCE_URL:-Not set}"
echo "CONFLUENCE_SPACE_KEY:  ${CONFLUENCE_SPACE_KEY:-Not set}"
echo "SLACK_WEBHOOK_URL:     ${SLACK_WEBHOOK_URL:+***configured***}"
echo "SLACK_BOT_TOKEN:       ${SLACK_BOT_TOKEN:+***configured***}"
echo "SLACK_CHANNEL_ID:      ${SLACK_CHANNEL_ID:-Not set}"
echo "FIGMA_API_KEY:    ${FIGMA_API_KEY:+***configured***}"
echo ""

# Exit with appropriate code
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}❌ Some tests failed. Please check configuration.${NC}"
  echo ""
  echo "Setup guide: docs/INTEGRATION_ENV_SETUP.md"
  exit 1
else
  if [ $PASSED -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No integrations configured.${NC}"
    echo ""
    echo "To setup integrations:"
    echo "  1. Copy template: cp .envrc.example .envrc"
    echo "  2. Fill in your values"
    echo "  3. Allow direnv: direnv allow ."
    echo "  4. Run this test again"
    echo ""
    echo "See: docs/INTEGRATION_ENV_SETUP.md"
    exit 0
  else
    echo -e "${GREEN}✅ All configured integrations working!${NC}"
    echo ""
    echo "You can now use Aura Frog with:"
    echo "  - workflow:start PROJ-1234"
    echo "  - bugfix:start PROJ-1234"
    echo "  - document feature 'Feature Name'"
    exit 0
  fi
fi

