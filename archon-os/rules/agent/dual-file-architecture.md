> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Dual-File Architecture

**Priority:** HIGH — Understanding file organization
**Type:** Rule (Structural Standard)

---

## Core Concept

Archon OS separates **plugin files** (global, shared system instructions) from **project files** (local, per-project customization).

**Why:** Claude Code auto-loads `.claude/CLAUDE.md` but NOT plugin files. Project CLAUDE.md acts as a lightweight loader that instructs Claude to read the plugin.

**Benefits:** No duplication, easy updates (change plugin = all projects benefit), project-specific overrides possible.

---

## Architecture

```
PROJECT (.claude/)          →  reads  →  PLUGIN (archon-os/)     →  fallback  →  GLOBAL (~/.claude/)
├── CLAUDE.md (loader)                   ├── CLAUDE.md (system)                  ├── CLAUDE.md (defaults)
├── settings.json                        ├── agents/                             └── settings.json
├── settings.local.json (gitignored)     ├── commands/
└── project-contexts/                    ├── rules/
    └── [project-name]/                  ├── skills/
        ├── project-config.yaml          ├── templates/
        ├── conventions.md               ├── scripts/
        ├── rules.md                     ├── hooks/
        └── examples.md                  └── docs/
```

---

## Minimal Project CLAUDE.md

```markdown
# Project: my-app
## Load Archon OS
Read and follow: ~/.claude/plugins/marketplaces/archon/archon-os/CLAUDE.md
## Project Context
Load from: .claude/project-contexts/my-app/
## Overrides (if any)
- Primary agent: mobile
- Test coverage: 90%
```

---

## When to Modify Each File

```toon
modify_guide[3]{file,when}:
  Project CLAUDE.md,"Project-specific overrides, primary agent, phase behavior"
  Plugin CLAUDE.md,"Core behavior updates, new agents/skills/rules, version updates"
  Global CLAUDE.md,"Defaults for ALL projects, personal preferences, fallback"
```

---

## Anti-Patterns

- Do NOT copy-paste plugin content into project CLAUDE.md — reference it
- Do NOT put project-specific rules in plugin — use project-contexts/

---

## File Location Reference

```toon
locations[5]{what,where}:
  System instructions,Plugin CLAUDE.md
  Project overrides,Project .claude/CLAUDE.md
  Tech stack config,project-contexts/*/project-config.yaml
  Agent/command/rule/skill definitions,Plugin agents/ commands/ rules/ skills/
  Naming conventions + project rules,project-contexts/*/conventions.md + rules.md
```

---
