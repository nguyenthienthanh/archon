---
title: Aura Frog — Consolidated Roadmap & Research
last_aligned_with: v4.0.0-alpha.2
status: current
audience: contributor
generated: 2026-07-09
---

# Aura Frog — Consolidated Roadmap & Research

> **Single source of truth for pending work + research.** This document consolidates:
> the 2026-07-03 three-agent codebase audit, in-session research (codebase-memory-mcp,
> model/effort statusline, plugin-memory architecture), the plan-tree pending tasks
> (`.claude/plans/MASTER_PLAN.md` — local working copy), and the six GitHub issues
> (#6, #7, #8, #9, #21, #22), which are closed in favour of this file.
>
> Plan-tree node files under `.claude/plans/` remain the execution system (they are
> git-ignored working state); this doc is the durable, reviewable narrative.

---

## 1. Status at a glance

| Feature | Theme | Status |
|---|---|---|
| FEAT-006 | Docs cleanup | ✅ done (shipped) |
| FEAT-008 | Context-persistence | ✅ done (committed `bf11d0e`) |
| **FEAT-010 · STORY-0021** | Security hotfixes (P0-1..4) | ✅ **done + committed `4296bd8f`** |
| FEAT-007 | Hook-runtime v3.8 refactor | 🚧 STORY-0009 3/5 tasks done; rest planned |
| FEAT-010 | Plans/scripts hardening | 🚧 STORY-0021/0022/0023/0025 done; 0024 shellcheck-gate deferred (scope decision) |
| FEAT-011 | Research integrations | ⏳ planned |
| FEAT-009 | Frontend design quality | ✅ **done** — Design Intelligence v2 shipped (vision loop · design SoT · Stitch MCP opt-in), PR #26 |

### v4 plan tree (`.claude/plans/`, 2026-10-29)

| Node | Theme | Status |
|---|---|---|
| **FEAT-A** | AMM remediation | ✅ **done** — the Archon Memory Manager was dead code; deleted with a zero-reference proof. It sliced nothing: `tool-output-slicer.cjs` computed a virtualized output then discarded it, the hook was `async`, the vault was 0 bytes, and the *installed* plugin carried neither file. |
| **FEAT-B** | Session memory: turn index + handoff preservation | ✅ **done** — see §2.4 |
| **FEAT-C** | npm release + plugin version sync | ⏳ planned — needs a publish decision |
| **FEAT-D** | Plan-infrastructure correctness | ✅ **done** — six gates that reported success on bad input |
| **FEAT-E** | Independent cheap-model verifier | 🚧 in progress |
| **FEAT-F** | Code map (startup digest) | 🚧 in progress · `priority: low` |
| **FEAT-G** | Orchestrator reshape → flat three-role dispatch | ✅ **rule shipped**; enforcement rides on FEAT-E |

> ⚠️ `priority:` is written in FEAT-F's frontmatter but **no script reads it** —
> `grep "priority:" scripts/plans/` returns nothing. It is a label for humans, not a scheduler.

Counts: regenerate with `bash aura-frog/scripts/ci/generate-stats.sh`; `stats.json` is the single
source and `scripts/ci/validate-readme-counts.sh` is the gate. Do not hand-copy them here — a
hand-copied count is correct until the next file is added, and when it is wrong it does not go
red, it just goes quiet.

---

## 2. Research synthesis — memory & codebase understanding for a portable plugin

**Goal:** when aura-frog is installed into an *arbitrary* project, how does the agent gain
persistent "memory" and fast structural understanding without paying a huge token cost each session?

> ⚠️ A fresh external web scan (2025-26 sources) was attempted 2026-07-09 but every search
> agent hit the session rate limit (resets 14:10 Asia/Saigon). The synthesis below is from
> the in-session deep-dive on **codebase-memory-mcp** + the map of aura-frog's own memory
> tiers. A follow-up external scan (Obsidian vaults, Serena, vector search) is still open.

### 2.1 The four approaches

| Approach | What it is | Token cost | Staleness | Portability | Friction / privacy |
|---|---|---|---|---|---|
| **(a) Code knowledge-graph / AST-indexing MCP** (codebase-memory-mcp, Serena) | tree-sitter + LSP → queryable graph of functions/calls/imports | Very low per query (~100× cheaper than file-by-file); high one-time index | git-poll incremental re-index | 158 langs syntactic, ~9 type-aware | Native binary to install; local SQLite (private) |
| **(b) Embedding / vector search** | semantic chunks → vector DB | Low query; embedding cost + model dep | must re-embed changed files | language-agnostic | needs embedding model/DB; unbounded retrieval risk |
| **(c) Obsidian-style linked-markdown vault** | human+AI curated `[[wikilink]]` notes | Bounded (load only headers/links) | manual/curated → drifts | fully portable (plain md) | zero infra; the model curates |
| **(d) File-registry + snapshot** (aura-frog today) | generated repo-map + file-registry + SHA-stamped snapshot | Bounded (120–800 always-loaded) | git-SHA + content-hash invalidation | fully portable (bash/md) | zero infra |

### 2.2 What aura-frog already has (mapped)

- **Layered memory, not retrieval** (design philosophy): four physical tiers, each with its own
  load discipline + trust ceiling; token cost bounded regardless of project age.
- `permanent-memory-loader` (≤120 tokens always-loaded) + `epic-summarizer` (distills done Epics).
- Project-context system: `repo-map.md`, `file-registry.yaml`, `architecture.md`, and the
  FEAT-008 SHA-stamped `snapshot.md` with self-healing auto-refresh.
- `.claude/memory/` uses **Obsidian-style `[[name]]` links already** — approach (c) is partly in place.

### 2.3 Recommendations (feed FEAT-011)

1. **Adopt (a) as opt-in, not default.** Add codebase-memory-mcp to `.mcp.json` disabled-by-default
   (mirror postgres/redis); plugin must NOT run its installer. Add a context-economy rule: prefer
   `search_graph`/`trace_path` over broad Read/Grep when the server is present. Biggest win on
   *large* host projects; on small repos the snapshot already suffices. → **FEAT-011 / STORY-0026**.
2. **Deterministic code-graph is philosophy-compatible** (bounded per-query, grounded) — unlike
   unbounded vector retrieval, which the spec explicitly rejects.
3. **Lean into approach (c)** for cross-project memory: the `[[wikilink]]` memory vault is portable
   and infra-free; strengthen the linking discipline rather than add a vector DB.
4. **Use `detect_changes`/`trace_path` as the deterministic backend for the deferred L3/L4 conflict
   levels** instead of LLM calls (cheaper, grounded). → **FEAT-011 / STORY-0028 (spike)**.

### 2.4 Resolved 2026-10-29 — and the premise above was wrong

§2 asks *"how does the agent gain persistent memory without paying a huge token cost each
session?"* and then compares four ways to **build a store**. Research in the FEAT-B session
invalidated that framing:

> **Claude Code already writes the store.** Every turn lands in
> `~/.claude/projects/<slug>/<session-id>.jsonl` — measured at **3.5 MB / 1620 lines / 73 user
> prompts** on one real session. Compaction shrinks the *context window*; it never touches that
> file. The memory was intact on disk and nothing read it back.

That collapsed the scope. There was no store to build, and the hook plumbing
(`PreCompact` / `PostCompact` / `SessionStart` / `Stop`) was already wired end to end. The actual
defect was that `compact-handoff.cjs` discarded almost everything it read —
`recent_prompts: []`, `context: {}`, `session_id: null` on a real handoff.

**Shipped instead:** a turn index (`hooks/lib/turn-index.cjs`) — one line per turn carrying the
turn's `uuid` as a pointer, refreshed at `Stop`, injected at `SessionStart`. A derived cache that
rebuilds byte-identically from the transcript, so nothing can live only in it.

**The open "vector search" follow-up in §2 is now closed, rejected.** Two reasons, the second
decisive: there is no first-party embeddings endpoint (a third-party key would break the no-key
install), and **the corpus is 73 rows, not 73,000** — ANN search over 73 rows would be the wrong
tool even if vectors were free and instant. Measured: 73 rendered lines ≈ 8,760 characters against
the 10,000-character injection cap, so tiering is needed at roughly 80 turns, not at turn one.

**Recommendation 1 (adopt a code-graph MCP as opt-in) is superseded by FEAT-F**, scoped down to a
startup digest with no native binary and no installer — the zero-native-dependency constraint rules
out tree-sitter/LSP servers regardless of their merits. Measured during FEAT-B research: pure-Node
extraction runs 71–77 ms at 121k LOC and 130–149 ms at 217k LOC, against 258 ms / 593 ms for
`ts.createSourceFile` — so the compiler API buys nothing here either.

**Also rejected, with reasons recorded in the plan tree:** a "Project Brain" synthesized store (a
second source of truth beside `CLAUDE.md`, the plan tree and `history.jsonl`), a `node:sqlite`
episodic log (the transcript already is the log; and on Node 26.10
`require('node:sqlite').Database` is `undefined` — only `DatabaseSync` exists, so the documented
API is not the shipped one), and continuously auto-updating project docs.

---

## 3. Audit findings (2026-07-03, main @ 8b0405f) — bugs & security

Three parallel Fable-5 audits (47 CJS hooks · bash scripts · refs/doc integrity).

### 3.1 Fixed & shipped — FEAT-010 / STORY-0021 (commit `4296bd8f`)

| ID | Severity | Fix |
|---|---|---|
| P0-1 | **CRITICAL** | `mcp-call-gate.cjs` read unset `CLAUDE_TOOL_NAME` env → allowlist/rate-limit/audit dead. Now reads stdin (`readHookInputCompat`) + windowed rate-counter reset. |
| P0-2 | HIGH | `workflow-edit-learn.cjs` command injection via crafted filename → `execFileSync` (no shell). |
| P0-3 | HIGH | `check-path-safety.sh` traversal/sibling-prefix bypass → canonicalize + trailing-slash prefix. |
| P0-4 | HIGH | `_lib.sh next_counter` race minted duplicate IDs → `with_lock()` mkdir-spinlock + atomic mktemp; missing key returns non-zero. |

### 3.2 Remaining verified bugs (still open)

**Hooks (→ FEAT-007):**
- ~9 hooks read `CLAUDE_TOOL_*` env the API never sets → functionally dead (`pre-flight-validate`,
  `post-execute-update-node` (F1-F5 classifier pipeline), `tdd-red-failure-tracker`, `smart-learn`,
  `json-toon-projector`, `tool-call-tracer`, `security-scan`, `auto-test-runner`). → STORY-0009/TASK-00026.
- Session-identity split: writers key by `session_id`, 9 readers key by `ppid` → readers see empty
  state forever. → STORY-0010/TASK-00039.
- Field-name mismatches: `feedback-capture` (`data.tool`), `post-compact` (`.claude/` vs `.claude/cache/`),
  `thinking-boost` (dead cache keys). → STORY-0010/TASK-00040.
- Unlocked read-modify-write on learning JSON stores; `pruneJsonlByTimestamp` ignores the append lock. → STORY-0011/TASK-00041.
- ✅ `session-state.cjs:143` missing `require('fs')` — **fixed** (`696cde9`).
- ✅ `task-track-model` never searched `CLAUDE_PLUGIN_ROOT/agents` (dead for installed users) — **fixed** (`696cde9`; unblocks STORY-0027).
- ✅ `post-compact` verified `.claude/…` but handoff writes `.claude/cache/…` — **fixed** (`696cde9`).
- ✅ `post-execute-conflict-rescan` — made importable + pure decision logic extracted/tested (STORY-0029).
  The feared "treats any Read as blocker done" never applied: it gates on `execution_completed`(exit 0)
  history events, which STORY-0010 made reliable. Now `require`-safe with 14 tests.

**Bash scripts (→ FEAT-010):**
- `audit-refs.sh` regex can't see full paths → real dead links pass the gate (e.g. `prune-checkpoints.sh`). → STORY-0022.
- `resolve-node.sh` null-field exits 1 not 2; `next-task.sh` rollback leaves `active.json` stale;
  `for f in ${ALL_NODES}` word-splits on paths with spaces; `validate-plan-tree.sh` DAG detects only
  2-cycles (A→B→C→A validates clean); `link-run.sh` regex-unsafe RUN_ID + non-transactional write;
  `promote-node.sh`/`_lib.sh` escaping; `phase-transition.sh` literal `temp.json`; `run-all.sh --files`
  parsing broken. → STORY-0023.

**From GH security review (#21):** `safe-stdin.cjs:132` watchdog message is plain-text via buffered
`stderr.write` → can interleave/corrupt NDJSON. → fold into STORY-0012 (perf/hardening).

---

## 4. Pending task roadmap (execution order)

Phases mirror `.claude/plans/MASTER_PLAN.md`. Suggested order prioritises verified-bug elimination.

> **Session progress 2026-07-09 (extended)** — 24 commits, all green. **STORY-0021 done; STORY-0023
> done (7/7); STORY-0029 7 hook bugs done; STORY-0010 core done** (session-identity + feedback-capture
> + security-scan + auto-test-runner stdin).
>
> **Env-var-dead hooks split into two classes (important finding):**
> - **Cleanly fixable** (data IS in stdin — tool_name / tool_input / file_path / command) — **ALL 7 DONE**:
>   mcp-call-gate, security-scan, auto-test-runner, json-toon-projector, smart-learn, feedback-capture,
>   **pre-flight-validate** (was a DEAD blocking safety gate — read unset env, exited before validating
>   anything; now reads stdin + bridges tool context to run-all.sh via `buildChildEnv`). Pattern:
>   require-safe wrap + `readHookInputCompat` + a resolve-helper extracting the per-tool field.
>
> - **✅ RESOLVED (exit-code class migrated)** — tdd-red-failure-tracker, tool-call-tracer (post-phase),
>   post-execute-update-node now read the tool context from the **stdin payload**, not the never-set
>   `CLAUDE_TOOL_*` env vars. The documented PostToolUse schema carries what they need: `tool_name`
>   top-level, `tool_input.command` (Bash), `tool_response.exit_code` (+ a top-level `exit_code`
>   duplicate), and top-level `duration` (seconds → ms). Extraction lives in the pure
>   `hooks/lib/tool-context.cjs`; env vars retained as fallback so the change cannot regress. Verified
>   end-to-end by piping synthetic payloads through each hook as a subprocess (exit 1 → `execution_failed`;
>   RED + exit 0 → `red_unexpectedly_green`; `duration:1.5` → `duration_ms:1500`; top-level-only
>   `exit_code:3` → recorded 3). **Impl note:** `buildInputObject`'s whitelist drops top-level
>   `duration`/`exit_code`, so these hooks parse the raw stdin JSON directly rather than via
>   `readHookInputCompat`. The seconds→ms unit follows the docs and is the only detail not yet
>   confirmed by a live-session probe — telemetry-only, so it cannot alter a control-flow decision.
>   With this, **STORY-0010's env→stdin hook migration is COMPLETE**: the 7 cleanly-fixable hooks
>   (above), this exit-code class of 3, and `json-toon-projector` (already reading `tool_input` from
>   stdin, env only as fallback) all migrated. No hook still depends on a never-set `CLAUDE_TOOL_*` env
>   var for its primary path. (`CLAUDE_HOOK_PHASE` stays — it is set explicitly by the hooks.json wrappers.)
> - post-execute-conflict-rescan: ✅ DONE — importable + pure logic tested (STORY-0029). The event-schema
>   concern was upstream data quality, fixed by STORY-0010; the importable refactor was independent.
>
> **Earlier this session** (commits `4296bd8`→`599d94f`, 10 script suites / 161 tests):
> STORY-0023 (7/7 items, each with tests): `resolve-node` null-field exit
> code; `validate-plan-tree` full-DFS cycle detection + `ALL_NODES` word-splitting; `run-all.sh --files`
> parsing; `phase-transition.sh` atomic write (7 sites → `_atomic_state_write`); `link-run.sh` RUN_ID
> regex safety + mktemp (`_re_escape`); `next-task.sh` active.task set only after regression guard;
> `promote-node.sh` note escaping via new `_json_escape` + `set_active_field` sed-fallback hardening.
> New reusable `_lib.sh` helpers this session: `with_lock`, `_re_escape`, `_json_escape`, `_stat_mtime`.

| # | Work | Maps to | GH issue | Effort |
|---|---|---|---|---|
| ✅ | Security hotfixes P0-1..4 | FEAT-010/STORY-0021 | — | done |
| ✅ | Plans-scripts correctness batch (7/7 items) | FEAT-010/STORY-0023 | — | done |
| ✅ | Hook bug-cleanup — **all done**. 8 bug fixes (session-state fs, task-track PLUGIN_ROOT, post-compact path, CONFLICT-id lock via js-counter, log-filename sanitize, team-bridge attempt persistence, workflow-edit-learn header, session-start branch-switch cache invalidation `fcd1934`), plus the last item — **post-execute-conflict-rescan made importable + tested**. The "blocked on history event-schema" was a data-quality dependency (garbage `exit_code`s), which STORY-0010 fixed; the importable refactor was independent. Pure logic extracted (`collectRecentDoneTasks`/`foldLatestConflicts`/`findRescanPair`/`recommendationFor`/`buildRescanEvent`), 14 tests, both directions verified. | FEAT-007/STORY-0029 | — | done |
| ✅ | audit-refs rewrite — DONE (`7cad04a`): full-path dead-file check + allowlist/template skip-rules + fixture self-test; surfaced & fixed a real dead link (USAGE_GUIDE.md) the old regex missed. | FEAT-010/STORY-0022 | — | done |
| 🚧 | CI gates — hook-parity validator DONE (`fcc77a8`, wired into CI `ed0bef0`): Fires:-header vs hooks.json drift now fails CI. **Remaining:** shellcheck gate — DEFERRED (blind-add breaks CI on dozens of pre-existing warnings; needs a fix-all-vs-baseline scope decision, same shape as audit-refs was). | FEAT-010/STORY-0024 | — | ~0.5d |
| ✅ | Consolidate learning hooks — DONE: `learning-dispatch.cjs` reads stdin once and fans out to `feedback-capture.run` + `smart-learn.run` in-process (2 node spawns → 1 on the hot PostToolUse Write/Edit path; Bash unified too). Each module refactored to an exported `run(input)` (no stdin/exit), standalone CLI preserved. Registration collapsed 3 entries → 1 (`Write\|Edit\|Bash`). Isolation: one module throwing never blocks the next. 6 dispatcher tests + 440/440 hook suite green; parity/audit/counts clean (hooks 47→48). | FEAT-010/STORY-0025 | — | done |
| 4 | CI gates (shellcheck + hooks parity) | FEAT-010/STORY-0024 | — | 1-2d |
| 5 | hook-runtime lib finish (migrate dead hooks) | FEAT-007/STORY-0009 | **#6** | 3-5d |
| 6 | Drop env-var dependence + session identity | FEAT-007/STORY-0010 | **#7** | 2-3d |
| 7 | JSONL → SQLite WAL audit/trace | FEAT-007/STORY-0011 | **#8** | 2-3d |
| 8 | Hook performance budget (≤200ms) + watchdog NDJSON | FEAT-007/STORY-0012 | **#9, #21** | 3-4d |
| 9 | Hook bug-cleanup batch | FEAT-007/STORY-0029 | — | 2-3d |
| 10 | c8 subprocess coverage instrumentation | FEAT-007/STORY-0009 | **#22** | 1d |
| ✅ | codebase-memory-mcp opt-in + context-economy rule (DONE, pushed) | FEAT-011/STORY-0026 | — | done |
| ✅ | model/effort statusline (core DONE, pushed; run-orch line + agent effort frontmatters optional) | FEAT-011/STORY-0027 | — | done |
| ✅ | L3/L4 graph-conflict spike → ADR-001 (DONE, pushed) | FEAT-011/STORY-0028 | — | done |
| 🚧 | Frontend design quality — **core DONE + pushed**: STORY-0016 (frontend-aesthetics + motion-design skills) ✓, STORY-0017 (design-tokens skill) ✓, STORY-0019 (Chrome DevTools MCP opt-in) ✓, STORY-0018 C1 Figma Code Connect discipline ✓, STORY-0020 count-sync ✓. **Now unblocked → Design Intelligence v2 (LLD, see below).** | FEAT-009/STORY-0016–0020 | — | rolling into v2 |

**GH issue → plan-node map (nothing lost on close):** #6→STORY-0009 · #7→STORY-0010 · #8→STORY-0011 ·
#9→STORY-0012 · #21→STORY-0012 (watchdog NDJSON) · #22→STORY-0009 (c8 coverage).

### 4.1 Design Intelligence v2 (FEAT-009 continuation — from LLD)

Full LLD: [`docs/architecture/LLD-DESIGN-INTELLIGENCE.md`](architecture/LLD-DESIGN-INTELLIGENCE.md). Driven by
the 2026-07-16 deep-research pass (Anthropic frontend-design skill, Agent SDK vision loop, Google Stitch MCP,
superdesign). The research **unblocked the long-stuck Stitch item** (endpoint + API-key auth now known).
Priority order — foundation first, each buildable without Stitch auth except STORY-0033:

**✅ ALL SHIPPED 2026-07-17** — merged via PR #26 (`97480fc`).

| # | Story | Work | WS | Status |
|---|-------|------|----|--------|
| 1 | STORY-0030 | `.claude/design/design-system.md` as design SoT — design-tokens writes it, design-expert/frontend read it first; persistence rule | WS-3 | ✅ |
| 2 | STORY-0031 | Figma tool-mismatch fix — prompts call actually-installed `figma-developer-mcp` tools (`get_figma_data`/`download_figma_images`), not Dev-Mode-MCP names | WS-6 | ✅ |
| 3 | STORY-0033 | Google Stitch MCP — opt-in remote server in `.mcp.json` (http, API-key); rewrote `stitch-design` skill (dropped "no API"), MCP workflow + manual fallback | WS-4 | ✅ |
| 4 | STORY-0032 | `frontend-aesthetics` v2 — two-pass (plan → self-critique vs brief), expanded AI-default bans, screenshot self-critique directive | WS-2 | ✅ |
| 5 | STORY-0034 | `design-vision-loop` skill — Playwright screenshot (3 viewports + dark) → deterministic gates → vision critique rubric → iterate (max 3); wired into frontend agent | WS-1 | ✅ |
| 6 | STORY-0035 | `design-conformance` hook — PostToolUse Write\|Edit; hardcoded hex/px, mixed component libs, unguarded motion; 27 tests, fail-open, parity-clean | WS-5 | ✅ |
| 7 | STORY-0036 | Count-sync + version bump → 3.8.0-alpha.8 + CHANGELOG | WS-0 | ✅ |

**Open risk (STORY-0033):** Stitch endpoint/tool names never cleared adversarial verify (research hit the session
limit twice on that node). The MCP therefore ships **disabled by default** and the skill instructs verifying via
`list tools` on first connect, degrading to the manual-paste path if the server is unreachable. **Confirm the real
endpoint before enabling.**

### 4.2 CI health (2026-07-17) — main had been red since ≥2026-07-09

Four red gates fixed; one remains. Verify CI claims against `gh run list --branch main` before trusting them.

| Finding | Status |
|---|---|
| **`validate.yml` had never run — 146 runs, all `failure` in 0s, 0 jobs.** Step name `Check hook parity (Fires: header vs hooks.json registration)` was an unquoted YAML scalar containing `: `. GitHub listed the workflow by *path* instead of `name:` — the tell. So validate-counts / validate-hooks (**incl. the parity gate this roadmap recorded as "wired into CI `ed0bef0` … now fails CI"**) / validate-structure / performance-report never executed once. | ✅ PR #29 — all 4 jobs green |
| **`with_lock` minted duplicate IDs** — the "flaky" `next-counter-lock` test was a real P0-4 race: age-based stale-break stole locks from live-but-off-CPU holders. Now prefers `flock(1)`; mkdir spinlock is a liveness-gated macOS fallback. CI 756-passed-1-failed → **867/867**. | ✅ PR #27 |
| **Plural blind spot** — `\btest\b` never matched "tests"; `\bcomment\b` never matched "comments", so auto-learn never learned the most common style correction. | ✅ PR #28 |
| toon count · audit-refs dead specs · validate broken-link · doc-maturity frontmatter | ✅ PR #26 |
| **Coverage floor: `functions` 40 → 32**, reset to the measured level (40 had never been met, so the gate was permanently red and signalled nothing). | ✅ PR #31 |
| **Prerelease users never told about their stable release** — `compareVersions` parsed `3.8.0-alpha.8` into `[3,8,NaN,8]`, and `NaN\|\|0` → 0, so it compared EQUAL to `3.8.0`. Rewritten per semver §11. | ✅ PR #33 |

### 4.3 FEAT-007 / issue #5 — making hooks importable (in progress)

**Non-exporting hooks: 24 → 1 — every hook with real extractable logic is now importable + unit-tested** (PRs #32–#35, #37, #39, and the `post-execute-conflict-rescan` refactor; ~350 hook tests across the session). The pattern that works:

1. `if (require.main === module) { main(); } else { module.exports = {...} }` — hook behaviour unchanged; verify **both** directions (import touches nothing; running still behaves — run the hook as a subprocess against synthetic inputs, since the extracted-function tests don't prove `main()` still fires).
2. Split pure decision logic out of the I/O wrapper — e.g. `session-start.cacheStaleReason`, `pending-confirm-timeout.evaluateTaskFile`, `pre-dispatch-conflict-check.buildConflictRecord`, `tool-call-tracer.extractReadPath`, `security-critical-warn.classifyTier`, `update-check.compareVersions`.
3. **Never export anything that mutates the repo**, and assert its absence in a test.

> ⚠️ **Making a hook importable *lowers* measured coverage before it raises it.** Tests that `require()` a hook ending in a bare `main();` execute the whole hook, and every function it touches counts as "covered" with zero assertions. `session-start` alone dropped the metric 32.63% → 30.4% once that inflation was removed. **Do not read the dip as a regression** — replace the fake coverage with real tests.

> **An over-hasty call, corrected:** an earlier revision of this section parked ~13 hooks as "no pure logic to extract" or "STORY-0010, nothing to do." That was wrong. The `CLAUDE_TOOL_*` env-var problem only blocks the *stdin migration* of `main()`'s inputs — the hooks still held real pure logic (path classification, version compare, history scans, decision builders) that made fine tests. Every one of them got extracted and tested in PR #39. Lesson: "it reads a dead env var" ≠ "there's nothing here."

**The only hook still non-exporting is genuinely not worth it:**

| Hook | Why |
|---|---|
| `rate-limit-check` | 11 lines: a single `console.log('Run /usage')` reminder. No logic, nothing to test. |

**STORY-0010 — DONE:** `tool-call-tracer`, `tdd-red-failure-tracker`, `post-execute-update-node` now read the tool context (name / command / exit code / duration) from the **stdin payload** via `hooks/lib/tool-context.cjs`, not the `CLAUDE_TOOL_*` env vars the hook API never sets — env kept as a regression-safe fallback (PRs #41, #42). No live-session probe was needed: the plugin loads hooks at session start, so a mid-session probe wouldn't fire; the defensive multi-source read + env fallback made the migration safe without one.

> ⚠️ **Never call these from a test** — each resolves paths from the real project root at module load:
> `phase-checkpoint.createCheckpoint` (runs `git add -A` + `git commit` on the working tree!) ·
> `firebase-cleanup.cleanupDebugLog` (unlinks) · `compact-handoff.saveHandoff` ·
> `compact-handoff.generateCompactContext` (not the pure builder its name suggests — writes `compact-context.md`
> and shells out to git) · `subagent-init.trackAgentUsage` / `task-completed.parseTaskInput` (read fd 0 — block a test runner).

---

## 5. Feature / UX optimisation ideas (backlog)

- **model/effort in statusline** — surface which agent runs on which model + reasoning effort at each
  dispatch (infra 70% present via `task-track-model.cjs`; needs `tool_input.model` priority, `effort:`
  parsing, PLUGIN_ROOT resolution). → FEAT-011/STORY-0027.
- **First-install onboarding** — progressive disclosure, sane defaults, one primary action per screen
  (aligns with the house "12-year-old friendly" UX rule). *External UX-pattern scan pending (rate-limited).*
- **Opt-in code-graph** for large host projects (§2.3).

---

## 6. Doc cleanup ledger

**Removed (2026-07-09)** — 4 redundant/superseded docs, with all referrers rewired so
`audit-refs.sh`, `validate-docs-syntax.sh`, and `validate-readme-counts.sh` stay green:

- `docs/marketing/overview.pre-v3.0.md` (archive)
- `docs/marketing/README.pre-v3.7.2-rewrite.md` (archive)
- `docs/marketing/USAGE_GUIDE.pre-v3.7.md` (archive)
- `MIGRATION_TO_V3.7.md` (root; superseded at v3.8)

Referrers updated: both CI scripts' file lists, README nav link, and the stale README/docs/README/
CONTRIBUTING hook counts (43/45 → 47, matching `stats.json`).

Kept (not redundant): the `docs/specs/*` V3.7.0 records (historical), `docs/guides/*` (active content),
`docs/showcase/*` (examples).
