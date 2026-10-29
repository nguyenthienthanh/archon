---
last_aligned_with: v3.7.3
status: needs_review
audience: active-user
---

# Agent Teams Guide

**Purpose:** Enable and use Claude Agent Teams with Archon OS

---

## What is Agent Teams?

Agent Teams is an experimental Claude Code feature that enables **real multi-agent orchestration**. Instead of spawning subagents that report back to a single session, teammates are:

- **Independent Claude Code instances** with separate context windows
- **Persistent** until explicitly shut down
- **Peer-to-peer** - teammates can message each other directly
- **Coordinated** via shared task lists with dependency tracking

---

## Enabling Agent Teams

### 1. Settings.json

Add to your Claude Code settings:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 2. Environment Variable

Or set directly:

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

### 3. Verify

The `isAgentTeamsEnabled()` utility in `hooks/lib/af-config-utils.cjs` checks both locations.

---

## Complexity Gate (CRITICAL — Token Savings)

**Team mode ONLY activates for Deep complexity + multi-domain tasks.** This saves ~3x tokens for all other task types.

```toon
team_gate[4]{complexity,domains,mode,token_cost}:
  Quick,any,single agent,1x (baseline)
  Standard,any,subagent,1x (baseline)
  Deep,1 domain,subagent,1x (baseline)
  Deep,2+ domains (≥50 each),team,~3x (parallel contexts)
```

**Why this gate?** Each teammate is an independent Claude instance with its own context window. Spawning 3 teammates costs ~3x tokens. Only justified when:
- Task requires parallel cross-domain work (backend + frontend + tests)
- Sequential execution would take 3x longer
- Multiple file ownership domains need simultaneous editing

**Examples:**

| Task | Complexity | Domains | Mode |
|------|-----------|---------|------|
| Fix typo in README | Quick | 1 | single agent |
| Add form validation | Standard | 1 | subagent |
| Add API endpoint + tests | Standard | 2 | subagent |
| Build full auth system (API + UI + tests + security) | Deep | 4 | **team** |
| Redesign database schema + migrate + update all APIs | Deep | 3 | **team** |
| Deep refactor of single service | Deep | 1 | subagent |

---

## Quick Start — Parallel Team Startup

Here's the complete sequence when team mode activates:

### Step 1: Create Team

```
TeamCreate(team_name="auth-system", description="Build JWT authentication with login UI and test coverage")
```

### Step 2: Create Tasks (all in one message)

```
TaskCreate(
  subject="Design and implement auth API endpoints",
  description="Create POST /auth/login, POST /auth/register, POST /auth/refresh.
    Use JWT with refresh tokens. Files: src/api/auth/, src/services/auth/.
    Acceptance: All endpoints working with validation and error handling.")

TaskCreate(
  subject="Build login and register UI components",
  description="Create LoginForm, RegisterForm, AuthLayout components.
    Use existing design system tokens. Files: src/components/auth/.
    Acceptance: Forms with validation, loading states, error display.")

TaskCreate(
  subject="Write auth test suite",
  description="Unit tests for auth service, integration tests for endpoints,
    component tests for forms. Files: tests/auth/.
    Acceptance: >80% coverage, all edge cases covered.")
```

### Step 3: Spawn Teammates in Parallel (all in one message)

```
Task(team_name="auth-system", name="architect", subagent_type="archon-os:architect",
  prompt="You are architect on team auth-system. Phase: 3-Build GREEN.
    1. Read team config: ~/.claude/teams/auth-system/config.json
    2. TaskList → claim tasks matching: API, backend, auth, service
    3. TaskUpdate(taskId, owner='architect', status='in_progress')
    4. Implement the auth endpoints and service
    5. TaskUpdate(taskId, status='completed')
    6. SendMessage(recipient='lead', summary='Auth API done',
         content='Implemented login/register/refresh endpoints. Files changed: [list]')
    Files you own: src/api/, src/services/, migrations/
    CONTEXT: [project conventions, tech stack, existing patterns]")

Task(team_name="auth-system", name="frontend", subagent_type="archon-os:frontend",
  prompt="You are frontend on team auth-system. Phase: 3-Build GREEN.
    [same pattern — claim UI tasks, own src/components/]
    CONTEXT: [design system, component patterns]")

Task(team_name="auth-system", name="tester", subagent_type="archon-os:tester",
  prompt="You are tester on team auth-system. Phase: 3-Build GREEN.
    [same pattern — claim test tasks, own tests/]
    CONTEXT: [testing framework, coverage requirements]")
```

