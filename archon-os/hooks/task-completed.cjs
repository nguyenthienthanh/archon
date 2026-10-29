#!/usr/bin/env node
/**
 * TaskCompleted Hook - Validates teammate task completion
 *
 * Fires when a teammate marks a task as done.
 * Exit 2 = reject (needs revision - sends feedback)
 * Exit 0 = accept completion
 *
 * Validates:
 * 1. Quality gates: lint/test status
 * 2. Cross-review completeness
 * 3. Phase deliverable requirements
 *
 * @version 1.0.0
 */

const fs = require('fs');
const { readStdinSafely } = require('./lib/safe-stdin.cjs');
const path = require('path');

const {
  readSessionState,
  isAgentTeamsEnabled
} = require('./lib/af-config-utils.cjs');

// Phase deliverable requirements
const PHASE_DELIVERABLES = {
  '1': ['requirements documented'],
  '2': ['technical design approved'],
  '3': ['ui breakdown complete'],
  '4': ['test plan written'],
  '5a': ['failing tests written (RED)'],
  '5b': ['all tests passing (GREEN)'],
  '5c': ['code refactored, tests still pass'],
  '6': ['security review complete'],
  '7': ['qa validation passed'],
  '8': ['documentation updated'],
  '9': ['notifications sent']
};

function parseTaskInput() {
  try {
    const stdin = readStdinSafely();
    if (stdin) {
      return JSON.parse(stdin);
    }
  } catch (e) { /* ignore */ }
  return {};
}

// Pure: in a TDD phase (5a/5b/5c) a task must reference test results — its
// description/subject has to mention test/spec/assert/expect/coverage. Returns
// true when that requirement is VIOLATED.
const TDD_PHASES = ['5a', '5b', '5c'];
function checkTddViolation(currentPhase, taskData) {
  if (!currentPhase || !TDD_PHASES.includes(currentPhase)) return false;
  const desc = ((taskData && (taskData.description || taskData.subject)) || '').toLowerCase();
  return !/test|spec|assert|expect|coverage/.test(desc);
}

// Pure: phases 2 and 5b are approval gates — completion is blocked while the
// matching approval status is still 'pending'. Returns true when BLOCKED.
const APPROVAL_PHASES = ['2', '5b'];
function checkApprovalPending(currentPhase, state) {
  if (!currentPhase || !APPROVAL_PHASES.includes(currentPhase)) return false;
  const status = state && state.approvalStatus && state.approvalStatus[`phase${currentPhase}`];
  return status === 'pending';
}

function main() {
  // Only active when Agent Teams is enabled
  if (!isAgentTeamsEnabled()) {
    process.exit(0);
    return;
  }

  const teammateName = process.env.CLAUDE_TEAMMATE_NAME;
  if (!teammateName) {
    process.exit(0);
    return;
  }

  const taskData = parseTaskInput();
  const sessionId = process.ppid?.toString();
  const state = readSessionState(sessionId);
  const currentPhase = state?.phase || process.env.AF_CURRENT_PHASE;

  // Validation 1: TDD phases must reference test results.
  if (checkTddViolation(currentPhase, taskData)) {
    console.error('🔴 TDD Violation: Task in TDD phase must reference test results');
    console.error('Action: Run tests and include results before marking complete');
    process.exit(2); // Reject
    return;
  }

  // Validation 2: approval-gate phases can't complete while approval is pending.
  if (checkApprovalPending(currentPhase, state)) {
    console.error(`⏳ Phase ${currentPhase} requires user approval before completion`);
    console.error('Action: Wait for approval gate before marking phase complete');
    process.exit(2); // Reject
    return;
  }

  // Record completion in team log if available
  if (process.env.AF_TEAM_LOG_DIR) {
    try {
      const teamLogWriter = require('./lib/team-log-writer.cjs');
      const taskId = taskData.taskId || taskData.id || 'unknown';
      const subject = taskData.subject || taskData.description || '';
      teamLogWriter.logTaskCompleted(taskId, subject, {
        phase: currentPhase,
        validation: 'passed'
      });
    } catch { /* non-fatal */ }
  }

  // Accept completion
  process.exit(0);
}

// Run as a hook; stay importable for tests. parseTaskInput reads stdin (blocks a
// test runner), so it stays unexported. FEAT-007 / issue #5.
if (require.main === module) {
  main();
} else {
  module.exports = { checkTddViolation, checkApprovalPending };
}
