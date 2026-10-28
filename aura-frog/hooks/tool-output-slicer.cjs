#!/usr/bin/env node
/**
 * Archon Memory Manager — Tool Output Slicer Hook
 *
 * Fires: PostToolUse (Bash | Read)
 * Purpose: Enforces Context Virtualization by paging oversized tool outputs (>2,000 tokens)
 *          to a secure local disk vault (.claude/scratch/vault/) while preserving 100% of the
 *          data and providing Claude with a clean digest and line-range index.
 *
 * @version 1.0.0
 */

'use strict';

const { readStdinSafely } = require('./lib/safe-stdin.cjs');
const { virtualizeToolOutput } = require('./lib/memory-manager.cjs');
const { findProjectRoot } = require('./lib/hook-runtime.cjs');

function main() {
  if (process.env.ARCHON_MEMORY_MANAGER_DISABLED === 'true' || process.env.AF_MEMORY_MANAGER_DISABLED === 'true') {
    process.exit(0);
  }

  let rawStdin = '';
  try {
    rawStdin = readStdinSafely();
  } catch {
    process.exit(0);
  }

  if (!rawStdin) process.exit(0);

  let data;
  try {
    data = JSON.parse(rawStdin);
  } catch {
    process.exit(0);
  }

  // Extract tool name and output text
  const toolName = data.tool_name || data.tool || 'tool';
  const output = data.tool_result || data.output || data.stdout || '';

  if (typeof output !== 'string' || output.length === 0) {
    process.exit(0);
  }

  const root = findProjectRoot();
  const result = virtualizeToolOutput(output, {
    toolName,
    projectRoot: root,
  });

  if (result.virtualized) {
    // Write notification to stderr so user and model see that paging took place
    process.stderr.write(`\n[Archon Memory Manager] Paged ${result.originalChars} chars to Vault: ${result.relVaultPath}\n`);
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };

