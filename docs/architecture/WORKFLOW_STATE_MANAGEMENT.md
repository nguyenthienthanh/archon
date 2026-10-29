---
last_aligned_with: v3.7.3
status: reference
audience: power-user
---

# 🗂️ Workflow State Management

**Purpose:** Manage multiple concurrent workflows

---

## 📊 Overview

Archon OS v1.2+ supports **multiple concurrent workflows** with independent state management.

---

## 🏗️ State Structure

### Previous (Single Workflow)

```
<your-project>/
└── workflow-state.json  ❌ Only one workflow at a time
```

**Problem:** Can't have multiple workflows simultaneously

### Current (Multi-Workflow)

```
<your-project>/
├── active-workflow.txt              → Current active workflow ID
└── .claude/logs/
    └── workflows/
        ├── workflow-1/
        │   ├── workflow-state.json  ← Workflow 1 state
        │   └── execution.log
        ├── workflow-2/
        │   ├── workflow-state.json  ← Workflow 2 state
        │   └── execution.log
        └── workflow-3/
            ├── workflow-state.json  ← Workflow 3 state
            └── execution.log
```

**Benefits:**
✅ Multiple workflows simultaneously  
✅ Each workflow has independent state  
✅ Easy to switch between workflows  
✅ No state conflicts  

---

## 📁 File Locations

### Workflow State

**Location:**
```
logs/workflows/[workflow-id]/workflow-state.json
```

**Contains:**
- Workflow metadata
- Current phase
- Phase history
- Token usage
- Deliverables list
- Agent list

### Active Workflow Pointer

**Location:**
```
active-workflow.txt
```

**Contains:**
```
add-user-authentication-20251124-120000
```

**Purpose:** Points to currently active workflow

### Workflow Logs

**Location:**
```
logs/workflows/[workflow-id]/
├── workflow-state.json
├── execution.log
├── phase-1.log
├── phase-2.log
├── tokens.log
└── errors.log
```

### Workflow Context

**Location:**
```
logs/contexts/[workflow-id]/
├── README.md
├── HANDOFF_CONTEXT.md
├── deliverables/
│   ├── 01-requirements-analysis/
│   ├── 02-technical-planning/
│   └── ...
└── phases/
```

---

## 🎮 Workflow Management

### List All Workflows

```bash
bash scripts/workflow/workflow-manager.sh list

# Output:
📋 All Workflows:

⏳ add-user-authentication [ACTIVE]
   ID: add-user-authentication-20251124-120000
   Phase: 3/5 | Status: in_progress
   Created: 2025-11-24T12:00:00Z

✅ refactor-userprofile
   ID: refactor-userprofile-20251124-110000
   Phase: 5/5 | Status: completed
   Created: 2025-11-24T11:00:00Z

⏸️  add-dark-mode
   ID: add-dark-mode-20251124-130000
   Phase: 2/5 | Status: initialized
   Created: 2025-11-24T13:00:00Z
```

### Switch Workflow

```bash
bash scripts/workflow/workflow-manager.sh switch [workflow-id]

# Or in Claude
workflow:switch add-dark-mode-20251124-130000
```

### Load Workflow State

```bash
bash scripts/workflow/workflow-manager.sh load [workflow-id]

# Returns JSON state
```

### Delete Workflow

```bash
bash scripts/workflow/workflow-manager.sh delete [workflow-id]

# Confirmation required
```

### Archive Workflow

```bash
bash scripts/workflow/workflow-manager.sh archive [workflow-id]

# Creates .tar.gz archive
```

---

## 🔄 Workflow Lifecycle

### 1. Create Workflow

```bash
/run "Add user authentication"

# Creates:
# - .claude/logs/workflows/add-user-auth-20251124-120000/
# - .claude/logs/workflows/add-user-auth-20251124-120000/
# - Sets as active workflow
```

### 2. Work on Workflow

```
# All commands operate on active workflow
/run status
workflow:progress
approve
# etc.
```

### 3. Switch Workflows

```bash
# Start another workflow (pauses current)
/run "Refactor UserProfile"

# Now "refactor-userprofile" is active
# Previous workflow is paused

# Switch back
workflow:switch add-user-auth-20251124-120000
# Now "add-user-auth" is active again
```

### 4. Complete Workflow

```
# After Phase 5 completion
workflow-state.json → status: "completed"
# Remains in .claude/logs/ for reference
```

### 5. Archive/Delete

```bash
# Archive old workflows
bash scripts/workflow/workflow-manager.sh archive [old-workflow-id]

# Delete if not needed
bash scripts/workflow/workflow-manager.sh delete [workflow-id]
```

---

## 💡 Use Cases

### Concurrent Development

**Scenario:** Working on multiple features

```bash
# Feature 1: Authentication
/run "Add authentication"
# ... work on Phase 1-2 ...

# Feature 2: Dark mode (while waiting for auth review)
/run "Add dark mode"
# ... work on Phase 1 ...

# Switch back to auth
workflow:switch add-authentication-20251124-120000
# Continue auth workflow
```

### Handoff & Resume

**Scenario:** Token limit reached

```bash
# Session 1
/run "Large refactoring"
# ... Phase 1-4 complete (150K tokens) ...
handoff

# Session 2 (new chat)
/run resume large-refactoring-20251124-100000
# Loads state from .claude/logs/workflows/[id]/
# Continues seamlessly
```

### Parallel Teams

**Scenario:** Multiple developers

```bash
# Dev 1: Feature A
/run "Feature A"

# Dev 2: Feature B
/run "Feature B"

# Each has independent state
# No conflicts!
```

---

## 🔍 State Management API

### Get Active Workflow

```bash
cat active-workflow.txt

# Returns:
add-user-authentication-20251124-120000
```

### Load Workflow State

```typescript
const workflowId = readFile('active-workflow.txt').trim();
const statePath = `.claude/logs/workflows/${workflowId}/workflow-state.json`;
const state = JSON.parse(readFile(statePath));
```

### Update Workflow State

```typescript
const statePath = `.claude/logs/workflows/${workflowId}/workflow-state.json`;
state.current_phase = 5;
state.phases[5].status = 'in_progress';
writeFile(statePath, JSON.stringify(state, null, 2));
```

### Switch Workflow

```typescript
writeFile('active-workflow.txt', newWorkflowId);
```

---

## 📊 State File Structure

