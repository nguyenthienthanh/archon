'use strict';

/**
 * env-compat.cjs — the v4 legacy environment bridge.
 *
 * What these tests pin down is the part that is easy to get wrong in a rename:
 * the direction of precedence. A user who has set both names has upgraded part
 * of their configuration, so the NEW name must win; a user who has set only the
 * old one has not been told about the rename, so the old name must still work.
 * Get that backwards and an upgrade silently reverts people's settings.
 */

const { canonicalName, applyEnvCompat, LEGACY_PREFIXES, CANONICAL_PREFIX } =
  require('../env-compat.cjs');

describe('canonicalName', () => {
  it('maps the AF_ prefix onto ARCHON_', () => {
    expect(canonicalName('AF_TRACE_DISABLED')).toBe('ARCHON_TRACE_DISABLED');
  });

  it('maps the AURA_FROG_ prefix onto ARCHON_', () => {
    expect(canonicalName('AURA_FROG_TDD_ENFORCE')).toBe('ARCHON_TDD_ENFORCE');
  });

  it('prefers the longer prefix, so AURA_FROG_ never falls through to AF_', () => {
    // AURA_FROG_ does not start with AF_, but the ordering matters if either
    // prefix is ever widened — assert the contract rather than the current list.
    expect(LEGACY_PREFIXES[0]).toBe('AURA_FROG_');
    expect(CANONICAL_PREFIX).toBe('ARCHON_');
  });

  it('returns null for a name with no legacy prefix', () => {
    expect(canonicalName('ARCHON_DEBUG')).toBeNull();
    expect(canonicalName('PATH')).toBeNull();
    expect(canonicalName('AFTERGLOW')).toBeNull();
  });
});

describe('applyEnvCompat', () => {
  it('fills a canonical name that is absent', () => {
    const env = { AF_DEBUG: '1' };
    expect(applyEnvCompat(env)).toEqual(['ARCHON_DEBUG']);
    expect(env.ARCHON_DEBUG).toBe('1');
  });

  it('leaves a canonical name that is already set — the new name wins', () => {
    const env = { AF_DEBUG: 'legacy', ARCHON_DEBUG: 'canonical' };
    expect(applyEnvCompat(env)).toEqual([]);
    expect(env.ARCHON_DEBUG).toBe('canonical');
  });

  it('treats an empty canonical value as set, not as absent', () => {
    // An explicit empty value is a choice ("off"), and the resolver downstream
    // distinguishes '' from undefined. Overwriting it would reverse that choice.
    const env = { AF_DEBUG: '1', ARCHON_DEBUG: '' };
    expect(applyEnvCompat(env)).toEqual([]);
    expect(env.ARCHON_DEBUG).toBe('');
  });

  it('keeps the legacy name in place, so a script reading either still works', () => {
    const env = { AF_DEBUG: '1' };
    applyEnvCompat(env);
    expect(env.AF_DEBUG).toBe('1');
  });

  it('is idempotent', () => {
    const env = { AF_DEBUG: '1' };
    applyEnvCompat(env);
    expect(applyEnvCompat(env)).toEqual([]);
    expect(env.ARCHON_DEBUG).toBe('1');
  });

  it('bridges both legacy prefixes in one pass', () => {
    const env = { AF_DEBUG: '1', AURA_FROG_TDD_ENFORCE: 'true' };
    expect(applyEnvCompat(env)).toEqual(['ARCHON_DEBUG', 'ARCHON_TDD_ENFORCE']);
  });

  it('does nothing when ARCHON_ENV_COMPAT_OFF is true', () => {
    const env = { AF_DEBUG: '1', ARCHON_ENV_COMPAT_OFF: 'true' };
    expect(applyEnvCompat(env)).toEqual([]);
    expect(env.ARCHON_DEBUG).toBeUndefined();
  });

  it('ignores any value of ARCHON_ENV_COMPAT_OFF other than the literal true', () => {
    const env = { AF_DEBUG: '1', ARCHON_ENV_COMPAT_OFF: '1' };
    expect(applyEnvCompat(env)).toEqual(['ARCHON_DEBUG']);
  });

  it('skips a legacy key whose value is undefined', () => {
    const env = { AF_DEBUG: undefined };
    expect(applyEnvCompat(env)).toEqual([]);
    expect('ARCHON_DEBUG' in env).toBe(false);
  });

  it('leaves names with no legacy prefix untouched', () => {
    const env = { PATH: '/usr/bin', HOME: '/home/x' };
    expect(applyEnvCompat(env)).toEqual([]);
    expect(Object.keys(env).sort()).toEqual(['HOME', 'PATH']);
  });
});
