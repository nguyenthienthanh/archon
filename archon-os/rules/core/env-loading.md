> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Environment Loading

**Priority:** Critical
**Applies:** Session start, before any response

---

## Rule

Check environment variables FIRST. If not loaded → run `/project reload-env`.

## Process

1. Source `.envrc` (project root) or `.claude/.envrc` (fallback). Project root takes priority.
2. Verify critical vars are set
3. If missing → auto-run `/project reload-env`

NEVER skip. NEVER respond without loading env first.

## Variables

```toon
vars[2]{category,keys}:
  Integrations,"JIRA_URL JIRA_EMAIL JIRA_API_TOKEN FIGMA_API_TOKEN SLACK_BOT_TOKEN CONFLUENCE_URL"
  Workflow,"AURA_FROG_AUTO_APPROVE AURA_FROG_DEFAULT_COVERAGE AURA_FROG_TDD_ENFORCE"
```

**Priority:** Environment Variable > Project Config > Global Config > Default

**Commands:** `/project reload-env` (reload), `/project init` (creates template)
