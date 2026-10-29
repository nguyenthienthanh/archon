# Aura Frog - [PROJECT_NAME]

**Project:** [PROJECT_NAME]
**Tech Stack:** [TECH_STACK]
**Aura Frog Version:** [AF_VERSION]

---

<!-- AURA-FROG:START - Do not edit this section manually -->
<!-- This section is auto-updated by project:regen -->

## Load Aura Frog Plugin

**Read and follow:** Aura Frog plugin's `CLAUDE.md` (auto-loaded by plugin system)

This plugin provides rules and skills that auto-load:
- **Execution:** Follow `rules/core/execution-rules.md`
- **Skills:** Auto-invoke from `skills/`
- **MCP:** Use bundled servers from `.mcp.json`

**Important:** Banner format is defined in the plugin. Do NOT duplicate here.

---

## MCP Integrations

Bundled MCP servers auto-invoke based on context:

| MCP | Triggers |
|-----|----------|
| **context7** | Library names (React, MUI, Tailwind) |
| **figma** | Figma URLs |
| **playwright** | E2E test requests |
| **vitest** | Unit test requests |
| **slack** | Phase 5 notifications |

**Setup:** Copy `.envrc.template` and set tokens.

<!-- AURA-FROG:END -->

---

## Project Context

**Load from:** `.claude/project-contexts/[PROJECT_NAME]/`

```toon
context_files[4]{file,purpose}:
  project-config.yaml,Tech stack + agents + integrations
  conventions.md,File naming + structure patterns
  rules.md,Project-specific quality rules
  examples.md,Code examples from this project
```

---

## Project-Specific Settings

- **Primary Agent:** `[PRIMARY_AGENT]`
- **Tech Stack:** [TECH_STACK]
- **Type:** [PROJECT_TYPE]

---

<!-- USER-CUSTOM:START - Add your project-specific rules below -->
<!-- This section is preserved during project:regen -->

## Project Rules

<!-- Add your project-specific rules, integrations, or instructions here -->
<!-- This section will NOT be overwritten by Aura Frog updates -->

<!-- USER-CUSTOM:END -->

---

**Aura Frog Version:** [AF_VERSION] | **Generated:** [DATE]