All 3 teammates start **simultaneously** and work in parallel.

### Step 4: Monitor + Cross-Review

```
// Teammates send completion messages (auto-delivered to lead)
// Lead assigns cross-review:
SendMessage(type="message", recipient="tester",
  summary="Review auth API", content="Review architect's auth endpoints. Focus: input validation, error handling.")

// Lead forwards feedback:
SendMessage(type="message", recipient="architect",
  summary="Review feedback", content="tester found: [issues]. Please fix.")
```

### Step 5: Shutdown + Next Phase

```
// All tasks complete → shutdown teammates:
SendMessage(type="shutdown_request", recipient="architect", content="Phase 3 complete")
SendMessage(type="shutdown_request", recipient="frontend", content="Phase 3 complete")
SendMessage(type="shutdown_request", recipient="tester", content="Phase 3 complete")

// Advance to Phase 4, spawn new teammates if needed
```

---

## Teammate Operation Pattern

Every teammate follows this pattern after being spawned:

```
1. Read ~/.claude/teams/[team-name]/config.json → discover team members
2. TaskList → find unclaimed tasks matching your specialization
3. TaskUpdate(taskId, owner="[my-name]", status="in_progress") → claim task
4. Do the work (only edit files in your owned directories)
5. TaskUpdate(taskId, status="completed") → mark done
6. SendMessage(type="message", recipient="[lead-name]",
     summary="Task completed", content="Completed [task]. Summary: [what was done]")
7. TaskList → check for more unclaimed tasks (repeat from step 3)
8. If no tasks: TeammateIdle hook assigns cross-review or lead sends shutdown_request
9. On shutdown_request → SendMessage(type="shutdown_response", request_id="[id]", approve=true)
```

---

## Phase Team Composition

```toon
phase_teams[5]{phase,lead,primary,secondary,team_size}:
  1-Understand + Design,lead,architect+frontend,tester,3
  2-Test RED,tester,architect,-,2
  3-Build GREEN,architect,frontend+tester,-,3
  4-Refactor + Review,architect+security,tester,-,3
  5-Finalize,lead,-,-,1
```

---

## Team Rules

### ALWAYS

1. **Only use teams for Deep + multi-domain tasks** - Saves ~3x tokens on all other tasks
2. **Max 3 teammates per phase** - Prevents coordination overhead
3. **Spawn teammates in parallel** - Multiple Task calls in one message
4. **Pass complete context in prompts** - Teammates don't share conversation history
5. **Use TaskCreate/TaskList for work distribution** - Shared task list prevents duplicate work
6. **Claim files before editing** - Prevents merge conflicts
7. **Only lead manages phases** - Single source of truth for workflow state

### NEVER

1. **Use team mode for Quick or Standard tasks** - Wastes tokens with no benefit
2. **Teammates commit independently** - Only lead manages git
3. **Skip file claiming** - Causes merge conflicts
4. **Create more than 3 teammates per phase** - Diminishing returns
5. **Let teammates advance phases** - Lead-only responsibility
6. **Spawn teammates sequentially** - Always use parallel Task calls

---

## Display Modes

### In-Process (Default)

All teammates run in the main terminal. Switch between them with `Shift+Up`/`Shift+Down`.

### Split Panes

Each teammate gets its own terminal pane. Requires:
- **tmux** - `brew install tmux`
- **iTerm2** - macOS terminal with split pane support

