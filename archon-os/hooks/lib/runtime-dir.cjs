'use strict';

/**
 * runtime-dir.cjs — resolves the plugin's per-project runtime directory.
 *
 * v4.0.0 renamed it from `.aura-frog/` to `.archon/`. A project that was mid-run
 * when the plugin upgraded still has live state under the old name — the model
 * stack is pushed on a Task dispatch and popped when the subagent returns, so
 * resolving straight to `.archon/` would orphan every entry already pushed and
 * leave the statusline reporting a model that is no longer executing.
 *
 * So: prefer `.archon/`, but keep using `.aura-frog/` while it is the one that
 * actually holds state. New projects only ever see `.archon/`.
 *
 * @version 1.0.0
 */

const fs = require('node:fs');
const path = require('node:path');

const RUNTIME_DIR = '.archon';
const LEGACY_RUNTIME_DIR = '.aura-frog';

/**
 * Absolute path to `relative` inside the project's runtime directory.
 *
 * Reads resolve to whichever directory holds the file; writes land in `.archon/`
 * unless the legacy file already exists, in which case the in-flight state keeps
 * its home for the rest of its life rather than being split across two paths.
 *
 * @param {string} projectRoot
 * @param {...string} relative - path segments below the runtime directory
 * @returns {string}
 */
function runtimePath(projectRoot, ...relative) {
  const canonical = path.join(projectRoot, RUNTIME_DIR, ...relative);
  if (fs.existsSync(canonical)) return canonical;
  const legacy = path.join(projectRoot, LEGACY_RUNTIME_DIR, ...relative);
  if (fs.existsSync(legacy)) return legacy;
  return canonical;
}

module.exports = { RUNTIME_DIR, LEGACY_RUNTIME_DIR, runtimePath };