```json
{
  "workflow_id": "add-user-authentication-20251124-120000",
  "workflow_name": "add-user-authentication",
  "created_at": "2025-11-24T12:00:00Z",
  "updated_at": "2025-11-24T13:30:00Z",
  "status": "in_progress",
  "current_phase": 3,
  "current_phase_name": "03-build-green",
  "total_tokens_used": 155000,
  "total_tokens_remaining": 45000,
  "auto_continue": true,

  "git": {
    "initial_branch": "feature/user-auth",
    "current_branch": "feature/user-auth",
    "base_branch": "main",
    "initial_commit": "abc1234",
    "latest_commit": "def5678",
    "commits": [
      {
        "hash": "abc1234",
        "message": "chore: start user auth workflow",
        "phase": 1,
        "timestamp": "2025-11-24T12:00:00Z"
      },
      {
        "hash": "def5678",
        "message": "feat: add auth types and interfaces",
        "phase": 2,
        "timestamp": "2025-11-24T12:30:00Z"
      }
    ],
    "uncommitted_changes": [
      "src/auth/Login.tsx",
      "src/auth/AuthContext.tsx"
    ],
    "stash_id": null
  },

  "change_log": {
    "files_created": [
      {
        "path": "src/auth/Login.tsx",
        "phase": 5,
        "commit": "def5678",
        "lines": 150
      }
    ],
    "files_modified": [
      {
        "path": "src/App.tsx",
        "phase": 5,
        "commit": "def5678",
        "diff_summary": "+15 -3"
      }
    ],
    "files_deleted": [],
    "total_lines_added": 450,
    "total_lines_removed": 20
  },

  "sessions": [
    {
      "session_id": "session-1",
      "started_at": "2025-11-24T12:00:00Z",
      "ended_at": "2025-11-24T13:00:00Z",
      "tokens_used": 155000,
      "phases_completed": [1, 2, 3, 4],
      "branch_at_start": "feature/user-auth",
      "branch_at_end": "feature/user-auth",
      "commits_made": ["abc1234", "def5678"]
    }
  ],

  "phases": {
    "1": {
      "name": "Requirements Analysis",
      "slug": "01-requirements-analysis",
      "status": "completed",
      "started_at": "2025-11-24T12:00:00Z",
      "completed_at": "2025-11-24T12:07:00Z",
      "duration_ms": 420000,
      "tokens": {
        "start": 5000,
        "end": 30000,
        "phase_tokens": 25000,
        "cumulative_tokens": 25000
      },
      "deliverables": [
        "requirements.md",
        "user-stories.md"
      ],
      "git_snapshot": {
        "branch": "feature/user-auth",
        "commit_before": "abc1234",
        "commit_after": "abc1234"
      }
    }
    // ... phases 2-5 ...
  },

  "context": {
    "task": "Add user authentication",
    "agents": [
      "lead",
      "mobile",
      "tester"
    ],
    "project_root": "/path/to/project",
    "user": "developer",
    "logs_dir": ".claude/logs/workflows/add-user-authentication-20251124-120000",
    "context_dir": ".claude/logs/workflows/add-user-authentication-20251124-120000"
  },

  "handoffs": [
    {
      "at_phase": 4,
      "at_tokens": 155000,
      "timestamp": "2025-11-24T13:00:00Z",
      "handoff_file": "HANDOFF_CONTEXT.md",
      "git_state": {
        "branch": "feature/user-auth",
        "commit": "def5678",
        "has_uncommitted": true,
        "uncommitted_files": ["src/auth/Login.tsx"]
      }
    }
  ],

  "recovery": {
    "backup_branch": "backup/user-auth-20251124-130000",
    "backup_stash": "stash@{0}",
    "deliverables_backup": ".claude/logs/workflows/add-user-authentication-20251124-120000/backup/",
    "recovery_instructions": "RECOVERY.md"
  }
}
```

---

## 🔀 Git Branch Tracking

### Why Branch Tracking is Critical

When working on multiple workflows, each may be on a different branch:

```
Workflow 1: feature/user-auth     (Phase 3)
Workflow 2: feature/dark-mode     (Phase 1)
Workflow 3: fix/login-crash       (Phase 4)
```

**Without branch tracking:**
- Resume to wrong branch → Code conflicts
- Lost commits → Work duplication
- Uncommitted changes lost → Progress lost

### Automatic Branch Management

**On Workflow Start:**
```bash
# Agent automatically captures:
git branch --show-current      → initial_branch
git rev-parse HEAD             → initial_commit
git rev-parse --abbrev-ref @{u} 2>/dev/null  → remote tracking
```

**At Each Phase:**
```bash
# Agent logs git state:
- Current branch
- Commit before/after phase
- Any uncommitted changes
```

**On Handoff:**
```bash
# Agent creates backup:
git stash push -m "workflow-handoff-[workflow-id]"
git branch backup/[workflow-name]-[timestamp]
```

### Resume with Branch Verification

**On Resume, Agent Will:**

1. **Check Current Branch**
   ```bash
   current=$(git branch --show-current)
   expected="feature/user-auth"

   if [ "$current" != "$expected" ]; then
     echo "⚠️ Branch mismatch detected!"
   fi
   ```

2. **Offer Recovery Options**
   ```markdown
   ⚠️ **Branch Mismatch Detected**

   **Expected:** feature/user-auth
   **Current:** main

   **Options:**
   1. `checkout` → Switch to feature/user-auth
   2. `continue` → Continue on current branch (may cause conflicts)
   3. `review` → Show branch differences first
   ```

