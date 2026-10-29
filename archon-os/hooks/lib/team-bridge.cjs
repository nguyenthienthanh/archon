#!/usr/bin/env node
/**
 * Team-Workflow Bridge Library
 *
 * Bridges Archon OS's 5-phase workflow with Claude Agent Teams.
 * Handles team lifecycle: creation, teardown, rejection, and state tracking.
 *
 * Both a library (require'd by hooks) and CLI (called from phase-transition.sh).
 *
 * CLI:
 *   node team-bridge.cjs create-if-needed <phase> <workflow-id>
 *   node team-bridge.cjs teardown <phase> <workflow-id>
 *   node team-bridge.cjs handle-rejection <phase> <workflow-id>
 *   node team-bridge.cjs get-active <workflow-id>
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

const { isAgentTeamsEnabled } = require('./af-config-utils.cjs');

// Phase slug mapping
const PHASE_SLUGS = {
  '1': '01-requirements-analysis',
  '2': '02-technical-planning',
  '3': '03-design-review',
  '4': '04-test-planning',
  '5': '05-tdd-implementation',
  '5a': '05a-tdd-red',
  '5b': '05b-tdd-green',
  '5c': '05c-tdd-refactor',
  '6': '06-code-review',
  '7': '07-qa-validation',
  '8': '08-documentation',
  '9': '09-notification'
};

// Phase team composition: lead + members
const PHASE_TEAMS = {
  '1': { lead: 'lead', members: ['architect', 'tester'] },
  '2': { lead: 'architect', members: ['frontend', 'tester'] },
  '3': { lead: 'frontend', members: ['mobile'] },
  '4': { lead: 'tester', members: ['architect'] },
  '5a': { lead: 'tester', members: ['architect'] },
  '5b': { lead: 'architect', members: ['frontend', 'tester'] },
  '5c': { lead: 'architect', members: ['tester'] },
  '6': { lead: 'security', members: ['architect', 'tester'] },
  '7': { lead: 'tester', members: [] },
  '8': { lead: 'lead', members: [] },
  '9': { lead: 'voice-operations', members: [] }
};

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function resolveWorkflowDir(workflowId) {
  const { findProjectRoot } = require('./hook-runtime.cjs');
  const possibleRoots = [
    path.join(findProjectRoot(), '.claude', 'logs', 'runs'),
    path.join(findProjectRoot(), '.claude', 'logs', 'workflows'),
    path.join(process.cwd(), 'logs', 'runs'),
    path.join(process.cwd(), 'logs', 'workflows')
  ];
  for (const root of possibleRoots) {
    const dir = path.join(root, workflowId);
    if (fs.existsSync(dir)) return dir;
  }
  // Default to .claude/logs/runs even if it doesn't exist yet
  return path.join(findProjectRoot(), '.claude', 'logs', 'runs', workflowId);
}

function resolveStateFile(workflowId) {
  const workflowDir = resolveWorkflowDir(workflowId);
  return path.join(workflowDir, 'workflow-state.json');
}

function readState(stateFile) {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  } catch {
    return null;
  }
}

function writeState(stateFile, state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

function normalizePhase(phase) {
  // Accept "2", "5b", "Phase 2", etc.
  const cleaned = String(phase).replace(/^phase\s*/i, '').trim().toLowerCase();
  return cleaned;
}

function getPhaseSlug(phase) {
  const norm = normalizePhase(phase);
  return PHASE_SLUGS[norm] || PHASE_SLUGS[norm.replace(/[a-z]$/, '')] || `phase-${norm}`;
}

// -------------------------------------------------------------------
// Core functions
// -------------------------------------------------------------------

/**
 * Determine whether a team should be created for this phase.
 * Requires: Agent Teams enabled + complexity=Deep + 2+ team members
 */
function shouldCreateTeam(sessionState) {
  if (!isAgentTeamsEnabled()) {
    return { create: false, reason: 'Agent Teams not enabled' };
  }

  const complexity = sessionState?.complexity;
  if (!complexity || complexity.toLowerCase() !== 'deep') {
    return { create: false, reason: `Complexity ${complexity || 'unknown'} is not Deep` };
  }

  return { create: true, reason: 'Deep complexity with Agent Teams enabled' };
}

/**
 * Generate team name from workflow ID and phase slug.
 */
function getTeamName(workflowId, phaseSlug) {
  return `${workflowId}-phase-${phaseSlug}`;
}

/**
 * Create the team log directory under the workflow's teams/ folder.
 * Returns the absolute path.
 */
function createTeamLogDir(workflowLogsDir, phaseSlug, attempt) {
  const suffix = attempt && attempt > 1 ? `-attempt-${attempt}` : '';
  const dirName = `phase-${phaseSlug}${suffix}`;
  const logDir = path.join(workflowLogsDir, 'teams', dirName);

  fs.mkdirSync(logDir, { recursive: true });
  return logDir;
}

