---
last_aligned_with: v3.7.3
status: reference
audience: power-user
---

# Multi-Session Architecture

**Purpose:** Enable complex workflows across multiple Claude Code sessions

---

## Overview

Large features often exceed single-session token limits (~200K). This architecture enables:

1. **Session splitting** by workflow phase
2. **State persistence** via file-based management
3. **Clean handoffs** between sessions
4. **Background agents** for parallel tasks

---

## Token Budget Reference

```toon
token_limits[4]{level,tokens,action}:
  Normal,0-150K,Continue working
  Warning,150K (75%),Show token warning
  Suggest Handoff,170K (85%),Recommend session split
  Force Handoff,180K (90%),Must save and restart
```

---

## Session Architecture

### Pattern 1: Phase-Based Splitting

Split workflow by natural phase boundaries:

```toon
sessions[3]{session,phases,focus,typical_tokens}:
  Session 1,1,Planning (Understand + Design),50K-80K
  Session 2,2-3,TDD (Test RED / Build GREEN),80K-150K
  Session 3,4-5,Review & Finalize (Refactor + Review / Finalize),40K-60K
```

**Benefits:**
- Natural breakpoints at approval gates
- Each session has clear deliverables
- Context can be discarded between sessions

### Pattern 2: Background Agents (Cursor 2.0 Pattern)

Run parallel agents for independent tasks:

```
┌─────────────────────────────────────────────────────────┐
│ Main Session (Interactive)                              │
│ - User interaction                                      │
│ - Core implementation                                   │
│ - Decision making                                       │
└─────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ Background    │  │ Background    │  │ Background    │
│ Agent: Tests  │  │ Agent: Docs   │  │ Agent: Review │
│               │  │               │  │               │
│ Writes tests  │  │ Generates     │  │ Security      │
│ in parallel   │  │ documentation │  │ scanning      │
└───────────────┘  └───────────────┘  └───────────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                             ▼
                    ┌───────────────┐
                    │ Merge Results │
                    │ (Main Session)│
                    └───────────────┘
```

**Implementation:**
```bash
# Main session delegates to background
# Background agent writes to /tmp/archon/agents/

# Agent 1: Write tests
# Agent 2: Generate docs
# Agent 3: Run security scan

# Main session merges when ready
```

### Pattern 3: Token-Efficient Tools (Anthropic Beta)

Enable experimental token reduction:

```
# In .claude/settings.json or environment
ANTHROPIC_BETA=token-efficient-tools-2025-02-19

# Reduces tool call overhead by ~30%
```

---

## Handoff Protocol

### Step 1: Detect Token Threshold

```toon
thresholds[3]{percent,tokens,action}:
  75%,150000,Show warning banner
  85%,170000,Suggest handoff + generate document
  90%,180000,Force handoff + auto-save
```

### Step 2: Generate Handoff Document

```bash
# Automatic at threshold
bash scripts/session-handoff.sh create wf-001

# Creates human-readable handoff with:
# - Current progress
# - Next steps
# - Files to review
# - Resume instructions
```

### Step 3: Save State

```bash
# Export to TOON (token-efficient)
bash scripts/workflow/workflow-export-toon.sh wf-001
```

> **Corrected 2026-10-29.** This step used to document
> `scripts/workflow-manager.sh export`. **That script does not exist** and has
> not for some time, so the command above was unrunnable. `workflow-export-toon.sh`
> is the real exporter.

### Step 4: New Session Resume

```bash
# Load TOON state (minimal tokens)
bash scripts/workflow/workflow-export-toon.sh wf-001

# Show handoff document
bash scripts/session-handoff.sh show wf-001

# Tell Claude: "Resume workflow wf-001"
```

---

## The turn index — what a compacted session still knows (v4.0.0-alpha.2)

The handoff protocol above answers *"the window is nearly full, save state."* It
does not answer the other half: **a long session that compacts repeatedly, where
work from three turns ago has to stay reachable.**

### The transcript was never lost

Claude Code already writes every turn to
`~/.claude/projects/<slug>/<session-id>.jsonl`. Measured on one real session:
**3.5 MB, 1620 lines, 73 user prompts.** Compaction shrinks the *context window*;
it never touches that file.

So the problem was never "the agent loses memory". It was:

> **The memory is intact on disk and nothing reads it back.**

### What was added

`hooks/lib/turn-index.cjs` renders one line per turn:

```
#NN │ hh:mm │ headline │ files │ cmds │ branch │ uuid
```

```toon
turn_index[5]{aspect,behaviour}:
  Source of truth,"the transcript JSONL — written by Claude Code, never rewritten by the plugin"
  Written,"at Stop and before a compaction, by compact-handoff.cjs → .claude/cache/turn-index.tsv"
  Injected,"at SessionStart — which is also the post-compaction entry point (source: compact)"
  Pointer not copy,"each line carries the turn's uuid; the agent reads that exact turn on demand instead of trusting a summary"
  Overflow,"tiers and SAYS so, naming the compressed range and the files those turns touched — never silent truncation"
```

### Two invariants

- **It is a derived cache, not a second source of truth.** Every write rebuilds
  it from the transcript, so deleting it is harmless and a rebuild is
  byte-identical. Nothing may be written only to the index.
- **It points at decisions, it does not restate them.** Decisions and gate
  verdicts live in `.claude/plans/history.jsonl` and the plan tree. A decision
  summarised in two places is a decision that can disagree with itself.

### Scoped to this session

Injection happens only when the session is continuing its *own* work — a resumed
handoff of ours, or the SessionStart that follows a compaction. A fresh session
being shown the list of other sessions' handoffs gets no index: those prompts are
not its to read. `source: clear` injects nothing.

