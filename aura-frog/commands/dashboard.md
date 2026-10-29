# /archon-os:dashboard

**CLI status display** — terse one-screen view of plan tree, active task, conflicts, freezes, token budget, recent decisions.

---

## Usage

```
/archon-os:dashboard                    # static one-shot snapshot (default)
/archon-os:dashboard --live             # live refresh every 5s (until Ctrl-C)
/archon-os:dashboard --json             # machine-readable JSON for automation
/archon-os:dashboard --section <name>   # only one section: plan|active|conflicts|memory|mcp|preflight
```

## Sections

```toon
sections[6]{name,what_it_shows}:
  plan,"T0-T4 tree summary: counts per tier, status histogram, deviation_score across active path"
  active,"Active task + ancestors + frozen count + recent run-state.json"
  conflicts,"Open conflicts (unresolved CONFLICT-NNNNN), stale frozen (>24h), arbitration history tail"
  memory,"permanent_memory.md size + last Epic distillation timestamp + Tentative-section count"
  mcp,"per-server enable + 24h call count + blocked count + rate-limit status"
  preflight,"session bypass count + last block reason + linter version"
```

## Static output (default)

```
🐸 Aura Frog — Dashboard
─────────────────────────────────────────────────────────────
Plan tree (5 nodes · 8/8 invariants ✓)
  ▶ INIT-001  ✓ FEAT-A  ✓ FEAT-B  ✓ FEAT-C  ✓ FEAT-D  ▶ FEAT-E
  Active path: MISSION → INIT-001 → FEAT-E → STORY-0050 → TASK-00200
  Tier counts: T0=1, T1=1, T2=5, T3=12, T4=47

Active task (TASK-00200) — Phase 3 (GREEN)
  Status: active · revision 2 · deviation 0.18 · replan budget 2/3
  Recent: 12 trace events · 0 hallucinations flagged · 1 file_write
  Ready queue: 4 · Frozen: 0 · Blocked: 0

Conflicts: 0 open · 0 stale (>24h)
Memory: permanent_memory.md 4 Epics · 2,840 tokens / 8,000 cap · 0 Tentative
MCP: 6 servers enabled · 87 calls today · 0 blocked
Pre-flight: 0 bypasses this session · last block: never
```

## Protocol — static (default)

1. Read `.claude/plans/active.json` for active path
2. Run `bash scripts/plans/render-plan-tree.sh` for tier counts (parsed, not rendered tree)
3. Read latest run-state from `.claude/logs/runs/<latest>/run-state.json`
4. Read open conflicts from `.claude/plans/conflicts.jsonl` (latest per conflict_id, filter resolution: null)
5. Read `.claude/memory/permanent_memory.md` for size + Epic count
6. Read `<security-dir>/mcp-audit.jsonl` tail (last 24h) for MCP stats (see `hooks/lib/security-dir.cjs`)
7. Read `.claude/logs/.preflight-bypass-count` for session bypass count
8. Project all into TOON via `scripts/json-to-toon.cjs --schema generic` per section
9. Render to stdout

## Protocol — `--live`

Loop: clear screen, run static, sleep 5s, repeat. Exit on Ctrl-C.

Implementation: `scripts/dashboard.sh --live` does the loop; this command file documents the UX. The dashboard script is the source of truth for rendering.

## Protocol — `--json`

Same data, raw JSON output (no TOON projection, no human formatting). For piping into other tooling. Sanitized — no credentials.

## Protocol — `--section <name>`

Run only the named section. Useful for status-line integration or scripted checks.

## Failure modes

| Missing input | Behavior |
|---|---|
| No `.claude/plans/` | Render banner + "Plans not initialized — run /archon-os:plan" |
| No `.claude/memory/` | Memory section: "Memory not initialized" |
| No audit log | MCP section: "Audit logging not started" |
| run-state.json missing | Active section: "No active run" |

## Tie-Ins

- **Spec:** §10.4 (commands)
- **Script:** `aura-frog/scripts/dashboard.sh` — implementation; static + --live + --json + --section
- **Skill:** `mcp-security-auditor` — for MCP section
- **Skill:** `permanent-memory-loader` (via summary lines) — for Memory section
- **Skill:** `plan-validator` — invariant check for the Plan-tree heading
- **Files read** (read-only): `.claude/plans/active.json`, `conflicts.jsonl`, `history.jsonl`, `.claude/memory/permanent_memory.md`, `<security-dir>/mcp-audit.jsonl`, `.claude/logs/runs/<latest>/run-state.json`, `.claude/logs/.preflight-bypass-count`
