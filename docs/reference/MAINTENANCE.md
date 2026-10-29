---
last_aligned_with: v3.8.0-alpha.10
status: reference
audience: contributor
---

# Plugin Maintenance Contract

**Audience:** contributors editing the Archon OS plugin source (`archon-os/agents/`, `skills/`, `rules/`, `commands/`, `hooks/`).
**When this applies:** only when you ADD, MODIFY, REMOVE, or RENAME one of those files — not on every session.

> This file used to live inline in `.claude/CLAUDE.md`. It was moved here so it stops costing always-on context tokens every session (it only matters when mutating plugin files). `.claude/CLAUDE.md` keeps a one-line pointer to it.

---

## 1. Documentation Update Rule

On EVERY change, update ALL relevant files to keep them consistent.

### Files that track counts (MUST stay in sync)

| Component | Files to Update |
|-----------|-----------------|
| **Agents** | `archon-os/agents/README.md` (index + count), `archon-os/CLAUDE.md` (Process Table + Resources), `.claude-plugin/plugin.json` (description) |
| **Skills** | `archon-os/skills/README.md` (index + count), `archon-os/CLAUDE.md` (Auto-Invoke list + Resources), `.claude-plugin/plugin.json` (description) |
| **Rules** | `archon-os/rules/README.md` (index + count + categories), `archon-os/CLAUDE.md` (Resources) |
| **Hooks** | `archon-os/hooks/README.md` (index + count) |
| **Commands** | `archon-os/commands/README.md` (index + count) |

> **Single-source rule (v3.8.0):** counts live in the per-component `README.md` files and the `archon-os/CLAUDE.md` **Resources** table. Do not restate counts in prose elsewhere — drift starts the moment a number appears twice.

### Version references (only these files carry the plugin version)

```toon
version_files[4]{file,location}:
  archon-os/.claude-plugin/plugin.json,Source of truth (version field)
  .claude-plugin/marketplace.json,Marketplace version fields
  archon-os/CLAUDE.md,System header + footer
  .claude/CLAUDE.md,Archon OS Version header
```

**Note:** Banner examples use `{version}` placeholder — no sync needed. All other files had version footers removed to avoid sync drift.

### CHANGELOG.md requirements

- Add entry under current version section
- Format: `- **Feature Name** - Brief description`
- Group by: Added, Updated, Fixed, Removed
- Include stats diff (e.g., "Skills: 34 (was 33)")

### Version bump rules

| Change Type | Version | Examples |
|-------------|---------|----------|
| Patch (x.x.X) | Bug fixes, typos, doc tweaks | Fix typo in README |
| Minor (x.X.0) | New features, agents, skills, rules | Add godot-expert skill |
| Major (X.0.0) | Breaking changes, major refactors | Restructure plugin |

**A bump is NOT complete until it is tagged AND released.** Use `scripts/release.sh` — it runs the whole flow so no step (git tag, GitHub release) is skipped:

```bash
# 1. Prepare: bump every version file, stamp CHANGELOG [Unreleased] as the new
#    version + open a fresh [Unreleased], run the CI gates, print the diff.
#    Does NOT commit — review, commit on a branch, open a PR, merge.
bash scripts/release.sh prepare 3.8.0-alpha.9 "Hook runtime hardening"

# 2. Publish: run on `main` AFTER the prepare PR merges. Creates the annotated
#    tag v<version>, pushes it, and cuts a GitHub release (auto Pre-release for
#    -alpha/-beta/-rc), with notes pulled from the CHANGELOG section.
bash scripts/release.sh publish 3.8.0-alpha.9
```

