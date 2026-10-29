#!/bin/bash
set -euo pipefail

# =============================================================================
# release.sh — one command for a complete, no-step-missed version bump
# =============================================================================
# A version bump is NOT just editing plugin.json — it must also stamp the
# CHANGELOG, tag the commit, and cut a GitHub release. Doing it by hand skipped
# the tag+release for alpha.3–alpha.8. This script makes the whole flow one
# command so nothing is forgotten.
#
# Two phases (run `prepare` first, merge to main, then `publish`):
#
#   bash scripts/release.sh prepare <version> "<changelog title>"
#       Bumps every canonical version location, stamps the CHANGELOG
#       [Unreleased] section as the new version, runs the CI gates, and prints
#       a diff. Does NOT commit — you review, commit, PR, and merge.
#
#   bash scripts/release.sh publish <version>
#       Run on main AFTER the prepare commit has merged. Creates the annotated
#       git tag v<version>, pushes it, and cuts a GitHub release (marked
#       Pre-release when the version has a -alpha/-beta/-rc suffix), with notes
#       pulled from the CHANGELOG section for that version.
#
# Canonical version locations (edited by `prepare`, historical refs untouched):
#   - .claude-plugin/plugin.json           "version"
#   - .claude-plugin/marketplace.json      "version" (x2)   [repo root]
#   - package.json                         "version"        [npm publish đọc file này]
#   - CLAUDE.md                            header / 8-Pillars / footer
#   - docs/**/*.md                         last_aligned_with: frontmatter
#   - docs/reference/CHANGELOG.md          [Unreleased] -> [version] stamp
# =============================================================================

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
die() { echo -e "${RED}${BOLD}✗ $*${NC}" >&2; exit 1; }
info() { echo -e "${CYAN}$*${NC}"; }
ok() { echo -e "${GREEN}✓ $*${NC}"; }

# Resolve dirs. SCRIPT_DIR=archon-os/scripts ; BASE_DIR=<repo>/archon-os ; REPO_ROOT=<repo>
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$BASE_DIR/.." && pwd)"

PLUGIN_JSON="$BASE_DIR/.claude-plugin/plugin.json"
MARKETPLACE_JSON="$REPO_ROOT/.claude-plugin/marketplace.json"
PKG_JSON="$BASE_DIR/package.json"
CLAUDE_MD="$BASE_DIR/CLAUDE.md"
CHANGELOG="$REPO_ROOT/docs/reference/CHANGELOG.md"

# semver-ish: MAJOR.MINOR.PATCH with optional -prerelease (alpha.N / beta.N / rc.N)
VERSION_RE='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'

current_version() {
  grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "$PLUGIN_JSON" | head -1 | grep -oE '[0-9][^"]+'
}

# perl in-place edit — consistent across BSD (macOS) and GNU (CI) sed differences.
subst() { # subst <file> <perl-regex-with-QE>
  perl -0777 -i -pe "$2" "$1"
}

