> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: DB Access Policy (Agent Tier)

**Priority:** Critical
**Tier:** Agent (loaded only when an agent with DB MCP capability activates)
**Applies To:** `architect`, `tdd-engineer`, any agent invoking `mcp__plugin_archon-os_postgres__*` or `mcp__*redis__*`

---

## Core Principle

**Database MCP servers are external systems with destructive blast radius.** Locked down per-agent, read-only by default, destructive ops blocked unconditionally regardless of allowlist.

---

## Per-agent allowlist

```toon
db_mcp_allowlist[8]{agent,postgres,redis}:
  architect,allowed,allowed
  tdd-engineer,allowed,allowed
  frontend,denied,denied
  mobile,denied,denied
  security,denied,denied
  devops,allowed (for migrations only),allowed (for cache config only)
  scanner,denied,denied
  any-other-agent,denied,denied
```

Default when agent's `mcp_servers:` frontmatter is unset = **denied** for DB MCPs (least privilege). Spec §8.8 backward-compat note about "all enabled MCPs by default" does NOT apply to DB MCPs — they require explicit allowlist entry.

## Read-only default

DB MCP calls are **read-only** by default. Write operations require an explicit `--allow-write` flag in the tool call args. The gate hook (`mcp-call-gate.cjs`) enforces this:

```toon
op_classes[3]{class,examples,default,override}:
  read,SELECT * FROM ...,allowed,no override needed
  write,"INSERT, UPDATE, DELETE WITH WHERE",blocked,require --allow-write flag
  destructive,"DROP, TRUNCATE, DELETE WITHOUT WHERE",HARD-BLOCKED (no override possible),never allowed
```

## Destructive operations (HARD-BLOCKED)

```toon
destructive_blocked[5]{pattern,reason}:
  DROP\s+(TABLE|DATABASE|SCHEMA|INDEX),irreversible structure loss
  TRUNCATE\s+TABLE,irreversible data loss
  DELETE\s+FROM\s+\w+\s*;,DELETE without WHERE = full-table wipe
  ALTER\s+TABLE\s+\w+\s+DROP\s+COLUMN,irreversible column loss
  CREATE\s+(USER|ROLE)|GRANT|REVOKE,permissions change — never via MCP
```

These regex patterns match in `scripts/security/sanitize-mcp-input.sh` before MCP call → if matched → call BLOCKED, audit entry has `BLOCKED:true, reason:destructive_op_blocked`.

## Connection string discipline

- **MUST come from `.envrc`** — `POSTGRES_CONNECTION_STRING`, `REDIS_URL`
- **NEVER** in MCP method input args — sanitizer redacts
- **NEVER** logged — sanitizer strips before audit append

## Workflow integration

- **Phase 1 (Design)**: architect may use DB MCP for read-only schema introspection
- **Phase 2 (RED)**: tdd-engineer may use DB MCP for fixture setup; writes require `--allow-write`
- **Phase 3 (GREEN)**: builder may use DB MCP via tdd-engineer's existing fixture; never re-create
- **Phase 4 (Review)**: security agent may NOT use DB MCP — read application code, not the DB
- **Phase 5 (Finalize)**: devops may use DB MCP for migration verification

## Anti-patterns

- **Hardcoding connection strings** — always env-var
- **Using `--allow-write` to "test something"** — always pair with a checkpoint + a clear rollback plan
- **Bypassing destructive-op check via string concatenation** — sanitizer normalizes whitespace; `DROP    TABLE  users` still matches
- **Granting DB allowlist to frontend/mobile/scanner agents** — they have no legitimate DB use case

## Tie-Ins

- **Spec:** §11.2, §14, §23 (MCP security)
- **Decisions:** Q14 (postgres opt-in default; this rule formalizes the gate)
- **Sibling rule:** `rules/agent/mcp-security-policy.md` — broader MCP allowlist + audit + rate limits (this rule is the DB-specific subset)
- **Hook:** `hooks/mcp-call-gate.cjs` — primary enforcer
- **Script:** `scripts/security/sanitize-mcp-input.sh` — input sanitization + destructive-pattern detection
- **Skill:** `mcp-security-auditor` — read-side companion (reads the audit log)
- **MCPs:** `mcp__plugin_archon-os_postgres__*`, `mcp__plugin_aura-frog_redis__*` (not bundled in `.mcp.json` — a `disabled` flag is ignored by Claude Code, so they are omitted entirely; this policy applies the moment a project adds them per `docs/operations/MCP_GUIDE.md § Optional Servers`)
