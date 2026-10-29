#!/usr/bin/env bash
# Aura Frog Pre-flight: path safety
# Reject path traversals (../../../etc/passwd) and absolute paths outside the repo
# (except known-safe dirs: /tmp, /var/tmp, the user's home).
#
# Exit codes:
#   0 — pass
#   1 — warn (path is suspicious but allowed; warn user)
#   2 — fail (block — clear traversal or hostile target)
#
# Usage:
#   check-path-safety.sh <path>
#   echo "$CLAUDE_TOOL_ARGS" | check-path-safety.sh --from-tool-args

set -e

TARGET=""
SOURCE=""

if [ "$1" = "--from-tool-args" ]; then
  ARGS_JSON=$(cat)
  if command -v jq >/dev/null 2>&1; then
    TARGET=$(echo "$ARGS_JSON" | jq -r '.file_path // .path // ""' 2>/dev/null || echo "")
  else
    # Degraded, not silently passing. Without jq the field read used to return
    # empty and the script exited 0 — a path check that always says "fine" is
    # worse than no path check, because it reads as a clean bill of health.
    # Best-effort extraction, and say out loud that this is the fallback.
    TARGET=$(printf '%s' "$ARGS_JSON" \
      | sed -E -n 's/.*"(file_path|path)"[[:space:]]*:[[:space:]]*"([^"]*)".*/\2/p' \
      | head -1)
    echo "preflight:path-safety WARN: jq not found — path extracted with a brittle fallback." >&2
    echo "  Install jq to restore full pre-flight validation." >&2
    if [ -z "$TARGET" ]; then
      echo "preflight:path-safety WARN: could not read a path from the tool args — check skipped" >&2
      exit 1
    fi
  fi
  SOURCE="tool-args"
elif [ -n "$1" ]; then
  TARGET="$1"
  SOURCE="cli"
fi

[ -z "$TARGET" ] && exit 0

# Reject obvious traversal patterns
if [[ "$TARGET" =~ \.\.\/.*\.\.\/ ]] || [[ "$TARGET" =~ ^\.\.\/\.\.\/ ]]; then
  echo "preflight:path-safety FAIL: traversal pattern in $TARGET" >&2
  exit 2
fi

# Hostile targets (system files)
case "$TARGET" in
  /etc/passwd|/etc/shadow|/etc/sudoers|/etc/sudoers.d/*|/root/*|/proc/*|/sys/*|/dev/*)
    echo "preflight:path-safety FAIL: system path $TARGET" >&2
    exit 2
    ;;
  *.ssh/id_rsa|*.ssh/id_ed25519|*/.aws/credentials|*/.config/gcloud/*)
    echo "preflight:path-safety FAIL: credential path $TARGET" >&2
    exit 2
    ;;
esac

# Resolve to absolute and check it stays within repo OR a safe sandbox.
# Canonicalize FIRST (resolve `..` and symlinks) so traversal segments cannot
# dodge the containment check, and compare against "$ROOT/"* (trailing slash)
# so a sibling like "${REPO_ROOT}-evil" is NOT whitelisted by prefix match.
canonicalize() {
  # Prefer python3 (resolves `..` + symlinks; works on non-existent paths);
  # fall back to GNU/BSD realpath, then to a lexical best-effort.
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1" 2>/dev/null && return 0
  fi
  realpath -m -- "$1" 2>/dev/null && return 0   # GNU
  realpath -- "$1" 2>/dev/null && return 0       # BSD (existing paths)
  echo "$1"                                       # last resort: unresolved
}

case "$TARGET" in
  /*) ABS="$TARGET" ;;
  *)  ABS="$(pwd)/$TARGET" ;;
esac
ABS="$(canonicalize "$ABS")"

REPO_ROOT="$(canonicalize "$(pwd)")"
# Canonicalize the hardcoded sandboxes too so macOS symlinks (/tmp → /private/tmp)
# still match after the target has been resolved.
TMP1="$(canonicalize /tmp)"; TMP2="$(canonicalize /var/tmp)"; HOME_C="$(canonicalize "${HOME:-/dev/null}")"

# Credential stores inside $HOME. These MUST be checked here, after
# canonicalization, and before the containment check below:
#
#   * The pre-canonical `~/.ssh/*` pattern above only ever matched the one
#     already-absolute, already-resolved spelling — `../.ssh/id_rsa`,
#     `src/../../.ssh/id_rsa` and any symlink into .ssh missed it entirely.
#   * And then `"$HOME_C"/*` in the containment case waved every one of those
#     through as "inside the home sandbox", exit 0.
#
# So the single most sensitive directory on the machine was the one place the
# path check reliably approved. Canonical form leaves no spelling to hide in.
if [ -n "$HOME_C" ] && [ "$HOME_C" != "/dev/null" ]; then
  case "$ABS" in
    "$HOME_C"/.ssh|"$HOME_C"/.ssh/*|\
    "$HOME_C"/.aws|"$HOME_C"/.aws/*|\
    "$HOME_C"/.gnupg|"$HOME_C"/.gnupg/*|\
    "$HOME_C"/.config/gcloud|"$HOME_C"/.config/gcloud/*|\
    "$HOME_C"/Library/LaunchAgents|"$HOME_C"/Library/LaunchAgents/*)
      echo "preflight:path-safety FAIL: credential/persistence path $TARGET (resolves to $ABS)" >&2
      exit 2
      ;;
  esac
fi

case "$ABS" in
  "$REPO_ROOT"|"$REPO_ROOT"/*|"$TMP1"/*|"$TMP2"/*|/tmp/*|/var/tmp/*|"$HOME_C"/*) : ;;
  *)
    echo "preflight:path-safety WARN: $TARGET resolves outside repo + sandbox dirs" >&2
    exit 1
    ;;
esac

exit 0
