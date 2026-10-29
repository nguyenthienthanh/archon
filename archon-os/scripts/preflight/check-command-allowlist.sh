#!/usr/bin/env bash
# Aura Frog Pre-flight: Bash command allowlist / blocklist
# Blocks unconditionally destructive commands. Warns on potentially-destructive
# patterns. Pass anything else.
#
# Exit codes: 0 pass / 1 warn / 2 fail (block)
#
# Usage:
#   check-command-allowlist.sh "<bash command>"
#   echo "$CLAUDE_TOOL_INPUT" | check-command-allowlist.sh --from-tool-input

set -e

CMD=""
if [ "$1" = "--from-tool-input" ]; then
  CMD=$(cat)
elif [ -n "$1" ]; then
  CMD="$*"
fi

[ -z "$CMD" ] && exit 0

# ---------------------------------------------------------------------------
# rm analysis
#
# `rm -rf /` used to be four rows in HARD_BLOCK, and all four were wrong:
#
#   'rm[[:space:]]+-rf?[[:space:]]+/(\s|$)'
#
#   * bash's `=~` is POSIX ERE, where `\s` is not "whitespace" — it is a
#     literal `s`. So the alternation read "/s or end-of-string", and
#     `rm -rf / --no-preserve-root` — the one spelling that actually works on
#     a modern GNU rm — matched nothing and sailed straight through.
#   * `-rf?` matches exactly `-r` and `-rf`. Not `-fr`, not `-Rf`, not `-rvf`,
#     not `--recursive`, and not `rm -f -r /`.
#
# Flags and targets are independent and can appear in any order, so this is
# parsing, not one regex: split the command line into segments at shell
# separators (so a neighbouring command's flags can't be attributed to rm),
# then look at each segment that actually invokes rm.
# ---------------------------------------------------------------------------

# Print each shell segment of "$1" on its own line.
_segments() {
  printf '%s' "$1" | tr ';|&()\n' '\n\n\n\n\n\n'
}

# Strip one layer of surrounding single or double quotes from "$1".
_unquote() {
  local s="$1"
  s="${s#\"}"; s="${s%\"}"
  s="${s#\'}"; s="${s%\'}"
  printf '%s' "$s"
}

# Is "$1" an rm flag token whose letters include r/R (or --recursive)?
_is_recursive_flag() {
  case "$1" in
    --recursive|--recursive=*) return 0 ;;
    --*) return 1 ;;
    -*[rR]*) return 0 ;;
    *) return 1 ;;
  esac
}

# Does segment "$1" invoke rm? Tolerates a sudo/env/command prefix and an
# absolute path (/bin/rm), and does NOT match npm, confirm, rmdir, ...
_segment_is_rm() {
  local tok first=""
  set -f
  # shellcheck disable=SC2086
  for tok in $1; do
    case "$tok" in
      sudo|env|command|nohup|time|\!) continue ;;
      *=*) continue ;;                    # leading VAR=value assignments
      *) first="$tok"; break ;;
    esac
  done
  set +f
  case "$first" in
    rm|*/rm) return 0 ;;
    *) return 1 ;;
  esac
}

