---
name: documentation
description: "Create Runbooks for operational documentation. For ADRs, tech specs, requirements, LLD and technical analysis use the tech-writing skill instead."
autoInvoke: false
priority: medium
triggers:
  - "ADR"
  - "runbook"
  - "architecture decision"
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Documentation (ADR & Runbook)

## When to Create

- **Runbook:** Service deployment, common ops tasks, incident response
- **ADR:** → use `skills/tech-writing` + `templates/decision-record.md`. That template carries the
  full 4-tier ladder (Y-statement → Nygard ADR → MADR → RFC) and picks the tier by decision size.
  The stripped ADR template below is kept only so existing links keep resolving.

## ADR Template

```markdown
# ADR-[N]: [TITLE]
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-X
**Date:** YYYY-MM-DD

## Context — ## Decision — ## Options Considered — ## Consequences
```

Location: `docs/adr/ADR-NNN-description.md`. Keep immutable — supersede, don't edit.

## Runbook Template

```markdown
# Runbook: [Service]
**Owner:** [Team] | **On-Call:** [Contact]

## Prerequisites — ## Common Operations — ## Troubleshooting — ## Alerts & Escalation
```

Location: `docs/runbooks/service-name.md`. Test commands before documenting.

## Principles

- ADR: clear problem, options evaluated, consequences documented
- Runbook: commands copy-paste-ready, escalation path defined
