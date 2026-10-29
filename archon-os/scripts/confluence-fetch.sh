#!/bin/bash
# Confluence Page Fetcher - TOON Format Output
# Usage: ./scripts/confluence-fetch.sh <PAGE_ID> [--verbose]
#    or: ./scripts/confluence-fetch.sh --space <SPACE_KEY> --title "Page Title" [--verbose]
# Requires: CONFLUENCE_BASE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN in environment

set -e

PAGE_ID=""
SPACE_KEY=""
PAGE_TITLE=""
VERBOSE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --space|-s)
      SPACE_KEY="$2"
      shift 2
      ;;
    --title|-t)
      PAGE_TITLE="$2"
      shift 2
      ;;
    --verbose|-v)
      VERBOSE="true"
      shift
      ;;
    --help|-h)
      echo "Confluence Page Fetcher - TOON Format Output"
      echo ""
      echo "Usage:"
      echo "  $0 <PAGE_ID> [--verbose]"
      echo "  $0 --space <SPACE_KEY> --title \"Page Title\" [--verbose]"
      echo ""
      echo "Options:"
      echo "  --space, -s    Space key (e.g., PROJ, DEV)"
      echo "  --title, -t    Page title (use quotes for spaces)"
      echo "  --verbose, -v  Include child pages and comments"
      echo "  --help, -h     Show this help"
      echo ""
      echo "Required environment variables:"
      echo "  CONFLUENCE_BASE_URL  - Your Confluence base URL (e.g., https://company.atlassian.net/wiki)"
      echo "  CONFLUENCE_EMAIL     - Your Confluence account email"
      echo "  CONFLUENCE_API_TOKEN - API token from https://id.atlassian.com/manage-profile/security/api-tokens"
      echo ""
      echo "Examples:"
      echo "  $0 123456789                           # Fetch by page ID"
      echo "  $0 --space PROJ --title \"API Docs\"     # Fetch by space and title"
      echo "  $0 123456789 --verbose                 # Include children and comments"
      exit 0
      ;;
    *)
      if [ -z "$PAGE_ID" ] && [[ ! "$1" == -* ]]; then
        PAGE_ID="$1"
      fi
      shift
      ;;
  esac
done

# Validate input
if [ -z "$PAGE_ID" ] && ([ -z "$SPACE_KEY" ] || [ -z "$PAGE_TITLE" ]); then
  echo "Error: Provide either PAGE_ID or both --space and --title"
  echo "Use --help for usage information"
  exit 1
fi

# Check required env vars (use JIRA credentials as fallback for Atlassian Cloud)
CONFLUENCE_BASE_URL="${CONFLUENCE_BASE_URL:-${JIRA_BASE_URL}/wiki}"
CONFLUENCE_EMAIL="${CONFLUENCE_EMAIL:-$JIRA_EMAIL}"
CONFLUENCE_API_TOKEN="${CONFLUENCE_API_TOKEN:-$JIRA_API_TOKEN}"

if [ -z "$CONFLUENCE_BASE_URL" ]; then
  echo "Error: CONFLUENCE_BASE_URL not set"
  exit 1
fi

if [ -z "$CONFLUENCE_EMAIL" ]; then
  echo "Error: CONFLUENCE_EMAIL not set"
  exit 1
fi

if [ -z "$CONFLUENCE_API_TOKEN" ]; then
  echo "Error: CONFLUENCE_API_TOKEN not set"
  exit 1
fi

# Remove trailing /wiki if present (we'll add it in API calls)
CONFLUENCE_BASE_URL="${CONFLUENCE_BASE_URL%/wiki}"

# If searching by space and title, find the page ID first
if [ -n "$SPACE_KEY" ] && [ -n "$PAGE_TITLE" ]; then
  ENCODED_TITLE=$(echo "$PAGE_TITLE" | jq -sRr @uri)
  SEARCH_RESPONSE=$(curl -s -u "${CONFLUENCE_EMAIL}:${CONFLUENCE_API_TOKEN}" \
    -H "Accept: application/json" \
    "${CONFLUENCE_BASE_URL}/wiki/rest/api/content?spaceKey=${SPACE_KEY}&title=${ENCODED_TITLE}&expand=version")

  PAGE_ID=$(echo "$SEARCH_RESPONSE" | jq -r '.results[0].id // empty')

  if [ -z "$PAGE_ID" ]; then
    echo "Error: Page not found in space '${SPACE_KEY}' with title '${PAGE_TITLE}'"
    exit 1
  fi
fi

# Fetch page content
RESPONSE=$(curl -s -u "${CONFLUENCE_EMAIL}:${CONFLUENCE_API_TOKEN}" \
  -H "Accept: application/json" \
  "${CONFLUENCE_BASE_URL}/wiki/rest/api/content/${PAGE_ID}?expand=body.storage,version,space,ancestors,children.page,metadata.labels")

# Check for errors
if echo "$RESPONSE" | jq -e '.statusCode >= 400' > /dev/null 2>&1; then
  echo "Error fetching page:"
  echo "$RESPONSE" | jq -r '.message // .errorMessage // "Unknown error"' 2>/dev/null
  exit 1
fi

if [ "$(echo "$RESPONSE" | jq -r '.id // empty')" = "" ]; then
  echo "Error: Page not found or empty response"
  exit 1
fi

