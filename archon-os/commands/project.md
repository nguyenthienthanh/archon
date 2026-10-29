# Project Commands

Unified project management. Handles detection, initialization, configuration, context generation, and environment loading.

---

## /project init

**Trigger:** First time using Aura Frog in a project, or reconfiguring.

Auto-detects project type (React, Next.js, Laravel, Go, Python, Flutter) and creates the full `.claude/` structure: `CLAUDE.md`, `settings.local.json`, `project-contexts/` with 7 context files (project-config.yaml, conventions.md, rules.md, examples.md, repo-map.md, file-registry.yaml, architecture.md), and session-context.toon (12 pattern detections).

Runs generator scripts (`repo-map-gen.sh`, `file-registry-gen.sh`, `architecture-gen.sh`, `context-compress.sh`), then Claude enriches output with AI-generated descriptions (~2000 token budget). Merges plugin settings into `settings.local.json`. Optionally sets up learning system if Supabase credentials exist.

---

## /project detect

**Trigger:** `/project detect` -- analyze current directory without initializing.

Scans project root for framework indicators (package.json, composer.json, go.mod, pubspec.yaml, requirements.txt). Reports detected type, tech stack with versions, structure pattern, and recommended configuration (coverage target, TDD enforcement, primary agent). Suggests running `/project init` to configure.

---

## /project status

**Trigger:** `/project status [project-name]` -- show cached detection results.

Displays detected framework, package manager, primary/secondary agents, test framework, templates, and styles without re-scanning. Shows cache age, key files hash, and last scan timestamp. In workspaces, renders a table of all projects with their frameworks, agents, and test setups. Task mentions auto-match to the correct project.

---

## /project list

**Trigger:** `/project list` -- list all configured projects.

Shows all Aura Frog-configured projects with their type, path, status, last-used date, team members, and integration status (JIRA, Confluence). Marks the active project. Navigate to a new directory and run `/project init` to add more.

---

## /project switch

**Trigger:** `/project switch <project-id>` -- switch active project context.

Loads target project configuration, updates active context, loads project-specific conventions, and activates mapped agents. Shows project info (type, path, status), conventions (branch format, naming, coverage), and active agents with scoring bonuses. Aliases: `/project`, `/switch`.

---

## /project refresh

**Trigger:** `/project refresh [--incremental]` -- force re-scan the codebase.

Invalidates detection cache and re-scans framework, package manager, project type, test infrastructure, file patterns, and agent mappings. Supports `--incremental` mode using `git diff` to only re-run affected generators (e.g., changed package.json triggers file-registry + architecture). Cache auto-invalidates after 24 hours or when key config files change. Works for both single projects and workspaces.

---

## /project regen

**Trigger:** `/project regen [project-name]` -- regenerate all context files.

Re-scans and updates all 7 context files while preserving manual customizations (marked `<!-- MANUAL -->` or `<!-- CUSTOM -->`). Creates timestamped backup before changes. Re-runs all generator scripts, syncs plugin settings, and updates `.claude/CLAUDE.md` (auto-updates AURA-FROG section, preserves USER-CUSTOM section). Differs from `/project init`: regen updates existing context, init creates from scratch.

---

## /project reload-env

**Trigger:** `/project reload-env` -- load/reload `.envrc` variables.

Searches for `.envrc` in project root then `.claude/.envrc`. Parses all `export VAR=value` statements (supports double-quoted, single-quoted, and unquoted values). Reports status of integration credentials (JIRA, Figma, Slack, Confluence), learning system (Supabase), and workflow settings (coverage, TDD, token warning). Variables persist for current session only. Never logs actual key values.

---

## /project sync-settings

**Trigger:** `/project sync-settings` -- merge latest plugin settings into project.

Merges `settings.example.json` from plugin into `.claude/settings.local.json`. Merge rules: `permissions.allow/deny` are unioned and deduplicated; `env` uses plugin defaults with project overrides winning; `statusLine` always comes from plugin. Creates timestamped backup. Run after plugin updates to pick up new permissions and env vars. Called automatically by `/project regen`.

---