### Why not vector search

Two reasons, and the second is the decisive one:

1. There is no first-party embeddings endpoint, so vector retrieval would mean a
   third-party key plus a vector store — breaking the plugin's no-key install.
2. **The corpus is 73 rows, not 73,000.** Approximate nearest-neighbour search
   over 73 rows is absurd. It is a list you read.

Reason 2 settles it on its own: even with free, first-party, zero-latency
vectors, this would still be the wrong tool at this size.

### Measured budget

A rendered line is ~120 characters. 73 turns ≈ **8,760 characters** against the
**10,000-character SessionStart injection cap** — 1.1× headroom, so tiering
becomes necessary at roughly **80 turns**, not from turn one.

Live-verified on a real session: 17 turns indexed, injected payload **5,853 of
10,000 characters**.

### What was deliberately NOT built

```toon
rejected[3]{idea,reason}:
  "Project Brain (a synthesized store of what the project knows)","Nothing reads it, nothing can verify it, and it would be a second source of truth beside CLAUDE.md, the plan tree and history.jsonl."
  "A node:sqlite episodic store","The transcript already IS the log. Independently: node:sqlite is Stability 1.1/1.2 on every Node line, and on Node 26.10 `require('node:sqlite').Database` is undefined — only DatabaseSync exists. The documented API is not the shipped API."
  "Auto-updating project docs","Rejected with its own recorded argument — see the FEAT-F plan node."
```

---

## State Files

### Locations

```
~/.claude/state/
├── workflows/           # Workflow states
│   ├── wf-001.json
│   └── wf-001.toon
├── sessions/            # Session tracking
│   └── current.json
├── context/             # Cached contexts
│   └── project-cache.json
└── temp/                # Handoff documents
    └── handoff-wf-001.md
```

### State Format (TOON vs JSON)

**JSON (~2000 tokens):** Full state, programmatic access
**TOON (~500 tokens):** Summary for AI context loading

Always load TOON into context, reference JSON when needed.

---

## Session Handoff Banner

Show this when approaching token limit:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  TOKEN WARNING - 75% Context Used
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current: ~150,000 tokens | Limit: ~200,000 tokens

📍 Progress: Phase 3 - Build GREEN (62% complete)

🔄 Consider: `handoff` to start fresh session

State will be saved. You can resume seamlessly.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Implementation Guide

### For Single-Phase Tasks

No special handling needed. Use standard workflow.

### For Multi-Phase Features

1. **Before starting:**
   ```bash
   bash scripts/workflow-manager.sh init wf-001 "Feature Name"
   ```

2. **During workflow:**
   - State auto-saves at each phase gate
   - Monitor token usage
   - Split at natural boundaries

3. **At token warning:**
   ```bash
   bash scripts/session-handoff.sh create wf-001
   ```

4. **In new session:**
   ```
   User: "Resume workflow wf-001 from Phase 5"

   Claude reads:
   - handoff-wf-001.md (context)
   - wf-001.toon (state)

   Claude continues from saved state.
   ```

---

## Background Agent Pattern

### When to Use

- Tests can be written in parallel with implementation
- Documentation can be generated while coding
- Security scans can run during review

### How to Implement

```bash
# Create agent task file
cat > /tmp/archon/agents/task-tests.md << EOF
# Background Task: Write Tests

## Context
- Feature: User authentication
- Phase: 2 (Test RED)
- Files: src/auth/Login.tsx

## Task
Write failing tests for Login component.

## Output
Write to: tests/auth/Login.test.tsx
EOF

# Agent reads task, writes output
# Main session merges result
```

### Merge Protocol

```bash
# Check background agent output
cat /tmp/archon/agents/output-tests.md

# If acceptable, merge into main workflow
cp /tmp/archon/agents/tests/* tests/

# Update state
bash scripts/workflow-manager.sh set wf-001 "deliverables" "tests/auth/Login.test.tsx"
```

---

## Best Practices

### Do

- Save state at every phase gate
- Use TOON format for context loading
- Generate handoff documents proactively
- Split sessions at natural boundaries
- Keep handoff documents human-readable

### Don't

- Rely on conversation history for state
- Push through token limits
- Skip state saves
- Lose uncommitted work
- Overload single sessions

---

## Troubleshooting

### Lost State

```bash
# Check for state files
ls ~/.claude/state/workflows/

# Check git for backup
git stash list
git log --all --oneline
```

### Corrupted State

```bash
# Regenerate from git
bash scripts/workflow-manager.sh init wf-002 "Feature (recovered)"
# Manually set phase based on git history
bash scripts/workflow-manager.sh phase wf-002 5
```

### Token Limit Hit

```bash
# Emergency save
bash scripts/workflow-manager.sh export wf-001
bash scripts/session-handoff.sh create wf-001

# Start new session
# Load minimal context
```

---

## Token Savings Summary

```toon
optimization_savings[6]{technique,before,after,savings}:
  TOON format,2000,500,75%
  Lazy agent loading,48000,2700,94%
  Compressed context,5000,500,90%
  Response analyzer,3000,150,95%
  State persistence,10000,500,95%
  Background agents,N/A,Parallel,Time savings
```

---

**Related:**
- `skills/session-continuation/SKILL.md` (includes state persistence)
- `skills/lazy-agent-loader/SKILL.md`
- `skills/response-analyzer/SKILL.md`
- `scripts/workflow-manager.sh`
- `scripts/workflow/workflow-export-toon.sh`
- `scripts/session-handoff.sh`
- `docs/WORKFLOW_DIAGRAMS.md`