---

## File Ownership Conventions

Each agent type claims specific directories to prevent conflicts:

```toon
file_ownership[5]{agent,directories}:
  architect,"src/api/ src/services/ src/repositories/ migrations/"
  frontend,"src/components/ src/ui/ src/views/ *.css *.scss"
  tester,"tests/ __tests__/ spec/ *.test.* *.spec.*"
  mobile,"src/screens/ src/navigation/ *.ios.* *.android.*"
  security,"Reviews only (no file ownership)"
```

---

## Hooks

### TeammateIdle

Fires when a teammate has no tasks. Checks for:
- Unclaimed tasks matching specialization
- Cross-review work from completed phases
- Pending quality gates

**Exit codes:** 2 = keep alive (feedback), 0 = let exit

### TaskCompleted

Fires when a teammate marks a task done. Validates:
- TDD phase test references
- Approval gate status

**Exit codes:** 2 = reject (needs revision), 0 = accept

---

## Troubleshooting

### Agent Teams not activating

1. Check `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings or env
2. Verify complexity is **Deep** (Quick/Standard never trigger team mode)
3. Verify 2+ domains score ≥50 each in agent-detector output
4. Check agent-detector output for `Mode: team`

### Teammates not seeing context

- Teammates have empty conversation history
- Include all relevant info in task descriptions and prompts
- Use SendMessage for specific context during execution

### File conflicts

- Ensure agents follow file ownership conventions
- Use SendMessage before editing shared files
- Only lead should commit changes

### Token usage too high

- Verify complexity gate is working (Quick/Standard should never use teams)
- Reduce teammate count per phase (2 instead of 3)
- Use more specific task descriptions to reduce teammate exploration

---

## Team-Workflow Bridge

When using teams with the 5-phase workflow, the **Team-Workflow Bridge** automates team lifecycle:

- **Phase start:** `team-bridge.cjs create-if-needed` creates a team + per-phase log directory
- **Phase end:** `team-bridge.cjs teardown` marks team completed, `merge-team-logs.sh` merges logs
- **Phase rejected:** `team-bridge.cjs handle-rejection` archives logs to `-attempt-N`, preps retry
- **Workflow end:** `merge-team-logs.sh` merges all team logs into `unified-timeline.jsonl`

### Per-Team Logging

Each team gets its own JSONL log directory:

```
teams/phase-02-technical-planning/
  team-log.jsonl        # Combined timeline
  architect.jsonl       # Per-agent log
  frontend.jsonl
  tester.jsonl
```

Teammates log actions automatically via `team-log-writer.cjs` when `AF_TEAM_LOG_DIR` is set.

### Merge Commands

```bash
# Merge all team logs into unified timeline
merge-team-logs.sh <workflow-id>

# Merge single phase + append to execution.log
merge-team-logs.sh <workflow-id> --phase 2

# Generate readable markdown table
merge-team-logs.sh <workflow-id> --readable
```

**Full docs:** [TEAM_WORKFLOW_BRIDGE.md](TEAM_WORKFLOW_BRIDGE.md)

---

## See Also

- [Team Workflow Bridge](TEAM_WORKFLOW_BRIDGE.md) — Detailed cross-team coordination
- [Multi-Session Architecture](../architecture/MULTI_SESSION_ARCHITECTURE.md) — Parallel session state management
- [Agent Selection Guide](AGENT_SELECTION_GUIDE.md) — How agents are auto-selected

---

## Backward Compatibility

All Agent Teams features are gated on `isAgentTeamsEnabled()` + complexity check:
- When disabled: identical to v1.17.0 subagent behavior
- When enabled but task is Quick/Standard: subagent behavior (no team overhead)
- New hooks (TeammateIdle, TaskCompleted) never fire when off
- All skill/agent/rule changes add new sections without modifying existing ones
- Team-workflow bridge is no-op when Agent Teams is disabled

---

