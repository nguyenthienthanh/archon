#!/usr/bin/env node
/**
 * Aura Frog - Feedback Capture Hook
 *
 * Fires: PostToolUse (after Edit, Write operations) — dispatched in-process by
 *        learning-dispatch.cjs (no longer registered directly in hooks.json;
 *        exported run() is the entrypoint). Standalone CLI still works.
 * Purpose: Detect when user corrects AI output and record as feedback
 *
 * Detection Patterns:
 * 1. User edits a file that AI just wrote/edited (correction)
 * 2. User switches agent after AI suggested one (agent_switch)
 * 3. Explicit feedback commands (/learn:feedback)
 *
 * Exit Codes:
 *   0 - Success (non-blocking)
 *
 * @version 1.0.0
 */

const fs = require('fs');
const { readStdinSafely } = require('./lib/safe-stdin.cjs');
const path = require('path');
const { recordFeedback, recordAgentPerformance, isFeedbackEnabled } = require('./lib/af-learning.cjs');

// Track recent AI operations for correction detection.
// Project-scoped (conversation happens within a project; corrections are per-project).

const { findProjectRoot } = require('./lib/hook-runtime.cjs');
const STATE_FILE = path.join(findProjectRoot(), '.claude', 'cache', 'aura-frog-recent-ops.json');

/**
 * Load recent operations state
 */
function loadRecentOps() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      // Only return ops from last 10 minutes
      const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
      return data.filter(op => op.timestamp > tenMinutesAgo);
    }
  } catch { /* malformed data - skip silently, fresh state on next run */ }
  return [];
}

/**
 * Save recent operations state
 */
function saveRecentOps(ops) {
  try {
    // Keep only last 50 operations
    const trimmed = ops.slice(-50);
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(trimmed));
  } catch { /* fs/cache write - non-blocking, ops tracking is best-effort */ }
}

/**
 * Record an AI operation (called when AI writes/edits)
 */
function recordAiOperation(operation) {
  const ops = loadRecentOps();
  ops.push({
    ...operation,
    timestamp: Date.now(),
    source: 'ai'
  });
  saveRecentOps(ops);
}

/**
 * Check if this is a user correction of AI output
 */
function detectCorrection(userOp, recentOps) {
  // Look for AI operation on same file within last 5 minutes
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

  for (const aiOp of recentOps) {
    if (aiOp.source === 'ai' &&
        aiOp.timestamp > fiveMinutesAgo &&
        aiOp.filePath === userOp.filePath &&
        aiOp.tool !== userOp.tool) {
      return {
        isCorrection: true,
        aiOperation: aiOp
      };
    }
  }

  return { isCorrection: false };
}

/**
 * Main hook execution
 */
/**
 * Core correction-capture logic, factored out of main() so the consolidated
 * learning-dispatch.cjs can invoke it in-process (one node spawn instead of
 * one-per-hook). Takes the RAW parsed stdin object (NOT the frozen
 * hook-runtime whitelist — it reads data.source / data.is_assistant which the
 * whitelist drops). Never reads stdin and never calls process.exit — returns
 * on every early-out so a dispatcher can continue to the next module.
 * Self-filters to Edit/Write, so it is safe to call on any PostToolUse matcher.
 *
 * @param {object} data - raw parsed PostToolUse stdin
 */
async function run(data) {
  if (!isFeedbackEnabled()) return;

  try {
    const { tool, input, output, sessionId } = extractToolFields(data || {});

    // Skip if not a file operation
    if (!['Edit', 'Write'].includes(tool)) return;

    const filePath = input?.file_path || input?.path;
    if (!filePath) return;

    // Fast path: skip brand-new files (ctime ≈ mtime means just created, no correction possible)
    try {
      const stat = fs.statSync(filePath);
      if (Math.abs(stat.ctimeMs - stat.mtimeMs) < 1000) return;
    } catch { /* file may not exist yet — skip silently */ }

    const recentOps = loadRecentOps();

    // Check if this is AI operation or user correction
    const isAiOperation = (data || {}).source === 'assistant' || (data || {}).is_assistant;

    if (isAiOperation) {
      // Record AI operation for future correction detection
      recordAiOperation({
        tool,
        filePath,
        content: input?.content || input?.new_string,
        workflowId: process.env.AF_WORKFLOW_ID
      });
    } else {
      // This might be a user correction
      const correction = detectCorrection({ tool, filePath }, recentOps);

      if (correction.isCorrection) {
        // Record as feedback
        await recordFeedback({
          type: 'correction',
          sessionId,
          workflowId: process.env.AF_WORKFLOW_ID,
          original: correction.aiOperation.content?.substring(0, 1000),
          corrected: (input?.content || input?.new_string)?.substring(0, 1000),
          metadata: {
            file: filePath,
            aiTool: correction.aiOperation.tool,
            userTool: tool,
            timeSinceAiOp: Date.now() - correction.aiOperation.timestamp
          }
        });

        console.log('🐸 Learning: Recorded correction feedback');
      }
    }
  } catch (error) {
    // Non-blocking - don't fail the tool use
    console.error(`🐸 Feedback hook error: ${error.message}`);
  }
}

async function main() {
  // Read stdin for tool use data
  let data = {};
  try {
    const stdin = readStdinSafely();
    if (stdin) data = JSON.parse(stdin);
  } catch { /* malformed data - skip silently, no stdin or invalid JSON is expected */ }

  await run(data);
  process.exit(0);
}

// Export for testing
/**
 * Extract tool fields from a PostToolUse stdin payload. The hook contract uses
 * tool_name / tool_input / tool_response; the old code read tool / input /
 * output (which are never present), so `tool` was always undefined and the hook
 * exited before doing anything. Accept the correct names, falling back to the
 * legacy ones for safety.
 */
function extractToolFields(data) {
  const d = data || {};
  return {
    tool: d.tool_name !== undefined ? d.tool_name : d.tool,
    input: d.tool_input !== undefined ? d.tool_input : d.input,
    output: d.tool_response !== undefined ? d.tool_response : d.output,
    sessionId: d.session_id,
  };
}

module.exports = { recordAiOperation, detectCorrection, extractToolFields, run };

// Run if called directly
if (require.main === module) {
  main();
}
