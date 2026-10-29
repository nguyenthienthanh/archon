#!/usr/bin/env bash
# Regenerate every derived raster in assets/brand/ from the SVG sources.
#
# The PNGs are DERIVED. Edit the .svg files, run this, commit both. A PNG that
# was touched by hand is a second source of truth for the brand, and the next
# person to run this will silently revert it.
#
# Requires Google Chrome (headless screenshot). No npm install, no native deps.
set -euo pipefail
cd "$(dirname "$0")"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "✗ Chrome not found at $CHROME — needed to rasterise SVG." >&2; exit 1; }

render() { # render <svg> <out.png> <css-width> <css-height> <scale>
  local svg="$1" out="$2" w="$3" h="$4" scale="${5:-1}"
  local html; html="$(mktemp /tmp/archon-brand-XXXXXX.html)"
  cat > "$html" <<HEOF
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent;width:${w}px;height:${h}px;overflow:hidden}
img{display:block;width:${w}px;height:${h}px}</style>
<img src="file://$(pwd)/${svg}">
HEOF
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --default-background-color=00000000 \
    --force-device-scale-factor="$scale" \
    --window-size="${w},${h}" --screenshot="$out" "file://$html" >/dev/null 2>&1
  rm -f "$html"
  [ -f "$out" ] || { echo "✗ failed: $out" >&2; exit 1; }
  printf '  %-24s %s\n' "$(basename "$out")" "$(du -h "$out" | cut -f1)"
}

echo "Rendering brand rasters…"
render banner-light.svg banner-light.png 1280 400 2
render banner-dark.svg  banner-dark.png  1280 400 2
render og-image.svg     og-image.png     1200 630 1
render icon.svg         favicon-32.png      32  32 1
render icon.svg         apple-touch-icon.png 180 180 1
echo "✓ done — these are derived files; edit the .svg sources instead."
