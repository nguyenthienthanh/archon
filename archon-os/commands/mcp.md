# /archon-os:mcp

**MCP security operations.** Status, audit, rate-limit reset, connectivity test.

---

## Usage

```
/archon-os:mcp status                  # which servers enabled, agent allowlists, current usage vs limits
/archon-os:mcp audit [--window 24h]    # show audit log (sanitized) — calls, blocks, rate-limit hits
/archon-os:mcp audit --blocked-only    # only blocked calls (forensics view)
/archon-os:mcp reset-limits [--mcp X]  # reset session counters (logged event); without --mcp resets all
/archon-os:mcp test <server>           # single-call connectivity test (e.g., context7 ping)
```

## Protocol — `status`

```toon
mcp_status{servers_enabled,total_audited_today,blocked_today,sessions_limited}:
  6,142,3,1

per_server[6]{server,enabled,calls_today,used_pct,rate_limit}:
  context7,true,87,29% of 200,30/min · 200/session
  playwright,true,12,—,30/min · 200/session
  vitest,true,18,—,30/min · 200/session
  firebase,true,5,—,30/min · 200/session
  figma,true,8,—,30/min · 200/session
  slack,true,4,—,30/min · 200/session

per_agent_allowlists[*]{agent,allowlist}:
  ...
```

## Protocol — `audit`

1. Read `<security-dir>/mcp-audit.jsonl` (already sanitized — no credentials in this file).
   `<security-dir>` resolves as `$AF_SECURITY_DIR`, else `.claude/security/` if it exists, else `.aura/security/` — see `hooks/lib/security-dir.cjs`.
2. Project via `mcp-security-auditor` skill (NEVER load raw JSONL into context)
3. Filter by `--window` (default 24h) and `--blocked-only` if set
4. Render TOON summary + top 10 events

```toon
audit_summary{window,total,success,blocked,rate_limit_hits,top_agent,top_mcp}:
  24h,142,139,3,2,architect,context7

blocked[3]{ts,agent,mcp,reason}:
  2026-05-07T10:30,backend,postgres,destructive_op_blocked
  2026-05-07T11:45,frontend,figma,allowlist_violation
  2026-05-07T12:10,architect,redis,destructive_op_blocked
```

## Protocol — `reset-limits`

1. Read `.claude/logs/.mcp-rate-counter.json`
2. Reset specified counters (or all if `--mcp` not given)
3. Append history.jsonl: `event: mcp_limits_reset`, `mcp: <server>` (or `all`), `actor: user`
4. Render confirmation

## Protocol — `test <server>`

Single-call connectivity test. Different per server:
- `context7` — `query-docs` for "test" with topic `"library:test"`
- `playwright` — `browser_snapshot` (returns "ok" if browser running)
- `vitest` — `list_tests` (returns 0+ tests)
- `firebase` — `list_projects` (requires `firebase login`)
- `figma` — `get_figma_data` for a known test URL (requires `FIGMA_API_TOKEN`)
- `slack` — `auth.test` (requires `SLACK_BOT_TOKEN`)
- `postgres` — `query "SELECT 1"` (requires `POSTGRES_CONNECTION_STRING`; not bundled — add it per `docs/operations/MCP_GUIDE.md § Optional Servers`)
- `redis` — `ping` (requires `REDIS_URL`; not bundled — same)

Only servers actually present in `.mcp.json` can be tested. Rows list every server the security layer knows a policy for, not every server that is running.

Output shows: latency, success, sanitized output snippet (or error).

## Failure modes

| Failure | Behavior |
|---|---|
| Audit log missing | Show empty + suggest enabling logging |
| Rate-counter file missing | Treat as zero counts (cold-start) |
| `--mcp X` for unknown server | Refuse with list of valid server names |
| Test fails (network, auth) | Print error; don't crash |

## Tie-Ins

- **Spec:** §10.4, §14 (MCP servers), §23 (security)
- **Hook:** `hooks/mcp-call-gate.cjs` — produces audit + counter files this command reads
- **Skill:** `mcp-security-auditor` — projection logic for audit display
- **Rule:** `rules/agent/mcp-security-policy.md` — allowlist + rate limits
- **Rule:** `rules/agent/db-access-policy.md` — DB-specific rules
- **Files:** `<security-dir>/mcp-audit.jsonl` (see `hooks/lib/security-dir.cjs`), `.claude/logs/.mcp-rate-counter.json`
- **Env:** `AF_MCP_AUDIT_DISABLED=true` (disables audit logging — strongly discouraged), `AF_MCP_AUDIT_RETENTION_DAYS=30` (default)
