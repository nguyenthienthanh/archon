/**
 * Tests for the pure classifiers of two 0-function hooks made importable by
 * FEAT-007 / issue #5: security-critical-warn and commit-attribution.
 */

const { TIERS, classifyTier } = require('../../archon-os/hooks/security-critical-warn.cjs');
const { needsAttributionWarning } = require('../../archon-os/hooks/commit-attribution.cjs');

describe('security-critical-warn — classifyTier', () => {
  it.each([
    '/app/.env', '/app/.env.local', 'config/credentials.json', '/home/u/.ssh/id_rsa',
    'secrets.yaml', 'service-account-key.json', 'server.pem', 'private.key',
  ])('classifies %s as CRITICAL', (p) => expect(classifyTier(p)).toBe('CRITICAL'));

  it.each([
    'src/auth/login.ts', 'app/payment/checkout.js', 'lib/crypto/hash.go',
    'middleware/auth/jwt.ts', 'src/oauth.py', 'passwordReset.tsx',
  ])('classifies %s as HIGH', (p) => expect(classifyTier(p)).toBe('HIGH'));

  it.each([
    'app.config.js', 'settings.py', 'database.ts', 'cors.js', 'rate-limit.ts',
  ])('classifies %s as MEDIUM', (p) => expect(classifyTier(p)).toBe('MEDIUM'));

  it.each(['src/components/Button.tsx', 'README.md', 'index.html', ''])(
    'classifies %s as null', (p) => expect(classifyTier(p)).toBeNull());

  // CRITICAL is checked before HIGH/MEDIUM.
  it('prefers the most severe matching tier', () => {
    // .env matches CRITICAL; "auth" would match HIGH, but CRITICAL wins.
    expect(classifyTier('/app/auth/.env')).toBe('CRITICAL');
  });

  it('normalises backslashes and case', () => {
    expect(classifyTier('C:\\App\\.ENV')).toBe('CRITICAL');
    expect(classifyTier('SRC/AUTH/Login.TS')).toBe('HIGH');
  });

  it('does not throw on null/undefined', () => {
    expect(classifyTier(null)).toBeNull();
    expect(classifyTier(undefined)).toBeNull();
  });

  it('every tier exposes an icon, label and message', () => {
    for (const cfg of Object.values(TIERS)) {
      expect(cfg.icon).toBeTruthy();
      expect(cfg.label).toBeTruthy();
      expect(cfg.message).toBeTruthy();
    }
  });
});

describe('commit-attribution — needsAttributionWarning', () => {
  it('warns on a plain git commit with a new message', () => {
    expect(needsAttributionWarning('git commit -m "add feature"')).toBe(true);
  });

  it('does not warn on a non-commit command', () => {
    expect(needsAttributionWarning('git status')).toBe(false);
    expect(needsAttributionWarning('ls -la')).toBe(false);
  });

  it('does not warn on an amend --no-edit', () => {
    expect(needsAttributionWarning('git commit --amend --no-edit')).toBe(false);
  });

  it('does not warn when the trailer is already present (any case)', () => {
    expect(needsAttributionWarning('git commit -m "x\n\nCo-Authored-By: Claude"')).toBe(false);
    expect(needsAttributionWarning('git commit -m "x\n\nco-authored-by: y"')).toBe(false);
  });

  it('does not warn on a -F message-file commit (trailer may be in the file)', () => {
    expect(needsAttributionWarning('git commit -F /tmp/msg.txt')).toBe(false);
  });

  it('does not throw on null/empty', () => {
    expect(needsAttributionWarning(null)).toBe(false);
    expect(needsAttributionWarning('')).toBe(false);
  });
});
