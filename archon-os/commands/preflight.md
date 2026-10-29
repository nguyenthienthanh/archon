# /archon-os:preflight

**Run pre-flight validation against the current tool context, manage policies, or bypass once.**

---

## Usage

```
/archon-os:preflight check                            # run run-all.sh against current/last tool context
/archon-os:preflight check --file path/to/file.md     # validate a specific file
/archon-os:preflight check --command "<bash cmd>"     # dry-run a command's safety check
/archon-os:preflight policies                         # list all 7 Tier 1 linters and what they check
/archon-os:preflight bypass <reason>                  # disable next tool call's pre-flight (single use)
/archon-os:preflight status                           # show bypass count this session + disabled state
```

## Protocol — `check`

1. Resolve target. With `--file`, validate the file (frontmatter, secret patterns). With `--command`, run command-allowlist on the string. Without args, use `CLAUDE_TOOL_NAME` + `CLAUDE_TOOL_ARGS` from env (the auto-hook context).
2. Invoke `bash archon-os/scripts/preflight/run-all.sh` with appropriate flags.
3. Surface stderr (linter output) to user.
4. Report aggregate exit code and per-check results.

## Protocol — `policies`

Enumerate the Tier 1 scripts:

```
preflight policies (Tier 1 — bash, always-on):
  validate-frontmatter.sh    YAML frontmatter on plan/skill/agent/rule/command markdown
  validate-tool-input.sh     Tool input shape (required fields, absolute paths)
  validate-tool-output.sh    ANSI volume, prompt-injection phrases, JSON sanity
  check-path-safety.sh       Reject traversal + system files + credential dirs
  check-command-allowlist.sh Hard-block destructive; warn on risky
  check-secret-patterns.sh   AWS/GitHub/OpenAI/JWT/private-key patterns
  run-all.sh                 Orchestrator (returns max exit from above)

Tier 2 (OPA, optional): not yet shipped — deferred to v3.7.0-rc.1+
```

## Protocol — `bypass <reason>`

Single-use override for the **next** tool call only. After consumption, normal pre-flight resumes.

1. Refuse if `<reason>` is empty or shorter than 10 chars (must be specific).
2. Write `.claude/logs/.preflight-bypass` with the reason + ISO timestamp.
3. Append history.jsonl: `event: preflight_bypass_set`, `reason: <reason>`.
4. Print confirmation: "Bypass armed for next tool call. Reason logged."
5. The hook's `consumeBypassFlag()` will delete the flag file on next PreToolUse and increment the session bypass counter.
6. After 3 bypasses in a session: warning banner from the hook ("review whether checks need updating").

## Protocol — `status`

- Read `.claude/logs/.preflight-bypass-count` (session counter)
- Check `AF_PREFLIGHT_DISABLED` env var
- Check `.claude/logs/.preflight-bypass` (armed bypass)
- Print: bypass count, disabled-permanent state, armed-bypass reason if any

## Disable mechanisms

- **Per-call**: `/archon-os:preflight bypass <reason>`
- **Per-session**: `export AF_PREFLIGHT_DISABLED=true` (reverts on new session)
- **Permanent**: add `AF_PREFLIGHT_DISABLED=true` to `.envrc` (NOT recommended; you lose secret-leak detection)

## Failure modes

| Failure | Behavior |
|---|---|
| `bash` not on PATH | Hook silently skips; surface in `/archon-os:preflight status` |
| `run-all.sh` missing | Hook silently skips |
| Linter timeout (>5s) | Treated as warn; tool call proceeds |
| Bypass file write fails | Bypass not armed; hook still blocks |

## Tie-Ins

- **Spec:** §10.3, §20
- **Skill:** `preflight-validator` — programmatic wrapper
- **Hook:** `hooks/pre-flight-validate.cjs` — auto-trigger on PreToolUse
- **Rule:** `rules/workflow/preflight-policies.md` — when pre-flight runs, exit-code semantics, 3-bypasses-warn
- **Scripts:** `archon-os/scripts/preflight/*.sh` — Tier 1 linters
