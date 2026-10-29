---
name: preflight-validator
description: "On-demand wrapper over scripts/preflight/run-all.sh. Runs Tier 1 bash linters against a file, command, or arbitrary content. Returns 0 pass / 1 warn / 2 fail. Used by /archon-os:preflight check and contributors authoring custom hooks."
when_to_use: "Before committing a markdown file, before piping risky shell content, when CI fails on pre-flight"
allowed-tools: Bash
effort: low
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Pre-flight Validator

**STATUS — v3.7.0-beta.1.** Thin wrapper over `archon-os/scripts/preflight/run-all.sh`.

## When this skill runs vs. when the hook runs

- **`hooks/pre-flight-validate.cjs`** — auto-fires on every PreToolUse for Bash/Edit/Write/Read. Blocks tool call on fail. **You don't have to do anything for this — it's automatic.**
- **This skill** — explicit invocation when you want to validate something the hook doesn't see. Examples: validating a markdown file before committing, dry-running a Bash command's safety, batching a directory of plan files through frontmatter validation.

## Behavior

1. Resolve target: file path / Bash command string / stdin content
2. Run `bash archon-os/scripts/preflight/run-all.sh` with the appropriate flags
3. Surface exit code + stderr to caller

## Tier 1 linters (per spec §20.2)

| Script | Checks |
|---|---|
| `validate-frontmatter.sh` | YAML frontmatter on plan/skill/agent/rule/command markdown |
| `validate-tool-input.sh` | Tool input shape — required fields, absolute paths, no-op edits |
| `validate-tool-output.sh` | ANSI-escape volume, prompt-injection phrases, JSON-claim sanity |
| `check-path-safety.sh` | Reject path traversals + system files (`/etc/passwd` etc.) + credential dirs |
| `check-command-allowlist.sh` | Hard-block destructive (`rm -rf /`, `mkfs`, fork bombs); warn on risky (`git push --force`, `DROP TABLE`) |
| `check-secret-patterns.sh` | High-confidence credential patterns (AWS, GitHub, OpenAI, JWT, private keys) |

`run-all.sh` orchestrates and returns the **highest** exit code from any linter.

## Exit codes (per spec §20.2)

```toon
exit_codes[3]{code,meaning,downstream_action}:
  0,pass,"continue silently"
  1,warn,"emit warning, allow"
  2,fail,"BLOCK tool call (PreToolUse hook returns 2 → claude-code rejects the tool)"
```

## Invocation patterns

- **Auto** — hook on PreToolUse fires this for every tool call
- **Manual** — `/archon-os:preflight check` runs run-all.sh against current tool context
- **CI** — `bash archon-os/scripts/preflight/run-all.sh --files <files>` for batch validation
- **Contributor** — invoke individual scripts directly when authoring a new hook

## What this skill does NOT do

- Does NOT run OPA Tier 2 (deferred to v3.7.0-rc.1+; OPA is optional per spec §20.4)
- Does NOT mutate tool inputs/outputs (read-only)
- Does NOT cache results (each call is fresh — fast enough at ~10ms)
- Does NOT fall back when `bash` is unavailable (Linux/macOS required)

## Tie-Ins

- **Spec:** §9.7, §20 (pre-flight)
- **Script:** `archon-os/scripts/preflight/run-all.sh` — implementation
- **Hook:** `hooks/pre-flight-validate.cjs` — primary auto-trigger
- **Command:** `/archon-os:preflight` — user-facing entry
- **Rule:** `rules/workflow/preflight-policies.md` — when, what, bypass policy
- **Future (rc.1):** `archon-os/scripts/preflight/install-opa.sh` for Tier 2 OPA policies (optional)
