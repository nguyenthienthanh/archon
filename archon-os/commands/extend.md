# /archon-os:extend

**Create project-level skills / rules / commands.** Always writes to `.claude/` in the user's project — NEVER to the plugin's `archon-os/` folder.

---

## Usage

```
/archon-os:extend propose <kind> <description>           # interview-driven skeleton; no write yet
/archon-os:extend create  <kind> <name>                  # write file from approved skeleton
/archon-os:extend list                                   # show project extensions
/archon-os:extend remove <kind> <name>                   # delete a project extension (confirm required)
```

`<kind>` ∈ `skill | rule | command`.

## Protocol — `propose <kind> <description>`

1. **Verify project context.** Refuse if the project has neither a root `CLAUDE.md` nor `.claude/CLAUDE.md` ("not an Archon OS project; run `/project init` first").
2. **Read project context** — the project's `CLAUDE.md` (root or `.claude/CLAUDE.md`), `README.md`, recent prompts/turns, file tree. Ground the proposal in actual usage.
3. **Draft a skeleton** with the right frontmatter for the kind:
   - `skill` → name, description, when_to_use, autoInvoke (default false), user-invocable: false, allowed-tools, effort
   - `rule` → priority (Critical/High/Medium), tier (core/agent/workflow), applies_to
   - `command` → usage block, protocol (imperative), tie-ins
4. **Show the skeleton** to the user with the target path printed.
5. **Wait for explicit confirmation.** `y` / `yes` / `looks good` / `create it` advances to step 6. Anything else aborts.
6. **Run `/archon-os:extend create <kind> <name>`** with the approved skeleton.

## Protocol — `create <kind> <name>`

1. **Resolve target path** based on kind:
   - skill → `.claude/skills/<name>/SKILL.md`
   - rule → `.claude/rules/<tier>/<name>.md` (tier from frontmatter)
   - command → `.claude/commands/<name>.md`
2. **Refuse if path collides with `archon-os/`** — explicit error: "/archon-os:extend writes only to .claude/, never to plugin folder".
3. **Refuse if file already exists** — suggest `propose` to draft an update instead.
4. **Create parent directory** if missing (`.claude/skills/<name>/` etc.).
5. **Write the approved skeleton** verbatim.
6. **Run reference integrity audit** (per CLAUDE.md "LESSON LEARNED — Reference Integrity Rule"):
   - For new rules: confirm ≥1 inbound reference will exist (or output: "rule created but currently orphaned — wire it from a skill/agent")
   - For new skills: confirm description triggers don't shadow an existing plugin skill
   - For new commands: confirm name doesn't collide with a plugin command
7. **Append `.claude/extensions.log`** (project-local, gitignored by default):
   ```jsonl
   {"ts":"<ISO>","kind":"skill","name":"<name>","path":"<rel-path>","reason":"<one-line>"}
   ```
8. **Render** the post-create summary: kind, path, audit findings.

## Protocol — `list`

- Glob `.claude/{skills,rules,commands}/**/*.md`
- Show one-line per entry: `kind | name | path | size`
- If `.claude/extensions.log` exists, show creation timestamps

## Protocol — `remove <kind> <name>`

- Refuse for plugin paths
- Confirm with user (irreversible warn)
- Run reference integrity audit AFTER deletion to surface dead links
- Append removal event to `.claude/extensions.log`

## Hard guardrails

- **Plugin pollution forbidden.** Any path starting with `archon-os/` is rejected immediately. Archon OS ships a fixed surface; project-specific knowledge belongs in the project.
- **Naming collision check.** Project skills must not share a description-trigger with a plugin auto-invoke skill (would cause duplicate fires).
- **No silent overwrites.** Existing project files require `--force` to overwrite, which warns on confirmation.
- **Frontmatter validation.** Project skills must include `user-invocable: false` per the Commands-vs-Skills architecture rule.

## Why project-claude level only

- Plugin updates would clobber custom additions if they lived in `archon-os/`
- Project-level extensions stay with the repo and version with it
- Other contributors benefit from `.claude/skills/` automatically (loaded by Claude Code in any session opened in the project)
- Plugin stays generic; per-project specifics don't leak across projects

## Tie-Ins

- **Skill:** `extension-detector` — only auto-invoked producer of `propose` calls (also user-invocable directly)
- **Rule:** `rules/workflow/extension-policy.md` — defines detection thresholds + project-only enforcement
- **Rule:** `rules/core/contextual-separation.md` — extensions read user-given proposals as untrusted draft until user confirms
- **Project file:** `.claude/CLAUDE.md` — extension authoring should match the project's existing conventions
- **Project file:** `.claude/extensions.log` — append-only audit of project extensions
