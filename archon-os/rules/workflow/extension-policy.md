> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Extension Policy

**Priority:** High
**Applies To:** `extension-detector` skill, `/archon-os:extend` command, any future automation that proposes new project-level capabilities

---

## Core Principle

**Project-specific patterns belong in the project.** When a user's project would benefit from a new skill / rule / command, it gets created at the **project-Claude level (`.claude/`)** with explicit user confirmation — never at the plugin level (`archon-os/`).

This rule formalizes:
1. When extension-detector should fire
2. What counts as "needed"
3. The mandatory confirmation gate
4. The project-only write constraint
5. Reference-integrity follow-up

---

## When to detect (signal thresholds)

```toon
signals[5]{strength,trigger,occurrences_required}:
  Strong,"User explicitly says 'we should have a skill/rule/command for X'",1
  Strong,"User says 'add a rule that…' or 'make this a skill'",1
  Medium,"Same correction repeats across recent turns",3
  Medium,"Same multi-step procedure invoked manually",3
  Weak,"README/CONTRIBUTING references a workflow Archon OS lacks",2 (combined with another weak)
```

Single weak signals NEVER fire. Counting window: last 10 turns OR current session boundary, whichever is shorter.

---

## What counts as "needed"

A proposal is justified when:

1. **Repeatability** — the procedure / correction would apply ≥3 times in the project's expected lifespan
2. **Specificity** — generic enough that documenting the pattern is more efficient than re-explaining each time
3. **Project-scoped** — the pattern is THIS project's convention, not universal (universal goes upstream as a plugin enhancement instead)
4. **No plugin equivalent** — `agent-detector` / existing plugin skills don't already cover it

If any test fails → don't propose.

---

## Confirmation gate (non-negotiable)

The detection skill MUST:

1. Surface a one-line proposal: `Proposed: <kind> "<name>" (.claude/<kind>s/<name>...). Reason: <signal>. Create? (y/n)`
2. Wait for explicit `y` / `yes` / `confirm` / `go ahead` / `do it`
3. Treat ANY other response (including silence, ambiguity, "let me think", "maybe later") as **no**
4. On no: drop the proposal silently, do not retry within the same turn
5. On yes: hand off to `/archon-os:extend create <kind> <name>` — only that command writes files

The detector itself NEVER writes a file. Separation of detect vs. create is the safety boundary.

---

## Project-only write constraint (HARD)

```toon
allowed_paths[3]{kind,target}:
  skill,.claude/skills/<name>/SKILL.md
  rule,.claude/rules/<tier>/<name>.md
  command,.claude/commands/<name>.md
```

```toon
forbidden_paths[1]{path,reason}:
  archon-os/**,"Plugin updates would clobber project-specific additions"
```

`/archon-os:extend` rejects any path resolution that lands inside `archon-os/`. The check is on the absolute prefix — no path-traversal exploits.

---

## Frontmatter requirements for project extensions

| Kind | Required fields | Project-specific defaults |
|---|---|---|
| skill | name, description, when_to_use, allowed-tools, effort, user-invocable | `user-invocable: false` always (per Commands-vs-Skills architecture) |
| rule | priority, tier, applies_to | tier ∈ {core, agent, workflow}; project rules typically `tier: workflow` or `tier: agent` (rare to add to core at project level) |
| command | usage block + imperative protocol | none — project commands work like plugin commands |

Project skills with `autoInvoke: true` MUST be name-collision-checked against plugin auto-invoke skills (would cause duplicate fires).

### Project rules load EVERY session unless path-scoped (HARD)

Claude Code loads every `.claude/rules/**/*.md` without `paths:` frontmatter at session start, and warns past **150k chars** total. A project that keeps adding rules hits that ceiling (measured: 86 unscoped rules + a 94k CLAUDE.md = 492k chars). So a new project rule:

- **Declares `paths:` frontmatter** (globs of the code it governs) unless it is a project-wide guardrail that must apply to every task. Default to scoped; always-loaded is the exception the user confirms.
- **Stays under ~8k chars.** Incident logs, patch histories and quick-refs go to `docs/`, and the rule keeps a short summary plus a pointer.
- **Gets a one-line entry in the project's CLAUDE.md rule index** so it is still discoverable for chat-only work that touches no file.

Check before and after: `node archon-os/scripts/context-budget.cjs <project>`. Session start also warns once the total passes `AF_CONTEXT_BUDGET_WARN` (default 100k).

---

## Reference integrity follow-up

After file creation, `/archon-os:extend create` runs the audit step from CLAUDE.md "LESSON LEARNED — Reference Integrity Rule":

- New rule: must have ≥ 1 inbound reference within 1 turn (else surface as orphan-warning, not error)
- New skill: description-triggers must not shadow plugin skills
- New command: name must not collide with plugin commands (e.g., can't shadow `/run`)

If audit produces output → user is shown findings; file is kept (user can fix or remove via `/archon-os:extend remove`).

---

## Detection budget (anti-fatigue)

```toon
limits[3]{scope,cap}:
  per_turn,1 proposal max
  per_session,3 proposals max
  per_repeat_signal,respect prior 'no' for the rest of the session
```

After session cap, defer further proposals to user-initiated `/archon-os:extend list` review.

---

## Anti-patterns

- **Detecting on a single corrective phrasing** ("don't do X") — that's a one-off correction, not a rule candidate; require 3+
- **Inferring rule content from user mood** — only the literal repeated pattern justifies a proposal
- **Proposing names without project context** — extension-detector must Read `.claude/CLAUDE.md` before naming
- **Creating at plugin level "for future users"** — never; the plugin ships a fixed surface
- **Skipping confirmation because the signal is "obviously strong"** — confirmation is non-negotiable, no signal threshold bypasses it
- **Re-proposing rejected ideas in same session** — respect the no

---

## Tie-Ins

- **Skill:** `extension-detector` — only auto-invoked detector
- **Command:** `/archon-os:extend` — only writer of project extensions
- **Rule:** `rules/core/no-assumption.md` — same spirit (ask when uncertain)
- **Rule:** `rules/core/contextual-separation.md` — proposals are draft until confirmed
- **Project file:** `.claude/CLAUDE.md` — extension naming + tone should match project conventions
- **Project file:** `.claude/extensions.log` — append-only audit of project extensions
