#!/usr/bin/env node
/**
 * SessionStart Hook - Show release highlights after update
 *
 * Compares last-seen version with current version.
 * If different, shows release highlights once.
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// Per-project: release-notes acknowledgement is project-local.
// Archon OS plugin NEVER writes to ~/.claude/ — only to the user's currently-active project.

const { findProjectRoot } = require('./lib/hook-runtime.cjs');
const SEEN_FILE = path.join(findProjectRoot(), '.claude', 'cache', 'archon-os', 'last-seen-version.json');

const RELEASE_HIGHLIGHTS = {
  '2.0.0': [
    'Deep Project Init — 7 context files generated per project',
    'Collaborative Planning — 4-round multi-perspective deliberation',
    'Strategist agent — ROI evaluation, MVP scoping, scope creep detection',
    'Agent rename — shorter, clearer names (lead, frontend, mobile, tester, security, devops)',
    'Smart context loading — routes by scenario (200-2000 tokens)',
    'BREAKING: Agent names changed. Update any custom scripts referencing old names.',
  ],
};

function getCurrentVersion() {
  try {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
    const pluginJson = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
    if (fs.existsSync(pluginJson)) {
      const data = JSON.parse(fs.readFileSync(pluginJson, 'utf8'));
      return data.version || '0.0.0';
    }
  } catch { /* non-blocking */ }
  return '0.0.0';
}

function getLastSeen() {
  try {
    if (fs.existsSync(SEEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'));
      return data.version || '0.0.0';
    }
  } catch { /* non-blocking */ }
  return '0.0.0';
}

function setLastSeen(version) {
  try {
    const dir = path.dirname(SEEN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SEEN_FILE, JSON.stringify({ version, timestamp: Date.now() }));
  } catch { /* non-blocking */ }
}

function main() {
  const current = getCurrentVersion();
  const lastSeen = getLastSeen();

  if (current === lastSeen || current === '0.0.0') {
    process.exit(0);
    return;
  }

  // Update last seen
  setLastSeen(current);

  const highlights = RELEASE_HIGHLIGHTS[current];
  if (!highlights) {
    process.exit(0);
    return;
  }

  const lines = [
    `Archon OS updated to v${current}!`,
    '',
    ...highlights.map(h => `  • ${h}`),
    '',
    'Full changelog: CHANGELOG.md',
  ];

  const result = { systemMessage: lines.join('\n') };
  console.log(JSON.stringify(result));
  process.exit(0);
}

// Run as a hook; stay importable for tests. FEAT-007 / issue #5.
// setLastSeen stays unexported -- it writes the real seen-marker file.
if (require.main === module) {
  main();
} else {
  module.exports = { getCurrentVersion, getLastSeen };
}
