#!/usr/bin/env node

/**
 * scout-block.cjs - Block scanning of large/irrelevant directories
 *
 * Prevents wasteful token usage by blocking access to:
 * - node_modules, __pycache__, .git, dist, build, vendor
 * - Custom patterns from .afignore
 *
 * Disable: AF_SCOUT_BLOCK=false
 *
 * Exit codes:
 * - 0: Command allowed
 * - 2: Command blocked
 */

const fs = require('fs');
const { readStdinSafely } = require('./lib/safe-stdin.cjs');
const path = require('path');

// Default blocked patterns.
// Note: `bin` and `obj` are NOT included by default — they collide with
// legitimate Node `bin/` entrypoints, Go cmd/, and committed compiled assets.
// Projects that want them blocked can add them in `.afignore`.
const DEFAULT_BLOCKED = [
  'node_modules',
  '__pycache__',
  '.git',
  'dist',
  'build',
  'vendor',
  '.next',
  '.nuxt',
  'coverage',
  '.cache',
  '.turbo',
  'target', // Rust
];

// Build commands that should be allowed
const ALLOWED_COMMANDS = [
  'npm build',
  'npm run build',
  'yarn build',
  'pnpm build',
  'npx build',
  'go build',
  'cargo build',
  'dotnet build',
];

/**
 * Load custom patterns from .afignore
 */
function loadCustomPatterns(projectRoot) {
  const ignoreFile = path.join(projectRoot, '.afignore');
  if (fs.existsSync(ignoreFile)) {
    return fs.readFileSync(ignoreFile, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  }
  return [];
}

/**
 * Check if a path contains blocked directories
 */
function isBlocked(targetPath, patterns) {
  const normalized = targetPath.replace(/\\/g, '/').toLowerCase();
  const segments = normalized.split('/');
  return patterns.some(pattern => {
    const lowerPattern = pattern.toLowerCase();
    return segments.some(segment => segment === lowerPattern);
  });
}

// Commands that read or scan paths. Only these segments are checked, so
// `cd repo && rm -f .git/index.lock` (stale-lock recovery) is not blocked.
const ACCESS_COMMANDS = ['cd', 'ls', 'cat', 'head', 'tail', 'find', 'grep'];
const SYSTEM_PREFIXES = ['/usr/', '/opt/', '/etc/', '/tmp/'];

/**
 * Return the blocked pattern a command reads from, or null.
 * Checks the first line, split into `&&` / `||` / `;` / `|` segments; a segment
 * counts only when its first word is an access command.
 */
function findBlockedInCommand(command, patterns) {
  const firstLine = command.split('\n')[0];
  for (const segment of firstLine.split(/&&|\|\||;|\|/)) {
    const tokens = segment.trim().split(/\s+/);
    if (!ACCESS_COMMANDS.includes(tokens[0])) continue;
    for (const token of tokens.slice(1)) {
      if (!token.includes('/') && !token.includes('\\')) continue;
      if (SYSTEM_PREFIXES.some(p => token.startsWith(p))) continue;
      const segments = token.replace(/\\/g, '/').toLowerCase().split('/');
      const matched = patterns.find(p => segments.includes(p.toLowerCase()));
      if (matched) return matched;
    }
  }
  return null;
}

/**
 * Check if command is an allowed build command
 */
function isAllowedBuildCommand(command) {
  return ALLOWED_COMMANDS.some(allowed => command.includes(allowed));
}

function main() {
  if (process.env.AF_SCOUT_BLOCK === 'false') process.exit(0);

  try {
    // Read hook input from stdin
    const input = readStdinSafely();
    if (!input) {
      process.exit(0); // Allow if no input
    }

    const data = JSON.parse(input);
    const toolInput = data.tool_input || {};

    // Get project root (current working directory)
    const projectRoot = process.cwd();

    // Load patterns.
    //
    // Two lists, deliberately. `.afignore` describes directories not worth
    // SCANNING ("blocked from scanning to save tokens", per its own header) —
    // it is a token-economy list, not a safety boundary. DEFAULT_BLOCKED is the
    // safety boundary: nobody should be writing into node_modules, dist or .git.
    //
    // Applying .afignore to writes made the plugin contradict itself: this repo
    // lists `__tests__`, and the plugin's own rules make Phase 2 Test RED
    // mandatory, so creating the required failing test was blocked by the
    // plugin that required it. Writes therefore consult DEFAULT_BLOCKED only.
    const customPatterns = loadCustomPatterns(projectRoot);
    const scanPatterns = [...DEFAULT_BLOCKED, ...customPatterns];
    const writePatterns = DEFAULT_BLOCKED;

    const toolName = data.tool_name || data.tool || '';
    const isWrite = /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(toolName);

    // Check file_path parameter (Read, Write, Edit tools)
    const filePath = toolInput.file_path || toolInput.path || '';
    const pathPatterns = isWrite ? writePatterns : scanPatterns;
    if (filePath && isBlocked(filePath, pathPatterns)) {
      console.error(`⛔ Blocked: ${filePath} (contains blocked directory)`);
      process.exit(2);
    }

    // Check command parameter (Bash tool)
    const command = toolInput.command || '';
    if (command && !isAllowedBuildCommand(command)) {
      const matched = findBlockedInCommand(command, scanPatterns);
      if (matched) {
        console.error(`⛔ Blocked: command accesses ${matched}`);
        process.exit(2);
      }
    }

    // Check pattern parameter (Glob, Grep tools)
    const pattern = toolInput.pattern || '';
    if (pattern && isBlocked(pattern, scanPatterns)) {
      console.error(`⛔ Blocked: pattern ${pattern} (contains blocked directory)`);
      process.exit(2);
    }
    process.exit(0);
  } catch (error) {
    console.error('scout-block error:', error.message);
    process.exit(0);
  }
}

// Run main only when invoked as a script; export pure fns when require()'d.
if (require.main === module) {
  main();
} else {
  module.exports = {
    DEFAULT_BLOCKED,
    ALLOWED_COMMANDS,
    isBlocked,
    isAllowedBuildCommand,
    loadCustomPatterns,
    findBlockedInCommand,
  };
}
