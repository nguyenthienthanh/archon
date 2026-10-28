#!/bin/bash
# envrc-guarded-source.sh
#
# Source-only helper (NEVER execute directly — must be `. "<this>"` or
# `source "<this>"` from a hook's command line). Replaces the unsafe
# pattern `if [ -f .envrc ]; then set -a; source .envrc; set +a; fi`
# that would auto-execute arbitrary code from any cloned repository.
#
# Behavior:
#   1. If $PWD/.envrc does not exist → do nothing (silent).
#   2. If .envrc is group- or world-writable → skip + warn. A file anyone else
#      on the box can rewrite cannot be meaningfully trusted, whatever the
#      trust file says.
#   3. Snapshot .envrc to a mode-600 temp file, then hash and source THAT ONE
#      file. See "TOCTOU" below for why the snapshot exists.
#   4. If the per-user trust file maps $PWD/.envrc to a sha256 that matches the
#      snapshot's hash → source the snapshot with `set -a; source; set +a`.
#   5. Otherwise → skip + emit a one-time stderr hint.
#
# TOCTOU: the gate used to hash $PWD/.envrc and then source $PWD/.envrc — two
# separate reads of a path an attacker can swap between them (a rename is
# atomic and needs no write access to the original inode). The approved content
# passed the hash check; the hostile content got executed. Copying to a private
# temp first collapses that to a single read: whatever we hashed is exactly what
# we source, because nothing else can reach the temp file.
#
# One consequence worth knowing: inside .envrc, $BASH_SOURCE now points at the
# temp copy rather than at $PWD/.envrc. $PWD is untouched, so relative paths and
# `$(pwd)` behave as before.
#
# Trust file: ~/.config/aura-frog/envrc-trust.json
# Schema:     { "/abs/path/to/.envrc": { "sha256": "<hex>", "approved_at": "<iso>" } }
# Approve:    af envrc allow     (computes hash + writes entry)
# Revoke:     af envrc revoke
# Status:     af envrc status
#
# Disable the gate (auto-source as before — NOT RECOMMENDED):
#   export AF_ENVRC_UNSAFE_AUTO_SOURCE=true
#   Setting this now announces itself once per session on stderr. A disabled
#   security gate that says nothing is indistinguishable from one that is
#   working, which is how it stays disabled for months.
#
# Rationale: closes the HIGH-severity finding where cloning a hostile
# repo with a crafted .envrc would execute arbitrary code as the user
# on SessionStart / PreToolUse / UserPromptSubmit hooks.

# Print the octal permission bits of a file, GNU or BSD stat. Empty when neither
# form works, which the caller treats as "cannot tell" rather than "fine".
_af_envrc_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1" 2>/dev/null
}

# 0 = safe to consider, 1 = group/world-writable, 2 = could not determine.
_af_envrc_perms_ok() {
  local mode
  mode=$(_af_envrc_mode "$1")
  [ -z "$mode" ] && return 2
  # Keep the low three octal digits (stat may print 644, 0644 or 100644).
  # sed rather than bash substring expansion: this file gets sourced by whatever
  # shell the hook line runs in, which is not guaranteed to be bash.
  mode=$(printf '%s' "$mode" | sed 's/.*\(...\)$/\1/')
  # Group digit or other digit carrying the write bit (2, 3, 6 or 7).
  case "$mode" in
    ?[2367]?|??[2367]) return 1 ;;
  esac
  return 0
}

# Copy $1 to a fresh mode-600 temp file and print its path. Non-zero on failure.
# `cat` rather than `cp`: cp -p would carry the source's mode across, and plain
# cp on some platforms still adjusts the destination mode.
_af_envrc_snapshot() {
  local src="$1" tmp
  tmp=$(mktemp "${TMPDIR:-/tmp}/af-envrc.XXXXXX" 2>/dev/null) || return 1
  chmod 600 "$tmp" 2>/dev/null || { rm -f "$tmp"; return 1; }
  if ! cat "$src" >"$tmp" 2>/dev/null; then
    rm -f "$tmp"
    return 1
  fi
  printf '%s\n' "$tmp"
}

# sha256 of a file via GNU sha256sum or BSD shasum. Empty when neither exists,
# which is fail-closed at the call site (no hash tool → do not source).
_af_envrc_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" 2>/dev/null | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'
  fi
}