3. **Verify Commit History**
   ```bash
   # Check if expected commits exist
   git log --oneline | grep "def5678"
   ```

---

## 📋 Change Log Tracking

### What Gets Tracked

| Category | Data | Purpose |
|----------|------|---------|
| Files Created | Path, phase, commit, lines | Know what was built |
| Files Modified | Path, phase, diff summary | Track changes |
| Files Deleted | Path, phase, reason | Avoid recreation |
| Commits | Hash, message, phase | Git history mapping |

### Change Log Structure

```json
{
  "change_log": {
    "files_created": [
      {
        "path": "src/auth/Login.tsx",
        "phase": 5,
        "commit": "def5678",
        "lines": 150,
        "checksum": "sha256:abc..."
      }
    ],
    "files_modified": [
      {
        "path": "src/App.tsx",
        "phase": 5,
        "commit": "def5678",
        "diff_summary": "+15 -3",
        "changes": "Added AuthProvider wrapper"
      }
    ],
    "total_stats": {
      "files_touched": 12,
      "lines_added": 450,
      "lines_removed": 20,
      "commits_made": 5
    }
  }
}
```

### Resume Comparison

**On Resume, Agent Shows:**

```markdown
📊 **Changes Since Handoff**

**Git Status:**
- Branch: feature/user-auth ✅ (same)
- Commits: 2 new commits since handoff

**File Changes:**
- ✅ src/auth/Login.tsx (unchanged)
- ⚠️ src/App.tsx (modified externally)
- ❌ src/auth/types.ts (deleted!)

**Options:**
- `continue` → Proceed with current state
- `diff` → Show detailed differences
- `restore` → Restore from backup
```

---

## 🔧 Recovery Scenarios

### Scenario 1: Branch Deleted

```markdown
❌ **Recovery Required: Branch Not Found**

**Expected Branch:** feature/user-auth
**Status:** Branch does not exist

**Recovery Options:**

1. **Restore from backup branch:**
   ```bash
   git checkout -b feature/user-auth backup/user-auth-20251124-130000
   ```

2. **Restore from remote:**
   ```bash
   git checkout -b feature/user-auth origin/feature/user-auth
   ```

3. **Start fresh:**
   - Deliverables preserved in: `.claude/logs/workflows/[id]/`
   - Can recreate code from deliverables
```

### Scenario 2: Commits Missing/Rebased

```markdown
⚠️ **Recovery Required: Commit History Changed**

**Expected Commit:** def5678
**Status:** Commit not found (possibly rebased)

**Recovery Options:**

1. **Check reflog:**
   ```bash
   git reflog | grep "def5678"
   ```

2. **Restore from backup:**
   ```bash
   git checkout backup/user-auth-20251124-130000
   ```

3. **Continue from current:**
   - Review change_log for what was done
   - Manually verify files exist
```

### Scenario 3: Uncommitted Changes Lost

