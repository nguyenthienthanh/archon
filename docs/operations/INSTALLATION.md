---
last_aligned_with: v3.7.3
status: current
audience: active-user
---

# Aura Frog Installation — Supplementary Paths

The fast path is in [GET_STARTED.md](../getting-started/GET_STARTED.md). This doc covers the situations where the fast path is not enough: CLI symlink, manual install (no marketplace), environment-variable setup, and how to wire up integrations.

---

## CLI symlink — `af` outside Claude Code

Aura Frog ships an `af` helper for health checks, setup wizards, and performance reports that you run from a regular terminal (not inside Claude Code).

Install one of two ways:

```bash
# With sudo — system-wide symlink
sudo ln -sf "$HOME/.claude/plugins/marketplaces/aurafrog/scripts/af" /usr/local/bin/af

# Without sudo — add to PATH
echo 'export PATH="$HOME/.claude/plugins/marketplaces/aurafrog/scripts:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Then use anywhere:

```bash
af doctor           # Health check
af setup remote     # Remote control guide
af setup channels   # Telegram/Discord channel wiring
af measure          # Performance report
```

`af` is optional — every plugin feature is also reachable from inside Claude Code via `/af`, `/check`, `/project`, `/run`.

---

## Manual install (no marketplace)

If your Claude Code build doesn't yet support `/plugin marketplace add`, or you want to track a fork:

```bash
mkdir -p ~/.claude/plugins/marketplaces/aurafrog
git clone https://github.com/nguyenthienthanh/archon.git \
  ~/.claude/plugins/marketplaces/archon/archon-os

cd ~/.claude/plugins/marketplaces/archon/archon-os
cp settings.example.json settings.local.json   # REQUIRED
```

Restart Claude Code to register the plugin. `/help` should now show Aura Frog commands.

**Uninstall** (either install path): `/plugin uninstall archon-os@archon`.

---

## Environment variables — `.envrc`

Aura Frog reads `.envrc` at session start. Create it in the project root (and add it to `.gitignore` — never commit it):

```bash
# JIRA Integration (auto-fetches tickets like PROJ-123 when mentioned in prompts)
export JIRA_BASE_URL="https://your-company.atlassian.net"
export JIRA_EMAIL="your.email@example.com"
export JIRA_API_TOKEN="your-jira-api-token"
# Optional: restrict to specific project prefixes
# export JIRA_PROJECT_PREFIXES="PROJ,BUG,FEAT"

# Confluence
export CONFLUENCE_URL="https://your-company.atlassian.net/wiki"
export CONFLUENCE_EMAIL="your.email@example.com"
export CONFLUENCE_API_TOKEN="your-confluence-api-token"

# Figma (auto-triggers on Figma URLs)
export FIGMA_API_TOKEN="your-figma-token"

# Slack (Phase 5 completion notifications)
export SLACK_BOT_TOKEN="xoxb-..."
export SLACK_CHANNEL="#aura-frog-bot"

# Supabase (for cross-machine learning sync — local fallback works without this)
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SECRET_KEY="eyJ..."
export AF_LEARNING_ENABLED="true"
```

After editing `.envrc`, reload with `/project env` — or just start a new session and the auto-loader will pick it up.

**Security:** Aura Frog gates `.envrc` access through a trust prompt the first time it loads (per project). See [SECURITY_AND_TRUST.md](SECURITY_AND_TRUST.md) for the trust model and how to bypass with `af envrc allow` for CI.

---

## `.gitignore` hygiene

Recommended additions for any project using Aura Frog:

```gitignore
# Aura Frog — local state, never commit
.claude/
.envrc
firebase-debug.log
```

`.claude/` holds plan trees, run logs, traces, and caches — local to your machine. The plugin itself lives in `~/.claude/plugins/` (out of your repo).

---

## What you don't need to install

- **Per-MCP CLIs.** Bundled MCPs (context7, playwright, vitest, firebase, figma, slack) are auto-invoked when context matches. Some need a one-time login (`firebase login`) or an env-var token (above). Optional MCPs (postgres, redis) live in `.mcp.json` with `disabled: true` — flip to enable. See [MCP_GUIDE.md](MCP_GUIDE.md).
- **Learning system setup.** Runs locally with zero config — just enabled by default. Cloud sync via Supabase is optional. See [LEARNING_SYSTEM.md](LEARNING_SYSTEM.md).
- **Phase scripts.** Lifecycle is in `.cjs` hooks (in the plugin), not user-editable phase files.

---

## Troubleshooting install

Full triage list in [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Install-specific FAQs:

| Symptom | Likely cause | Fix |
|---|---|---|
| `/plugin marketplace add` errors | Older Claude Code build | Update Claude Code or use [manual install](#manual-install-no-marketplace) |
| Plugin installed but `/help` shows nothing new | Marketplace not refreshed | Restart Claude Code; re-run `/plugin install archon-os@archon` |
| `.envrc` not picked up | Not in project root, or trust gate denied | `cd` to project root; run `af envrc allow` |
| Hooks fail with permission errors | `~/.claude/plugins/` perms drift | `chmod -R u+r ~/.claude/plugins/marketplaces/aurafrog/` |
| MCP server silently no-ops | Missing env var | Check the MCP's required env in `.mcp.json` |
