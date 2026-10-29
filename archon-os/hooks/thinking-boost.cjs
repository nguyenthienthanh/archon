#!/usr/bin/env node
/**
 * UserPromptSubmit Hook - Silently enhance Claude's reasoning depth
 *
 * Injects thinking-level hints based on detected task complexity.
 * Hints appear as system messages via JSON output.
 *
 * Levels:
 *   0 - Disabled (quick tasks: typo, rename)
 *   1 - Light (standard tasks: bug fix, small feature)
 *   2 - Deep (complex: multi-file, architecture)
 *   3 - Maximum (critical: security audit, data migration)
 *
 * Disable: AF_THINKING_BOOST=0 in .envrc
 *
 * @version 1.0.0
 */

const fs = require('fs');
const { readStdinSafely } = require('./lib/safe-stdin.cjs');
const path = require('path');

// Check if disabled
if (process.env.AF_THINKING_BOOST === '0' || process.env.AF_THINKING_BOOST === 'false') {
  process.exit(0);
}

// Thinking hints per level
const THINKING_HINTS = {
  1: 'Think step-by-step. Consider edge cases.',
  2: 'Think deeply. Consider: trade-offs, failure modes, edge cases, security implications, performance impact. Reason through alternatives before deciding.',
  3: 'Think extremely carefully. This is critical. Consider: all failure modes, security vulnerabilities, data integrity, rollback strategy, monitoring needs, blast radius. Challenge your own assumptions. Verify each step.',
};

// Task patterns that force level 3
const CRITICAL_PATTERNS = /\b(security audit|migration|payment|auth.*system|database.*schema|production.*deploy|delete.*user|gdpr|compliance)\b/i;

function readSessionState() {
  try {

const { findProjectRoot } = require('./lib/hook-runtime.cjs');
    const cacheDir = path.join(findProjectRoot(), '.claude', 'cache');
    const cacheFile = path.join(cacheDir, 'session-start-cache.json');
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
  } catch { /* ignore */ }
  return {};
}

function main() {
  let input = '';
  try {
    input = readStdinSafely();
  } catch { /* no stdin */ }

  let userPrompt = '';
  try {
    const data = JSON.parse(input);
    userPrompt = data.prompt || data.user_prompt || '';
  } catch { /* not JSON */ }

  const state = readSessionState();

  // Determine level from complexity
  const complexityMap = { quick: 0, standard: 1, deep: 2 };
  let level = complexityMap[state.complexity] || 1;

  // Override to level 3 for critical tasks
  if (CRITICAL_PATTERNS.test(userPrompt)) {
    level = 3;
  }

  // Phase-specific boosts
  const phase = state.phase || state.currentPhase || '';
  if (phase === '1') level = Math.max(level, 2); // Design needs deep thinking
  if (phase === '4') level = Math.max(level, 2); // Review needs deep thinking

  // Inject hint
  if (level > 0 && THINKING_HINTS[level]) {
    const result = { systemMessage: THINKING_HINTS[level] };
    console.log(JSON.stringify(result));
  }

  process.exit(0);
}

// Run as a hook; stay importable for tests. FEAT-007 / issue #5.
if (require.main === module) {
  main();
} else {
  module.exports = { readSessionState };
}
