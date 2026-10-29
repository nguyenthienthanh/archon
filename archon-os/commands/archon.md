# Archon OS System Commands

Plugin management, learning system, metrics, agents, and setup.

**Category:** System
**Scope:** Session

---

## /archon status

Show plugin status: version, active project, MCP server health, env vars loaded, component counts (agents/skills/rules), and session stats.

---

## /archon agents

List all available agents with capabilities, or show details for a specific agent.

**Usage:** `/archon agents`, `/archon agents security`

---

## /archon metrics

Show metrics dashboard: token usage, workflow completion rates, agent usage, phase durations vs budget, session stats. Aggregates from `.claude/metrics/`.

**Usage:** `/archon metrics`, `/archon metrics --hooks` (profile hooks), `/archon metrics --performance` (plugin overhead)

---

## /archon learn

Learning system management. Requires Supabase (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ARCHON_LEARNING_ENABLED=true`).

```toon
subs[5]{sub,purpose}:
  "/archon learn status","Show learning system status + statistics"
  "/archon learn feedback","Submit manual feedback (success/correction/issue/suggestion)"
  "/archon learn analyze","Analyze patterns from Supabase (agents/workflows/feedback)"
  "/archon learn apply","Review and apply pending improvements"
  "/archon learn setup","First-time Supabase schema creation"
```

---

## /archon setup

Plugin setup and configuration.

```toon
subs[3]{sub,purpose}:
  "/archon setup activate","Quick-activate Archon OS in current project"
  "/archon setup integrations","Configure JIRA/Confluence/Slack/Figma tokens"
  "/archon setup cli","Install af CLI globally"
```

---

## /archon update

Check for plugin updates and install latest version.

---

## /archon mcp

Show MCP server status: connected/disconnected, last response time, error count.

---

## /archon prompts

Evaluate prompt quality and Claude Code feature utilization. Scores 0-100 with improvement suggestions.

**Usage:** `/archon prompts`, `/archon prompts --days 30 --focus efficiency`

---

## /archon skill create

Create a new reusable skill template.

**Usage:** `/archon skill create "my-skill-name"`

---

## /archon statusline

Install / update / inspect the custom multi-line statusline (identity · 5h+7d limits with reset clock + context% · session $ / burn $/hr / billing-cycle $). Backed by `scripts/statusline-install.sh`; the canonical renderer lives in `scripts/statusline-render.py` and ships with the plugin.

```toon
statusline[3]{sub,action}:
  "/archon statusline install","Copy the statusline scripts to ~/.claude/ + wire settings.json. Flags: --billing-day N, --plan LABEL, --style cost|af"
  "/archon statusline update","Pull the latest renderer into ~/.claude/ (keeps your wiring + billing/plan)"
  "/archon statusline status","Show active statusline, resolved billing day + plan, cost-refresh + rate-limit cache health"
```

**Usage:** `/archon statusline install --billing-day 9 --plan Max`, `/archon statusline update`, `/archon statusline status`
**Details:** `docs/reference/STATUSLINE.md`. Env toggles: `ARCHON_BILLING_DAY`, `ARCHON_PLAN_LABEL`, `ARCHON_CTX_WINDOW`, `ARCHON_STATUSLINE_USAGE_DISABLED`, `NO_COLOR`.

---

## Related

- **Skills:** `prompt-evaluator`, `self-improve` (Analyze→Apply learning loop)