```markdown
⚠️ **Recovery Required: Uncommitted Work**

**At Handoff:** 2 uncommitted files
- src/auth/Login.tsx
- src/auth/AuthContext.tsx

**Current Status:** Files not found

**Recovery Options:**

1. **Restore from stash:**
   ```bash
   git stash list | grep "workflow-handoff"
   git stash apply stash@{0}
   ```

2. **Restore from backup directory:**
   ```bash
   cp .claude/logs/workflows/[id]/backup/src/auth/* src/auth/
   ```

3. **Regenerate from deliverables:**
   - Phase 3 deliverables contain code specs
   - Can regenerate implementation
```

### Scenario 4: Complete Repository Loss

```markdown
🚨 **Critical Recovery: Repository Not Found**

**Workflow:** add-user-authentication
**Status:** Project directory not found or not a git repo

**Recovery Options:**

1. **Deliverables Preserved:**
   ```
   ~/.claude/logs/workflows/[workflow-id]/
   ├── deliverables/          ← All phase outputs
   ├── HANDOFF_CONTEXT.md     ← Full context
   └── backup/                ← Code snapshots
   ```

2. **Recovery Steps:**
   - Clone repository fresh
   - Create branch from base
   - Use deliverables to guide reimplementation
   - Or copy backup files directly

3. **Partial Recovery:**
   - Requirements, specs, test plans preserved
   - Can restart from Phase 3 with existing planning
```

---

## 🛡️ Backup Strategy

### Automatic Backups

**On Handoff:**
```bash
# 1. Create backup branch
git branch backup/[workflow]-[timestamp]

# 2. Stash uncommitted changes
git stash push -m "workflow-handoff-[id]"

# 3. Copy changed files to backup dir
cp -r src/ .claude/logs/workflows/[id]/backup/src/

# 4. Save git state
git log --oneline -20 > .claude/logs/workflows/[id]/backup/git-log.txt
git diff HEAD > .claude/logs/workflows/[id]/backup/uncommitted.patch
```

### Backup Locations

```
.claude/logs/workflows/[workflow-id]/
├── backup/
│   ├── src/                    ← Source code snapshot
│   ├── git-log.txt             ← Recent commits
│   ├── uncommitted.patch       ← Uncommitted changes
│   └── file-checksums.json     ← For verification
├── RECOVERY.md                 ← Recovery instructions
└── workflow-state.json         ← Full state
```

### Recovery Priority

| Priority | Source | When to Use |
|----------|--------|-------------|
| 1 | Git branch | Branch exists, commits intact |
| 2 | Backup branch | Main branch modified |
| 3 | Stash | Uncommitted changes lost |
| 4 | Backup directory | Git history corrupted |
| 5 | Deliverables | Complete loss, rebuild needed |

---

## 🎯 Best Practices

### 1. Name Workflows Clearly

```bash
# Good
/run "Add JWT authentication"
/run "Refactor UserProfile component"
/run "Fix login crash on iOS"

# Bad
/run "Update stuff"
/run "Changes"
```

### 2. One Active Workflow

**At any time:**
- One workflow = ACTIVE (being worked on)
- Others = PAUSED (saved state)

**Switch when:**
- Waiting for review
- Need to work on urgent fix
- Token limit approaching

### 3. Clean Up Completed

```bash
# After workflow complete
/run status  # Verify completed

# Archive for reference
bash workflow-manager.sh archive [id]

# Or delete if not needed
bash workflow-manager.sh delete [id]
```

### 4. Use Handoff for Long Workflows

```bash
# At 150K tokens
handoff

# New session
/run resume [id]
# State loads from .claude/logs/workflows/[id]/
```

---

## 🔧 Migration

### From Single State (Old)

**If you have `workflow-state.json`:**

```bash
# Move to new structure
mkdir -p .claude/logs/workflows/legacy-workflow
mv workflow-state.json \
   .claude/logs/workflows/legacy-workflow/workflow-state.json

# Set as active
echo "legacy-workflow" > active-workflow.txt
```

---

## ⚠️ Important Notes

1. **Active Workflow Pointer**
   - Always check `active-workflow.txt` first
   - Commands operate on active workflow
   - Switch with `workflow:switch`

2. **State Independence**
   - Each workflow has separate state
   - No cross-workflow interference
   - Safe to run concurrently

3. **Token Tracking**
   - Per-workflow token tracking
   - Independent limits
   - Each workflow starts fresh

4. **Handoff & Resume**
   - State persists in `.claude/logs/workflows/[id]/`
   - Resume loads from there
   - No dependency on single state file

---

## 📚 Related

- **scripts/workflow/workflow-manager.sh** - Management script
- **scripts/workflow/init-workflow.sh** - Create workflow
- **commands/workflow/switch.md** - Switch command
- **SESSION_CONTINUATION_GUIDE.md** - Handoff/resume

---

**Multiple workflows = Better organization! 🎯**

---

*Version: 1.0.0*  
*Added: Archon OS v1.2*  
*Multi-workflow support*

