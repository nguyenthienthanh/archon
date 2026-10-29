#!/usr/bin/env node
/**
 * Team Log Writer - Lightweight teammate log helper
 *
 * Minimal-dependency module for teammates to call from hooks.
 * Reads AF_TEAM_LOG_DIR and CLAUDE_TEAMMATE_NAME env vars.
 *
 * All writes are JSONL appends (one JSON object per line).
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

function getLogDir() {
  return process.env.AF_TEAM_LOG_DIR || null;
}

function getAgentName() {
  return process.env.CLAUDE_TEAMMATE_NAME || 'unknown';
}

/**
 * Append a JSONL entry to team-log.jsonl and agent-specific log.
 */
function appendEntry(entry) {
  const logDir = getLogDir();
  if (!logDir) return;

  // Ensure directory exists
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch { return; }

  const line = JSON.stringify(entry) + '\n';

  try {
    // Combined team log
    fs.appendFileSync(path.join(logDir, 'team-log.jsonl'), line, 'utf-8');

    // Per-agent log
    const agent = entry.agent;
    if (agent && agent !== 'system') {
      fs.appendFileSync(path.join(logDir, `${sanitizeAgentName(agent)}.jsonl`), line, 'utf-8');
    }
  } catch { /* non-fatal */ }
}

/**
 * Log a generic action.
 */
function logAction(action, description, meta) {
  appendEntry({
    ts: new Date().toISOString(),
    agent: getAgentName(),
    action,
    description: description || '',
    meta: meta || {}
  });
}

/**
 * Log a task being claimed.
 */
function logTaskClaimed(taskId, subject) {
  logAction('task_claimed', subject, { taskId });
}

/**
 * Log a task being completed.
 */
function logTaskCompleted(taskId, subject, meta) {
  logAction('task_completed', subject, { taskId, ...(meta || {}) });
}

/**
 * Log a file edit.
 */
function logFileEdited(filePath, description) {
  logAction('file_edited', description || `Edited ${filePath}`, { files: [filePath] });
}

/**
 * Log a message sent to another teammate.
 */
function logMessageSent(recipient, summary) {
  logAction('message_sent', summary, { recipient });
}

// -------------------------------------------------------------------
// Exports
// -------------------------------------------------------------------

// Collapse anything outside [A-Za-z0-9._-] to '_' and strip leading dots so an
// agent name like '../../etc/x' cannot escape the log dir when used as a
// per-agent log filename.
function sanitizeAgentName(agent) {
  return String(agent || 'agent').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '') || 'agent';
}

module.exports = {
  logAction,
  logTaskClaimed,
  logTaskCompleted,
  logFileEdited,
  logMessageSent,
  sanitizeAgentName
};
