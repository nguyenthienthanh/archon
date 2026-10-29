#!/usr/bin/env node
/**
 * Aura Frog - Smart Learn Hook
 *
 * Fires: PostToolUse (Write, Edit, Bash) — dispatched in-process by
 *        learning-dispatch.cjs (no longer registered directly in hooks.json;
 *        exported run() is the entrypoint). Standalone CLI still works.
 * Purpose: Automatically learn from successful operations without explicit user feedback
 *
 * Features:
 * - Tracks successful code patterns (no errors after write/edit)
 * - Detects file modification patterns
 * - Learns from successful bash commands
 * - Auto-creates patterns from repetitive successful actions
 *
 * Exit Codes:
 *   0 - Success (non-blocking)
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { recordPattern, isLearningEnabled, isLocalMode } = require('./lib/af-learning.cjs');

// Smart learn cache

const { findProjectRoot, readHookInputCompat } = require('./lib/hook-runtime.cjs');

// Resolve tool context from the PostToolUse stdin payload. The old code read
// CLAUDE_TOOL_NAME / _INPUT / _RESULT env vars (never set by the hook API), so
// toolName was undefined and the hook exited before learning anything. The
// per-tool code/command field is extracted at each call site (Write/Edit use
// tool_input.content / new_string; Bash uses tool_input.command).
function resolveToolContext(input) {
  const d = input || {};
  const tr = d.tool_response;
  return {
    toolName: d.tool_name || process.env.CLAUDE_TOOL_NAME || '',
    ti: (d.tool_input && typeof d.tool_input === 'object') ? d.tool_input : {},
    toolResult: (typeof tr === 'string' ? tr : (tr ? JSON.stringify(tr) : '')) || process.env.CLAUDE_TOOL_RESULT || '',
  };
}
const CACHE_DIR = path.join(findProjectRoot(), '.claude', 'cache');
const SMART_LEARN_CACHE = path.join(CACHE_DIR, 'smart-learn-cache.json');

// Thresholds
const SUCCESS_THRESHOLD = 3; // Number of successes before creating pattern
const CACHE_MAX_SIZE = 200;

// Caps for the keyed maps. Only `successfulActions` was bounded; the three maps
// beside it grew a key per distinct extension / pattern / command base — and
// `bashPatterns` grows with command diversity, which is unbounded in practice.
//
// Eviction keeps the highest counts: count is what drives SUCCESS_THRESHOLD, so
// a high-count key is one prompt away from becoming a learned pattern while a
// count-1 key is a one-off. Entries whose count was just reset to 0 after being
// promoted lose first, which is correct — their pattern is already recorded.
const MAP_MAX_KEYS = 100;
const SUB_PATTERN_MAX_KEYS = 50;

/**
 * Ensure cache directory exists
 */
function ensureCacheDir() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  } catch { /* fs mkdir - non-blocking, will retry next time */ }
}

/**
 * Load smart learn cache
 */
function loadCache() {
  try {
    if (fs.existsSync(SMART_LEARN_CACHE)) {
      return JSON.parse(fs.readFileSync(SMART_LEARN_CACHE, 'utf-8'));
    }
  } catch { /* malformed data - skip silently, fresh state on next run */ }
  return {
    filePatterns: {},      // file extension -> { patterns: [], successCount: 0 }
    codePatterns: {},      // pattern type -> { count, examples }
    bashPatterns: {},      // command pattern -> { count, lastSuccess }
    successfulActions: []  // recent successful actions
  };
}

/**
 * Cap a `{key → entry}` map, keeping the highest-scoring entries.
 * `scoreOf` reads the entry's count; ties break on `lastSuccess` (newer wins).
 */
function trimKeyedMap(map, max, scoreOf = (v) => (v && v.count) || 0) {
  const src = map && typeof map === 'object' ? map : {};
  const keys = Object.keys(src);
  if (keys.length <= max) return src;
  const kept = keys
    .sort((a, b) =>
      (scoreOf(src[b]) - scoreOf(src[a])) ||
      ((src[b]?.lastSuccess || 0) - (src[a]?.lastSuccess || 0))
    )
    .slice(0, max);
  const out = {};
  for (const k of kept) out[k] = src[k];
  return out;
}

/**
 * Apply every cap. Called on save so no write path can bypass it.
 */
function trimCache(cache) {
  cache.successfulActions = (cache.successfulActions || []).slice(-CACHE_MAX_SIZE);
  cache.filePatterns = trimKeyedMap(cache.filePatterns, MAP_MAX_KEYS, (v) => (v && v.successCount) || 0);
  for (const ext of Object.keys(cache.filePatterns)) {
    if (cache.filePatterns[ext] && cache.filePatterns[ext].patterns) {
      cache.filePatterns[ext].patterns = trimKeyedMap(cache.filePatterns[ext].patterns, SUB_PATTERN_MAX_KEYS);
    }
  }
  cache.codePatterns = trimKeyedMap(cache.codePatterns, MAP_MAX_KEYS);
  cache.bashPatterns = trimKeyedMap(cache.bashPatterns, MAP_MAX_KEYS);
  return cache;
}

