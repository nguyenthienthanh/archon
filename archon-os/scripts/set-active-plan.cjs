#!/usr/bin/env node
/**
 * Aura Frog - Set Active Plan Command
 *
 * Usage (from Claude):
 *   node hooks/set-active-plan.cjs <plan-path>
 *   node hooks/set-active-plan.cjs plans/241223-user-auth
 *   node hooks/set-active-plan.cjs clear
 *
 * This sets the active plan in session state, which will be used
 * by session-start.cjs to inject AF_ACTIVE_PLAN env var.
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { readSessionState, writeSessionState } = require('../hooks/lib/af-config-utils.cjs');

function main() {
  const args = process.argv.slice(2);
  const planPath = args[0];

  if (!planPath) {
    console.error('Usage: set-active-plan.cjs <plan-path|clear>');
    process.exit(1);
  }

  // Get session ID from parent process or env
  const sessionId = process.env.AF_SESSION_ID || process.ppid?.toString();

  if (!sessionId) {
    console.error('Error: No session ID available');
    process.exit(1);
  }

  // Read existing state
  const existingState = readSessionState(sessionId) || {
    sessionOrigin: process.cwd(),
    timestamp: Date.now()
  };

  if (planPath === 'clear') {
    // Clear active plan
    existingState.activePlan = null;
    existingState.suggestedPlan = null;
    writeSessionState(sessionId, existingState);
    console.log('✓ Active plan cleared');
    process.exit(0);
  }

  // Validate plan path exists
  const resolvedPath = path.resolve(process.cwd(), planPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: Plan path does not exist: ${resolvedPath}`);
    process.exit(1);
  }

  // Check for plan.md file
  const planFile = path.join(resolvedPath, 'plan.md');
  if (!fs.existsSync(planFile)) {
    console.warn(`Warning: No plan.md found in ${resolvedPath}`);
  }

  // Update session state
  existingState.activePlan = planPath;
  existingState.suggestedPlan = null; // Clear suggestion when explicitly setting
  existingState.timestamp = Date.now();

  writeSessionState(sessionId, existingState);

  console.log(`✓ Active plan set: ${planPath}`);
  console.log(`  Session: ${sessionId}`);
  console.log(`  Path: ${resolvedPath}`);

  process.exit(0);
}

main();
