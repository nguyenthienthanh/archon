---
last_aligned_with: v3.7.3
status: current
audience: active-user
---

# Archon OS Learning System

**Status:** Production Ready

The Learning System enables Archon OS to improve over time by collecting feedback, analyzing patterns, and generating actionable insights. It works out of the box with local JSON files -- no external services required.

---

## Local Storage (Default -- Zero Setup)

Learning works immediately with no configuration. All data stays in your project:

```
.claude/learning/
├── feedback.json      # All feedback entries (max 500)
├── patterns.json      # Learned patterns
├── metrics.json       # Workflow metrics
└── learned-rules.md   # Human-readable rules (auto-linked to instructions)
```

A link file at `.claude/LEARNED_PATTERNS.md` points Claude to the learned rules automatically.

**Data Retention (Local):**
- Feedback: Last 500 entries
- Patterns: Indefinite
- Cache: Last 200 entries

**Reset:** `rm -rf .claude/learning/`

---

## How Learning Works

### 1. Smart Learn (Automatic -- No Feedback Needed)

Detects patterns from successful operations automatically.

| Language | Patterns Detected |
|----------|-------------------|
| TypeScript/JS | arrow_functions, prefer_const, async_await, explicit_types, react_hooks, error_handling |
| Python | python_type_hints, python_async |
| Bash | Command patterns, pipe usage, chaining |

After every successful Write/Edit/Bash, the hook analyzes content for patterns. After 3+ successes, a learned pattern is created.

**Hook:** `hooks/smart-learn.cjs`

### 2. Auto-Learn (From User Corrections)

Detects corrections and approvals in user messages.

**Detection:** "no", "wrong", "actually", "should be", "I prefer", "always use", "never use", "good job", "perfect", "looks good"

Corrections are categorized (code_style, testing, security, etc.) with 24h deduplication. After 3+ similar corrections, a learned pattern is created.

**Hook:** `hooks/auto-learn.cjs`

### 3. Workflow Edit Detection (From Direct Edits)

Learns from your direct edits to workflow MD files (outside Claude sessions).

**Monitored:** `.claude/cache/workflow-state.json`, `.claude/logs/workflows/*.md`, `docs/workflow/*.md`, `phase-*.md`, `plan.md`, `spec.md`, `requirements.md`

**Detects:** Structure preferences (headers, bullets), verbosity preferences, tone preferences, documentation style.

**Hook:** `hooks/workflow-edit-learn.cjs`

---

## Learned Rules File

The system auto-generates `.claude/learning/learned-rules.md`:

```markdown
# Learned Patterns & Rules

## Summary
- **Total Patterns:** 5
- **Total Feedback:** 23

## Code Style
*8 corrections in this category*

### User prefers: arrow_functions in .ts files
**Frequency:** 12 occurrences

### User prefers: minimal_comments
**Examples:**
- Don't add comments everywhere, only when needed
**Frequency:** 4 occurrences
```

This file is automatically linked via `.claude/LEARNED_PATTERNS.md`, ensuring Claude reads and applies learned patterns.

---

## Commands

| Command | Description |
|---------|-------------|
| `/af learn status` | Show learning system status and stats |
| `/af learn analyze` | Run pattern analysis |
| `/af learn apply` | Apply learned improvements |
| `/af learn feedback` | Submit manual feedback |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AF_LOCAL_LEARNING` | `true` | Enable local learning |
| `AF_FORCE_LOCAL` | `false` | Force local mode even with Supabase configured |
| `AF_FEEDBACK_COLLECTION` | `true` | Enable feedback collection |
| `AF_METRICS_COLLECTION` | `true` | Enable metrics collection |

**Disable all learning:**
```bash
export AF_LOCAL_LEARNING="false"
export AF_LEARNING_ENABLED="false"
```

---

## Privacy & Data

**Stored:** Feedback text, pattern summaries, performance metrics, workflow metadata.

**NOT stored:** Full source code, API keys/secrets, personal information, full conversation logs.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Learning not working | Check `.claude/learning/` directory exists |
| Missing patterns | Smart Learn needs 3+ successes; Auto-Learn needs 3+ similar corrections; 24h dedup window |
| Check status | Run `/af learn status` -- should show `Mode: local`, pattern and feedback counts |

---

## Advanced: Cross-Machine Sync (Supabase)

For teams or multi-machine setups, you can optionally sync learning data to Supabase.

**Setup (5 min):**
```bash
# Add to .envrc
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SECRET_KEY="your-secret-key"
export AF_LEARNING_ENABLED="true"
```

Then run: `./scripts/supabase/setup.sh`

**Additional env vars for Supabase mode:**

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Supabase secret key |
| `AF_LEARNING_ENABLED` | Force enable learning (Supabase mode) |

**Data Retention (Supabase):** Feedback: 90 days | Metrics: 1 year | Patterns: Indefinite

**Troubleshooting Supabase:** Verify `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set. Run `/af learn status` to confirm `Mode: supabase`.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Learning Hooks              │  Storage                  │
│  ├── smart-learn.cjs         │  ├── Local (default)      │
│  ├── auto-learn.cjs          │  │   └── .claude/learning/ │
│  ├── workflow-edit-learn.cjs │  └── Supabase (optional)  │
│  ├── feedback-capture.cjs    │      └── af_* tables      │
│  └── session-metrics.cjs     │                           │
├──────────────────────────────────────────────────────────┤
│  Library: hooks/lib/af-learning.cjs (dual-mode)          │
├──────────────────────────────────────────────────────────┤
│  Output: .claude/learning/learned-rules.md               │
└──────────────────────────────────────────────────────────┘
```

---

