'use strict';

/**
 * Archon Memory Manager (AMM)
 *
 * Implements Context Virtualization across two storage tiers:
 * - Tier 1: Context Window RAM (bounded to token budget)
 * - Tier 2: Local Disk Vault (.claude/scratch/vault/ - 100% data preservation)
 *
 * Provides:
 * 1. Paging & Slicing for oversized tool results (> 2,000 tokens)
 * 2. Research-preserving structured summaries with line-range pointers
 * 3. Replan Circuit Breaker (hard-freeze upon budget exhaustion)
 *
 * @version 1.0.0
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_MAX_OUTPUT_CHARS = 8000; // ~2,000 tokens (4 chars/token approx)
const DEFAULT_HEAD_LINES = 35;
const DEFAULT_TAIL_LINES = 35;

/**
 * Resolve max characters before virtualization kicks in.
 */
function getMaxOutputChars() {
  const custom = process.env.ARCHON_MAX_TOOL_OUTPUT || process.env.AF_MAX_TOOL_OUTPUT;
  if (custom) {
    const parsed = parseInt(custom, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_OUTPUT_CHARS;
}

/**
 * Ensure the local Vault directory exists with restricted user-only permissions.
 *
 * @param {string} projectRoot
 * @returns {string} vaultDir
 */
function ensureVaultDir(projectRoot = process.cwd()) {
  const vaultDir = path.join(projectRoot, '.claude', 'scratch', 'vault');
  if (!fs.existsSync(vaultDir)) {
    fs.mkdirSync(vaultDir, { recursive: true, mode: 0o700 });
  }
  return vaultDir;
}

/**
 * Save raw un-truncated output to disk vault.
 *
 * @param {string} rawContent
 * @param {string} toolName
 * @param {string} [projectRoot=process.cwd()]
 * @returns {string} filePath
 */
function vaultRawOutput(rawContent, toolName = 'tool', projectRoot = process.cwd()) {
  const vaultDir = ensureVaultDir(projectRoot);
  const hash = crypto.createHash('sha256').update(rawContent).digest('hex').slice(0, 8);
  const timestamp = Date.now();
  const safeTool = toolName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const fileName = `${safeTool}-${timestamp}-${hash}.txt`;
  const filePath = path.join(vaultDir, fileName);

  fs.writeFileSync(filePath, rawContent, { mode: 0o600 });
  return filePath;
}

/**
 * Virtualize / Page oversized tool output.
 * If rawContent exceeds threshold, stores full content in Vault and returns
 * a bounded representation with head, tail, and line-range index.
 *
 * @param {string} rawContent
 * @param {object} options
 * @param {string} [options.toolName='tool']
 * @param {string} [options.projectRoot=process.cwd()]
 * @param {number} [options.maxChars]
 * @param {number} [options.headLines=35]
 * @param {number} [options.tailLines=35]
 * @returns {{ virtualized: boolean, output: string, vaultPath?: string, originalChars: number }}
 */
function virtualizeToolOutput(rawContent, options = {}) {
  if (typeof rawContent !== 'string') {
    return { virtualized: false, output: String(rawContent || ''), originalChars: 0 };
  }

  const maxChars = options.maxChars || getMaxOutputChars();
  const originalChars = rawContent.length;

  // Below threshold: pass through untouched
  if (originalChars <= maxChars) {
    return { virtualized: false, output: rawContent, originalChars };
  }

  const toolName = options.toolName || 'tool';
  const projectRoot = options.projectRoot || process.cwd();
  const headCount = options.headLines || DEFAULT_HEAD_LINES;
  const tailCount = options.tailLines || DEFAULT_TAIL_LINES;

  // 1. Vault raw content to disk
  const vaultPath = vaultRawOutput(rawContent, toolName, projectRoot);
  const relVaultPath = path.relative(projectRoot, vaultPath);

  // 2. Compute lines
  const lines = rawContent.split('\n');
  const totalLines = lines.length;

  const head = lines.slice(0, headCount).join('\n');
  const tail = lines.slice(-tailCount).join('\n');
  const omittedCount = Math.max(0, totalLines - headCount - tailCount);
  const approxTokens = Math.round(originalChars / 4);

  // 3. Assemble structured digest
  const notice = [
    `[ARCHON MEMORY MANAGER: Output was ${originalChars} chars (~${approxTokens} tokens) across ${totalLines} lines.]`,
    `[PAGING ACTIVE: 100% of raw content safely vaulted at: ${relVaultPath}]`,
    `--- HEAD (Lines 1 to ${Math.min(headCount, totalLines)}) ---`,
    head,
    `... [${omittedCount} lines paged to disk vault to protect Context RAM] ...`,
    `--- TAIL (Lines ${Math.max(1, totalLines - tailCount + 1)} to ${totalLines}) ---`,
    tail,
    `-------------------------------------------------------------------------`,
    `[RESEARCH TIP: To inspect paged sections without context bloat, use read_file with StartLine and EndLine on '${relVaultPath}']`
  ].join('\n');

  return {
    virtualized: true,
    output: notice,
    vaultPath,
    relVaultPath,
    originalChars,
    totalLines,
  };
}

/**
 * Replan Circuit Breaker: Enforces hard freeze when a plan node exhausts its replan budget.
 *
 * @param {object} node
 * @param {number} [node.replan_budget_remaining]
 * @returns {{ allowed: boolean, reason?: string, budgetRemaining: number }}
 */
function checkReplanCircuitBreaker(node = {}) {
  const budget = node.replan_budget_remaining !== undefined ? node.replan_budget_remaining : 3;

  if (budget <= 0) {
    return {
      allowed: false,
      reason: 'replan_budget_exhausted',
      budgetRemaining: 0,
      message: '🚨 ARCHON CIRCUIT BREAKER: Replan budget exhausted (0 remaining). Node is frozen to prevent token loop. Manual user escalation required.',
    };
  }

  return {
    allowed: true,
    budgetRemaining: budget,
  };
}

module.exports = {
  virtualizeToolOutput,
  vaultRawOutput,
  ensureVaultDir,
  getMaxOutputChars,
  checkReplanCircuitBreaker,
  DEFAULT_MAX_OUTPUT_CHARS,
};

