---
last_aligned_with: v3.7.3
status: current
audience: first-time
---

# Aura Frog — 60-Second Quickstart

> v3.7.x syntax. The current command surface is `/run` (universal entry point with intent detection) + `/archon-os:*` (plan / heal / mcp / trace / dashboard) + `/af` (status / agents / learn). Older `workflow:*`-prefixed verbs from v3.6 are documented in `MIGRATION_TO_V3.7.md`.

## Install

```bash
# In Claude Code terminal:
/plugin marketplace add nguyenthienthanh/archon
/plugin install archon-os@archon
```

## Use

```bash
# Universal entry point — auto-detects bugfix / feature / refactor / test / review / deploy
/run implement user profile with avatar upload

# Or a one-shot bugfix
/run fix login button not disabling on submit

# At approval gates (Phase 1 design, Phase 3 build):
#   approve     → advance to next phase
#   reject      → redo with feedback
#   modify      → adjust deliverables without restarting
#   handoff     → save state for next session
```

For a project-scope task that touches 5+ features, `/run` will offer to escalate into the hierarchical planner (`/archon-os:plan`). Once a plan is active, you can also type bare verbs (`next`, `expand FEAT-A`, `status`) without any prefix.

## Update

```bash
# Check current version
/af status

# Update to latest
/plugin marketplace update aurafrog

# Restart Claude Code after update
/exit
```

**Auto-check:** Aura Frog checks for updates daily. Set `AF_UPDATE_CHECK=false` to disable.

## Essential Commands

| Command | What it does |
|---------|-------------|
| `/run <task>` | Universal entry point — auto-detects intent (feature / bugfix / refactor / test / review / deploy) |
| `/archon-os:plan` | Hierarchical planning (T0 Mission → T1 Initiative → T2 Feature → T3 Story → T4 Task) |
| `/check` | Quality scan — security / perf / complexity / debt / coverage / deps |
| `/design` | Pre-code design — API / DB / docs |
| `/project init` | Scan repo, detect stack, generate `.claude/project-contexts/` |
| `/af status` | Plugin status — version, agents, MCP servers, learning system |
| `/help` | Plugin overview, per-command help, agent routing guide |

## Learn More

- [GET_STARTED.md](GET_STARTED.md) — Full setup walkthrough with first workflow
- [FIRST_WORKFLOW_TUTORIAL.md](FIRST_WORKFLOW_TUTORIAL.md) — Guided hands-on tutorial
- [All Commands](../../archon-os/commands/README.md) — 24 commands (core 6 + `/archon-os:*` planning suite)
- [MCP Guide](../operations/MCP_GUIDE.md) — 6 bundled MCP servers (all enabled) + opt-in snippets
- [Agent Selection Guide](../guides/AGENT_SELECTION_GUIDE.md) — How agents are auto-picked per task

---
