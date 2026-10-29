'use strict';

/**
 * jest.setup.cjs — runs in every worker before any test file is loaded.
 *
 * The suite is usually run from inside a Claude Code session that has this very
 * plugin installed, which means the host exports the plugin's own configuration:
 * ARCHON_PROJECT_ROOT, ARCHON_CLAUDE_SESSION_ID, ARCHON_TRANSCRIPT_PATH, and (from
 * the pre-v4 installed build) the legacy AF_* spellings of all of them. Tests that
 * assert the "nothing configured" path delete the ARCHON_* names in `beforeEach` —
 * and then hooks/lib/env-compat.cjs, which bridges AF_* onto ARCHON_* at require
 * time, puts the host's values straight back. A test asserting an unconfigured
 * default would silently exercise the developer's live session instead, and the
 * failure looks like a bug in the hook rather than a leak from the environment.
 *
 * Switching the bridge off for the whole suite removes the class rather than
 * patching each file: a test that wants the bridge's behaviour tests
 * applyEnvCompat() against an explicit object, which this does not touch.
 */

process.env.ARCHON_ENV_COMPAT_OFF = 'true';

// Belt and braces: the bridge is off, but the legacy names themselves are still
// inherited, and a hook that reads one directly would pick up the host's value.
for (const name of Object.keys(process.env)) {
  if (name.startsWith('AF_') || name.startsWith('AURA_FROG_')) delete process.env[name];
}
