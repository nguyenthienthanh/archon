'use strict';
/**
 * Aura Frog — Plans Dir Resolver (JS mirror of scripts/plans/_lib.sh#plans_dir)
 *
 * Single source of truth for "where do plan-tree files live?" Used by every
 * hook that reads/writes plan state. Replaces 10 hand-coded
 * `path.join(process.cwd(), '.aura', 'plans')` instances that survived the
 * v3.7.3 sweep gap and re-created the legacy `.aura/` folder on upgraded
 * projects.
 *
 * Resolution order (v3.7.3+):
 *   1. process.env.AF_PLANS_DIR — explicit override, path.resolve'd
 *   2. <cwd>/.claude/plans  — v3.7.3 default, returned if it exists
 *   3. <cwd>/.aura/plans    — legacy fallback (only if .claude/plans absent)
 *   4. <cwd>/.claude/plans  — absent-tree case (caller is expected to mkdir)
 *
 * The migration helper performs a one-shot `.aura/plans → .claude/plans` rename
 * when only the legacy directory exists and the user has not opted into a
 * custom location via AF_PLANS_DIR. Designed to be called from session-start
 * before any other hook reads plan state.
 */

const fs = require('node:fs');
const path = require('node:path');

function resolvePlansDir(cwd) {
    const root = cwd || process.cwd();
    if (process.env.AF_PLANS_DIR) {
        return path.resolve(process.env.AF_PLANS_DIR);
    }
    const claudePath = path.join(root, '.claude', 'plans');
    if (fs.existsSync(claudePath)) return claudePath;
    const auraPath = path.join(root, '.aura', 'plans');
    if (fs.existsSync(auraPath)) return auraPath;
    return claudePath;
}

function migrateLegacyPlansDir(cwd) {
    const root = cwd || process.cwd();
    if (process.env.AF_PLANS_DIR) {
        return { migrated: false, reason: 'AF_PLANS_DIR set — user opted into custom location' };
    }
    const claudePath = path.join(root, '.claude', 'plans');
    const auraPath = path.join(root, '.aura', 'plans');
    if (fs.existsSync(claudePath)) {
        return { migrated: false, reason: '.claude/plans already exists' };
    }
    if (!fs.existsSync(auraPath)) {
        return { migrated: false, reason: 'no legacy .aura/plans to migrate' };
    }
    try {
        fs.mkdirSync(path.dirname(claudePath), { recursive: true });
        fs.renameSync(auraPath, claudePath);
        return { migrated: true, from: auraPath, to: claudePath };
    } catch (err) {
        return { migrated: false, reason: 'rename failed', error: err.message };
    }
}

module.exports = resolvePlansDir;
module.exports.resolvePlansDir = resolvePlansDir;
module.exports.migrateLegacyPlansDir = migrateLegacyPlansDir;