# Parse fields
TITLE=$(echo "$RESPONSE" | jq -r '.title // "N/A"')
SPACE_NAME=$(echo "$RESPONSE" | jq -r '.space.name // "N/A"')
SPACE_KEY=$(echo "$RESPONSE" | jq -r '.space.key // "N/A"')
PAGE_TYPE=$(echo "$RESPONSE" | jq -r '.type // "page"')
VERSION=$(echo "$RESPONSE" | jq -r '.version.number // 1')
AUTHOR=$(echo "$RESPONSE" | jq -r '.version.by.displayName // "N/A"')
CREATED=$(echo "$RESPONSE" | jq -r '.version.when | split("T")[0] // "N/A"')
STATUS=$(echo "$RESPONSE" | jq -r '.status // "current"')

# Get labels
LABELS=$(echo "$RESPONSE" | jq -r '[.metadata.labels.results[]?.name] | join(";") // ""')

# Get ancestors (breadcrumb)
ANCESTORS=$(echo "$RESPONSE" | jq -r '[.ancestors[]? | .title] | join(" > ") // ""')

# Output TOON format
echo "# ${TITLE}"
echo ""
echo '```toon'
echo "page[1]{id,title,type,status,version}:"
echo "  ${PAGE_ID},${TITLE},${PAGE_TYPE},${STATUS},${VERSION}"
echo ""
echo "space[1]{key,name}:"
echo "  ${SPACE_KEY},${SPACE_NAME}"
echo ""
echo "metadata[1]{author,updated}:"
echo "  ${AUTHOR},${CREATED}"

# Labels
if [ -n "$LABELS" ]; then
  LABEL_COUNT=$(echo "$LABELS" | tr ';' '\n' | wc -l | tr -d ' ')
  echo ""
  echo "labels[${LABEL_COUNT}]: ${LABELS}"
fi

# Ancestors (breadcrumb path)
if [ -n "$ANCESTORS" ]; then
  echo ""
  echo "path: ${ANCESTORS}"
fi

# Child pages
CHILD_COUNT=$(echo "$RESPONSE" | jq -r '.children.page.results | length // 0')
if [ "$CHILD_COUNT" -gt 0 ]; then
  echo ""
  echo "children[${CHILD_COUNT}]{id,title}:"
  echo "$RESPONSE" | jq -r '.children.page.results[]? | "  " + .id + "," + .title'
fi

echo '```'

# Content
echo ""
echo "## Content"
echo ""

# Extract and convert HTML content to readable text
BODY=$(echo "$RESPONSE" | jq -r '.body.storage.value // ""')
if [ -n "$BODY" ] && [ "$BODY" != "null" ]; then
  # Convert HTML to readable text (basic conversion)
  echo "$BODY" | \
    sed 's/<h1[^>]*>/\n# /g; s/<\/h1>/\n/g' | \
    sed 's/<h2[^>]*>/\n## /g; s/<\/h2>/\n/g' | \
    sed 's/<h3[^>]*>/\n### /g; s/<\/h3>/\n/g' | \
    sed 's/<h4[^>]*>/\n#### /g; s/<\/h4>/\n/g' | \
    sed 's/<p[^>]*>/\n/g; s/<\/p>/\n/g' | \
    sed 's/<br[^>]*>/\n/g' | \
    sed 's/<li[^>]*>/- /g; s/<\/li>/\n/g' | \
    sed 's/<ul[^>]*>//g; s/<\/ul>/\n/g' | \
    sed 's/<ol[^>]*>//g; s/<\/ol>/\n/g' | \
    sed 's/<strong[^>]*>/**/g; s/<\/strong>/**/g' | \
    sed 's/<b[^>]*>/**/g; s/<\/b>/**/g' | \
    sed 's/<em[^>]*>/*/g; s/<\/em>/*/g' | \
    sed 's/<i[^>]*>/*/g; s/<\/i>/*/g' | \
    sed 's/<code[^>]*>/`/g; s/<\/code>/`/g' | \
    sed 's/<pre[^>]*>/```\n/g; s/<\/pre>/\n```/g' | \
    sed 's/<a[^>]*href="\([^"]*\)"[^>]*>\([^<]*\)<\/a>/[\2](\1)/g' | \
    sed 's/<[^>]*>//g' | \
    sed 's/&nbsp;/ /g; s/&amp;/\&/g; s/&lt;/</g; s/&gt;/>/g; s/&quot;/"/g' | \
    sed '/^$/N;/^\n$/d' | \
    head -200
else
  echo "(No content)"
fi

# Verbose: Fetch comments
if [ "$VERBOSE" = "true" ]; then
  COMMENTS_RESPONSE=$(curl -s -u "${CONFLUENCE_EMAIL}:${CONFLUENCE_API_TOKEN}" \
    -H "Accept: application/json" \
    "${CONFLUENCE_BASE_URL}/wiki/rest/api/content/${PAGE_ID}/child/comment?expand=body.storage,version")

  COMMENT_COUNT=$(echo "$COMMENTS_RESPONSE" | jq -r '.results | length // 0')
  if [ "$COMMENT_COUNT" -gt 0 ]; then
    echo ""
    echo "## Comments"
    echo ""
    echo '```toon'
    echo "comments[${COMMENT_COUNT}]{author,date,body}:"
    echo "$COMMENTS_RESPONSE" | jq -r '.results[]? |
      "  " + .version.by.displayName + "," + (.version.when | split("T")[0]) + "," + (.body.storage.value | gsub("<[^>]*>"; "") | gsub(","; ";") | gsub("\n"; " ") | .[0:100])'
    echo '```'
  fi
fi

echo ""
echo "---"
echo "**URL:** ${CONFLUENCE_BASE_URL}/wiki/spaces/${SPACE_KEY}/pages/${PAGE_ID}"
echo "**Fetched:** $(date '+%Y-%m-%d %H:%M:%S')"
