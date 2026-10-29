#!/usr/bin/env node
/**
 * scope-drift.cjs - Detect workflow scope drift
 *
 * UserPromptSubmit hook.
 * Compares user prompt keywords against the initial workflow task.
 * Warns when the conversation scope diverges significantly.
 *
 * Exit codes:
 * - 0: No drift or no active workflow
 * - 1: Warning (scope drift detected)
 */

const fs = require('fs');
const path = require('path');
const { readSessionState } = require('./lib/af-config-utils.cjs');
const { readPromptFromStdin } = require('./lib/safe-stdin.cjs');

// Feature-indicating keywords that suggest new scope
const FEATURE_TRIGGERS = [
  /\balso\s+(?:add|create|implement|build)\b/i,
  /\bwhile\s+(?:you're|we're|you are)\s+at\s+it\b/i,
  /\bcan\s+you\s+also\b/i,
  /\blet'?s\s+also\b/i,
  /\band\s+(?:add|create|implement|build)\s+a?\s*(?:new\s+)?(?!test)/i,
  /\bnew\s+feature\b/i,
  /\bseparate\s+(?:task|feature|thing)\b/i,
];

// Stopwords to ignore in keyword extraction
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'that',
  'this', 'it', 'not', 'but', 'and', 'or', 'if', 'then', 'so', 'no',
  'yes', 'just', 'now', 'please', 'thanks', 'thank', 'ok', 'okay',
  'i', 'me', 'my', 'we', 'you', 'your', 'use', 'make', 'get', 'set',
]);

/**
 * Extract meaningful keywords from text
 */
function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Calculate keyword overlap between two texts
 */
function calculateOverlap(taskKeywords, promptKeywords) {
  if (taskKeywords.length === 0 || promptKeywords.length === 0) return 1;

  const taskSet = new Set(taskKeywords);
  const matched = promptKeywords.filter(k => taskSet.has(k));
  return matched.length / promptKeywords.length;
}

function main() {
  try {
    // Prompt arrives as JSON on stdin; CLAUDE_USER_PROMPT is only the TTY
    // fallback (see lib/safe-stdin.cjs). Reading env alone left userPrompt
    // empty in production, so scope-drift detection never fired.
    const userPrompt = readPromptFromStdin();
    if (!userPrompt || userPrompt.length < 20) process.exit(0);

    if (userPrompt.startsWith('/') || userPrompt.startsWith('workflow:')) {
      process.exit(0);
    }

    const sessionId = process.ppid?.toString();
    const state = readSessionState(sessionId);
    const taskDescription = state?.taskDescription || state?.task || '';
    if (!taskDescription) process.exit(0);

    const hasFeatureTrigger = FEATURE_TRIGGERS.some(re => re.test(userPrompt));

    const taskKeywords = extractKeywords(taskDescription);
    const promptKeywords = extractKeywords(userPrompt);
    const overlap = calculateOverlap(taskKeywords, promptKeywords);

    if (hasFeatureTrigger && overlap < 0.2) {
      console.error('🔀 Scope drift detected: This looks like a new feature outside the current workflow.');
      console.error(`   Current task: "${taskDescription.substring(0, 60)}"`);
      console.error('   Consider starting a separate workflow for better focus and token efficiency.');
      process.exit(1);
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = { extractKeywords, calculateOverlap, FEATURE_TRIGGERS, STOPWORDS };
}
