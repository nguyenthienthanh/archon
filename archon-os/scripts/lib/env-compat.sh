#!/usr/bin/env bash
# env-compat.sh — legacy environment-variable bridge for the v4 rebrand.
#
# The shell-side twin of hooks/lib/env-compat.cjs. The plugin's variables moved
# from AF_* and AURA_FROG_* to ARCHON_* in v4.0.0; a user who exported the old
# names in ~/.zshrc, an .envrc, or CI has no reason to know that happened, so
# reading only ARCHON_* would quietly drop their configuration.
#
# Mirrors each legacy name onto its canonical ARCHON_ name without overwriting a
# canonical name that is already set — the new name wins where both are present.
# Idempotent: sourcing it twice changes nothing.
#
# Scheduled for removal in v5. ARCHON_ENV_COMPAT_OFF=true disables it, which is
# how you verify you no longer depend on it.
#
# Usage, from a script in scripts/ or scripts/<subdir>/:
#   . "$(dirname "${BASH_SOURCE[0]}")/lib/env-compat.sh"

archon_env_compat() {
  [ "${ARCHON_ENV_COMPAT_OFF:-}" = "true" ] && return 0

  local name canonical value
  # `compgen -v` lists every shell variable, exported or not, which is what we
  # want: a legacy name set in .zshrc without `export` still reflects intent.
  for name in $(compgen -v 2>/dev/null); do
    case "$name" in
      AURA_FROG_*) canonical="ARCHON_${name#AURA_FROG_}" ;;
      AF_*)        canonical="ARCHON_${name#AF_}" ;;
      *)           continue ;;
    esac
    # Already set under the new name → the new name wins, leave it alone.
    [ -n "${!canonical+x}" ] && continue
    value="${!name}"
    export "$canonical=$value"
  done
}

archon_env_compat
