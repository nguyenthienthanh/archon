'use strict';

/**
 * env-compat.cjs — legacy environment-variable bridge for the v4 rebrand.
 *
 * The plugin's own variables were prefixed `AF_` (Aura Frog) and, for the five
 * workflow defaults, `AURA_FROG_`. v4.0.0 renames both to `ARCHON_`. A user who
 * exported the old names in a shell profile, an .envrc, or a CI secret store has
 * no reason to know the rename happened — so reading only `ARCHON_*` would turn
 * their working configuration into silent defaults.
 *
 * This module mirrors the legacy names onto the canonical ones at require time:
 * `AF_TRACE_DISABLED` → `ARCHON_TRACE_DISABLED`, `AURA_FROG_TDD_ENFORCE` →
 * `ARCHON_TDD_ENFORCE`. It never overwrites a canonical name that is already
 * set, so the new name always wins where both are present, and it is idempotent
 * — requiring it from several modules in one process is a no-op after the first.
 *
 * Deprecation: the bridge is scheduled for removal in v5. `ARCHON_ENV_COMPAT_OFF=true`
 * disables it, which is how a user verifies they no longer depend on it.
 *
 * @version 1.0.0
 */

const LEGACY_PREFIXES = ['AURA_FROG_', 'AF_'];
const CANONICAL_PREFIX = 'ARCHON_';

/**
 * Pure: the canonical `ARCHON_*` name a legacy variable maps to, or null when
 * the name carries no legacy prefix.
 */
function canonicalName(name) {
  for (const prefix of LEGACY_PREFIXES) {
    if (name.startsWith(prefix)) return CANONICAL_PREFIX + name.slice(prefix.length);
  }
  return null;
}

/**
 * Mirror legacy names onto canonical ones in `env` (default: process.env).
 * Returns the list of names it filled, for diagnostics and tests.
 */
function applyEnvCompat(env = process.env) {
  if (env.ARCHON_ENV_COMPAT_OFF === 'true') return [];
  const filled = [];
  // Snapshot the keys: assigning into process.env during iteration is defined
  // but makes the loop's reach depend on insertion order, which is not.
  for (const name of Object.keys(env)) {
    const canonical = canonicalName(name);
    if (!canonical) continue;
    if (env[canonical] !== undefined) continue;
    if (env[name] === undefined) continue;
    env[canonical] = env[name];
    filled.push(canonical);
  }
  return filled.sort();
}

// Side effect on require: the callers are hook entrypoints that read
// process.env at module scope, so the bridge has to be in place before them.
applyEnvCompat();

module.exports = { LEGACY_PREFIXES, CANONICAL_PREFIX, canonicalName, applyEnvCompat };
