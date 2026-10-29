'use strict';

/**
 * env-compat.sh — the shell twin of the v4 legacy environment bridge.
 *
 * The .sh and .cjs bridges are read by different halves of the plugin (statusline
 * and plan scripts vs. hooks), so they are two implementations of one contract.
 * These tests assert the same precedence rules against the shell one, because a
 * divergence would mean a variable that works in a hook and not in the statusline.
 */

const { execFileSync } = require('child_process');
const path = require('path');

const BRIDGE = path.join(__dirname, '..', 'lib', 'env-compat.sh');

// Runs the bridge in a clean-ish bash and echoes the resulting values. `env -i`
// is deliberate: the host is often a Claude Code session with AF_* exported, and
// inheriting those would make every assertion depend on the machine.
function bridge(vars, read) {
  // Separate statements, not an assignment prefix: `VAR=x . file` scopes the
  // assignment to the command in bash's default mode, so the bridge would never
  // see it. The real caller inherits exported variables, which this mirrors.
  const assigns = Object.entries(vars)
    .map(([k, v]) => `export ${k}=${JSON.stringify(v)};`)
    .join(' ');
  const echo = read.map(k => `\${${k}-<unset>}`).join('\u001f');
  const out = execFileSync(
    'env',
    ['-i', 'PATH=/usr/bin:/bin', 'bash', '-c',
      `${assigns} . ${JSON.stringify(BRIDGE)}; printf '%s' "${echo}"`],
    { encoding: 'utf8' },
  );
  return out.split('\u001f');
}

describe('env-compat.sh', () => {
  it('fills a canonical name that is absent', () => {
    expect(bridge({ AF_DEBUG: '1' }, ['ARCHON_DEBUG'])).toEqual(['1']);
  });

  it('maps the AURA_FROG_ prefix too', () => {
    expect(bridge({ AURA_FROG_TDD_ENFORCE: 'true' }, ['ARCHON_TDD_ENFORCE']))
      .toEqual(['true']);
  });

  it('leaves a canonical name that is already set — the new name wins', () => {
    expect(bridge({ AF_DEBUG: 'legacy', ARCHON_DEBUG: 'canonical' }, ['ARCHON_DEBUG']))
      .toEqual(['canonical']);
  });

  it('treats an explicit empty canonical value as set', () => {
    expect(bridge({ AF_DEBUG: '1', ARCHON_DEBUG: '' }, ['ARCHON_DEBUG'])).toEqual(['']);
  });

  it('keeps the legacy name in place', () => {
    expect(bridge({ AF_DEBUG: '1' }, ['AF_DEBUG'])).toEqual(['1']);
  });

  it('exports the canonical name, so a child process sees it', () => {
    const out = execFileSync(
      'env',
      ['-i', 'PATH=/usr/bin:/bin', 'bash', '-c',
        `export AF_DEBUG=1; . ${JSON.stringify(BRIDGE)}; env | grep '^ARCHON_DEBUG='`],
      { encoding: 'utf8' },
    );
    expect(out.trim()).toBe('ARCHON_DEBUG=1');
  });

  it('does nothing when ARCHON_ENV_COMPAT_OFF is true', () => {
    expect(bridge({ AF_DEBUG: '1', ARCHON_ENV_COMPAT_OFF: 'true' }, ['ARCHON_DEBUG']))
      .toEqual(['<unset>']);
  });

  it('leaves names with no legacy prefix untouched', () => {
    expect(bridge({ AFTERGLOW: '1' }, ['ARCHON_TERGLOW'])).toEqual(['<unset>']);
  });
});
