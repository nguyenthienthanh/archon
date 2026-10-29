'use strict';
/**
 * Aura Frog — Security Dir Resolver (mirror of lib/plans-dir.cjs)
 *
 * Single source of truth for "where does the MCP audit log live?" Before this,
 * `path.join(findProjectRoot(), '.aura', 'security', ...)` was written out by
 * hand in the hook that writes the log, the session-start sweep that prunes it,
 * dashboard.sh that reads it, new-plan.sh that creates it, and five docs. Five
 * independent spellings of one path is how a store ends up split — exactly the
 * failure the trace files hit when one writer kept its own copy of the layout.
 *
 * Resolution order:
 *   1. process.env.AF_SECURITY_DIR — explicit override, path.resolve'd
 *   2. <root>/.claude/security — preferred, returned if it exists
 *   3. <root>/.aura/security   — current default; every install has this one
 *
 * NOTE ON THE DEFAULT: unlike plans-dir, the fallback here is the LAST resort
 * and also the default for a fresh project. That is deliberate and matches what
 * ships today — session-start.cjs records the reasoning as "security domain
 * stays separate from plans". Flipping the default to .claude/security (and
 * migrating existing logs) is a maintainer decision, not a mechanical one: it
 * relocates a security audit trail. migrateLegacySecurityDir() below implements
 * that move and is deliberately NOT called from anywhere yet, so the flip is a
 * one-line change once the call is made.
 */

const fs = require('node:fs');
const path = require('node:path');

function resolveSecurityDir(root) {
    const base = root || process.cwd();
    if (process.env.AF_SECURITY_DIR) {
        return path.resolve(process.env.AF_SECURITY_DIR);
    }
    const claudePath = path.join(base, '.claude', 'security');
    if (fs.existsSync(claudePath)) return claudePath;
    return path.join(base, '.aura', 'security');
}

// Convenience: the one file anything actually wants out of that directory.
function resolveMcpAuditFile(root) {
    return path.join(resolveSecurityDir(root), 'mcp-audit.jsonl');
}

/**
 * One-shot `.aura/security → .claude/security` rename. Wired to nothing yet —
 * see the note above. Same shape as migrateLegacyPlansDir so that turning it on
 * later is a call, not a rewrite.
 */
function migrateLegacySecurityDir(root) {
    const base = root || process.cwd();
    if (process.env.AF_SECURITY_DIR) {
        return { migrated: false, reason: 'AF_SECURITY_DIR set — user opted into custom location' };
    }
    const claudePath = path.join(base, '.claude', 'security');
    const auraPath = path.join(base, '.aura', 'security');
    if (fs.existsSync(claudePath)) {
        return { migrated: false, reason: '.claude/security already exists' };
    }
    if (!fs.existsSync(auraPath)) {
        return { migrated: false, reason: 'no legacy .aura/security to migrate' };
    }
    try {
        fs.mkdirSync(path.dirname(claudePath), { recursive: true });
        fs.renameSync(auraPath, claudePath);
        return { migrated: true, from: auraPath, to: claudePath };
    } catch (err) {
        return { migrated: false, reason: 'rename failed', error: err.message };
    }
}

module.exports = resolveSecurityDir;
module.exports.resolveSecurityDir = resolveSecurityDir;
module.exports.resolveMcpAuditFile = resolveMcpAuditFile;
module.exports.migrateLegacySecurityDir = migrateLegacySecurityDir;
