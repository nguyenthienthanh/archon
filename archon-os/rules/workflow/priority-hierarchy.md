> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Priority Hierarchy

**Priority:** HIGH
**Type:** Rule (Structural Standard)

---

## Core Rule

Claude Code loads instructions in order and MERGES them. Project linting config MERGES with Archon OS rules (conflicts: project wins).

---

## Loading Order

```
0. Project Linting Config    (HIGHEST) — .eslintrc, .prettierrc, tsconfig.json
1. Project: CLAUDE.md, .claude/CLAUDE.md, .claude/rules/**, .claude/skills/**, .claude/agents/** (HIGH)
2. User:    ~/.claude/CLAUDE.md, ~/.claude/rules/**, ~/.claude/skills/**, ~/.claude/agents/** (HIGH)
3. Plugin:  archon-os/CLAUDE.md, rules/, skills/, agents/ (DEFAULT)
```

**Host extensions beat plugin defaults.** The user's own rules/skills (user + project
scope) are deliberate choices; Archon OS's are generic defaults. On conflict the host wins,
and when a host skill and a plugin skill both match a task, invoke the host skill. A
security/override rule in `~/.claude/rules/` is never relaxed by a plugin rule.

`session-start` prints the host index (`🧩 Host extensions`) and `subagent-init` injects it
into every subagent (plugin agents carry the `Skill` tool for this). Disable with
`ARCHON_HOST_EXTENSIONS_DISABLED=true`.

**Skills Claude Code never registers:** only `.claude/skills/<name>/SKILL.md` with
`description` frontmatter loads. Flat `.claude/skills/<name>.md` files are silently ignored —
session-start warns; convert with `node scripts/migrate-host-skills.cjs <project-dir> --apply`.

---

## Code Quality Merge

```toon
code_quality_merge[5]{priority,source,behavior}:
  1,Project linting,Overrides conflicts in layers 2-5
  2,Project conventions,Overrides conflicts in layers 3-5
  3,Project examples,Overrides conflicts in layers 4-5
  4,Archon OS rules,Applies where layers 1-3 are silent
  5,Claude defaults,Applies where layers 1-4 are silent
```

**See:** `project-linting-precedence.md` for detailed merge strategy.

---

## Override Behavior

**Additive** (lists merged): agents, skills
**Override** (values replaced): test_coverage, naming conventions

---

## When to Use Each Level

- **Project CLAUDE.md:** Project-specific tech stack, overrides, custom agents
- **Plugin CLAUDE.md:** Standard Archon OS behavior, core instructions
- **Global CLAUDE.md:** Cross-project defaults, personal preferences

---

## Troubleshooting

- Plugin not loading? Check global `~/.claude/CLAUDE.md` points to plugin
- Overrides not working? Check priority order (project > user > plugin)
- Host skill never shows up? Check it is `<name>/SKILL.md` with `description` frontmatter (`scripts/migrate-host-skills.cjs`)
- Context not applied? Run `/project init`, verify `.claude/project-contexts/` exists

---

**Last Updated:** 2026-10-23
