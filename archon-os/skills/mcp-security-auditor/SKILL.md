---
name: mcp-security-auditor
description: "On-demand audit of MCP usage. Reads the MCP audit log (mcp-audit.jsonl) written by the mcp-call-gate hook, surfaces blocked calls, rate-limit hits, suspicious input patterns. Companion to mcp-call-gate hook (which produces the audit log)."
when_to_use: "/archon-os:mcp audit, security review, post-incident forensics on MCP calls"
allowed-tools: Read, Glob, Grep, Bash
effort: low
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# MCP Security Auditor

**STATUS — v3.7.0-rc.1.** Read-only auditor; does not enforce — that's `mcp-call-gate.cjs`'s job.

## Behavior

1. Read `<security-dir>/mcp-audit.jsonl` (append-only; produced by `hooks/mcp-call-gate.cjs`).
   Resolve `<security-dir>` the same way the writer does — see `hooks/lib/security-dir.cjs`:
   `$ARCHON_SECURITY_DIR`, else `.claude/security/` if it exists, else `.aura/security/`.
   Do NOT hardcode one of them: read the first that exists, and report "no audit log yet" if neither does.
2. Group entries by:
   - Agent → MCP server → method
   - Time bucket (last 1h / 24h / session)
   - Status (success / blocked / rate-limited)
3. Project to TOON (via `scripts/json-to-toon.cjs --schema generic` or custom fields) — NEVER load raw JSONL into context
4. Surface findings categorized as:
   - **Blocked calls** (`BLOCKED:true`) — deserve investigation
   - **Rate-limit warnings** — soft (80%) or hard (100%) hits
   - **Suspicious patterns** — destructive SQL detected, large output (>10KB), high frequency

## What this skill does NOT do

- Does NOT enforce — `mcp-call-gate.cjs` is the enforcement layer
- Does NOT mutate the audit log (append-only by design)
- Does NOT call MCPs itself (read-only on the audit file)
- Does NOT proxy MCP calls — the gate hook intercepts at PreToolUse
- Does NOT decide policy — `rules/agent/mcp-security-policy.md` is authoritative

## Audit log schema (per spec §23.2)

```jsonl
{"ts":"2026-05-07T...","agent":"architect","mcp":"context7","method":"query","input":{"q":"React hooks"},"output_size_bytes":4521,"latency_ms":234,"success":true}
{"ts":"2026-05-07T...","agent":"backend","mcp":"postgres","method":"query","input":{"sql":"DROP TABLE users"},"BLOCKED":true,"reason":"destructive_op_blocked"}
{"ts":"2026-05-07T...","agent":"frontend","mcp":"figma","method":"download_image","input":{"url":"..."},"success":true,"rate_limit":"80%_warn"}
```

Sanitized input fields per `scripts/security/sanitize-mcp-input.sh`:
- Authorization headers stripped
- Tokens/secrets replaced with `[REDACTED]`
- Content-Length > 1KB → truncated with `... [N more bytes]`

## Output (TOON)

```toon
mcp_audit_summary{window,total_calls,blocked,rate_limit_hits,top_agent,top_mcp}:
  24h,142,3,2,architect,context7

blocked[3]{ts,agent,mcp,reason}:
  2026-05-07T10:30,backend,postgres,destructive_op_blocked
  2026-05-07T11:45,frontend,figma,allowlist_violation
  2026-05-07T12:10,architect,redis,destructive_op_blocked
```

## Retention (per spec §23.2)

`ARCHON_MCP_AUDIT_RETENTION_DAYS=30` (default) — older entries are pruned by a session-start sweep (NOT this skill).

## Tie-Ins

- **Spec:** §9.10, §23 (MCP security)
- **Hook:** `hooks/mcp-call-gate.cjs` — sole writer of `<security-dir>/mcp-audit.jsonl`
- **Resolver:** `hooks/lib/security-dir.cjs` (shell mirror: `scripts/plans/_lib.sh#security_dir`) — where that log lives
- **Script:** `scripts/security/sanitize-mcp-input.sh` — sanitization run by the gate before logging
- **Rule:** `rules/agent/mcp-security-policy.md` — authoritative policy
- **Rule:** `rules/agent/db-access-policy.md` — DB-specific subset (architect/tdd-engineer only, read-only default, destructive ops blocked)
- **Command:** `/archon-os:mcp audit` — primary user-facing entry to this skill
- **Skill:** Reuses `scripts/json-to-toon.cjs` to project the JSONL into context-friendly TOON