/**
 * Save smart learn cache
 */
function saveCache(cache) {
  try {
    ensureCacheDir();
    trimCache(cache);
    fs.writeFileSync(SMART_LEARN_CACHE, JSON.stringify(cache, null, 2));
  } catch { /* fs/cache write - non-blocking, will retry next time */ }
}

/**
 * Detect code patterns from content
 */
function detectCodePatterns(content, filePath) {
  const patterns = [];
  const ext = path.extname(filePath).toLowerCase();

  // TypeScript/JavaScript patterns
  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    // Arrow functions vs regular functions
    const arrowFunctions = (content.match(/=>\s*{/g) || []).length;
    const regularFunctions = (content.match(/function\s+\w+/g) || []).length;
    if (arrowFunctions > regularFunctions) {
      patterns.push({ type: 'style', pattern: 'arrow_functions', weight: arrowFunctions });
    }

    // Const vs let usage
    const constUsage = (content.match(/\bconst\s+/g) || []).length;
    const letUsage = (content.match(/\blet\s+/g) || []).length;
    if (constUsage > letUsage * 2) {
      patterns.push({ type: 'style', pattern: 'prefer_const', weight: constUsage });
    }

    // Async/await usage
    const asyncAwait = (content.match(/\basync\b/g) || []).length;
    if (asyncAwait > 0) {
      patterns.push({ type: 'style', pattern: 'async_await', weight: asyncAwait });
    }

    // Type annotations (TypeScript)
    if (['.ts', '.tsx'].includes(ext)) {
      const typeAnnotations = (content.match(/:\s*(string|number|boolean|Array|object|any)/g) || []).length;
      if (typeAnnotations > 5) {
        patterns.push({ type: 'typing', pattern: 'explicit_types', weight: typeAnnotations });
      }
    }

    // React hooks
    if (content.includes('useState') || content.includes('useEffect')) {
      patterns.push({ type: 'framework', pattern: 'react_hooks', weight: 1 });
    }

    // Error handling
    const tryCatch = (content.match(/\btry\s*{/g) || []).length;
    if (tryCatch > 0) {
      patterns.push({ type: 'quality', pattern: 'error_handling', weight: tryCatch });
    }
  }

  // Python patterns
  if (ext === '.py') {
    const typeHints = (content.match(/->\s*\w+/g) || []).length;
    if (typeHints > 2) {
      patterns.push({ type: 'typing', pattern: 'python_type_hints', weight: typeHints });
    }

    const asyncDef = (content.match(/\basync\s+def\b/g) || []).length;
    if (asyncDef > 0) {
      patterns.push({ type: 'style', pattern: 'python_async', weight: asyncDef });
    }
  }

  return patterns;
}

/**
 * Extract bash command pattern
 */
function extractBashPattern(command) {
  if (!command) return null;

  // Normalize command
  const normalized = command.trim()
    .replace(/["'][^"']*["']/g, '""')  // Replace quoted strings
    .replace(/\d+/g, 'N')               // Replace numbers
    .replace(/\s+/g, ' ');              // Normalize whitespace

  // Extract base command
  const parts = normalized.split(/[|;&]/);
  const baseCmd = parts[0].trim().split(' ')[0];

  return {
    base: baseCmd,
    pattern: normalized.substring(0, 100),
    hasPipe: command.includes('|'),
    hasChain: command.includes('&&') || command.includes(';')
  };
}

/**
 * Record successful action
 */
async function recordSuccess(action) {
  const cache = loadCache();

  // Add to successful actions
  cache.successfulActions.push({
    ...action,
    timestamp: Date.now()
  });

  // Update file patterns
  if (action.type === 'write' || action.type === 'edit') {
    const ext = path.extname(action.file || '').toLowerCase() || 'other';
    if (!cache.filePatterns[ext]) {
      cache.filePatterns[ext] = { successCount: 0, patterns: {} };
    }
    cache.filePatterns[ext].successCount++;

    // Detect and count code patterns
    if (action.patterns) {
      action.patterns.forEach(p => {
        const key = `${p.type}:${p.pattern}`;
        if (!cache.filePatterns[ext].patterns[key]) {
          cache.filePatterns[ext].patterns[key] = { count: 0, weight: 0 };
        }
        cache.filePatterns[ext].patterns[key].count++;
        cache.filePatterns[ext].patterns[key].weight += p.weight || 1;
      });
    }
  }

  // Update bash patterns
  if (action.type === 'bash' && action.cmdPattern) {
    const key = action.cmdPattern.base;
    if (!cache.bashPatterns[key]) {
      cache.bashPatterns[key] = { count: 0, patterns: [] };
    }
    cache.bashPatterns[key].count++;
    cache.bashPatterns[key].lastSuccess = Date.now();
  }

  saveCache(cache);

  // Check if any pattern reached threshold
  await checkAndCreatePatterns(cache);
}

/**
 * Check patterns and create learned patterns if threshold reached
 */
async function checkAndCreatePatterns(cache) {
  // Check file patterns
  for (const [ext, data] of Object.entries(cache.filePatterns)) {
    for (const [patternKey, patternData] of Object.entries(data.patterns || {})) {
      if (patternData.count >= SUCCESS_THRESHOLD) {
        const [type, pattern] = patternKey.split(':');
        await recordPattern({
          type: 'code_style',
          category: type,
          description: `Prefer ${pattern.replace(/_/g, ' ')} in ${ext} files`,
          rule: pattern,
          evidence: [`Auto-detected from ${patternData.count} successful operations`]
        });

        // Reset count to avoid duplicate patterns
        cache.filePatterns[ext].patterns[patternKey].count = 0;
        saveCache(cache);

        console.log(`🧠 Smart Learn: Pattern detected! "${pattern}" in ${ext} files`);
      }
    }
  }

  // Check bash patterns
  for (const [cmd, data] of Object.entries(cache.bashPatterns)) {
    if (data.count >= SUCCESS_THRESHOLD * 2) { // Higher threshold for bash
      await recordPattern({
        type: 'workflow',
        category: 'bash',
        description: `Commonly used command: ${cmd}`,
        rule: cmd,
        evidence: [`Used successfully ${data.count} times`]
      });

      // Reset count
      cache.bashPatterns[cmd].count = 0;
      saveCache(cache);

      console.log(`🧠 Smart Learn: Bash pattern! "${cmd}" is frequently used`);
    }
  }
}

/**
 * Main hook execution
 */
/**
 * Core learning logic, factored out of main() so the consolidated
 * learning-dispatch.cjs can invoke it in-process (one node spawn instead of
 * one-per-hook). Takes an already-parsed hook input object; never reads stdin
 * and never calls process.exit — returns on every early-out so a dispatcher
 * can continue to the next module. Self-filters by tool_name, so it is safe to
 * call on any PostToolUse matcher (Bash|Write|Edit).
 *
 * @param {object} input - parsed PostToolUse stdin (tool_name/tool_input/tool_response)
 */
async function run(input) {
  if (!isLearningEnabled()) return;

  try {
    const { toolName, ti, toolResult } = resolveToolContext(input || {});

    // Skip if there was an error
    if (toolResult.includes('Error:') || toolResult.includes('error:') ||
        toolResult.includes('FAILED') || toolResult.includes('failed')) {
      return;
    }

    // Handle Write/Edit success
    if (toolName === 'Write' || toolName === 'Edit') {
      const filePath = ti.file_path || ti.path || process.env.CLAUDE_FILE_PATHS || '';

      // Early exit: skip non-learnable file types
      const SKIP_EXTS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.css', '.scss', '.svg', '.png', '.jpg', '.gif', '.ico', '.lock', '.log', '.env', '.toml', '.ini', '.cfg']);
      const ext = path.extname(filePath).toLowerCase();
      if (SKIP_EXTS.has(ext)) {
        return;
      }

      // The written code: Write carries tool_input.content; Edit tool_input.new_string.
      const content = ti.content || ti.new_string || '';

      if (filePath && content) {
        const patterns = detectCodePatterns(content, filePath);
        await recordSuccess({
          type: toolName.toLowerCase(),
          file: filePath,
          patterns: patterns
        });
      }
    }

    // Handle Bash success
    if (toolName === 'Bash') {
      // Only track certain types of commands
      const command = ti.command || '';
      if (command && !command.startsWith('cd ') && !command.startsWith('ls') &&
          !command.startsWith('echo') && !command.startsWith('cat')) {
        const cmdPattern = extractBashPattern(command);
        await recordSuccess({
          type: 'bash',
          command: command.substring(0, 200),
          cmdPattern: cmdPattern
        });
      }
    }
  } catch (error) {
    // Non-blocking — swallow so a dispatcher continues to the next module.
  }
}

async function main() {
  let input = {};
  try { input = readHookInputCompat(); } catch { /* env fallback in resolver */ }
  await run(input);
  process.exit(0);
}

module.exports = {
  detectCodePatterns,
  extractBashPattern,
  recordSuccess,
  resolveToolContext,
  run,
  trimKeyedMap,
  trimCache,
  MAP_MAX_KEYS,
  SUB_PATTERN_MAX_KEYS,
};

if (require.main === module) {
  main();
}
