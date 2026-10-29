---
name: extension-detector
description: "Detects when a new project-level skill / rule / command would reduce friction. Asks the user for confirmation before creating anything. NEVER writes plugin-level files — only `.claude/skills/`, `.claude/rules/`, `.claude/commands/` in the user's project."
when_to_use: "When repeated patterns, recurring user corrections, or explicit 'we should have a skill/rule for X' signals appear in conversation"
autoInvoke: true
allowed-tools: Read, Glob, Grep
effort: low
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Extension Detector

**STATUS — v3.7.0-alpha.3.** Self-extending capability with hard gates against plugin pollution.

## Core principle

The Aura Frog plugin ships a fixed set of skills, rules, and commands. Project-specific patterns belong **in the project**, not in the plugin. This skill watches for the moment a user's project would benefit from its own extensions and proposes them — but **never creates them autonomously**.

**Hard rule:** anything this skill creates lands in the user's project under `.claude/`, never in `aura-frog/`.

## Detection signals (in order of strength)

| Strength | Signal | Action |
|---|---|---|
| **Strong** | User explicitly says "we should have a skill/rule/command for X", "add a rule that…", "make this a skill" | Surface immediately |
| **Medium** | User repeats the same correction 3+ times across recent turns ("don't do X" / "always do Y") | Surface as candidate rule |
| **Medium** | Same multi-step procedure invoked manually 3+ times in this project | Surface as candidate skill |
| **Weak** | Project README/CONTRIBUTING references a workflow Aura Frog doesn't have a command for | Surface as candidate command |

Weak signals require 2+ in combination before surfacing.

## Confirmation protocol (mandatory)

When a signal fires, the skill MUST:

1. **Pause and surface** — never write a file as a side effect of detection
2. **Show a one-line proposal** — `Proposed: project skill "<name>" (.claude/skills/<name>/SKILL.md). Reason: <signal>. Create? (y/n)`
3. **Wait for explicit yes** — `y`, `yes`, `confirm`, `go ahead`, `do it` count as yes; anything else (including silence, ambiguity, or "let me think") = no
4. **On yes:** delegate to `/archon-os:extend create <kind> <name>` — the command owns actual file authoring + audit
5. **On no:** drop the proposal, do NOT re-surface within the same turn, but track for re-detection if the signal repeats

## What this skill does NOT do

- Does NOT write any file directly (delegates to `/archon-os:extend`)
- Does NOT write to `aura-frog/skills/`, `aura-frog/rules/`, `aura-frog/commands/` — plugin pollution is forbidden
- Does NOT auto-create even on strong signals (human-in-the-loop is the whole point)
- Does NOT detect patterns across projects (project-isolated; signals only count within the current project)
- Does NOT lower its detection threshold based on past confirmations (each proposal is independent)

## Detection budget

To prevent fatigue, max **1 proposal per turn**, max **3 proposals per session**. After session cap, defer further proposals to `/archon-os:extend list` (user-initiated review).

## What gets created (kinds)

| Kind | Path | Purpose |
|---|---|---|
| skill | `.claude/skills/<name>/SKILL.md` | AI-discoverable knowledge for repeated procedures |
| rule | `.claude/rules/<tier>/<name>.md` | Guardrail; **declare `paths:` frontmatter** so it loads on demand, keep it under ~8k chars (see `rules/workflow/extension-policy.md` § path-scoped) |
| command | `.claude/commands/<name>.md` | User-invocable slash command |

Project-level files load AFTER plugin-level files, so they can shadow or extend plugin behavior without modifying the plugin.

## Anti-patterns

- **Detecting on a single user message** — that's reactive, not pattern-based; require 3+ occurrences for medium signals
- **Inferring intent from one similar phrasing** — if the user said "don't do X" once, it's a correction, not a rule candidate
- **Proposing skill/rule/command names without reading project context** — use Read on the project's `CLAUDE.md` (root or `.claude/CLAUDE.md`) and recent files to ground the name
- **Surfacing a proposal mid-flow when the user is in active execution** — wait until a natural pause (between turns, not mid-tool-call)
- **Re-proposing rejected ideas in the same session** — respect the no

## Tie-Ins

- **Command:** `/archon-os:extend` — only consumer; this skill never writes files itself
- **Rule:** `rules/workflow/extension-policy.md` — formalizes detection thresholds + project-claude-only constraint
- **Rule:** `rules/core/no-assumption.md` — confirmation requirement aligns with broader ask-when-uncertain principle
- **Skill:** `agent-detector` — if extension would change agent routing, agent-detector's behavior should be referenced
