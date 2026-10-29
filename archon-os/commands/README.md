# Aura Frog Commands

**Total:** 24 command files (5 bundled + 1 standalone + 12 hierarchical-planning slash commands + 1 project-extension + 1 session-reset + 1 pre-flight + 3 self-healing/MCP-security/dashboard)

---

## Bundled Commands

```toon
bundled[5]{command,subs,count}:
  /run,"<task>/status/resume/progress/rollback + context-aware: approve/reject/modify/handoff/stop",10
  /check,"(all)/security/perf/complexity/debt/coverage/deps",7
  /design,"api/db/doc",3
  /project,"init/detect/status/list/switch/refresh/regen/env/sync",9
  /af,"status/agents/metrics/learn/setup/update/mcp/prompts/skill",9
```

## Standalone Commands

```toon
standalone[1]{command,file,description}:
  help,help.md,Show help and available commands
```

## Hierarchical Planning (alpha — opt-in)

```toon
planning[12]{command,file,purpose}:
  /archon-os:plan,plan.md,"Bootstrap T0/T1/T2 via interview"
  /archon-os:plan-expand,plan-expand.md,"Decompose node one tier down"
  /archon-os:plan-next,plan-next.md,"Return next ready T4 leaf"
  /archon-os:plan-replan,plan-replan.md,"Replan with budget enforcement"
  /archon-os:plan-promote,plan-promote.md,"Promote node to higher tier"
  /archon-os:plan-archive,plan-archive.md,"Archive completed branch"
  /archon-os:plan-status,plan-status.md,"Render plan tree + summary"
  /archon-os:plan-undo,plan-undo.md,"Restore latest checkpoint (LIFO) + git_sha rollback"
  /archon-os:plan-freeze,plan-freeze.md,"Manual freeze + descendant cascade (beta.2)"
  /archon-os:plan-thaw,plan-thaw.md,"Reverse freeze + compatibility check (beta.2)"
  /archon-os:plan-conflicts,plan-conflicts.md,"list/show/resolve/history/check L1-L4 conflicts (beta.2)"
  /archon-os:trace,trace.md,"Reasoning trace + hallucination surface (alpha.2)"
```

These commands are **silent on projects without `.claude/plans/`**. Initialize with `/archon-os:plan` (or `bash archon-os/scripts/plans/new-plan.sh`).

## Project Extension (alpha.3 — opt-in)

```toon
extension[1]{command,file,purpose}:
  /archon-os:extend,extend.md,"Create project-level skills/rules/commands at .claude/ — never plugin-level. Subcommands: propose / create / list / remove."
```

`extension-detector` skill auto-invokes when patterns suggest a new skill/rule/command would help; surfaces a confirmation question; only `/archon-os:extend` actually writes files. Hard guardrail: writes are blocked from any path inside `archon-os/`.

## Memory Tier (alpha.4 — opt-in)

```toon
memory[1]{command,file,purpose}:
  /archon-os:reset-session,reset-session.md,"Distill active Epic via epic-summarizer → permanent_memory.md → optional reset. Preserves history.jsonl, plan tree, conflict cache, manual_overrides."
```

`epic-summarizer` agent runs on T2 done (auto via `feature-done-trigger-archive` hook) or manually via this command. `permanent-memory-loader` skill auto-loads distilled summaries (≤120 tokens always-loaded) in subsequent sessions.

## Pre-flight (beta.1 — auto-on)

```toon
preflight[1]{command,file,purpose}:
  /archon-os:preflight,preflight.md,"check/policies/bypass/status — Tier 1 bash linters (path safety, command allowlist, secret patterns, frontmatter, tool input/output)"
```

`hooks/pre-flight-validate.cjs` auto-fires on every PreToolUse for Bash|Edit|Write|Read. Hard-blocks `rm -rf /`, system paths, credential leaks. Warns on `git push --force`, `DROP TABLE`, etc. Bypass per-call only with `/archon-os:preflight bypass <reason ≥10 chars>`. Tier 2 OPA Rego policies deferred to v3.7.0-rc.1.

## Self-Healing + MCP Security + Dashboard (rc.1)

```toon
rc1[3]{command,file,purpose}:
  /archon-os:heal,heal.md,"diagnose/status/disable/enable/accept/decline — F2/F3 only, confidence ≥0.7, user approval"
  /archon-os:mcp,mcp.md,"status/audit/reset-limits/test — per-agent allowlist + rate limits + sanitized audit"
  /archon-os:dashboard,dashboard.md,"--live / --json / --section — terse one-screen view of plan + conflicts + memory + MCP + preflight"
```

`hooks/mcp-call-gate.cjs` auto-fires on every PreToolUse for `mcp__.*`. Enforces per-agent allowlist (frontmatter `mcp_servers:`), rate limits (soft 80% warn / hard 100% block), and writes sanitized audit to `<security-dir>/mcp-audit.jsonl` (resolved by `hooks/lib/security-dir.cjs`). `scripts/security/sanitize-mcp-input.sh` strips Authorization headers + redacts tokens before logging.

---

## Usage

Type `/run <task>` to start working — intent is auto-detected.
During an active run, type bare words: `approve`, `reject`, `modify`, `handoff`.

---

## Architecture — Commands vs Skills

`commands/` is the **slash surface**. Skills (`archon-os/skills/`) are AI-discoverable knowledge with `user-invocable: false` — they don't appear in the slash menu, but Claude auto-invokes them on intent match.

**Rule:** if a user types `/<name>`, the file MUST live here in `commands/`. If a skill needs slash exposure, wrap it in a thin command file that delegates to the skill (e.g., `/af prompts` → invokes `prompt-evaluator` skill).

This keeps the `/` menu uncluttered (only actionable commands) while preserving full AI discoverability of skill content.

See: `.claude/CLAUDE.md` "ARCHITECTURE RULE — Commands vs Skills Separation".