/**
 * Append a JSONL event to the team log (team-log.jsonl) and optionally the agent log.
 */
function recordTeamEvent(teamLogDir, agent, action, description, meta) {
  if (!teamLogDir || !fs.existsSync(teamLogDir)) return;

  const entry = {
    ts: new Date().toISOString(),
    agent: agent || 'system',
    action,
    description: description || '',
    meta: meta || {}
  };

  const line = JSON.stringify(entry) + '\n';

  // Append to combined team log
  fs.appendFileSync(path.join(teamLogDir, 'team-log.jsonl'), line, 'utf-8');

  // Append to per-agent log (if agent specified). Sanitize the name so a value
  // containing '/' or '..' can't escape the log dir.
  if (agent && agent !== 'system') {
    const safe = String(agent).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '') || 'agent';
    fs.appendFileSync(path.join(teamLogDir, `${safe}.jsonl`), line, 'utf-8');
  }
}

/**
 * Register a team entry in the workflow-state.json "teams" field.
 */
function registerTeamInWorkflowState(stateFile, teamEntry) {
  const state = readState(stateFile);
  if (!state) return;

  if (!state.teams) state.teams = {};
  state.teams[teamEntry.team_name] = teamEntry;

  writeState(stateFile, state);
}

/**
 * Mark a team as completed in workflow-state.json.
 */
function teardownTeamInState(stateFile, teamName) {
  const state = readState(stateFile);
  if (!state || !state.teams || !state.teams[teamName]) return;

  state.teams[teamName].status = 'completed';
  state.teams[teamName].teardown_at = new Date().toISOString();

  writeState(stateFile, state);
}

/**
 * Get the active (non-completed) team from workflow-state.json.
 */
function getActiveTeam(stateFile) {
  const state = readState(stateFile);
  if (!state || !state.teams) return null;

  for (const [name, team] of Object.entries(state.teams)) {
    if (team.status === 'active') return team;
  }
  return null;
}

/**
 * Handle phase rejection: rename log dir to -attempt-N, increment attempt counter.
 * Returns the next attempt number.
 */
