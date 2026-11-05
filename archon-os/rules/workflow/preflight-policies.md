> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Pre-flight Policies

**Priority:** Critical
**Applies To:** PreToolUse on Bash | Edit | Write | Read; `/archon-os:preflight` command; preflight-validator skill

---

## Core Principle

**Before any tool call that mutates state or reads sensitive paths, run Tier 1 linters. Block on `fail`. Warn on `warn`. Pass on `pass`.**

The pre-flight tier is the deterministic safety net that catches catastrophic mistakes (`rm -rf /`, hostile path access, leaked credentials) before they execute. It's faster than a code review and runs on every PreToolUse hook fire.

---

## When pre-flight runs

```toon
triggers[3]{when,scope,note}:
  PreToolUse hook,"Bash | Edit | Write | Read",auto via hooks/pre-flight-validate.cjs
  /archon-os:preflight check,"current tool context OR --file/--command target",manual
  CI / commit hook,"per-file batch via run-all.sh --files",contributor workflow
```

## Tier 1 linters (per spec §20.2)

```toon
linters[7]{script,checks,returns}:
  validate-frontmatter.sh,"YAML frontmatter on plan/skill/agent/rule/command md","0 pass / 1 warn / 2 fail"
  validate-tool-input.sh,"Tool input shape — required fields, absolute paths, no-op edits","0 pass / 1 warn / 2 fail"
  validate-tool-output.sh,"ANSI volume, prompt-injection phrases, JSON sanity","0 pass / 1 warn / 2 fail"
  check-path-safety.sh,"Reject traversal + system files + credential dirs","0 pass / 1 warn / 2 fail"
  check-command-allowlist.sh,"Hard-block destructive; warn on risky","0 pass / 1 warn / 2 fail"
  check-secret-patterns.sh,"AWS/GitHub/OpenAI/JWT/private-key patterns","0 pass / 1 warn / 2 fail"
  run-all.sh,"Orchestrator — returns max exit from above","0 pass / 1 warn / 2 fail"
```

## Exit code semantics

```toon
codes[3]{exit,severity,downstream_action}:
  0,pass,"continue silently"
  1,warn,"emit warning, allow tool call"
  2,fail,"BLOCK tool call (PreToolUse hook returns 2 → claude-code rejects)"
```

`run-all.sh` returns the **highest** (most severe) exit from any individual linter. One fail anywhere → overall fail.

---

## Hard-block patterns (exit 2 — non-bypassable without explicit `/archon-os:preflight bypass`)

| Class | Examples |
|---|---|
| Filesystem destruction | `rm -rf /`, `rm -rf ~`, `mkfs.*`, `dd if=/dev/zero of=...` |
| Resource exhaustion | fork bombs (`:(){ :\|:& };:`) |
| Privilege change | `shutdown`, `reboot`, `halt`, `chmod -R 777 /` |
| Pipe-to-shell | `curl ... \| sudo bash`, `curl ... \| sh -c` |
| Path hostility | `/etc/passwd`, `/etc/shadow`, `~/.ssh/id_*`, `~/.aws/credentials`, `/proc/*` |
| Path traversal | `../../etc/...` patterns |
| Credential leak | AWS key (`AKIA*`), GitHub PAT (`ghp_*`), OpenAI/Anthropic keys, JWTs, `-----BEGIN PRIVATE KEY-----` |

These cannot be silently bypassed by environment changes — `/archon-os:preflight bypass <reason>` is the only escape hatch, and each bypass is logged + counted.

## Warn patterns (exit 1 — informational, not blocking)

| Class | Examples |
|---|---|
| Risky git ops | `git push --force`, `git reset --hard`, `git clean -f` |
| Local destruction | `rm -rf ./`, `rm -rf node_modules/dist/.next/.aura/build` |
| SQL hazards | `DROP TABLE`, `TRUNCATE`, `DELETE FROM ... ;` (no WHERE) |
| Privilege | `sudo`, `eval ...` |
| Heuristic credentials | low-confidence patterns (password=..., api_key=..., long-token-shaped strings) |

---

## Bypass policy

Per spec §20.5: bypass is **per-call only**, never session-scoped (decision Q7).

1. User runs `/archon-os:preflight bypass <reason>` (reason ≥10 chars; refuse vague "let me try")
2. Command writes `.claude/logs/.preflight-bypass` with reason + timestamp
3. Next PreToolUse fire: hook reads the flag, **consumes** (deletes) it, increments session counter, allows the tool call
4. After 3 consumed bypasses in one session: hook prints warning banner — checks may need updating, OR you're in a bad state

The bypass file is single-use by design — you cannot leave pre-flight off.

## Disable mechanisms (escalation order)

1. **Per-call**: `/archon-os:preflight bypass` (preferred for one-off needs)
2. **Per-session**: `export ARCHON_PREFLIGHT_DISABLED=true` (revertes on new session; emits a session-start warning)
3. **Permanent**: `.envrc` setting (strongly discouraged — disables the secret-leak net)

The hook always tries to import `scripts/preflight/run-all.sh`. If absent, it silently no-ops (e.g., installs without the script, or in CI environments without bash).

---

## What pre-flight does NOT do (per spec §20.4 + §33)

- Does NOT run OPA Tier 2 in v3.7.0-beta.1 — Tier 2 with 5 default Rego policies (plan_structure, mutation_safety, grounding, token_budget, conflict_respect) is deferred to **v3.7.0-rc.1**
- Does NOT scan filesystem-wide — only the tool's input/output and named files
- Does NOT replace test runs / linter / type-check (those are user-invoked)
- Does NOT modify tool output — read-only check (modification belongs in `json-toon-projector` and similar projection hooks)

---

## Anti-patterns

- **Bypassing without a real reason** — vague "test it" gets refused; specific "verifying chmod -R 777 on test fixture in /tmp/sandbox" is fine
- **Disabling ARCHON_PREFLIGHT_DISABLED in `.envrc` to "make it stop"** — pre-flight catches your secrets being committed; turning it off is a foot-gun
- **Adding new hard-block patterns to check-command-allowlist.sh without testing** — over-blocking is a usability tax; warns are usually the right level
- **Using pre-flight as a code linter** — it's a safety net, not a style enforcer. ESLint / Prettier handle style.

---

## Tie-Ins

- **Spec:** §20 (pre-flight), §20.4 (OPA optional), §20.5 (bypass)
- **Hook:** `hooks/pre-flight-validate.cjs` — primary auto-trigger
- **Skill:** `preflight-validator` — programmatic wrapper
- **Command:** `/archon-os:preflight` — user-facing entry
- **Scripts:** `archon-os/scripts/preflight/*.sh` — Tier 1 implementation
- **Sibling rule:** `rules/core/context-economy.md` — tool calls should be minimal anyway; pre-flight catches the rest
- **Future:** `policies/*.rego` (Tier 2, rc.1)
