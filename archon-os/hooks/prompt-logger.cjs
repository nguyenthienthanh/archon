#!/usr/bin/env node
/**
 * Aura Frog - Prompt Logger Hook
 *
 * Fires: UserPromptSubmit (async)
 * Purpose: Log user prompts with metadata for usage analysis
 *
 * Captures:
 * - Timestamp, prompt text (truncated), word count, char count
 * - Detected intent (question, command, task, debug, feedback, chat)
 * - Skills/commands referenced
 * - Complexity signals
 *
 * Storage: .claude/metrics/prompts/{date}.jsonl
 * Rotation: 30 days (cleaned on SessionStart via session-start.cjs)
 *
 * Exit codes:
 *   0 - Always (non-blocking, informational only)
 *
 * @version 1.0.0
 */

const fs = require('fs');
const { readStdinSafely } = require('./lib/safe-stdin.cjs');
const path = require('path');


const { findProjectRoot } = require('./lib/hook-runtime.cjs');
const PROMPTS_DIR = path.join(findProjectRoot(), '.claude', 'metrics', 'prompts');
const MAX_PROMPT_LENGTH = 2000;
const RETENTION_DAYS = 30;

// Intent detection patterns
const INTENT_PATTERNS = [
  { intent: 'command', pattern: /^\// },
  { intent: 'debug', pattern: /\b(debug|errors?|bugs?|fix(es|ed)?|broken|crash(es|ed)?|fail(s|ed|ing)?|not working|issues?|problems?|wrong|incorrect)\b/i },
  { intent: 'question', pattern: /^(what|how|why|where|when|who|which|can|could|would|is|are|do|does|did|should|will)\b/i },
  { intent: 'question', pattern: /\?\s*$/ },
  { intent: 'review', pattern: /\b(review|check|audit|look at|examine|inspect)\b/i },
  { intent: 'test', pattern: /\b(tests?|specs?|coverage|unit tests?|e2e|integration tests?)\b/i },
  { intent: 'refactor', pattern: /\b(refactor|simplify|clean up|reorganize|optimize)\b/i },
  { intent: 'implement', pattern: /\b(implement|build|create|add|develop|make|write|generate)\b/i },
  { intent: 'feedback', pattern: /^(no[,.\s!]|nope|wrong|actually|don't|stop|never|prefer|good|great|perfect|thanks)/i },
  { intent: 'explain', pattern: /\b(explain|describe|tell me|walk me through|what does)\b/i },
];

// Complexity signals
const COMPLEXITY_SIGNALS = {
  multi_file: /\b(multiple files|across files|several files|refactor.*system)\b/i,
  architecture: /\b(architect|design|system|infrastructure|migration|scale)\b/i,
  security: /\b(security|auth|password|token|encrypt|vulnerability|owasp)\b/i,
  performance: /\b(performance|optimize|slow|latency|cache|bundle size)\b/i,
  database: /\b(database|schema|migration|query|sql|orm)\b/i,
};

// Skill/command references
const SKILL_PATTERN = /\/([\w:-]+)/g;
const AGENT_PATTERN = /\b(lead|architect|frontend|mobile|strategist|security|tester|devops|scanner|router)\b/i;

/**
 * Detect primary intent from prompt text
 */
function detectIntent(prompt) {
  for (const { intent, pattern } of INTENT_PATTERNS) {
    if (pattern.test(prompt)) {
      return intent;
    }
  }
  return 'chat';
}

/**
 * Detect complexity signals
 */
function detectComplexity(prompt) {
  const signals = [];
  for (const [signal, pattern] of Object.entries(COMPLEXITY_SIGNALS)) {
    if (pattern.test(prompt)) {
      signals.push(signal);
    }
  }
  return signals;
}

/**
 * Extract referenced skills/commands
 */
function extractReferences(prompt) {
  const commands = [];
  let match;
  while ((match = SKILL_PATTERN.exec(prompt)) !== null) {
    commands.push(match[1]);
  }

  const agentMatch = prompt.match(AGENT_PATTERN);
  const agent = agentMatch ? agentMatch[1].toLowerCase() : null;

  return { commands, agent };
}

/**
 * Clean up old prompt logs (>30 days)
 */
function cleanupOldLogs() {
  try {
    if (!fs.existsSync(PROMPTS_DIR)) return;

    const cutoff = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const files = fs.readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.jsonl'));

    for (const file of files) {
      const filePath = path.join(PROMPTS_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    }
  } catch { /* cleanup - best effort */ }
}

/**
 * Main hook execution
 */
function main() {
  // Check if disabled
  if (process.env.AF_PROMPT_LOGGING === 'false' || process.env.AF_PROMPT_LOGGING === '0') {
    process.exit(0);
  }

  try {
    // Read stdin for hook data
    let input = '';
    try {
      input = readStdinSafely();
    } catch { /* no stdin */ }

    // Get user prompt from stdin JSON or env
    let userPrompt = '';
    try {
      const data = JSON.parse(input);
      userPrompt = data.prompt || data.user_prompt || '';
    } catch { /* not JSON */ }

    if (!userPrompt) {
      userPrompt = process.env.CLAUDE_USER_PROMPT || '';
    }

    if (!userPrompt || userPrompt.length < 2) {
      process.exit(0);
    }

    // Ensure directory exists
    if (!fs.existsSync(PROMPTS_DIR)) {
      fs.mkdirSync(PROMPTS_DIR, { recursive: true });
    }

    // Build log entry
    const now = new Date();
    const refs = extractReferences(userPrompt);
    const entry = {
      ts: now.toISOString(),
      prompt: userPrompt.substring(0, MAX_PROMPT_LENGTH),
      words: userPrompt.split(/\s+/).filter(Boolean).length,
      chars: userPrompt.length,
      intent: detectIntent(userPrompt),
      complexity: detectComplexity(userPrompt),
      commands: refs.commands,
      agent: refs.agent || process.env.AF_CURRENT_AGENT || null,
      phase: process.env.AF_CURRENT_PHASE || null,
      project: process.env.AF_PROJECT_NAME || process.env.PROJECT_NAME || null,
      framework: process.env.AF_FRAMEWORK || null,
      sessionId: process.ppid?.toString() || null,
    };

    // Write to JSONL file (one per day)
    const dateStr = now.toISOString().slice(0, 10);
    const logFile = path.join(PROMPTS_DIR, `${dateStr}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');

    // Periodic cleanup (roughly once per day — check if cleanup marker exists)
    const cleanupMarker = path.join(PROMPTS_DIR, `.cleanup-${dateStr}`);
    if (!fs.existsSync(cleanupMarker)) {
      cleanupOldLogs();
      try { fs.writeFileSync(cleanupMarker, ''); } catch { /* marker write - non-blocking */ }
    }

    process.exit(0);
  } catch (error) {
    // Silent fail - non-blocking
    process.exit(0);
  }
}

// Export for testing
module.exports = { detectIntent, detectComplexity, extractReferences };

if (require.main === module) {
  main();
}
