#!/usr/bin/env node
/**
 * Session State Management Library
 *
 * Shared utilities for session state across hooks.
 * Uses af-config-utils.cjs for core read/write operations.
 * State file: /tmp/af-session-{ppid}.json
 *
 * @version 1.1.0
 */

const fs = require('fs');
const {
  getSessionTempPath,
  readSessionState,
  writeSessionState
} = require('./af-config-utils.cjs');

// Get session file path (for compatibility)
function getSessionFile() {
  return getSessionTempPath(process.ppid?.toString());
}

// Create default state
function createDefaultState() {
  return {
    startedAt: new Date().toISOString(),
    phase: null,
    approvalStatus: {},
    activePlan: null,
    suggestedPlan: null,
    agents: [],
    tokenEstimate: 0,
    complexity: null,
    projectType: null,
    packageManager: null,
    framework: null,
    activeTeam: null,
    activeTeamPhase: null,
    teamLogDir: null,
    teamHistory: []
  };
}

// Load session state
function loadState() {
  const sessionId = process.ppid?.toString();
  const state = readSessionState(sessionId);
  return state || createDefaultState();
}

// Save session state
function saveState(state) {
  const sessionId = process.ppid?.toString();
  return writeSessionState(sessionId, state);
}

// Update specific state field
function updateState(field, value) {
  const state = loadState();
  state[field] = value;
  state.updatedAt = new Date().toISOString();
  return saveState(state);
}

// Get specific state field
function getState(field) {
  const state = loadState();
  return state[field];
}

// Set current phase
function setPhase(phase) {
  return updateState('phase', phase);
}

// Set active plan
function setActivePlan(planPath) {
  return updateState('activePlan', planPath);
}

// Set approval status
function setApproval(phase, status) {
  const state = loadState();
  state.approvalStatus = state.approvalStatus || {};
  state.approvalStatus[phase] = status;
  return saveState(state);
}

// Add active agent
function addAgent(agentName) {
  const state = loadState();
  if (!state.agents.includes(agentName)) {
    state.agents.push(agentName);
    return saveState(state);
  }
  return true;
}

// Set active team
function setActiveTeam(name, phase, logDir) {
  const state = loadState();
  state.activeTeam = name;
  state.activeTeamPhase = phase;
  state.teamLogDir = logDir;
  state.updatedAt = new Date().toISOString();
  return saveState(state);
}

// Clear active team (move to history)
function clearActiveTeam() {
  const state = loadState();
  if (state.activeTeam) {
    if (!state.teamHistory) state.teamHistory = [];
    state.teamHistory.push({
      name: state.activeTeam,
      phase: state.activeTeamPhase,
      logDir: state.teamLogDir,
      clearedAt: new Date().toISOString()
    });
  }
  state.activeTeam = null;
  state.activeTeamPhase = null;
  state.teamLogDir = null;
  state.updatedAt = new Date().toISOString();
  return saveState(state);
}

// Get active team info
function getActiveTeamInfo() {
  const state = loadState();
  if (!state.activeTeam) return null;
  return {
    name: state.activeTeam,
    phase: state.activeTeamPhase,
    logDir: state.teamLogDir
  };
}

// Clear session
function clearSession() {
  const file = getSessionFile();
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Export functions
module.exports = {
  loadState,
  saveState,
  updateState,
  getState,
  setPhase,
  setActivePlan,
  setApproval,
  addAgent,
  setActiveTeam,
  clearActiveTeam,
  getActiveTeamInfo,
  clearSession,
  getSessionFile
};

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'get':
      console.log(JSON.stringify(loadState(), null, 2));
      break;
    case 'set-phase':
      setPhase(args[1]);
      console.log(`Phase set to: ${args[1]}`);
      break;
    case 'set-plan':
      setActivePlan(args[1]);
      console.log(`Plan set to: ${args[1]}`);
      break;
    case 'approve':
      setApproval(args[1], 'approved');
      console.log(`Phase ${args[1]} approved`);
      break;
    case 'clear':
      clearSession();
      console.log('Session cleared');
      break;
    default:
      console.log('Usage: session-state.cjs <get|set-phase|set-plan|approve|clear> [value]');
  }
}
