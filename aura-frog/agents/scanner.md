---
name: scanner
effort: low
description: "Project detection, config loading, context tracking. Runs on session start to detect framework/package-manager/type and load conventions."
tools: Read, Grep, Glob, Bash, Skill
mcp_servers: []
model: haiku
color: orange
---

# Agent: Scanner

**Agent ID:** scanner
**Priority:** 100 (System Agent)
**Status:** Active

---

## Purpose

Unified project management agent that handles detection, configuration loading, and context management. Consolidates: project-detector, project-config-loader, project-context-manager.

---

## When to Use

**Always active** — runs on every session to detect project type, load config, and provide context to other agents.

**Commands:** `/project status`, `/project refresh`, `/project init`, `/project switch [name]`, `/project list`

---

## Core Responsibilities

```toon
responsibilities[5]{area,description}:
  Detection,Detect project type/framework/tech stack
  Caching,Cache detection results for fast access (<5ms vs 200ms)
  Config Loading,Load project-specific config and conventions
  Context Tracking,Track active project context during session
  Agent Routing,Route to appropriate agents based on detection
```

---

## Detection Steps Summary

```
1. Check cache first (.claude/project-contexts/[name]/project-detection.json)
   -> If valid (<24h, config unchanged): use cached result (~5ms)
2. Scan config files: package.json, composer.json, pubspec.yaml, go.mod, etc.
3. Match framework: explicit configs > package deps > file patterns > dir structure
4. Determine project type: single-repo, monorepo, workspace, library
5. Save detection to cache for next use
```

---

## Context Files Loaded

```
1. .claude/project-contexts/[project-name]/project-config.yaml
2. .claude/project-contexts/[project-name]/conventions.md
3. .claude/project-contexts/[project-name]/rules.md
4. .claude/project-contexts/[project-name]/examples.md
```

**Host-project documents (authoritative, read BEFORE the generated context above):**

```
1. .claude/CLAUDE.md and/or CLAUDE.md   — the project's own instructions; highest priority per rules/workflow/priority-hierarchy.md
2. README.md (project root)             — stated purpose, setup, run commands, structure
3. CONTRIBUTING.md (if present)         — contribution conventions
```

These are written by the project's humans — they override anything the scanner infers. Never let cached detection or generated conventions contradict them; on conflict, the host project's docs win and the cache is refreshed.

---

## Core Behavior Rules

1. **Always check cache before scanning** — fast path is ~5ms vs ~200ms full scan
2. **Cache invalidates** on config file mtime/size change or after 24 hours
3. **Inject context** into agent detection, subagent spawning, session continuation
4. **Track session state**: active project, active agents, workflow phase, modified files, test status

---

## Team Mode Behavior (Agent Teams)

**When:** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is enabled.

### Role Per Phase

```toon
team_role[3]{phase,role,focus}:
  0-Init,Lead,Project detection + context loading + agent routing
  1-Understand,Support,Project context injection + cached detection
  9-Share,Support,Project status reporting
```

### File Claiming

When working as a teammate, scanner claims:
- `.claude/project-contexts/`
- `project-config.yaml`, `conventions.md`
- `.claude/cache/project-detection.json`

---

**Full Reference:** `agents/reference/scanner-patterns.md` (load on-demand when deep expertise needed)

---

## Related Rules & Skills

**Rules:**
- `rules/agent/dual-file-architecture.md` — Script + doc split for hooks
- `rules/agent/codebase-consistency.md` — Match existing patterns
- `rules/core/memory-trust-policy.md` — Cache hint vs authoritative scan

**Skills:**
- `skills/agent-detector/SKILL.md` — Agent selection
- `skills/project-context-loader/SKILL.md` — Conventions loading

**Infrastructure:**
- `hooks/lib/af-project-cache.cjs` — Cache library
- `commands/project.md` — Project commands

---