# Expected hash for $2 (the .envrc path) out of trust file $1.
_af_envrc_expected_hash() {
  local trust_file="$1" envrc_path="$2" canon_path="$3"
  if command -v jq >/dev/null 2>&1; then
    if [ -n "$canon_path" ] && [ "$canon_path" != "$envrc_path" ]; then
      jq -r --arg p "$envrc_path" --arg c "$canon_path" '.[$p].sha256 // .[$c].sha256 // empty' "$trust_file" 2>/dev/null
    else
      jq -r --arg p "$envrc_path" '.[$p].sha256 // empty' "$trust_file" 2>/dev/null
    fi
  else
    # Fallback: line-based extraction. Works with the canonical pretty-printed
    # JSON our writer produces; brittle on hand-edited files (which is fine —
    # we recommend using `af envrc allow` to write the file).
    local hash=""
    hash=$(awk -v path="\"$envrc_path\":" '
      $0 ~ path { in_block=1 }
      in_block && /"sha256":/ { gsub(/.*"sha256": *"/, ""); gsub(/".*/, ""); print; exit }
    ' "$trust_file" 2>/dev/null)
    if [ -z "$hash" ] && [ -n "$canon_path" ] && [ "$canon_path" != "$envrc_path" ]; then
      hash=$(awk -v path="\"$canon_path\":" '
        $0 ~ path { in_block=1 }
        in_block && /"sha256":/ { gsub(/.*"sha256": *"/, ""); gsub(/".*/, ""); print; exit }
      ' "$trust_file" 2>/dev/null)
    fi
    echo "$hash"
  fi
}

af_envrc_guarded_source() {
  local envrc_path="$PWD/.envrc"
  local canon_path=""
  if [ -f "$envrc_path" ]; then
    if command -v realpath >/dev/null 2>&1; then
      canon_path=$(realpath "$envrc_path" 2>/dev/null || echo "")
    else
      canon_path="$(pwd -P)/.envrc"
    fi
  fi
  [ ! -f "$envrc_path" ] && return 0

  # Opt-out for users who explicitly want the old behavior — loudly.
  if [ "${AF_ENVRC_UNSAFE_AUTO_SOURCE:-}" = "true" ]; then
    _af_envrc_warn_unsafe_once
    set -a; . "$envrc_path" 2>/dev/null; set +a
    return 0
  fi

  _af_envrc_perms_ok "$envrc_path"
  case "$?" in
    1)
      _af_envrc_warn_once \
        "[af] .envrc is group/world-writable — auto-source skipped. Fix with: chmod go-w .envrc"
      return 0
      ;;
    2)
      # No usable stat. The hash gate below still stands, so degrade rather than
      # lock the user out — but say so, once, instead of silently dropping a check.
      _af_envrc_warn_once \
        "[af] cannot read .envrc permissions (no usable stat) — writability check skipped"
      ;;
  esac

  local trust_file="${HOME}/.config/aura-frog/envrc-trust.json"
  if [ ! -f "$trust_file" ]; then
    _af_envrc_warn_once
    return 0
  fi

  # Single read: hash and source the same private copy, never the live path.
  local snapshot
  snapshot=$(_af_envrc_snapshot "$envrc_path") || {
    _af_envrc_warn_once "[af] could not stage .envrc for verification — auto-source skipped"
    return 0
  }

  local current_hash expected_hash
  current_hash=$(_af_envrc_hash "$snapshot")
  if [ -n "$current_hash" ]; then
    expected_hash=$(_af_envrc_expected_hash "$trust_file" "$envrc_path" "$canon_path")
    if [ -n "$expected_hash" ] && [ "$current_hash" = "$expected_hash" ]; then
      set -a; . "$snapshot" 2>/dev/null; set +a
    else
      _af_envrc_warn_once
    fi
  fi
  # No hash tool (current_hash empty) → fail closed, nothing sourced.

  rm -f "$snapshot"
}

_af_envrc_warn_once() {
  # One stderr line per shell — prevents log spam on rapid-fire hooks.
  if [ -z "${AF_ENVRC_WARN_SHOWN:-}" ]; then
    echo "${1:-[af] .envrc found but not trusted — auto-source skipped. To approve: af envrc allow}" >&2
    export AF_ENVRC_WARN_SHOWN=1
  fi
}

_af_envrc_warn_unsafe_once() {
  # Tracked separately from the trust warning: this one must not be suppressed
  # by an earlier "not trusted" hint, and vice versa.
  if [ -z "${AF_ENVRC_UNSAFE_WARN_SHOWN:-}" ]; then
    echo "[af] SECURITY: envrc trust gate DISABLED via AF_ENVRC_UNSAFE_AUTO_SOURCE — $PWD/.envrc is being executed unverified" >&2
    export AF_ENVRC_UNSAFE_WARN_SHOWN=1
  fi
}

af_envrc_guarded_source
