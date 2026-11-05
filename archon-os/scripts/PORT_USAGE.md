# Port Plugin — Usage Guide

`port-plugin.cjs` exports Archon OS's universal instruction layer into the native formats of GitHub Copilot, Codex/OpenAI, and Cursor. It automates steps 1–5 of the [Portability Guide](../../docs/PORTABILITY.md).

---

## What It Does

The script reads the plugin's universal layer — `CLAUDE.md`, all `rules/`, `skills/`, `agents/`, `commands/`, and `.mcp.json` — and writes tool-specific instruction files into an output directory. It also writes a `PORT_MANIFEST.json` summarising what was generated.

It does **not** port:
- `hooks/` — lifecycle hook scripts must be rewritten per tool. See [Non-Portable Items](#non-portable-items) below.
- Version files, CHANGELOG, README counts, or `plugin.json` (those stay in the source repo).

---

## CLI

```
node archon-os/scripts/port-plugin.cjs <target> [--out <dir>] [--dry-run]
```

| Argument | Description |
|----------|-------------|
| `<target>` | One of: `copilot`, `codex`, `cursor`, `all` |
| `--out <dir>` | Output directory (default: `./dist/port/` for a single target, `./dist/port/<target>/` for `all`) |
| `--dry-run` | Preview what would be written without touching the filesystem |

**Examples:**

```bash
# Export to Codex AGENTS.md format
node archon-os/scripts/port-plugin.cjs codex

# Export Cursor rules to a custom directory
node archon-os/scripts/port-plugin.cjs cursor --out /tmp/my-cursor-port

# Dry-run all three targets
node archon-os/scripts/port-plugin.cjs all --dry-run

# Check what Copilot output looks like without writing
node archon-os/scripts/port-plugin.cjs copilot --dry-run
```

---

## Targets

### `copilot` — GitHub Copilot

Output layout:

```
<out>/
  .github/
    copilot-instructions.md              # Repo-wide consolidated instructions
    instructions/
      core.instructions.md              # Core rules, applyTo: **/*
      agent.instructions.md             # Agent rules, applyTo: **/*.{ts,js,...}
      workflow.instructions.md          # Workflow rules, applyTo: **/*
  PORT_MANIFEST.json
```

- `copilot-instructions.md` consolidates `CLAUDE.md` + MCP server list + non-portable notice.
- Each `*.instructions.md` file uses Copilot's `applyTo:` frontmatter to scope rules to relevant file patterns.
- MCP servers from `.mcp.json` are translated into a documented table (Copilot does not execute MCP servers directly, but the list documents available tooling).

### `codex` — Codex / OpenAI AGENTS.md

Output layout:

```
<out>/
  AGENTS.md                            # Full consolidated instruction file
  PORT_MANIFEST.json
```

- `AGENTS.md` follows the OpenAI AGENTS.md convention.
- Includes: core instructions from `CLAUDE.md`, agent roster table, rules (grouped by tier), skills index, command playbooks, MCP server table, non-portable notice.
- Lifecycle hooks are **excluded** — Codex has no lifecycle event system. The file notes this explicitly.

### `cursor` — Cursor MDC Rules

Output layout:

```
<out>/
  .cursor/
    rules/
      archon-os-core-rules.mdc         # Core rules, alwaysApply: true
      archon-os-agent-rules.mdc        # Agent rules, alwaysApply: false
      archon-os-workflow-rules.mdc     # Workflow rules, alwaysApply: false
      archon-os-overview.mdc           # Agents + skills + commands overview
  PORT_MANIFEST.json
```

- Each `.mdc` file has Cursor MDC frontmatter: `description`, `globs`, `alwaysApply`.
- Core rules use `alwaysApply: true`; agent and workflow rules are scoped by file glob.
- The overview MDC provides agent roster, skills index, and commands for Cursor's AI context.

### `all`

Runs all three targets in sequence. Output is placed under `<out>/copilot/`, `<out>/codex/`, and `<out>/cursor/` subdirectories. Each subdirectory gets its own `PORT_MANIFEST.json`.

---

## PORT_MANIFEST.json

Every run writes a manifest to the output directory:

```json
{
  "target": "codex",
  "sourcePluginName": "archon-os",
  "sourceVersion": "3.8.0-alpha.2",
  "generatedAt": "2026-06-03T10:00:00.000Z",
  "counts": {
    "rules": 71,
    "skills": 56,
    "agents": 15,
    "commands": 24
  },
  "files": ["/path/to/AGENTS.md"],
  "nonPortable": [
    "hooks/ directory — ...",
    "..."
  ]
}
```

The `generatedAt` field is an ISO timestamp stamped at CLI invocation time. When calling `writePortBundle()` programmatically (e.g., in tests), pass `generatedAt: null` to suppress it.

---

## Non-Portable Items

These features cannot be ported automatically and require manual adaptation:

| Item | Reason | Workaround |
|------|--------|------------|
| `CLAUDE.md` filename | Claude Code convention | `cp CLAUDE.md AGENTS.md` (Codex) or symlink |
| `effort: high` frontmatter | Claude Code–specific | Other tools ignore unknown fields; map to temperature if needed |
| `paths: "**/*.tsx"` auto-invoke | Claude Code skill feature | Fall back to manual invocation or name-based matching |
| `cache_control` breakpoints | Anthropic SDK–specific | Use tool-native caching if available |
| `subagent_type` values | Claude Code Agent tool | Map to tool-native spawn primitive or skip |
| `hooks/` directory | Lifecycle scripts (PreToolUse, PostToolUse, etc.) | Rewrite per target tool's event model; see the event mapping table in `docs/PORTABILITY.md` |

---

## Portability Reference

Full spec, event mapping table, and portability layer breakdown:
[docs/PORTABILITY.md](../../docs/PORTABILITY.md)
