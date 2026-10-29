---
last_aligned_with: v3.7.3
status: current
audience: active-user
---

# Troubleshooting Guide

Quick fixes for common issues. For each problem: what happened, why, and how to fix.

---

## Workflow Issues

### Workflow crashed mid-phase

**Recovery:**
1. Start new Claude Code session
2. Aura Frog auto-detects saved state via `compact-handoff.cjs`
3. If auto-resume doesn't trigger: `/run resume`
4. If no saved state: check `.claude/logs/workflows/` for latest workflow directory

### Workflow stuck at approval gate

- `approve` or `yes` — Continue
- `reject: <reason>` — Redo current phase
- `modify: <changes>` — Adjust deliverables
- `stop` or `cancel` — End workflow, save state

### Phase 2 tests pass when they should fail

Tests don't actually test new code. Workflow auto-stops by design.
1. Review test file — ensure tests assert NEW behavior
2. `/run resume` — Re-enter Phase 2

### Phase 4 refactor broke tests

1. Option A: Fix the refactor to maintain behavior
2. Option B: `rollback 4` — Revert to pre-refactor checkpoint
3. `/run resume` — Continue

### Coverage below 80% in Phase 5

1. Check coverage report — which lines/branches uncovered?
2. Add tests for uncovered paths
3. `/run resume` — Re-run Phase 5

---

## Context & Token Issues

### Context window running out

**Automatic handling:**
- 75% (150K tokens): Warning displayed
- 85% (170K tokens): Suggests `handoff`
- 90% (180K tokens): Force handoff — saves state

**Manual:** `handoff` then `/run resume` in new session.

### Session disconnected unexpectedly

**Preserved:** All written files, git commits, workflow state (if Stop hook fired).
**Lost:** In-progress phase deliverables not yet written.

**Recovery:** New session → auto-resume, or `/run resume`.

### "/compact ran and lost my context"

`PreCompact` hook saves workflow state before compaction.
Recovery: `/run resume` or check `.claude/cache/compact-handoff.json`.

---

## Git & Worktree Issues

### Git worktree conflict

```bash
git worktree list              # List existing
git worktree remove .worktrees/<id> --force  # Remove stale
git worktree prune             # Clean refs
```

### Rollback not working

No checkpoint found? Possible causes:
1. `phase-checkpoint.cjs` wasn't active during that workflow
2. No changes were made before that phase
3. Manual fallback: `git log --oneline -20` then `git reset --hard <hash>`

---

## Agent & Skill Issues

### Wrong agent detected

Override manually: `Use only frontend for this task`

### Skill not triggering

1. Is it `autoInvoke: true`? (Only 8 skills auto-invoke)
2. Does your message contain trigger keywords?
3. Force invoke: directly reference the skill name

### MCP server not connecting

```
mcp:status
```
- **firebase:** Run `firebase login` first
- **figma:** Set `FIGMA_API_TOKEN` in `.envrc`
- **slack:** Set `SLACK_BOT_TOKEN` in `.envrc`
- **context7, playwright, vitest:** Work without config

---

## Installation Issues

### Plugin not recognized
```bash
/exit
claude    # Restart
/help     # Verify
```

### Commands not showing
```bash
/plugin list                                    # Check installed
/plugin marketplace add nguyenthienthanh/archon  # Re-add
/plugin install archon-os@archon              # Reinstall
```

---

## Learning System Issues

### Learning not working
```
/af learn status
```
If disabled: check `.envrc` for `AF_LEARNING_DISABLED=true`.

### Supabase connection failed
Check `.envrc` has `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
Run `/project env` after editing. Falls back to local mode automatically.

---

## Reset Everything

**Soft reset** (keep context, clear workflow state):
```bash
rm -rf .claude/cache/ .claude/logs/workflows/
```

**Hard reset** (fresh start):
```bash
rm -rf .claude/
project:init
```

---