function handlePhaseRejection(stateFile, logsDir, teamName, phaseSlug) {
  const state = readState(stateFile);
  if (!state) return 1;

  // Find current attempt number
  const team = state.teams?.[teamName];
  const currentAttempt = team?.attempt || 1;
  const nextAttempt = currentAttempt + 1;

  // Rename current log dir to -attempt-N
  const currentDir = path.join(logsDir, 'teams', `phase-${phaseSlug}`);
  const archiveDir = path.join(logsDir, 'teams', `phase-${phaseSlug}-attempt-${currentAttempt}`);

  if (fs.existsSync(currentDir)) {
    // Persisting attempt (below) keeps archiveDir unique; guard anyway so a
    // stale archive from a lost/reset state can't crash rename with ENOTEMPTY.
    if (fs.existsSync(archiveDir)) {
      try { fs.rmSync(archiveDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    fs.renameSync(currentDir, archiveDir);
  }

  // Update team entry in state. Persist attempt = nextAttempt so a SECOND
  // rejection reads the incremented value (it previously stayed 1 forever,
  // re-archiving onto phase-…-attempt-1 and crashing on ENOTEMPTY).
  if (team) {
    team.status = 'rejected';
    team.attempt = nextAttempt;
    team.teardown_at = new Date().toISOString();
    writeState(stateFile, state);
  }

  return nextAttempt;
}

/**
 * Get teammates for a given phase from PHASE_TEAMS.
 */
function getTeammatesForPhase(phase) {
  const norm = normalizePhase(phase);
  const config = PHASE_TEAMS[norm];
  if (!config) return [];

  const teammates = [
    { name: config.lead, agentType: `archon-os:${config.lead}`, role: 'lead' }
  ];

  for (const member of config.members) {
    teammates.push({
      name: member,
      agentType: `archon-os:${member}`,
      role: 'member'
    });
  }

  return teammates;
}

// -------------------------------------------------------------------
// CLI commands
// -------------------------------------------------------------------

function cliCreateIfNeeded(phase, workflowId) {
  if (!isAgentTeamsEnabled()) {
    console.log('Agent Teams not enabled - skipping team creation');
    return;
  }

  const stateFile = resolveStateFile(workflowId);
  const state = readState(stateFile);
  if (!state) {
    console.error(`No workflow state found for ${workflowId}`);
    process.exit(1);
  }

  // Read session state for complexity check
  let sessionState = null;
  try {
    const { readSessionState } = require('./af-config-utils.cjs');
    sessionState = readSessionState(process.ppid?.toString());
  } catch { /* ignore */ }

  const check = shouldCreateTeam(sessionState || { complexity: state.context?.complexity });
  if (!check.create) {
    console.log(`Team not needed: ${check.reason}`);
    return;
  }

  const phaseSlug = getPhaseSlug(phase);
  const teamName = getTeamName(workflowId, phaseSlug);
  const workflowDir = resolveWorkflowDir(workflowId);

  // Check for existing active team
  const existing = getActiveTeam(stateFile);
  if (existing && existing.team_name === teamName) {
    console.log(`Team already active: ${teamName}`);
    return;
  }

  // Determine attempt number
  const existingTeam = state.teams?.[teamName];
  const attempt = existingTeam ? (existingTeam.attempt || 1) : 1;

  // Create log directory
  const logDir = createTeamLogDir(workflowDir, phaseSlug, attempt > 1 ? attempt : null);

  // Register in workflow state
  const teammates = getTeammatesForPhase(phase);
  const teamEntry = {
    phase: normalizePhase(phase),
    phase_slug: phaseSlug,
    team_name: teamName,
    status: 'active',
    created_at: new Date().toISOString(),
    teardown_at: null,
    teammates: teammates.map(t => t.name),
    log_dir: path.relative(process.cwd(), logDir),
    attempt
  };

  registerTeamInWorkflowState(stateFile, teamEntry);

  // Record team creation event
  recordTeamEvent(logDir, 'system', 'team_created', `Team ${teamName} created`, {
    phase: normalizePhase(phase),
    teammates: teammates.map(t => t.name),
    attempt
  });

  console.log(`Team created: ${teamName}`);
  console.log(`Log dir: ${logDir}`);
  console.log(`Teammates: ${teammates.map(t => `${t.name} (${t.role})`).join(', ')}`);
}

function cliTeardown(phase, workflowId) {
  if (!isAgentTeamsEnabled()) return;

  const stateFile = resolveStateFile(workflowId);
  const phaseSlug = getPhaseSlug(phase);
  const teamName = getTeamName(workflowId, phaseSlug);
  const workflowDir = resolveWorkflowDir(workflowId);

  // Record teardown event
  const logDir = path.join(workflowDir, 'teams', `phase-${phaseSlug}`);
  if (fs.existsSync(logDir)) {
    recordTeamEvent(logDir, 'system', 'team_teardown', `Team ${teamName} torn down`, {
      phase: normalizePhase(phase)
    });
  }

  teardownTeamInState(stateFile, teamName);
  console.log(`Team torn down: ${teamName}`);
}

function cliHandleRejection(phase, workflowId) {
  if (!isAgentTeamsEnabled()) return;

  const stateFile = resolveStateFile(workflowId);
  const phaseSlug = getPhaseSlug(phase);
  const teamName = getTeamName(workflowId, phaseSlug);
  const workflowDir = resolveWorkflowDir(workflowId);

  const nextAttempt = handlePhaseRejection(stateFile, workflowDir, teamName, phaseSlug);
  console.log(`Phase ${phase} rejected. Log archived. Next attempt: ${nextAttempt}`);
}

function cliGetActive(workflowId) {
  const stateFile = resolveStateFile(workflowId);
  const active = getActiveTeam(stateFile);

  if (active) {
    console.log(JSON.stringify(active, null, 2));
  } else {
    console.log('null');
  }
}

// -------------------------------------------------------------------
// Exports
// -------------------------------------------------------------------

module.exports = {
  shouldCreateTeam,
  getTeamName,
  createTeamLogDir,
  recordTeamEvent,
  registerTeamInWorkflowState,
  teardownTeamInState,
  getActiveTeam,
  handlePhaseRejection,
  getTeammatesForPhase,
  getPhaseSlug,
  normalizePhase,
  resolveWorkflowDir,
  resolveStateFile,
  PHASE_SLUGS,
  PHASE_TEAMS
};

// -------------------------------------------------------------------
// CLI interface
// -------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'create-if-needed':
      if (args.length < 3) {
        console.error('Usage: team-bridge.cjs create-if-needed <phase> <workflow-id>');
        process.exit(1);
      }
      cliCreateIfNeeded(args[1], args[2]);
      break;

    case 'teardown':
      if (args.length < 3) {
        console.error('Usage: team-bridge.cjs teardown <phase> <workflow-id>');
        process.exit(1);
      }
      cliTeardown(args[1], args[2]);
      break;

    case 'handle-rejection':
      if (args.length < 3) {
        console.error('Usage: team-bridge.cjs handle-rejection <phase> <workflow-id>');
        process.exit(1);
      }
      cliHandleRejection(args[1], args[2]);
      break;

    case 'get-active':
      if (args.length < 2) {
        console.error('Usage: team-bridge.cjs get-active <workflow-id>');
        process.exit(1);
      }
      cliGetActive(args[1]);
      break;

    default:
      console.log('Usage: team-bridge.cjs <create-if-needed|teardown|handle-rejection|get-active> [args]');
      process.exit(1);
  }
}
