#!/usr/bin/env bash
# gen-plugin-readme.sh — derive archon-os/README.md from the root README.md.
#
# Two READMEs render in different places: the root one on GitHub (where relative
# links resolve) and the plugin payload's one on npm and in the Claude Code
# plugin browser (where they do not). They had drifted four minor versions apart
# because both were hand-maintained, so the plugin README was still advertising
# v3.7.4 while the root had moved to v4.
#
# This makes the root README the single source and rewrites every repo-relative
# link and image into an absolute github.com / raw.githubusercontent.com URL.
#
# Usage: bash scripts/gen-plugin-readme.sh [--check]
#   --check  exit 1 if the generated output differs from what is on disk (CI)

set -euo pipefail

REPO_SLUG="nguyenthienthanh/archon"
BRANCH="main"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/README.md"
DEST="$ROOT/archon-os/README.md"

generate() {
  python3 - "$SRC" "$REPO_SLUG" "$BRANCH" <<'PY'
import re, sys

src, slug, branch = sys.argv[1], sys.argv[2], sys.argv[3]
blob = f'https://github.com/{slug}/blob/{branch}/'
raw  = f'https://raw.githubusercontent.com/{slug}/{branch}/'

text = open(src).read()

# Images must be raw; <picture>/<source> does not survive npm's renderer, so the
# light banner is used unconditionally there.
text = re.sub(r'<picture>.*?</picture>',
              f'<img alt="Archon OS — a planning-first LLM operating system for software engineering" '
              f'src="{raw}assets/brand/banner-light.png" width="860">',
              text, flags=re.S)
text = re.sub(r'(<img[^>]*\bsrc=")(?!https?:)([^"]+)(")', lambda m: m.group(1) + raw + m.group(2) + m.group(3), text)

def md_link(m):
    target = m.group(1)
    if target.startswith(('http', 'mailto:', '#')):
        return m.group(0)
    base = raw if target.endswith(('.png', '.svg', '.jpg', '.jpeg', '.gif', '.webp')) else blob
    return f']({base}{target})'

text = re.sub(r'\]\(([^)]+)\)', md_link, text)

header = (
    '<!-- GENERATED FILE — do not edit.\n'
    '     Source: README.md at the repository root.\n'
    '     Regenerate: bash scripts/gen-plugin-readme.sh\n'
    '     Repo-relative links are rewritten to absolute URLs because this file renders on\n'
    '     npm and in the Claude Code plugin browser, where relative paths do not resolve. -->\n\n'
)
sys.stdout.write(header + text)
PY
}

if [ "${1:-}" = "--check" ]; then
  if ! diff -q <(generate) "$DEST" >/dev/null 2>&1; then
    echo "archon-os/README.md is out of date — run: bash scripts/gen-plugin-readme.sh" >&2
    exit 1
  fi
  echo "archon-os/README.md is in sync with README.md"
  exit 0
fi

generate > "$DEST"
echo "Wrote $DEST ($(grep -c '' "$DEST") lines) from README.md"