# Classify the rm targets in segment "$1":
#   0 — a catastrophic target (/, //, /., /*, ~, $HOME)
#   1 — a merely risky target (./, node_modules, dist, build, .next, .aura)
#   2 — nothing notable
_rm_target_class() {
  local tok bare found_risky=1
  set -f
  # shellcheck disable=SC2086
  for tok in $1; do
    case "$tok" in -*) continue ;; esac      # flags handled separately
    bare=$(_unquote "$tok")
    case "$bare" in
      # Catastrophic: the root, the home directory, or a glob over either.
      # Every pattern is quoted: case patterns undergo tilde and parameter
      # expansion, so a bare ~ or $HOME here would be expanded against THIS
      # process's environment and compare against the wrong thing entirely.
      /|//|///|/.|/./|'/*'|'//*'|'~'|'~/'|'~/*'|'$HOME'|'${HOME}'|'$HOME/'|'${HOME}/'|'$HOME/*'|'${HOME}/*')
        set +f
        return 0
        ;;
      # Risky but routine: the working tree, or a build/dependency directory.
      .|..|./*|node_modules|node_modules/*|dist|dist/*|build|build/*|.next|.next/*|.aura|.aura/*)
        found_risky=0
        ;;
    esac
  done
  set +f
  if [ "$found_risky" -eq 0 ]; then return 1; fi
  return 2
}

# Does segment "$1" carry a recursive flag?
_segment_is_recursive() {
  local tok rc=1
  set -f
  # shellcheck disable=SC2086
  for tok in $1; do
    if _is_recursive_flag "$tok"; then rc=0; break; fi
  done
  set +f
  return "$rc"
}

# 0 = catastrophic recursive rm, 1 = risky recursive rm, 2 = neither.
classify_rm() {
  local seg worst=2 class
  while IFS= read -r seg; do
    case "$seg" in *[![:space:]]*) : ;; *) continue ;; esac
    if ! _segment_is_rm "$seg"; then continue; fi
    if ! _segment_is_recursive "$seg"; then continue; fi

    if _rm_target_class "$seg"; then class=0; else class=$?; fi
    if [ "$class" -lt "$worst" ]; then worst="$class"; fi
    if [ "$worst" -eq 0 ]; then break; fi
  done <<EOF
$(_segments "$1")
EOF
  return "$worst"
}

if classify_rm "$CMD"; then RM_CLASS=0; else RM_CLASS=$?; fi
if [ "$RM_CLASS" -eq 0 ]; then
  echo "preflight:cmd-allowlist FAIL: recursive rm targeting / or \$HOME" >&2
  echo "  command: $CMD" >&2
  exit 2
fi

# Hard-block patterns — destruction without recourse.
# NOTE: these are POSIX EREs (bash `=~`). `\s`, `\d`, `\b` and friends are NOT
# available here — use [[:space:]], [[:digit:]] and explicit alternations.
HARD_BLOCK=(
  'mkfs\.[a-z0-9]+'                                # mkfs.* (filesystem create)
  'dd[[:space:]]+if=/dev/(zero|random|urandom)[[:space:]]+of='
  ':\(\)\{[[:space:]]*:\|:&[[:space:]]*\};:'      # fork bomb
  'shutdown'
  'reboot([[:space:]]|$)'
  'halt([[:space:]]|$)'
  'init[[:space:]]+0'
  'chmod[[:space:]]+-R[[:space:]]+777[[:space:]]+/'
  'chown[[:space:]]+-R[[:space:]]+root'
  '>[[:space:]]*/dev/sda'
  'curl.+\|[[:space:]]*sudo[[:space:]]+(bash|sh)'  # pipe-to-sudo-shell
  'curl.+\|[[:space:]]*(bash|sh)[[:space:]]+-c'    # pipe-to-shell-c
)

for pat in "${HARD_BLOCK[@]}"; do
  if [[ "$CMD" =~ $pat ]]; then
    echo "preflight:cmd-allowlist FAIL: hard-blocked pattern matched ($pat)" >&2
    echo "  command: $CMD" >&2
    exit 2
  fi
done

if [ "$RM_CLASS" -eq 1 ]; then
  echo "preflight:cmd-allowlist WARN: recursive rm of a build/dependency dir — verify intent" >&2
  echo "  command: $CMD" >&2
  exit 1
fi

# Warn patterns — risky but valid in some contexts
WARN_PATTERNS=(
  'git[[:space:]]+push[[:space:]]+.*--force([[:space:]]|$)'
  'git[[:space:]]+push[[:space:]]+.*-f([[:space:]]|$)'
  'git[[:space:]]+reset[[:space:]]+--hard'
  'git[[:space:]]+clean[[:space:]]+-[a-z]*f'
  'DROP[[:space:]]+(TABLE|DATABASE)'
  'TRUNCATE[[:space:]]+TABLE'
  'DELETE[[:space:]]+FROM[[:space:]]+[a-z_]+[[:space:]]*;'    # DELETE without WHERE
  'sudo'
  'eval[[:space:]]+'
)

for pat in "${WARN_PATTERNS[@]}"; do
  if [[ "$CMD" =~ $pat ]]; then
    echo "preflight:cmd-allowlist WARN: $pat — verify intent" >&2
    exit 1
  fi
done

exit 0
