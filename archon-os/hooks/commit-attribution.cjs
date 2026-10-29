#!/usr/bin/env node
/**
 * commit-attribution.cjs - Enforce Co-Authored-By in AI-assisted commits
 *
 * PreToolUse hook on Bash commands.
 * Warns if a git commit is missing AI attribution.
 *
 * Exit codes:
 * - 0: Allowed (not a commit, or attribution present)
 * - 1: Warning (commit missing attribution)
 */

const fs = require('fs');
const { readStdinSafely } = require('./lib/safe-stdin.cjs');

// Pure: should this Bash command be warned about for missing AI attribution?
// True only for a git commit that introduces a NEW message without a
// Co-Authored-By trailer. Skips: non-commits, `--amend --no-edit` (no new
// message), commits that already carry the trailer, and `-F file` commits
// (the trailer may live in the message file we can't see).
function needsAttributionWarning(command) {
  const cmd = command || '';
  if (!/git\s+commit/.test(cmd)) return false;
  if (/--amend\s+--no-edit/.test(cmd)) return false;
  if (/co-authored-by/i.test(cmd)) return false;
  if (/\s-F\s/.test(cmd)) return false;
  return true;
}

function main() {
  try {
    const input = readStdinSafely();
    if (!input) return 0;

    const data = JSON.parse(input);
    const command = (data.tool_input || {}).command || '';

    if (needsAttributionWarning(command)) {
      console.error('💡 Missing AI attribution. Add to commit message:');
      console.error('   Co-Authored-By: Claude <noreply@anthropic.com>');
      return 1; // Warning, don't block
    }
    return 0;
  } catch {
    return 0; // Fail open
  }
}

// Run as a hook; stay importable for tests. FEAT-007 / issue #5.
if (require.main === module) {
  process.exit(main());
} else {
  module.exports = { needsAttributionWarning };
}