`prepare` edits only the canonical version locations (the version-reference files above + each doc's `last_aligned_with:` frontmatter) — historical version strings in CHANGELOG/ROADMAP prose are left untouched. `publish` refuses to run unless it is on `main`, the tree is clean, and `plugin.json` already carries the target version (i.e. the prepare PR has merged).

### Pre-commit checklist

- [ ] All count references match (agents, skills, rules, hooks, commands)
- [ ] All version references match
- [ ] CHANGELOG.md has new entry
- [ ] README files updated if public API changed
- [ ] `git diff` reviewed for consistency
- [ ] `./scripts/audit/audit-refs.sh` exits 0
- [ ] On a version bump: `scripts/release.sh prepare` ran; after merge, `scripts/release.sh publish` created the tag + GitHub release

---

## 2. Frontmatter Maintenance Rule

When you ADD/MODIFY/REMOVE an agent/skill/rule file, maintain the YAML frontmatter schema.

### Agent frontmatter (`archon-os/agents/*.md`) — required fields

```yaml
---
name: agent-id                                          # required
description: "One sentence — what it does + when to use it."  # required
tools: Read, Grep, Glob[, Edit, Write, Bash]           # allowlist (per-role)
model: sonnet|haiku                                    # optional — omit to inherit
color: red|blue|green|yellow|purple|orange|pink|cyan   # free UX win
---
```

Review **every field** for role-appropriateness:
- Read-only agents (security, strategist) → tools omit Edit/Write/Bash
- Fast-path agents (scanner) → `model: haiku`
- Orchestrator (lead) → no model override (inherits)

### Skill frontmatter (`archon-os/skills/*/SKILL.md`) — supported fields

Only these are officially supported (per docs.claude.com/skills):
`name`, `description`, `when_to_use`, `argument-hint`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`, `effort`, `context`, `agent`, `hooks`, `paths`, `shell`.

- **NOT official:** `triggers` (use `when_to_use`).
- **NOT official:** `autoInvoke` (opt out via `disable-model-invocation: true`).
- **NOT official:** `priority` (order via `description` specificity).

### Rules (`archon-os/rules/**/*.md`)

Rules are NOT auto-loaded. Every rule MUST have ≥1 inbound reference from an agent, skill, or CLAUDE.md. If adding a rule, cite its path from the owning agent/skill's "Related Rules" section.

---

## 3. Architecture Rule — Commands vs Skills Separation

`commands/` is the user-typed slash surface. `skills/` is AI-discoverable knowledge. They do NOT overlap on triggers.

- Anything the user types as `/<name>` MUST live in `archon-os/commands/<name>.md`.
- Skills MUST set `user-invocable: false` — hides them from the slash menu so users only see commands.
- If a skill needs slash exposure → wrap it in a thin `commands/<name>.md` that delegates to the skill (e.g. `/af prompts` wraps the `prompt-evaluator` skill).
- Skills remain triggerable by: AI auto-invoke on description match, explicit prompt mention, or internal invocation from a command/another skill.

**Why:** without it, two slashes resolve to overlapping content, the slash menu fills with knowledge modules users can't act on, and contributors can't tell which file is the source of truth.

---

## 4. Reference Integrity Rule

**Context:** In v3.6.0 an incomplete refactor left 30 of 45 rules orphaned (no inbound references). Lazy-loading can't work for files nothing points to. Dead links accumulate silently across refactors.

**Rule:** After ANY change that adds/modifies/removes/renames a skill/agent/rule/command/hook file, verify reference integrity:

1. **Inbound refs** — new/modified content must have ≥1 file pointing to it.
2. **Outbound refs** — deleted content must have zero remaining references (grep for old name, fix every hit).
3. **Renames** — `git mv` preserves history but does NOT auto-fix refs. Find and update every reference to the old path.
4. **Counts** — the 4 version files + all README/CLAUDE count references must match disk reality.

**How to apply:** every commit touching `agents/` / `skills/` / `rules/` / `commands/` / `hooks/` MUST run the audit first and produce zero orphans + zero dead links:

```bash
./scripts/audit/audit-refs.sh   # exit 0 = clean; exit 1 = do NOT commit
```

The script runs the zero-orphan, zero-dead-link, and `user-invocable: false` checks. **If it prints anything → fix the refs before committing.**

**Why non-negotiable:** orphan rules silently never load (the feature you added doesn't fire); dead links mislead users and break rendered-README navigation; inconsistent counts erode trust; cleanup-later accumulates faster than expected (30 orphans formed in <10 refactors).
