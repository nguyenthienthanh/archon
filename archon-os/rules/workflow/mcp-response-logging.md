> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# MCP Response Logging

**Priority:** Medium
**Type:** Rule (Auto-Save)

---

## Core Rule

**After fetching data via MCP (JIRA, Figma, Confluence), ALWAYS save to logs.**

---

## JIRA Tickets

After fetching a JIRA ticket via MCP:

```bash
# Save the raw JSON response
bash ~/.claude/plugins/marketplaces/archon/archon-os/scripts/workflow/save-mcp-response.sh save jira TICKET-ID --stdin <<< '$JSON_RESPONSE'
```

**Or in Claude's workflow:**
1. Mention the ticket key (e.g. `PROJ-123`) in any user prompt
2. `hooks/jira-auto-fetch.cjs` fires on UserPromptSubmit, fetches the ticket, and writes raw JSON to `.claude/logs/jira/{TICKET_ID}.json` (24h TTL)
3. Claude reads the cache via `state.context.jira_ticket` during pre-phase setup

---

## Output Format (TOON)

JIRA responses are automatically converted to TOON:

```toon
ticket[1]{key,summary,type,status,priority}:
  PROJ-123,Fix login bug,Bug,In Progress,High
```

```toon
metadata[1]{assignee,reporter,created,updated}:
  John Doe,Jane Smith,2025-01-15,2025-01-20
```

Plus inline scalar fields:

```
labels: frontend, urgent
components: authentication
```

---

## Log Locations

```
.claude/logs/
├── jira/
│   ├── PROJ-123_latest.toon
│   └── PROJ-123_20251222-143052.toon
├── figma/
│   ├── design-abc_latest.toon
│   └── design-abc_20251222-143052.toon
└── confluence/
    └── page-id_latest.toon
```

---

## Commands

```bash
# Save response
workflow-manager.sh mcp-save jira PROJ-123 "$JSON"

# List saved responses
workflow-manager.sh mcp-list

# Get latest for ticket
workflow-manager.sh mcp-get jira PROJ-123
```

---

## When to Apply

- **JIRA ticket fetch** → Save to `logs/jira/`
- **Figma design fetch** → Save to `logs/figma/`
- **Confluence page fetch** → Save to `logs/confluence/`

---