cmd_prepare() {
  local NEW="${1:-}" TITLE="${2:-}"
  [ -n "$NEW" ] || die "usage: release.sh prepare <version> \"<changelog title>\""
  [ -n "$TITLE" ] || die "a CHANGELOG title is required (e.g. \"Hook runtime hardening\")"
  [[ "$NEW" =~ $VERSION_RE ]] || die "version '$NEW' is not MAJOR.MINOR.PATCH[-prerelease]"

  local OLD; OLD="$(current_version)"
  [ -n "$OLD" ] || die "could not read current version from $PLUGIN_JSON"
  [ "$OLD" != "$NEW" ] || die "version is already $NEW"
  local DATE; DATE="$(date +%Y-%m-%d)"

  info "Bumping ${BOLD}$OLD${NC}${CYAN} → ${BOLD}$NEW${NC}${CYAN} (${DATE})"

  # 1) plugin.json + marketplace.json — the "version" fields only.
  subst "$PLUGIN_JSON"      "s/(\"version\"\s*:\s*\")\Q$OLD\E(\")/\${1}$NEW\${2}/g"
  subst "$MARKETPLACE_JSON" "s/(\"version\"\s*:\s*\")\Q$OLD\E(\")/\${1}$NEW\${2}/g"
  # package.json — file mà `npm publish` đọc version từ đó. Trước v3.8.0-alpha.13 nó
  # KHÔNG nằm trong danh sách canonical nào (cả release.sh lẫn sync-version.sh), nên
  # mỗi lần phát hành phải nhớ sửa tay; quên là npm lệch khỏi plugin.json.
  subst "$PKG_JSON"         "s/(\"version\"\s*:\s*\")\Q$OLD\E(\")/\${1}$NEW\${2}/g"

  # 2) CLAUDE.md — every current-version ref (header, 8-Pillars, footer). No
  #    historical version strings live in this file, so a scoped replace is safe.
  subst "$CLAUDE_MD" "s/\Q$OLD\E/$NEW/g"

  # 3) docs frontmatter — only the `last_aligned_with:` line of each doc that was
  #    aligned with the OLD version. Body prose (ROADMAP history rows) is untouched.
  local doc
  while IFS= read -r doc; do
    subst "$doc" "s/^(last_aligned_with:\s*v?)\Q$OLD\E\s*\$/\${1}$NEW/m"
  done < <(grep -rlE "^last_aligned_with:[[:space:]]*v?${OLD//./\\.}[[:space:]]*\$" "$REPO_ROOT/docs" 2>/dev/null || true)

  # 4) CHANGELOG — stamp the first [Unreleased] heading as the new version and
  #    open a fresh empty [Unreleased] above it.
  grep -qE '^## \[Unreleased\]' "$CHANGELOG" || die "no '## [Unreleased]' heading in CHANGELOG"
  subst "$CHANGELOG" "s/^## \[Unreleased\][^\n]*\n/## [Unreleased]\n\n## [$NEW] - $DATE ($TITLE)\n/m"

  echo ""
  info "Changed files:"
  ( cd "$REPO_ROOT" && git --no-pager diff --stat -- \
      .claude-plugin/marketplace.json \
      archon-os/.claude-plugin/plugin.json \
      archon-os/CLAUDE.md \
      docs ) || true

  echo ""
  info "Running CI gates…"
  bash "$SCRIPT_DIR/ci/validate-counts.sh"      >/dev/null 2>&1 && ok "counts"       || die "validate-counts failed — run it directly to see why"
  node "$SCRIPT_DIR/ci/validate-hook-parity.cjs" >/dev/null 2>&1 && ok "hook-parity" || die "hook-parity failed"
  bash "$SCRIPT_DIR/ci/validate-doc-maturity.sh" >/dev/null 2>&1 && ok "doc-maturity (non-blocking flags OK)" || true

  echo ""
  ok "prepare done for v$NEW"
  echo -e "  ${BOLD}Next:${NC}"
  echo "    1. review the diff, then commit on a branch + open a PR"
  echo "    2. after it merges to main:  bash scripts/release.sh publish $NEW"
}

cmd_publish() {
  local NEW="${1:-}"
  [ -n "$NEW" ] || die "usage: release.sh publish <version>"
  [[ "$NEW" =~ $VERSION_RE ]] || die "version '$NEW' is not valid"
  local TAG="v$NEW"

  cd "$REPO_ROOT"
  [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || die "publish must run on 'main' (the release commit must be merged first)"
  [ -z "$(git status --porcelain --untracked-files=no)" ] || die "working tree has uncommitted changes"
  [ "$(current_version)" = "$NEW" ] || die "plugin.json is $(current_version), not $NEW — did the prepare PR merge?"
  git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && die "tag $TAG already exists"

  # Extract this version's CHANGELOG section (between its heading and the next '## [').
  local NOTES; NOTES="$(awk -v v="## [$NEW]" '
    index($0, v)==1 {grab=1; next}
    grab && /^## \[/ {exit}
    grab {print}
  ' "$CHANGELOG")"
  [ -n "${NOTES// /}" ] || NOTES="See CHANGELOG for details."

  local HEADLINE; HEADLINE="$(grep -oE "^## \[$NEW\][^(]*\((.*)\)" "$CHANGELOG" | sed -E 's/.*\((.*)\)/\1/' | head -1)"
  [ -n "$HEADLINE" ] && HEADLINE=" — $HEADLINE"

  info "Tagging $TAG at $(git rev-parse --short HEAD)…"
  git tag -a "$TAG" -m "$TAG$HEADLINE"
  git push origin "$TAG"
  ok "tag pushed"

  local PRE=()
  case "$NEW" in *-*) PRE=(--prerelease); info "prerelease (has -suffix)";; esac

  info "Creating GitHub release…"
  printf '%s\n' "$NOTES" | gh release create "$TAG" \
    --title "$TAG$HEADLINE" \
    "${PRE[@]}" \
    --notes-file - >/dev/null
  ok "release: $(gh release view "$TAG" --json url -q .url)"
}

case "${1:-}" in
  prepare) shift; cmd_prepare "$@";;
  publish) shift; cmd_publish "$@";;
  *) die "usage: release.sh {prepare <version> \"<title>\" | publish <version>}";;
esac
