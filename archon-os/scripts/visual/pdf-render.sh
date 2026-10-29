#!/bin/bash
#
# pdf-render.sh
# Render PDF snapshot using Puppeteer
#
# Usage: ./pdf-render.sh <url> <output-path> [config-path]
#
# Arguments:
#   url          - URL to render (can be file:// or http://)
#   output-path  - Path to save PDF (e.g., snapshots/current/report.pdf)
#   config-path  - Optional path to config.json
#
# Version: 1.0.0

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Arguments
URL="$1"
OUTPUT_PATH="$2"
CONFIG_PATH="${3:-.claude/visual/config.json}"

if [ -z "$URL" ] || [ -z "$OUTPUT_PATH" ]; then
    echo -e "${RED}Usage: ./pdf-render.sh <url> <output-path> [config-path]${NC}"
    exit 1
fi

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT_PATH")"

# Read PDF config from config.json if exists
if [ -f "$CONFIG_PATH" ]; then
    FORMAT=$(jq -r '.render.pdf.format // "A4"' "$CONFIG_PATH")
    PRINT_BG=$(jq -r '.render.pdf.printBackground // true' "$CONFIG_PATH")
    MARGIN_TOP=$(jq -r '.render.pdf.margin.top // "24mm"' "$CONFIG_PATH")
    MARGIN_RIGHT=$(jq -r '.render.pdf.margin.right // "24mm"' "$CONFIG_PATH")
    MARGIN_BOTTOM=$(jq -r '.render.pdf.margin.bottom // "24mm"' "$CONFIG_PATH")
    MARGIN_LEFT=$(jq -r '.render.pdf.margin.left // "24mm"' "$CONFIG_PATH")
else
    FORMAT="A4"
    PRINT_BG="true"
    MARGIN_TOP="24mm"
    MARGIN_RIGHT="24mm"
    MARGIN_BOTTOM="24mm"
    MARGIN_LEFT="24mm"
fi

echo -e "${YELLOW}Rendering PDF...${NC}"
echo "  URL: $URL"
echo "  Output: $OUTPUT_PATH"
echo "  Format: $FORMAT"

# Create temporary Node.js script for Puppeteer
TEMP_SCRIPT=$(mktemp /tmp/pdf-render-XXXXXX.js)

cat > "$TEMP_SCRIPT" << NODESCRIPT
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Disable animations
  await page.addStyleTag({
    content: \`
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
    \`
  });

  await page.goto('${URL}', {
    waitUntil: 'networkidle0',
    timeout: 30000
  });

  // Wait for fonts to load
  await page.evaluateHandle('document.fonts.ready');

  await page.pdf({
    path: '${OUTPUT_PATH}',
    format: '${FORMAT}',
    printBackground: ${PRINT_BG},
    margin: {
      top: '${MARGIN_TOP}',
      right: '${MARGIN_RIGHT}',
      bottom: '${MARGIN_BOTTOM}',
      left: '${MARGIN_LEFT}'
    }
  });

  await browser.close();

  console.log('PDF rendered successfully');
})();
NODESCRIPT

# Run Puppeteer script
node "$TEMP_SCRIPT"
RESULT=$?

# Cleanup
rm -f "$TEMP_SCRIPT"

if [ $RESULT -eq 0 ]; then
    echo -e "${GREEN}PDF saved to: $OUTPUT_PATH${NC}"

    # Convert PDF to PNG for comparison (first page)
    PNG_OUTPUT="${OUTPUT_PATH%.pdf}.png"
    if command -v pdftoppm &> /dev/null; then
        pdftoppm -png -singlefile "$OUTPUT_PATH" "${PNG_OUTPUT%.png}"
        echo -e "${GREEN}PNG preview: $PNG_OUTPUT${NC}"
    elif command -v magick &> /dev/null; then
        magick -density 150 "$OUTPUT_PATH[0]" "$PNG_OUTPUT"
        echo -e "${GREEN}PNG preview: $PNG_OUTPUT${NC}"
    else
        echo -e "${YELLOW}Note: Install pdftoppm or ImageMagick for PNG preview${NC}"
    fi
else
    echo -e "${RED}PDF rendering failed${NC}"
    exit 1
fi
