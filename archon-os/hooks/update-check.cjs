#!/usr/bin/env node
/**
 * SessionStart Hook - Check for plugin updates (async, non-blocking)
 *
 * Checks GitHub releases API for latest version, warns if outdated.
 * Runs at most once per day (caches last check timestamp).
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Per-project: update-check cache lives with the project's other Aura Frog state.
// Aura Frog plugin NEVER writes to ~/.claude/ — only to the user's currently-active project.

const { findProjectRoot } = require('./lib/hook-runtime.cjs');
const CACHE_FILE = path.join(findProjectRoot(), '.claude', 'cache', 'archon-os', 'update-cache.json');
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REPO = 'nguyenthienthanh/archon';

function getCurrentVersion() {
  try {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
    const pluginJson = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
    if (fs.existsSync(pluginJson)) {
      const data = JSON.parse(fs.readFileSync(pluginJson, 'utf8'));
      return data.version || '0.0.0';
    }
  } catch { /* plugin.json read failed - non-blocking */ }
  return '0.0.0';
}

function readCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch { /* cache read failed - non-blocking */ }
  return {};
}

function writeCache(data) {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
  } catch { /* cache write failed - non-blocking */ }
}

function shouldCheck() {
  const cache = readCache();
  if (!cache.lastCheck) return true;
  return (Date.now() - cache.lastCheck) > CHECK_INTERVAL_MS;
}

/**
 * Split "v3.8.0-alpha.8" into { nums: [3,8,0], pre: "alpha.8" }.
 * Splitting the whole string on "." used to turn "0-alpha" into NaN, which then
 * collapsed to 0 via `|| 0` — see compareVersions.
 */
function parseVersion(v) {
  const [core, ...rest] = String(v).replace(/^v/, '').split('-');
  const nums = core.split('.').map((n) => Number(n) || 0);
  return { nums, pre: rest.length ? rest.join('-') : null };
}

/**
 * Compare two dot-separated prerelease strings per semver §11.
 * Returns >0 when `a` has higher precedence than `b`.
 */
function comparePrerelease(a, b) {
  const A = a.split('.');
  const B = b.split('.');
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    // A larger set of identifiers wins when all preceding ones are equal.
    if (A[i] === undefined) return -1;
    if (B[i] === undefined) return 1;
    const na = Number(A[i]);
    const nb = Number(B[i]);
    const bothNumeric = A[i] !== '' && B[i] !== '' && !Number.isNaN(na) && !Number.isNaN(nb);
    if (bothNumeric) {
      if (na !== nb) return na - nb;           // numeric identifiers compare numerically
    } else if (A[i] !== B[i]) {
      return A[i] < B[i] ? -1 : 1;             // otherwise ASCII order
    }
  }
  return 0;
}

/**
 * True when `latest` is newer than `current`.
 *
 * Prereleases are the subtle part, and the previous implementation got them
 * wrong: it did `'3.8.0-alpha.8'.split('.').map(Number)` → [3, 8, NaN, 8], and
 * `NaN || 0` → 0, so 3.8.0-alpha.8 compared EQUAL to 3.8.0. Every user on a
 * prerelease was therefore never told when the matching stable release shipped
 * (only a minor/major bump got through). Semver §11: a prerelease has lower
 * precedence than its release.
 */
function compareVersions(current, latest) {
  const c = parseVersion(current);
  const l = parseVersion(latest);

  for (let i = 0; i < 3; i++) {
    if ((l.nums[i] || 0) > (c.nums[i] || 0)) return true;
    if ((l.nums[i] || 0) < (c.nums[i] || 0)) return false;
  }

  // Same numeric core below this point.
  if (c.pre && !l.pre) return true;   // 3.8.0-alpha.8 -> 3.8.0 IS an update
  if (!c.pre && l.pre) return false;  // never push a stable user back to a prerelease
  if (c.pre && l.pre) return comparePrerelease(l.pre, c.pre) > 0;
  return false;
}

function checkForUpdate() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO}/releases/latest`,
      headers: { 'User-Agent': 'archon-os-update-check' },
      timeout: 5000,
    };

    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          resolve(release.tag_name || null);
        } catch { resolve(null); }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function main() {
  if (!shouldCheck()) {
    process.exit(0);
    return;
  }

  const currentVersion = getCurrentVersion();
  const latestTag = await checkForUpdate();

  // Update cache regardless of result
  writeCache({ lastCheck: Date.now(), latestTag, currentVersion });

  if (latestTag && compareVersions(currentVersion, latestTag)) {
    const currentMajor = parseInt(currentVersion.replace(/^v/, '').split('.')[0]);
    const latestMajor = parseInt(latestTag.replace(/^v/, '').split('.')[0]);
    const isMajor = latestMajor > currentMajor;

    const lines = [
      `🐸 Aura Frog update available: ${currentVersion} → ${latestTag}`,
    ];
    if (isMajor) {
      lines.push(`⚠️  Major version — may include breaking changes`);
      lines.push(`   Read release notes BEFORE updating: https://github.com/${REPO}/releases/tag/${latestTag}`);
    }
    lines.push('', 'Update: /plugin marketplace update aurafrog');

    const result = { systemMessage: lines.join('\n') };
    console.log(JSON.stringify(result));
  }

  process.exit(0);
}

// Run as a hook; stay importable for tests. FEAT-007 / issue #5.
// writeCache (writes the real cache) and checkForUpdate (network) stay unexported.
if (require.main === module) {
  main().catch(() => process.exit(0));
} else {
  module.exports = { getCurrentVersion, readCache, shouldCheck, compareVersions };
}
