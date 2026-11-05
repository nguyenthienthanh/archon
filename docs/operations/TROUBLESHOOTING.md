---
last_aligned_with: v4.0.0-alpha.3
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
2. Archon OS auto-detects saved state via `compact-handoff.cjs`
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
/archon learn status
```
If disabled: check `.envrc` for `ARCHON_LEARNING_DISABLED=true`.

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

---

## FAQ

Moved here from the README in v4.0.0 so the README could stay a landing page. Each answer
names the check to run before the fix, because the same symptom usually has two causes.

<details>
<summary><strong>Q: Workflow state isn't saving. `/run status` shows nothing.</strong></summary>

**Likely cause:** Path drift between hooks and skills (fixed in v3.7+).

**Check:**
```bash
ls -la .claude/logs/runs/         # Should exist after first /run
ls -la .claude/logs/workflows/    # Legacy path — may have old state
```

**Fix:**
- Upgrade to v3.7+ (`/plugin update archon-os`)
- Or manually move: `mv .claude/logs/workflows/* .claude/logs/runs/`

Verify with `/archon status` — should show 0 orphan paths.
</details>

<details>
<summary><strong>Q: Wrong agent picked for my task.</strong></summary>

**Likely cause:** Missing project context or ambiguous task description.

**Check:**
- Did you run `/project init` yet? Scanner uses those files for Layer 3 (project context).
- Is your task description short/vague? `agent-detector` defaults to repo type when signals are weak.

**Fix:**
- Run `/project init` if you haven't
- Rephrase task with domain-specific keywords: `"Add email template styling"` (frontend) vs `"Update email feature"` (ambiguous)
- Override manually: `/run @frontend implement X` forces the frontend agent

Full scoring logic: `skills/agent-detector/task-based-agent-selection.md`.
</details>

<details>
<summary><strong>Q: Token budget blown past 200K. What happened?</strong></summary>

**Likely cause:** Phase 3 (Build GREEN) hit an iteration loop on a complex refactor.

**Check:**
```bash
/run budget      # Shows per-phase consumption
/run metrics     # Shows if rejection count is high
```

**Fix:**
- `/run handoff` to save state → resume in fresh session
- For next time: use `/run predict <task>` first — flags Deep tasks likely to exceed budget
- Consider splitting: `/run part 1: <narrow scope>` → merge → `/run part 2`
</details>

<details>
<summary><strong>Q: Hooks not firing (no SessionStart banner, no lint-autofix).</strong></summary>

**Likely cause:** `.claude/settings.json` missing hook config, or plugin not activated in this project.

**Check:**
```bash
cat .claude/settings.json   # Should reference plugin hooks
/archon status                  # Should show "Hooks: 28 registered"
```

**Fix:**
```bash
/archon setup integrations      # Re-installs hook config
```

If still nothing, check plugin.json path:
```bash
ls ~/.claude/plugins/marketplaces/archon/archon-os/hooks/hooks.json
```
</details>

<details>
<summary><strong>Q: Opus session costs surprised me. Can I lock everything to Sonnet?</strong></summary>

**Yes — two ways:**

**Option 1 — Session override (temporary):**
```bash
# Start Claude Code with model flag
claude --model sonnet
```

**Option 2 — Env var (permanent, overrides ALL frontmatter):**
```bash
export CLAUDE_CODE_SUBAGENT_MODEL=sonnet
```

This overrides every agent/skill `model:` declaration. See [Per-Agent Model Override](#per-agent-model-override--how-it-works-and-why) for resolution order.

**Cost tip:** `scanner` and `agent-detector` stay on haiku regardless — you don't need to touch them.
</details>

<details>
<summary><strong>Q: Can I run multiple /run workflows in parallel?</strong></summary>

**Yes — use git worktrees:**
```bash
/run worktree: <task>    # Automatically creates isolated worktree + runs there
```

Each worktree has its own state in `.claude/logs/runs/<id>/`. See [Git skill](../../archon-os/skills/git/SKILL.md) (worktree isolation section).

For full multi-agent parallel work, enable Agent Teams:
```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

See [Agent Teams Guide](../guides/AGENT_TEAMS_GUIDE.md).
</details>

<details>
<summary><strong>Q: How do I disable a hook that's slowing me down?</strong></summary>

Each hook has a disable env var:

```bash
ARCHON_LINT_AUTOFIX=false        # Skip post-edit linter
ARCHON_PROMPT_LOGGING=false      # Skip prompt metadata logging
ARCHON_LEARNING_ENABLED=false    # Skip all learning hooks
```

Or disable at the source by editing `archon-os/hooks/hooks.json` (comment out the matcher).

Full hook list: [hooks/README.md](../../archon-os/hooks/README.md).
</details>

More issues: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
