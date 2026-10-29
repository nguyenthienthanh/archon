'use strict';

/**
 * Archon OS / Archon — Universal Environment Resolver
 *
 * Implements Passive Cascading Resolution (12-Factor compliant):
 * 1. Checks active process.env (already set by shell, direnv, Docker, 1Password CLI, etc.)
 * 2. If missing, parses project-level files (.env.local -> .env -> .envrc)
 *    PVI (Pure Value Ingestion) — NEVER executes shell scripts or uses eval.
 * 3. Normalizes legacy/discrepant aliases (JIRA_URL <-> JIRA_BASE_URL, etc.)
 *
 * @version 1.0.0
 */

const fs = require('node:fs');
const path = require('node:path');

// Canonical aliases: [canonicalName, ...legacyAliases]
const ALIAS_MAP = [
  ['JIRA_BASE_URL', 'JIRA_URL'],
  ['FIGMA_API_TOKEN', 'FIGMA_API_KEY'],
  ['CONFLUENCE_BASE_URL', 'CONFLUENCE_URL'],
];

/**
 * Pure parser for key-value environment files (.env, .envrc, .env.local).
 * Strips comments, quotes, and optional 'export ' prefix without shell execution.
 *
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const env = {};
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      // Matches: KEY=value or export KEY=value or export KEY="value"
      const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) {
        let [, key, val] = match;
        // Strip trailing comment if not inside quotes
        if (!val.startsWith('"') && !val.startsWith("'")) {
          val = val.split(/\s+#/)[0].trim();
        } else {
          val = val.replace(/^['"](.*)['"]$/, '$1');
        }
        env[key] = val;
      }
    }
    return env;
  } catch {
    return {};
  }
}

/**
 * Resolve an environment variable by key, checking aliases and fallback files.
 *
 * @param {string} key
 * @param {string} [projectRoot=process.cwd()]
 * @returns {string|undefined}
 */
function resolveEnv(key, projectRoot = process.cwd()) {
  // Find all known aliases for this key
  const aliasGroup = ALIAS_MAP.find(group => group.includes(key)) || [key];

  // 1. Check existing process.env for key or any alias
  for (const name of aliasGroup) {
    if (process.env[name] !== undefined && process.env[name] !== '') {
      return process.env[name];
    }
  }

  // 2. Cascade check files: .env.local -> .env -> .envrc
  const candidateFiles = ['.env.local', '.env', '.envrc'];
  for (const fileName of candidateFiles) {
    const fullPath = path.join(projectRoot, fileName);
    if (!fs.existsSync(fullPath)) continue;

    const parsed = parseEnvFile(fullPath);
    for (const name of aliasGroup) {
      if (parsed[name] !== undefined && parsed[name] !== '') {
        // Hydrate active process.env for subsequent reads
        process.env[name] = parsed[name];
        // Also hydrate the requested key if it was an alias
        if (key !== name) {
          process.env[key] = parsed[name];
        }
        return parsed[name];
      }
    }
  }

  return undefined;
}

/**
 * Hydrate all supported project environment variables into process.env.
 * Call once during session boot or script startup.
 *
 * @param {string} [projectRoot=process.cwd()]
 * @returns {Record<string, string>}
 */
function loadProjectEnv(projectRoot = process.cwd()) {
  const loaded = {};
  const candidateFiles = ['.envrc', '.env', '.env.local']; // reverse order so .env.local overrides

  for (const fileName of candidateFiles) {
    const fullPath = path.join(projectRoot, fileName);
    if (!fs.existsSync(fullPath)) continue;

    const parsed = parseEnvFile(fullPath);
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined || process.env[k] === '') {
        process.env[k] = v;
        loaded[k] = v;
      }
    }
  }

  // Synchronize aliases
  for (const [canonical, ...aliases] of ALIAS_MAP) {
    const val = process.env[canonical] || aliases.map(a => process.env[a]).find(Boolean);
    if (val) {
      process.env[canonical] = val;
      for (const a of aliases) {
        if (!process.env[a]) process.env[a] = val;
      }
    }
  }

  return loaded;
}

module.exports = {
  parseEnvFile,
  resolveEnv,
  loadProjectEnv,
  ALIAS_MAP,
};
