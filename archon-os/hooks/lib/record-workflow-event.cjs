#!/usr/bin/env node
/**
 * Record Workflow Event
 *
 * CLI wrapper for recording workflow events to local storage and Supabase.
 * Called by phase-transition.sh and other workflow scripts.
 *
 * Usage:
 *   node record-workflow-event.cjs <event_type> <phase> [workflow_id] [reason] [attempt_count]
 *
 * Event types: APPROVED, REJECTED, MODIFIED, CANCELLED, PHASE_START, WORKFLOW_COMPLETE, TEAM_CREATED, TEAM_TEARDOWN, TEAM_LOG_MERGED
 *
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');

// Load the learning library
const learning = require('./af-learning.cjs');

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node record-workflow-event.cjs <event_type> <phase> [workflow_id] [reason] [attempt_count]');
    console.error('Event types: APPROVED, REJECTED, MODIFIED, CANCELLED, PHASE_START, WORKFLOW_COMPLETE, TEAM_CREATED, TEAM_TEARDOWN, TEAM_LOG_MERGED');
    process.exit(1);
  }

  const eventType = args[0].toUpperCase();
  const phase = parseInt(args[1], 10);
  const workflowId = args[2] || getActiveWorkflowId();
  const reason = args[3] || null;
  const attemptCount = args[4] ? parseInt(args[4], 10) : 1;

  if (!workflowId) {
    console.error('Error: No workflow ID provided and no active workflow found');
    process.exit(1);
  }

  const validEventTypes = ['APPROVED', 'REJECTED', 'MODIFIED', 'CANCELLED', 'PHASE_START', 'WORKFLOW_COMPLETE', 'TEAM_CREATED', 'TEAM_TEARDOWN', 'TEAM_LOG_MERGED'];
  if (!validEventTypes.includes(eventType)) {
    console.error(`Error: Invalid event type "${eventType}". Valid types: ${validEventTypes.join(', ')}`);
    process.exit(1);
  }

  try {
    const result = await learning.recordWorkflowEvent({
      workflowId,
      eventType,
      phase,
      reason,
      attemptCount,
      metadata: {
        source: 'phase-transition',
        recorded_at: new Date().toISOString()
      }
    });

    if (result) {
      console.log(`✓ Recorded ${eventType} event for phase ${phase} (workflow: ${workflowId})`);
      if (learning.isSupabaseConfigured()) {
        console.log('  → Synced to Supabase');
      }
    }
  } catch (error) {
    console.error(`Error recording workflow event: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Get active workflow ID from active-workflow.txt
 */
function getActiveWorkflowId() {
  const { findProjectRoot } = require('./hook-runtime.cjs');
  const possiblePaths = [
    path.join(findProjectRoot(), '.claude', 'active-workflow.txt'),
    path.join(process.cwd(), 'active-workflow.txt')
  ];

  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8').trim();
      }
    } catch { /* ignore */ }
  }

  return null;
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
