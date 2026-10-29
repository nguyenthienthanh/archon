---
last_aligned_with: v3.7.3
status: needs_review
audience: active-user
---

# Team-Workflow Bridge

**Purpose:** Automatic team lifecycle management across workflow phases

---

## Overview

The Team-Workflow Bridge connects Archon OS's 5-phase workflow with Claude Agent Teams. When conditions are met (Agent Teams enabled + Deep complexity), phase transitions automatically:

1. **Create teams** with per-phase log directories
2. **Record team activity** in JSONL format
3. **Teardown teams** and merge logs on phase completion
4. **Handle rejections** by archiving logs and incrementing attempt counters

---

## Architecture

```
Phase start
  -> phase-transition.sh execute_pre_phase_hook()
  -> node team-bridge.cjs create-if-needed
  -> Checks: isAgentTeamsEnabled() + complexity=Deep
  -> If yes: mkdir teams/phase-{slug}/, register in workflow-state.json
  -> Returns team name for lead to use with TeamCreate()

Teammates spawn
  -> subagent-init.cjs injects AF_TEAM_LOG_DIR env var
  -> Teammates log actions via team-log-writer.cjs

Phase ends
  -> phase-transition.sh execute_post_phase_hook()
  -> node team-bridge.cjs teardown (marks completed in state)
  -> merge-team-logs.sh merges phase logs into execution.log

Phase rejected
  -> node team-bridge.cjs handle-rejection
  -> Renames log dir to -attempt-N, increments counter
  -> Fresh team created on next pre-phase

Workflow complete
  -> merge-team-logs.sh (no --phase) -> unified-timeline.jsonl
```

---

## Directory Structure

```
.claude/logs/workflows/{workflow-id}/
|-- workflow-state.json           # Main state (includes "teams" field)
|-- execution.log                 # Main timeline (team summaries appended)
|-- teams/                        # Per-phase team logs
|   |-- phase-02-technical-planning/
|   |   |-- team-log.jsonl        # Combined team timeline
|   |   |-- architect.jsonl       # Per-agent log
|   |   |-- frontend.jsonl
|   |   `-- tester.jsonl
|   |-- phase-05b-tdd-green/
|   |   |-- team-log.jsonl
|   |   |-- architect.jsonl
|   |   `-- frontend.jsonl
|   |-- phase-05b-tdd-green-attempt-1/   # Rejected attempt preserved
|   |   `-- ...
|   `-- ...
|-- unified-timeline.jsonl        # Merged all-teams timeline
`-- deliverables/
```

---

## JSONL Log Format

Each line is a JSON object with these fields:

```json
{"ts":"2026-02-11T10:01:00Z","agent":"architect","action":"task_claimed","description":"Design auth API","meta":{}}
{"ts":"2026-02-11T10:05:00Z","agent":"architect","action":"file_edited","description":"Created src/api/auth.ts","meta":{"files":["src/api/auth.ts"]}}
{"ts":"2026-02-11T10:10:00Z","agent":"system","action":"team_teardown","description":"Team torn down","meta":{"phase":"2"}}
```

### Action Types

| Action | Source | Description |
|--------|--------|-------------|
| `team_created` | system | Team created for phase |
| `team_teardown` | system | Team torn down after phase |
| `task_claimed` | agent | Agent claimed a task |
| `task_completed` | agent | Agent completed a task |
| `file_edited` | agent | Agent edited a file |
| `message_sent` | agent | Agent sent a message |
| `cross_review_assigned` | system | Cross-review assigned to idle agent |

---

## Core Library: `team-bridge.cjs`

### Functions

| Function | Description |
|----------|-------------|
| `shouldCreateTeam(sessionState)` | Check if team should be created (returns `{create, reason}`) |
| `getTeamName(workflowId, phaseSlug)` | Generate team name: `{workflow-id}-phase-{slug}` |
| `createTeamLogDir(logsDir, phaseSlug, attempt)` | Create and return log directory path |
| `recordTeamEvent(logDir, agent, action, desc, meta)` | Write JSONL entry to team + agent logs |
| `registerTeamInWorkflowState(stateFile, entry)` | Register team in workflow-state.json |
| `teardownTeamInState(stateFile, teamName)` | Mark team as completed |
| `getActiveTeam(stateFile)` | Get currently active team (or null) |
| `handlePhaseRejection(stateFile, logsDir, name, slug)` | Archive logs, increment attempt |
| `getTeammatesForPhase(phase)` | Get team composition for a phase |

### CLI

```bash
node team-bridge.cjs create-if-needed <phase> <workflow-id>
node team-bridge.cjs teardown <phase> <workflow-id>
node team-bridge.cjs handle-rejection <phase> <workflow-id>
node team-bridge.cjs get-active <workflow-id>
```

---

## Log Writer: `team-log-writer.cjs`

Lightweight helper for teammates. Reads `AF_TEAM_LOG_DIR` and `CLAUDE_TEAMMATE_NAME` env vars.

```javascript
const logger = require('./lib/team-log-writer.cjs');

logger.logAction('custom_action', 'Did something', { key: 'value' });
logger.logTaskClaimed('task-1', 'Design auth API');
logger.logTaskCompleted('task-1', 'Design auth API', { phase: '2' });
logger.logFileEdited('src/api/auth.ts', 'Created auth endpoint');
logger.logMessageSent('tester', 'Review needed');
```

---

## Merge Script: `merge-team-logs.sh`

```bash
# Merge all team logs into unified timeline
merge-team-logs.sh <workflow-id>

# Merge only phase 2 logs and append to execution.log
merge-team-logs.sh <workflow-id> --phase 2

# Also generate human-readable markdown
merge-team-logs.sh <workflow-id> --readable
```

---

## Rejection Handling

When a phase is rejected:

1. Current log dir `phase-{slug}/` is renamed to `phase-{slug}-attempt-{N}/`
2. Team entry in workflow-state.json is marked `"status": "rejected"`
3. Attempt counter is incremented
4. Next `create-if-needed` creates a fresh directory for the new attempt

This preserves the full audit trail for every attempt.

---

## Workflow State: `teams` Field

```json
{
  "teams": {
    "AUTH-456-phase-02-technical-planning": {
      "phase": "2",
      "phase_slug": "02-technical-planning",
      "team_name": "AUTH-456-phase-02-technical-planning",
      "status": "completed",
      "created_at": "2026-02-11T10:00:00Z",
      "teardown_at": "2026-02-11T10:15:00Z",
      "teammates": ["architect", "frontend", "tester"],
      "log_dir": ".claude/logs/workflows/AUTH-456/teams/phase-02-technical-planning/",
      "attempt": 1
    }
  }
}
```

---

## Backward Compatibility

All bridge code is gated on `isAgentTeamsEnabled()`:

- **Disabled:** `create-if-needed` returns immediately (no-op), no `teams/` directory populated
- **Enabled, not Deep:** `shouldCreateTeam()` returns `false`, no team created
- **workflow-state.json** always includes `"teams": {}` (harmless empty object)
- **Session state** has `activeTeam: null` when no team active
- Existing hooks are unchanged in behavior when bridge is inactive

---

