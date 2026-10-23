---
last_aligned_with: v3.8.0-alpha.8
status: reference
audience: contributor
---

# Aura Frog - Changelog

All notable changes to Aura Frog will be documented in this file.

---

## [Unreleased]

## [3.8.0-alpha.21] - 2026-10-23 (Host rules and skills honoured)

### Fixed

- **Plugin now honours the host's own rules and skills (user + project scope).** Claude Code
  loads `~/.claude/{rules,skills,agents}` and `<project>/.claude/{rules,skills,agents}`, but Aura
  Frog's routing only knew its own components, so host skills were bypassed:
  - all 15 plugin agents lacked the `Skill` tool, so a plugin subagent could never invoke a
    user/project skill — `Skill` added to every agent's `tools:`;
  - `subagent-init` printed its context to stderr, which `SubagentStart` does not deliver to the
    model — it now emits `hookSpecificOutput.additionalContext`, including the host index (unscoped
    rule paths + skill paths, project first);
  - `priority-hierarchy` ranked global below the plugin and ignored rules/skills dirs — order is now
    project > user > plugin, and `agent-detector` prefers a matching host skill.
- **Host skills Claude Code silently ignores are flagged.** Only `.claude/skills/<name>/SKILL.md`
  with `description` frontmatter registers; flat `.claude/skills/<name>.md` files never load.
  `session-start` now prints a `🧩 Host extensions` index plus a warning listing unregistered files.

### Added

- **`scripts/migrate-host-skills.cjs`** — converts flat skill files into `<name>/SKILL.md` and adds
  missing `name`/`description` frontmatter (description from the `**Trigger:**` line, else heading +
  first line). Dry run by default, `--apply` to write, `~` targets `~/.claude/skills`.
- `hooks/lib/host-extensions.cjs` (discovery + index). Opt out: `AF_HOST_EXTENSIONS_DISABLED=true`.

## [3.8.0-alpha.20] - 2026-10-01 (Startup context budget warning)

### Added

- **Startup context budget warning.** Claude Code loads every `CLAUDE.md` in the tree, every
  `.claude/rules/**.md` without `paths:` frontmatter, and `~/.claude` instructions at session start,
  and only warns past 150k chars. By then every session is already paying for it (measured on a
  real project: 89 files = 492k chars). New `scripts/context-budget.cjs` measures the same set
  (skips path-scoped rules, follows `@` imports); `session-start` now warns from 100k with the three
  largest files and the fix. Threshold `AF_CONTEXT_BUDGET_WARN`, opt out
  `AF_CONTEXT_BUDGET_DISABLED=true`.

### Changed

- **Project rules created via `extension-detector` / `/aura-frog:extend` are path-scoped by default.**
  `extension-policy` now requires `paths:` frontmatter (always-loaded only with user confirmation),
  a ~8k-char cap (logs and quick-refs go to `docs/`), and a one-line entry in the project's CLAUDE.md
  rule index.

## [3.8.0-alpha.19] - 2026-09-25 (Multi-session git: no more index.lock contention from hooks)

### Fixed

- **`phase-checkpoint` no longer fights other sessions for `index.lock`.** With several sessions
  on one repo, the async checkpoint (`git add -A` + `git commit`, fired on every Write/Edit in
  phases 2–4) could collide with a user/Claude commit and leave "index.lock: File exists". The
  status check now uses `--no-optional-locks`; the hook skips (and retries on the next edit) while
  another git process holds the lock; concurrent hook instances claim the phase atomically so only
  one runs git.
- **`scout-block` checks only the segments that read paths.** It now splits the command on
  `&&` / `||` / `;` / `|` and checks a segment only when its first word is `cd`/`ls`/`cat`/`head`/
  `tail`/`find`/`grep`. `cd repo && rm -f .git/index.lock` (stale-lock recovery) is no longer
  blocked, and words like `tools` / `concat` no longer match `ls ` / `cat `.

### Added

- `AF_SCOUT_BLOCK=false` disables `scout-block`.

## [3.8.0-alpha.18] - 2026-09-24 (Evidence-based code review: correctness + compatibility aspects, check review command)

### Changed

- **`code-reviewer` rebuilt on verified engineering standards** (Google eng-practices, OWASP
  Top 10:2025, CWE Top 25, SemVer/Hyrum's law/AIP-180, Conventional Comments, SonarSource
  cognitive complexity; sources in `skills/code-reviewer/references/standards.md`). 6 → 8 aspects:
  adds **Correctness** (logic bugs) and **Compatibility** (no breaking change) as CRITICAL
  priority; Simplicity now covers over-engineering and unnecessary comments. Every finding needs
  `file:line` + a concrete failure scenario + a refute pass; severity is blocking / non-blocking /
  nit by impact. Approval bar: the change improves code health, not perfection.
- **Review is wired into every entry point:** TDD Phase 4 reviewers follow the skill and fill the
  8-row `CODE_REVIEW.md`; new `/check review [path|PR]`; `/run review` also matches "audit".
- `security` agent: OWASP Top 10 2021 → 2025.

## [3.8.0-alpha.17] - 2026-09-23 (Per-session named handoffs that follow the project's plan)

### Fixed

- **Sessions in one project overwrote and stole each other's handoff.** There was a single
  `.claude/cache/compact-handoff.json` per project, and any new session injected + deleted it.
  Handoffs are now one per session: `.claude/handoffs/<name>.{json,md}`, named after the session
  title (`/rename` → auto title → `session-<id8>`; a same-title clash gets `-<id8>`). SessionStart
  injects only the handoff whose `session_id` matches; a new session gets just an index of names.
  Resume by name: `/run resume <name>` (`compact-handoff.cjs --show <name>` / `--list`).
- **Handoff ignored the project's plan.** The plan tree was resolved from cwd, not the project
  root, and the project's own plan docs were never recorded. The handoff now carries the
  `plans/active.json` anchor (from the project root) plus plan docs (`ROADMAP.md`, `*_PLAN.md`,
  `docs/*plan*`…) and tells the resumed session to follow them.
- **Non-code projects got run/plan logs.** Projects without `.git` or a manifest no longer get
  `.claude/logs/workflows/` written by the hook, and `session-continuation` no longer asks for a
  `run-state.json` there.
- **Manual `handoff`** now runs `compact-handoff.cjs --save --note "…"`; the session id reaches it
  via `AF_CLAUDE_SESSION_ID` / `AF_TRANSCRIPT_PATH`, exported to `CLAUDE_ENV_FILE` at SessionStart.
- Handoff keeps `/command <args>` prompts (was dropping every `/run <task>`) and widens the
  transcript scan until it finds the last 3 prompts (a 512KB tail missed them in long turns).
- `post-compact.cjs` validates the compacting session's own handoff file. Handoffs >14 days are
  pruned.

## [3.8.0-alpha.16] - 2026-09-13 (Compact handoff — save before autocompact, resume after)

### Fixed

- **Compact handoff saved nothing and resumed nothing.** `hooks/compact-handoff.cjs` read legacy
  `.claude/logs/workflows` / `cache/workflow-state.json` state that `/run` no longer writes, and
  only saved when `PROJECT_NAME` was visible to the hook. It now sources the newest open
  `.claude/logs/runs/*/run-state.json` (legacy fallback kept), the `plans/active.json` anchor, the
  last 3 user prompts from `transcript_path`, and uncommitted files.
- **Handoff is saved before autocompact, not after.** PreCompact (manual + auto) always saves;
  Stop saves once context usage ≥ `AF_HANDOFF_THRESHOLD` (default 70%). Hooks never receive
  `used_percentage`, so `statusline.sh` now persists it to `.claude/cache/context-usage.json`.
- **Resume is injected into context.** SessionStart reads `source` (skips `clear`), emits
  `hookSpecificOutput.additionalContext` pointing Claude back at the run state and current phase,
  then consumes the handoff. Opt-out: `AF_COMPACT_HANDOFF_DISABLED=true`.
- `post-compact.cjs` accepts the v2 handoff schema; `session-continuation` skill no longer claims
  a "every 5 min" auto-save that had no implementation.

## [3.8.0-alpha.15] - 2026-09-04 (Portability audit — EN templates, deliverables backstop, host-project context)

### Fixed

- **Run deliverable docs were often never created.** `run-orchestrator` Step 0.5 (scaffold
  REQUIREMENTS.md, TECH_SPEC.md, … into `.claude/logs/runs/<id>/`) was instruction-only, buried
  mid-file, and absent from the `/run` command protocol — real runs shipped with nothing but
  `run-state.json`. New PostToolUse hook `run-deliverables-scaffold.cjs` now auto-scaffolds the
  current phase's docs on every `run-state.json` write (idempotent, silent on re-run, skips
  Quick/direct), and the scaffold step is spelled out in `commands/run.md` step 4.
- **Default deliverable templates translated to English.** `requirements.md`, `lld.md`,
  `decision-record.md`, `confluence-page.md` were majority-Vietnamese and scaffolded into every
  user's Phase-1 deliverables — the plugin is publicly distributed, so defaults are now English
  (structure, sources, and tone preserved 1:1).
- **Host-project docs are now authoritative context.** `scanner` and `project-context-loader`
  never read the host project's own `CLAUDE.md` / `README.md` — only the plugin's self-generated
  cache. Both now read the project's `CLAUDE.md` (root or `.claude/`), `README.md`, and
  `CONTRIBUTING.md` first; on conflict the project's docs win and the cache refreshes.
- **Agent-roster hygiene.** Deleted orphaned `skills/agent-detector/task-based-agent-selection.md`
  (517 lines referencing fictitious agents: `backend-laravel`, `web-nextjs`, "Dev agent");
  `story-planner.md` no longer labels `run-orchestrator` an Agent (it's a skill) nor references a
  nonexistent `tdd-engineer` (→ `tester`); `af-project-cache.cjs#detectAgentMapping` now emits the
  canonical 15-agent roster instead of stale `web-*`/`backend-*` labels.
- **Portability polish.** Hard `.claude/CLAUDE.md` paths accept a root `CLAUDE.md` too;
  `frontend-aesthetics` house style is an overridable default (host project's design language
  wins); `profile-hooks.sh` falls back timeout → gtimeout → none on macOS;
  `context-economy.md` notes `Explore`/`general-purpose` are unprefixed Claude Code built-ins.

### Added

- **`scripts/audit/portability-audit.sh`** — 4-dimension portability gate (region/company/personal
  tokens, undefined agent references, hardcoded paths, host-project context discipline). Exit 0/1,
  CI-gate-ready; passes on this release.

## [3.8.0-alpha.14] - 2026-08-25 (Statusline context % — đọc từ stdin, đúng sau compact)

### Fixed

- **Statusline tính sai context %, và không reset sau compact.** Trên Opus (cửa sổ 1M)
  statusline hiện `81%` ở 161k, `82%` ở 164k, rồi sau khi compact tụt về 100k mà % vẫn
  đứng nguyên. Hai lỗi, cùng một nguyên nhân — `statusline-render.py` tự suy ra context
  từ transcript thay vì đọc khối `context_window` Claude Code đã đưa sẵn vào stdin:
  - **Mẫu số đoán mò**: dùng 200k cho tới khi vượt 200k mới nhảy sang 1M ⇒ `161k/200k
    = 81%` thay vì `161k/1M = 16%`, phóng đại 5 lần; và khi vượt 200k thì % rơi vực
    100% → 20% rồi leo lại.
  - **Compact không reset**: transcript của phiên bị compact KHÔNG ghi
    `isCompactSummary` và khối `usage` cứ leo tiếp (đo trên transcript thật: 376k và
    tăng đều, không một cú tụt nào, trong khi context thật đã về ~100k).

  Claude Code ≥ v2.1.x đưa sẵn `context_window{context_window_size, total_input_tokens,
  used_percentage}` — đúng cửa sổ model VÀ đúng sau compact. Giờ ưu tiên nguồn này, chỉ
  lùi về suy-từ-transcript với Claude Code cũ. `AF_CTX_WINDOW` vẫn ghi đè được.
  Kèm 6 test RED/GREEN (`__tests__/scripts/statusline-context.test.cjs`).

## [3.8.0-alpha.13] - 2026-08-25 (tech-writing skill + 4 template viết lại)

### Added

- **`tech-writing` skill** — viết requirements/PRD, tech spec, LLD, decision record
  và phân tích kỹ thuật ở mức nghi thức khớp với quy mô task. Dựng trên 2 lượt
  deep-research (214 agent, 49 nguồn sơ cấp). Bốn điểm đáng chú ý:
  - **Phân tầng T0–T3, mặc định HẠ tầng**: Y-statement → ADR (Nygard) → MADR → RFC.
    Thứ phân biệt là mức phân tích phương án, không phải độ dài.
  - **Cấm tự chấm bản nháp trong chính context bản nháp.** Huang et al. (ICLR 2024):
    GPT-4 GSM8K 95.5 → 91.5 → 89.0 và GPT-3.5 CommonSenseQA 75.8 → 38.1 sau khi tự
    sửa; cải thiện trong nghiên cứu trước đến từ oracle label và biến mất khi bỏ nó.
    Skill dùng chain-of-verification trả lời câu hỏi kiểm chứng ở context RIÊNG, và
    ưu tiên verifier NGOÀI (chạy test, gọi API) hơn suy nghĩ nội tại.
  - **Grounding trước khi viết**: trích nguyên văn → mọi claim về code phải có
    `file_read` trước đó (`rules/core/grounding-discipline.md`) → claim không chống
    lưng được thì XOÁ và đánh dấu lỗ hổng.
  - **Nhãn mức bằng chứng** `[CODE]` / `[SOURCE]` / `[CONVENTION]` / `[UNVERIFIED]`,
    và ghi rõ gần như toàn bộ nội dung là quy ước có nguồn, không phải hiệu quả đo được.
- **`templates/decision-record.md`** — thang 4 bậc trong một file, kèm vòng đời trạng
  thái của Oxide RFD (cố tình không có `draft`).

### Changed

- **Bốn template phase-1 viết lại.** Chúng vốn là khung rỗng: `lld.md` dán cứng ví dụ
  `ShareModal.tsx`/Zustand của một dự án khác, `requirements.md` có NFR bịa số
  (`< 200ms`, `1000 concurrent users`), `confluence-page.md` liệt kê
  `FacebookCard`/`InstagramCard`.
  - `lld.md` — nói THẲNG là không có chuẩn cho LLD (IEEE 1016-2009 để ranh giới
    architecture/HLD/LLD ngoài phạm vi). Dùng 12 design viewpoint làm THỰC ĐƠN, cộng
    tiêu chí dừng của ECSS: chi tiết tới mức đơn vị code/compile/test được, không hơn.
    Idempotency/observability/migration đánh dấu `[UNVERIFIED]` — không chuẩn nào
    chống lưng.
  - `requirements.md` — bộ ba C/R/A của INCOSE GtWR v4: C1–C9 cá thể, C10–C15 tập hợp,
    tập con ~10–12 rule lint được, A-attributes làm schema truy vết. Ghi rõ INCOSE §1.8
    nói công cụ NLP/AI không phủ hết rule.
  - `confluence-page.md` — bỏ ví dụ dán cứng, thêm mục Non-goals / Nhược điểm / Chế độ hỏng.
- **`DESIGN_DECISIONS.md` sửa ánh xạ sai** — trước đây trỏ vào `lld.md` (LLD không phải
  chỗ ghi quyết định), giờ trỏ `decision-record.md`; thêm `LLD.md` thành file riêng.
  `rules/workflow/workflow-deliverables.md` 12 → 14 deliverables.
- **`documentation` skill** thu hẹp về Runbook; ADR chuyển sang `tech-writing`.

### Fixed

- **`package.json` không được sync version.** File mà `npm publish` đọc version từ đó
  KHÔNG nằm trong danh sách canonical của `release.sh` lẫn `sync-version.sh`, nên mỗi
  lần phát hành phải nhớ sửa tay — quên là npm lệch khỏi `plugin.json`. Đã thêm vào
  `release.sh prepare`.
- **Link chết `skills/git-worktree/SKILL.md` trong README** — skill bị xoá có chủ ý ở
  `03ddfe33` (consolidate 59→42) nhưng link bị bỏ lại, làm job "Check for broken
  markdown links" đỏ trên chính `main`. Trỏ lại sang `skills/git`.

## [3.8.0-alpha.12] - 2026-08-20 (Audit follow-ups: skill consolidation, KG-2, custom statusline)

Completes the two follow-up tracks the audit (PR #50) deliberately deferred as
"needs a maintainer call", and brings the session-built custom statusline into
the plugin. No behavior change by default — the new runtime features are opt-in
and off. (PR #51.)

### Changed

- **Skills consolidated 59 → 42** (audit CON-01). The 11 `*-expert` skills fold
  into the `framework-expert` bundle as lazy `refs/<framework>.md`;
  `performance-optimizer` → `perf-profiling`; `sequential-thinking` →
  `tree-of-thoughts`; `learning-analyzer` → `self-improve` (Analyze→Apply);
  `git-workflow` + `git-worktree` → `git`; `lazy-agent-loader` +
  `response-analyzer` → `rules/core/context-economy.md`. Every capability is
  preserved, just relocated; all cross-references, counts, and `stats.json`
  reconciled.

### Added (KG-2 — durable-format work, backward-compatible)

- **`epic-summarizer` schema v2** (KG-2.1). New `<!-- af-memory:v2 … -->` marker +
  typed, confidence-scored entries so `permanent-memory-loader` reads summary
  lines cheaply. v1 sections still load; existing `permanent_memory.md` files are
  never rewritten.
- **Pattern nodes in the plan tree** (KG-2.2). New `node_type: pattern` leaf lets
  the learning tier persist durable patterns; inert to T0–T4
  scheduling/DAG/test-ref and handled surgically across all 8 plan invariants.
  Gated behind `AF_KG_PROMOTE` (default off).
- **Async reflection queue** (KG-2.3). Crash-safe, idempotent
  `.claude/reflection/queue.jsonl` with retention. Gated behind
  `AF_REFLECTION_QUEUE` (default off → full no-op).

### Added (statusline)

- **Custom cost/usage statusline + `/af statusline`.** The renderer
  (`scripts/statusline-render.py`) now ships with the plugin: 3 lines —
  identity · 5h/7d limits with reset clock + context% · session $ / burn $/hr /
  billing-cycle $. `/af statusline install|update|status`
  (`scripts/statusline-install.sh`) installs or refreshes it into `~/.claude/`
  (settings.json edits back up first). `docs/reference/STATUSLINE.md` documents
  the layout + env toggles (`AF_BILLING_DAY`, `AF_PLAN_LABEL`, `AF_CTX_WINDOW`,
  `AF_STATUSLINE_USAGE_DISABLED`, `NO_COLOR`) and fixes a dead CLAUDE.md link.
  `settings.example.json` defaults new installs to it; the classic AF-context
  statusline stays available via `--style af`.

## [3.8.0-alpha.11] - 2026-08-19 (Audit roadmap: P1 fixes, ENV hardening, plan-tree index)

Remediation of the deep-research audit (PR #50). Baseline 79 suites / 1296 tests; after: 86 / 1529, CI green.

### Security

- **`.envrc` TOCTOU closed and the trust gate no longer fails silently.** The guarded loader hashed the file then re-read it to source; it now snapshots to a mode-600 temp, hashes and sources the same bytes, and refuses a group/world-writable `.envrc`. `AF_ENVRC_UNSAFE_AUTO_SOURCE` now warns on stderr when it disables the gate.
- **Plugin credentials never leave over cleartext or to unlisted hosts.** Supabase/Jira requests refuse a non-`https` URL and check the host against an allowlist before sending `apikey`/`Bearer`. Spawned linters no longer inherit `SECRET`/`TOKEN`/`KEY`/`PASSWORD`/`PAT`/`CREDENTIAL` env.
- **Command injection removed from conflict-rescan.** `git_sha` read from a checkpoint JSON is validated (`/^[0-9a-f]{7,40}$/`) and passed via `execFileSync` argv instead of an `execSync` shell string.
- **The `rm -rf` and credential-path preflight blocks actually fire now** — real POSIX ERE (the old `\s` was a literal), and `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/Library/LaunchAgents` are blocked after canonicalization.

### Fixed

- **`post-compact` validated handoff state against the wrong schema**, so a healthy file triggered `exit 2` (a false block) after every compact. It now checks the schema its writer actually emits.
- **One trace store.** `tdd-red-failure-tracker` and `/aura-frog:trace` now use `tool-call-tracer`'s co-located resolver and event-id counter instead of a resurrected legacy `traces/` dir, so forensic traces stop losing events.
- **Abandoned session-state temp files** (`af-session-<ppid>.json`) are expired on read and swept at SessionStart.

### Added

- **`graph-index.json` — an opt-in adjacency cache for the plan tree.** `next-task`, `render` and `validate` read it when a project has opted in via `--rebuild`, falling back to the `find` + awk sweep (which self-heals a stale index) otherwise. Removes the vestigial `ready_queue`.

### Changed

- **One resolver for the MCP audit dir** (`.claude/security`, migrating from five hand-coded `.aura/security` spellings). Preflight skips the bash tree for Glob and Grep.
- **Docs/counts:** stop claiming `autoInvoke` skills "fire on every message"; drop the dead flat-`planning` README; fold `phase1-lite` into `run-orchestrator`; drop `godot`/`svelte` from `framework-expert` (no such skills); skill count 60 → 59 across READMEs and `stats.json`.


## [3.8.0-alpha.10] - 2026-08-12 (Hook dispatch, RAM discipline, and 33 verified audit fixes)

### Performance

- **Hook chains now run in one node process instead of one per script.** `hooks.json` registered 54 separate `node <script>.cjs` commands; a single Read tool call fired 5 of them on PreToolUse alone at ~536ms and ~45MB peak RSS each, almost all interpreter boot, and the multi-agent flows paid it 5–7× in parallel. `hooks/dispatch.cjs` reads fd 0 once and replays it to each hook, loads each with its `require.main` guard satisfied, and intercepts `process.exit` so one hook exiting doesn't kill the rest. 54 → 30 commands with all 48 scripts and 51 invocations kept in order; PreToolUse hot chain 359ms → 230ms (4 processes → 1), UserPromptSubmit 87ms → 56ms. `AF_DISPATCH_DISABLED=1` restores the old behaviour. Four bugs the tests caught during review: hooks wrap their body in `try { … } catch (e) { log(e); exit(0) }`, so that catch swallowed the unwind sentinel and reported success — `scout-block`'s exit 2 silently became 0, disarming every blocking hook; a sentinel thrown from a `setTimeout` surfaces as `uncaughtException`, not a rejection, and node aborted with code 1 (which Claude Code reads as "block"); a stray timer from a finished hook was credited to the running hook and cut it short (`AsyncLocalStorage` now attributes the exit to the hook that armed it); and waiting per hook cost `prompt-reminder` the full 5s timeout on every prompt, since only 44 of 50 hooks call `process.exit`.

- **Dispatch treated any non-zero exit as blocking, silently cancelling downstream hooks.** Claude Code's contract is that only exit 2 blocks; exit 1 is a non-blocking warning. `runInProcess` latched on any non-zero code, so hooks that exit 1 on ordinary findings — `scope-drift`, `security-scan`, `design-conformance` — skipped every sibling after them in their chain: a drifting prompt cancelled `prompt-logger`, `jira-auto-fetch`, `bare-word-router` and `plan-escalation-check`; a security finding cancelled `design-conformance` and `auto-test-runner`. Before dispatch each was an independent `hooks.json` entry and all ran. Exit 2 still aborts (the tool call is already dead); the first warn code becomes the chain's exit once every hook has run. Documented limit: exit codes are read after each hook's synchronous part, so a hook that exits from a timer cannot block — no shipped hook does.

- **`auto-test-runner` was the plugin's worst RAM amplifier.** It fires on every Write/Edit, and four causes compounded: (1) `npx jest` resolves an *unpinned* latest from the npx cache when the dep isn't installed locally, leaving a resident `npm exec` wrapper; (2) `execSync` spawned `sh -c "npx jest"`, so its 30s timeout SIGTERMed the **shell** — jest and its workers were grandchildren, orphaned and never reaped (387 deadlocked `jest-worker` zombies had to be killed by hand once, 33 more later); (3) jest defaults to `cpu-1` workers, each a full node process, so the same edit cost 9 workers on a 10-core box and 15 on a 16-core one — which is why memory pressure appeared on some machines and not others; (4) the whole suite ran per edit and a burst of edits stacked concurrent suites. Now: local `node_modules/.bin` only (no npx fallback, and no `npm test` fallback either — that runs the whole suite with the project's own worker settings), `spawnSync` with an argv array so the runner is the direct child and a path can't reach a shell, `--runInBand` / `--no-file-parallelism` for zero worker processes, `--findRelatedTests` to scope the run to the edited file, and a single-flight lock. `jest.config.cjs` gets `maxWorkers: '50%'` (measured on a 10-core M-series: 1150 tests take 44.3s at the `cpu-1` default and 30.3s at 50% — the default over-subscribes and the workers contend on I/O) plus `workerIdleMemoryLimit: '512MB'`.

- **State files that grew forever, read whole on every Stop.** `history.jsonl` and `conflicts.jsonl` were append-only with no pruning, and three Stop-registered hooks each slurped the entire history file and split it into an array — 2× file size, three times, every Stop. New `hooks/lib/jsonl-tail.cjs` reads only the trailing window and drops the partial first line, decoding with `StringDecoder` because a truncated read can start mid-UTF-8-sequence and `toString()` would inject a replacement char into an otherwise valid record. Safe by each hook's own logic, not by assumption: every one breaks at the first event outside its 60s window, and `foldLatestConflicts` wants the newest record per `conflict_id`, which in an append-only log is the last one. Both files joined `sweepRetention()` under the existing `AF_AUDIT_RETENTION_DAYS` policy; `pruneJsonlByTimestamp` now rewrites in 64KB chunks rather than loading the file, which matters for exactly the large-and-stale file its old size guard let through. Co-located `trace.jsonl` (inside task folders since v3.7.3) had escaped the sweep entirely — only the legacy `traces/` dir was pruned — and `.claude/logs/runs` accumulated one directory per workflow forever; both are now swept, with the run named by `active-workflow.txt` pinned so a resume still finds its state.

- **Every subprocess call is bounded.** Eight sites had no `timeout`, so a hung child wedged the hook and, under the dispatcher, the whole chain; none set `maxBuffer`, so oversize output hit Node's 1MB default, threw, and was swallowed by a bare catch — silently becoming "no data". New `hooks/lib/af-exec.cjs` provides timeout tiers (2s/5s/10s), maxBuffer tiers (2MB/16MB) and `warnExecLimit()`, which tells a timeout from an ENOBUFS and says so on stderr. Bounded: `execSafe` (the generic escape hatch, so every caller inherits a default), `firebase login:list`, `ps -Ao`, `git diff`, `git diff sha..HEAD`, `git show`, `which`, `git rev-parse`. A source-walking test now fails on **any** exec/spawn site in `hooks/` lacking a timeout, so a new unbounded call can't be added silently.

- **`lint-autofix` ran up to two linters per Write with no cache, lock or debounce, at 30s each.** The availability probe re-parsed `package.json`/`composer.json` once per candidate linter per Write; nothing stopped N concurrent Writes each launching eslint; and an unchanged file was re-linted every time. Now: probe cached (process memo plus an on-disk cache keyed by an mtime/size fingerprint of every manifest it consults), single-flight via the new shared `hooks/lib/af-run-lock.cjs` (exclusive `wx` create, stale reclaim on a dead PID, idempotent release that won't drop a lock another process has taken over — also now used by `auto-test-runner`), a content-hash debounce capped at 200 entries that records the *post*-lint hash so a formatter rewrite still debounces, and 10s per linter.

- **Caches that grew without bound now have caps**, each keeping what carries the signal: `learned-patterns.md` 50 blocks by occurrence count (ties newer, original file order preserved so diffs stay stable — it was previously read whole, string-concatenated and rewritten on every learnable prompt with no cap at all); `auto-learn` `cache.patterns` 200 by count; `smart-learn` file/code/bashPatterns 100 by count then recency; `af-learning` `patterns.json` `slice(-500)` — deliberately *not* frequency-sorted, since a new pattern has frequency 1 and would be the first thing discarded; `updateLearnedRulesMD` renders the top 25 per category with a "top N of M" note.

- **`json-toon-projector` walked all of `.claude/logs` on the `Read|mcp__.*` hot path** with no depth limit, no candidate cap, and two `statSync` per file just to filter for files touched in the last 60s — then read, parsed and converted the target, holding three copies. Now depth 4, 50 candidates, one `statSync` per entry, mtime-pruned directories, and a 1MB ceiling above which a file is skipped. The directory prune uses a 24h grace rather than the 60s window: a directory's mtime doesn't move when a file inside is rewritten in place, so a 60s prune would silently miss in-place appends.

### Changed

- **The five `disabled: true` MCP servers are gone from `.mcp.json`, because that field does nothing.** Claude Code ignores it: measured on a dev box, `chrome-devtools` was running with 6 live processes despite the flag — and it is the one that launches a real Chrome. The other four (`postgres`, `redis`, `codebase-memory`, `stitch`) only stayed down because they'd fail to start anyway, missing env vars or a user-installed binary. Absence is the only off-switch, so all five entries are removed and `docs/operations/MCP_GUIDE.md` gains an "Optional Servers (Not Bundled)" section with a copy-pasteable snippet per server. MCP counts across 16 docs were already stale before this — variously claiming 8, 10 and 11 — and now all say 6, along with the "ships disabled in .mcp.json" claims in `context-economy.md`, `db-access-policy.md`, `commands/mcp.md`, `commands/dashboard.md` and the `stitch-design` skill.

- **`playwright-reaper` now covers the servers that actually leak.** It only matched playwright, so `chrome-devtools`' orphaned Chrome and orphaned `jest-worker` processes (200–500MB each) were invisible. Both patterns added, anchored to the package path rather than a bare browser name, and the `ps` call is bounded and now warns instead of returning `[]` in silence. **The safety reasoning changed with a measurement:** the user's ordinary Chrome runs at `ppid 1` on macOS, so the `ppid === 1` guard does *not* protect it — only pattern precision does. The two guards are load-bearing for different processes: `ppid === 1` keeps a running jest suite's workers safe (measured live at a non-1 ppid), pattern precision keeps the user's browser safe. The header says that now instead of implying `ppid` covers both. Dry-run against a live `ps`: 0 processes selected.

### Fixed

- **Two sessions could activate the same T4 task.** `scripts/plans/next-task.sh` dispatched with no lock; the claim-and-write section now runs under the existing `with_lock` (flock with an mkdir-spinlock fallback, so bash 3.2/macOS is fine) with a `status=planned` re-check inside the critical section, and the loser exits 2. Verified with a live two-process race: exactly one activation, exactly one history line.

- **Conflict rescan read a checkpoint layout no writer produces, and mistook "a tool ran" for "the task is done".** `post-execute-conflict-rescan` filtered on a flat `plans/checkpoints/${task}.` path while `_lib.sh save_checkpoint` writes `<node_folder>/checkpoints/<ISO>.json`, so the compatibility check was permanently "inconclusive"; it now resolves the blocker's task folder and reads the newest real checkpoint, with `{ID}_legacy/` and the pre-v3.7.3 flat path as fallbacks. Separately, any recent `execution_completed` event counted as a done blocker — a task now qualifies only when its `task.md` frontmatter `status:` actually reads `done`.

- **The feature-done archive trigger listened for events nothing writes, and re-fired on every edit.** It keyed on `status_transition`/`from`/`to` history events that no writer emits; it now reads the feature node's real `status: done` (nested subfeatures handled), with a prior `feature_done_detected` event as a fired-once guard.

- **`ready_queue` was documented but never implemented.** `next-task.sh`'s header described a queue and an event name it doesn't use, and the plan-context hook rendered a "Ready: N task(s) queued" line from a list that is always empty. The header now describes the real algorithm (rescan task files), the dead line is gone, and the pop-from-`ready_queue` wording is corrected in `commands/plan-next.md`, `commands/plan.md` and `skills/plan-orchestrator/SKILL.md`. `rules/workflow/checkpoint-discipline.md` likewise documented a pre-v3.7.3 checkpoint path and schema the code no longer writes, and now matches `save_checkpoint`/`undo-decision.sh`.

- **The full test suite hung forever, and the CI test job was cancelled at 6h on every run — so the coverage gate had never actually enforced anything.** Root cause: `hooks/lib/safe-stdin.cjs` whitelists stdin sockets, and a jest worker's fd 0 *is* a socket, so an in-process read blocked with nothing to read. Dropping the socket case wholesale is wrong — node's spawn-pipe stdio is a unix socketpair on Unix, which is the production path when Claude Code spawns hooks — so sockets stay whitelisted except inside the jest runtime, detected by `JEST_WORKER_ID` **plus** a `typeof globalThis.expect === 'function'` probe (the env var alone is inherited by spawned test drivers). The suite now completes in ~30s, and the CI test job is bounded at 15 minutes.

- **CI gates that could not fail.** `npm run lint` had every ESLint rule at `warn` and no `--max-warnings`, so lint could never go red; it is now a ratchet at the current count, failing on any new warning. `validate-counts.sh` silently stopped checking agents/skills/commands when `CLAUDE.md` dropped its inline counts (reporting `??` rather than failing) and now reads the Resources block, hard-fails on a missing marker, and cross-checks `plugin.json`. `audit-refs.sh`'s orphan check used an unanchored substring grep, so a rule named after a common word could never be flagged; the match is now anchored to the rule's full path. `validate-hook-parity.cjs` only recognised `hooks/<name>.cjs` paths, so a hook moved into a dispatch chain looked unregistered on that event — it now parses dispatch's spec grammar.

- **101 tests asserted against code that was copy-pasted into the test file.** `__tests__/hooks/lib/af-project-cache.test.cjs` and `af-learning.test.cjs` re-implemented the functions they claimed to cover, and the `af-project-cache` replica still asserted a 24h-TTL contract the real module had removed. The replica suite is deleted (a genuine one already exists next to the module) and `af-learning`'s 37 tests now `require()` the real module. Also: `next-counter-lock` ran unbounded synchronous bash under load (jest's per-test timeout cannot interrupt `spawnSync`), and `hook-runtime` leaked un-cleared 2s timers plus an assertion-free test whose premise was false.

- **`scripts/sync-version.sh` silently updated nothing on macOS** — nine BSD-incompatible `sed` expressions, a version regex that rejected the project's own `-alpha.N` scheme, and a zero-files-changed run that still reported success. `file-registry-gen.sh` and `architecture-gen.sh` likewise depended on GNU-only `grep -P` with the failure suppressed, emitting empty output on macOS.

### Added

- **`docs/proposals/ARCHITECTURE_V4_PROPOSAL.md`** — a draft redesign built from the audit's structural findings and checked against the platform docs: one owner for session/workflow state (it currently lives in 6+ stores with a different resolution order per hook) over an append-only JSONL log, retiring the `autoInvoke`/`priority`/`triggers` frontmatter layer that `MAINTENANCE.md` itself lists as unofficial in favour of the platform's own description-matching and hook enforcement, hook hygiene against the documented matcher/timeout/exit-code contract, a context-budget diet, and deletion of the dead config layer. Five workstreams, a four-phase migration, and an explicit list of what was rejected — notably database-style locking for the plan tree, which CoAgent measured as strictly worse than detect-and-notify on real multi-agent workloads. Proposal only; no behaviour changes.

### Fixed

- **Every-turn auto-invoke skills slimmed to their declared budgets.** The four per-turn skills (`agent-detector`, `plan-loader`, `permanent-memory-loader`, `reasoning-trace-recorder`) carried ~1,587 words of always-loaded SKILL.md body (440/356/369/422); each is now a lean core (~180–205 words, 770 total — 51% cut) with the detail (schemas, degradation ladders, tie-ins, rationale) moved to an on-demand `reference.md` per skill. Behavior contracts unchanged.
- **Rule-loading docs told three incompatible stories; token budgets were fiction.** `rules/README.md` claimed the 22-rule core tier is "ALWAYS — every session" at "~1,800 tokens" (and "Core only (11)" in the same file) while `CLAUDE.md` budgeted ~2,000 and simultaneously said core paths are read on-demand. Measured reality: core tier is ~10,200 words (~13.5K tokens); all 72 rules ~41K. Docs now state one loading model everywhere — core *path index* every session (~300 tokens), rule bodies on demand — with measured tier sizes (`rules/README.md`, `CLAUDE.md` boot sequence + Rule Loading table, `docs/reference/BENEFITS.md` §4.3).
- **Component counts synced to disk across all docs.** Actual: 15 agents, 60 skills (9 auto + 51 reference), 72 rules (22 core + 20 agent + 30 workflow), 24 commands, 51 hooks. Corrected stale figures in `skills/README.md` (56→60; index was missing 8 skills — added a Planning & Safety section + `design-vision-loop`), `rules/README.md` (71→72; agent-rule index listed 19, missing `design-system-persistence` — row added), `aura-frog/CLAUDE.md` (40→51 reference skills; agent tier 19→20), `hooks/README.md` (28→51), root `README.md`, `docs/README.md`, `docs/reference/BENEFITS.md`, `CONTRIBUTING.md`.
- **`git-workflow` skill dropped the mandatory pre-commit confirmation gate.** Its "Commit + Push" step only gated push, contradicting `rules/workflow/git-workflow.md` (CRITICAL: show diff + message, wait for explicit confirmation before `git commit`, ask separately before push). The skill now restates the rule's sequence verbatim.

- **Playwright Chrome processes were leaking into multi-day zombies that silently loaded the machine.** The `@playwright/mcp` server is always-on and launches a Chrome lazily (first `browser_*` call); nothing ever called `browser_close`, so when a session exited ungracefully the Chrome was reparented to launchd (`ppid 1`) and kept running — a live machine had a **headless playwright Chrome idle for 8 days**, plus MCP servers pinned by Claude sessions alive 5–9 days. Three-part fix: (1) **`--headless --isolated`** on the playwright args in `.mcp.json` — lighter, no visible windows, in-memory profile (no disk residue); (2) a new **`playwright-reaper` SessionStart hook** that kills *orphaned* playwright processes — reaps only when a process is **both** orphaned (`ppid === 1`) **and** playwright-launched (the `playwright_chromiumdev_profile` temp dir / `ms-playwright` / `playwright-mcp`), so a live session's browser (`ppid !== 1`) and the user's ordinary Chrome (default profile) are never touched; disable via `AF_PLAYWRIGHT_REAPER_DISABLED=true`; (3) a mandatory **`browser_close` teardown step** in the `design-vision-loop` skill so the browser is disposed after use rather than left for the reaper to catch. The browser stays lazy (spawns only on an actual browser task), gets closed when done, and any leak self-cleans on the next session start. 10 reaper tests (pure `parsePsLines` / `selectOrphans`; the safety contract — never reap a live-parent or non-playwright process — is the bulk of them).

### Added

- **`post-execute-conflict-rescan` made importable + its decision logic tested — FEAT-007 / issue #5 is now complete (24 → 1 non-exporting hooks, and the 1 is nothing but a `console.log`).** This was the last hook still running its whole pipeline at module scope with a `process.exit()` on `require` — I'd parked it as "blocked on the history event-schema," but that blocker was about upstream *data quality* (garbage `exit_code`s), which STORY-0010 fixed; making the hook importable was always independent of it. Wrapped the execution in `main()` and extracted the pure decision logic: `collectRecentDoneTasks` (newest-first window scan for `execution_completed`(exit 0) nodes, stopping at the first out-of-window event), `foldLatestConflicts` (latest record per `conflict_id`), `findRescanPair` (the just-done blocker + its frozen `pending-confirm` sibling; null when resolved / no blocker / no frozen sibling), `recommendationFor` (compat verdict → `auto_thaw`/`auto_discard`/inconclusive), and `buildRescanEvent`. The git-diff compatibility check stays in the I/O wrapper. 14 tests; verified both directions (import is inert; running it as a subprocess against a synthetic conflicts/history tree still emits the recommendation and appends the advisory event). `rate-limit-check` is the only non-exporting hook left — a one-line `/usage` reminder with nothing to extract.

- **`scripts/release.sh` — one command for a complete, no-step-missed version bump.** A bump is not just editing `plugin.json`; it must also stamp the CHANGELOG, tag the commit, and cut a GitHub release. Doing it by hand skipped the tag+release for alpha.3–alpha.8. The script runs the whole flow in two phases: `prepare <version> "<title>"` bumps every canonical version location (plugin.json, marketplace.json, `aura-frog/CLAUDE.md`, each doc's `last_aligned_with:` frontmatter), stamps CHANGELOG `[Unreleased]` → `[version]` with a fresh empty `[Unreleased]`, runs the CI gates, and prints a diff without committing; `publish <version>` (run on `main` after the prepare PR merges) creates the annotated `v<version>` tag, pushes it, and cuts a GitHub release (auto Pre-release for `-alpha`/`-beta`/`-rc`) with notes extracted from the CHANGELOG section. Historical version strings in CHANGELOG/ROADMAP prose are left untouched (only canonical locations are edited); `publish` refuses unless on `main`, tree clean, and `plugin.json` already at the target version. Also fixes `MAINTENANCE.md`, which pointed at a `sync-version.sh` that never existed.

## [3.8.0-alpha.9] - 2026-07-18 (Hook runtime hardening — importable hooks, stdin migration, CI restored)

> Applied the plugin's own lazy-load principle to its own CLAUDE.md files. Maintainer-only procedure and reference catalogs were costing always-on context every session; they now lazy-load from `docs/`. Net: **~1,685 tokens cut from every session** (~48% of the project CLAUDE.md).

### Fixed

- **Three telemetry hooks were reading tool context from env vars the hook API never sets — so they always saw the defaults.** `post-execute-update-node`, `tdd-red-failure-tracker`, and `tool-call-tracer` (post-phase) pulled the tool name / command / exit code / duration from `CLAUDE_TOOL_EXIT_CODE`, `CLAUDE_TOOL_COMMAND`, `CLAUDE_TOOL_NAME`, `CLAUDE_TOOL_ARGS`, `CLAUDE_TOOL_DURATION_MS` — none of which Claude Code populates. The result: `post-execute-update-node` recorded **every** execution as `execution_completed exit_code=0` and never once fired the failure-classifier on a real non-zero exit; `tdd-red-failure-tracker` couldn't tell RED-as-designed from unexpectedly-green (it saw exit 0 always) and never flagged an F2 candidate; `tool-call-tracer` logged `tool_name=unknown`, `exit_code=0`, `duration_ms=0` on every post event. STORY-0010 (FEAT-007 / issue #7). Migrated all three to read the hook's **stdin payload** via a new pure `hooks/lib/tool-context.cjs` (`readToolName`/`readExitCode`/`readCommand`/`readArgs`/`readDurationMs`), following the documented PostToolUse schema: `tool_name` top-level, `tool_input.command` for Bash, `tool_response.exit_code` (with the top-level `exit_code` duplicate as fallback), and `duration` seconds → ms. **`CLAUDE_HOOK_PHASE` is untouched** — it *is* set, explicitly, by the pre/post wrappers in `hooks.json`. Each reader returns `null` (never a default) when its field is absent so a real exit `0` is never mistaken for "missing", and every hook keeps the old env var as a fallback → **the migration cannot regress** a host that doesn't populate the payload. Verified end-to-end by piping synthetic payloads through each hook as a subprocess (exit 1 → `execution_failed`; `npm test` + exit 0 in RED → `red_unexpectedly_green`; `duration:1.5` → `duration_ms:1500`; top-level-only `exit_code:3` → recorded 3). Field names cross-checked against the official hooks docs + claude-code-guide; the seconds→ms unit is the one detail not yet confirmed by a live-session probe, and it feeds telemetry only (never a control-flow decision). 19 tool-context tests + existing hook suites green. **This clears the STORY-0010 blocker the roadmap parked as "needs the exit-code probe first."** Note: `buildInputObject`'s whitelist drops top-level `duration`/`exit_code`, so these hooks read the raw stdin JSON (`parseStdinJson(readStdinSafely())`) rather than the whitelisted `readHookInputCompat` — `tool_response` survives the whitelist but `duration` does not.

- **Prerelease users were never told about their stable release.** `update-check.cjs` compared versions with `'3.8.0-alpha.8'.split('.').map(Number)` → `[3, 8, NaN, 8]`, and `NaN || 0` collapsed to `0`, so **`3.8.0-alpha.8` compared EQUAL to `3.8.0`** — anyone on a prerelease (i.e. everyone on the current build) only ever saw a notice for a minor/major bump, never for the matching stable release. Rewritten per semver §11: the core is parsed separately from the prerelease tag, a prerelease ranks below its release, numeric identifiers compare numerically (`alpha.9 < alpha.10`, which string order gets backwards), more identifiers outrank fewer, and a stable user is never pushed back onto a prerelease. 20 tests.

- **The `Plugin Validation` workflow has never run — one unquoted colon killed it.** `.github/workflows/validate.yml` step name `Check hook parity (Fires: header vs hooks.json registration)` was an unquoted YAML scalar containing `: `, so the parser read `name: Check hook parity (Fires` and then choked on `: header …` — *mapping values are not allowed in this context* (line 91). GitHub rejected the whole file: **146 consecutive runs completed in 0s with zero jobs**, and the Actions UI listed the workflow by path (`.github/workflows/validate.yml`) rather than its name — the tell that it never parsed. So `validate-counts`, `validate-hooks` (incl. the hook-parity gate the roadmap records as "wired into CI … now fails CI"), `validate-structure` and `performance-report` have **never executed once**. Quoting the step name restores all four; each verified green locally. Note the masking effect: `validate-counts` would have caught the plugin.json count drift (46 hooks / 56 skills documented vs 48 / 59 actual) months ago had it ever run.

- **Hook keyword detection missed every plural.** The intent/category keyword lists in `prompt-logger.cjs` and `auto-learn.cjs` were `\b`-anchored singulars, so `\btest\b` never matched "tests" and `\bcomment\b` never matched "comments" — i.e. the most natural phrasing silently missed its branch. `"add unit tests"` classified as **implement** instead of **test**; `"there are bugs"` fell through instead of **debug**; and `"don't add so many comments"` — the single most common style correction — fell back to **general** instead of `code_style/no_excessive_comments`, so auto-learn never learned it. Pluralised the affected lists (`tests?`, `specs?`, `bugs?`, `errors?`, `issues?`, `problems?`, `comments?`, `types?`, `interfaces?`, `promises?`, `imports?`, `exports?`, `modules?`, `names?`, `variables?`). Found while writing the coverage tests below; each fix has a regression guard.

### Added

- **Four more hooks made importable + tested** (FEAT-007 / issue #5, batch 8): `post-compact` (`validateStateFile` — per-file required-field checks for workflow-state vs compact-handoff), `pre-execute-load-plan-context` (`composeContextLines` — the mission→…→ready display order, count summaries), `session-start-restore-active` (`composeBanner` — feature-over-initiative-over-mission precedence), `task-completed` (`checkTddViolation` — a TDD-phase task must reference test results; `checkApprovalPending` — phases 2/5b block completion while approval is pending). 45 tests. **This takes FEAT-007 / #5 from 24 non-exporting hooks down to 2** — `rate-limit-check` (a single `console.log` reminder, nothing to extract) and `post-execute-conflict-rescan` (blocked on the history event-schema cleanup, STORY-0029). Every hook with real extractable logic is now importable and unit-tested; ~340 hook tests added across PRs #28, #32–#35, #37, and this batch.

- **Four more hooks made importable + tested** (FEAT-007 / issue #5, batch 7) — including the "0-function" ones I'd wrongly written off as having no extractable logic: `security-critical-warn` (`classifyTier` — 20+ patterns across CRITICAL/HIGH/MEDIUM, most-severe-wins, backslash/case normalisation), `commit-attribution` (`needsAttributionWarning` — git-commit-with-new-message-and-no-trailer, skipping amend/`-F`/existing-trailer), `feature-done-trigger-archive` (`shouldTriggerArchive` — newest-first history scan: latest transition is `done` and not yet epic-summarized), `session-reset-trigger` (`findPromptableSummarize` — a fresh `epic_summarized` inside the window not followed by a `session_reset`). 79 tests. Exit-code behaviour verified unchanged (commit-attribution still exits 1 on a plain commit, 0 otherwise).

- **The three STORY-0010 hooks made importable + their pure logic tested** (FEAT-007 / issue #5): `tool-call-tracer` (7 helpers — `hash`, `taskSlugOf` incl. the `T2.3`≠`T23` collision guard, `extractReadPath` JSON-then-regex, `resolveTaskFolder`/`resolveTracePaths` co-located-vs-legacy layout, bounded file hashing, counter id — 22 tests), `tdd-red-failure-tracker` (`isTestRunner`, `buildDecisionEvent` — a failing RED test is `red_as_designed`, a passing one flags an F2 candidate), `post-execute-update-node` (`buildHistoryEvent` — non-zero exit → `execution_failed`). 45 tests total. **The env→stdin migration these hooks actually need (they read `CLAUDE_TOOL_*` the API never sets) is still STORY-0010** and needs the exit-code/duration probe first — but the hooks are now testable, so that migration can land with a safety net instead of blind. An in-file NOTE marks the env reads.

- **`pre-dispatch-conflict-check` restructured out of module scope + tested** (FEAT-007 / issue #5). Its entire L1/L2 conflict-detection pipeline — read `active.json`, walk siblings, `spawnSync` two bash detectors, mint a `CONFLICT-NNNNN` id, append `conflicts.jsonl` + `history.jsonl`, warn — ran at module scope with `process.exit()` on require. Wrapped in `main()` and extracted the pure helpers: `isPendingStatus` (planned/blocked/blocked-on-confirm), `buildConflictRecord({taskId, detectedLayer, conflictPayload, conflictId, ts})` (participant list, L1→file_overlap / L2→function_overlap, null-safe overlap + confidence defaults). `main` and `nextConflictId` (mints ids, runs bash, appends files) stay unexported. Verified: import is inert, and running against a synthetic `active.json` with no siblings exits 0 and writes no `conflicts.jsonl`. 14 tests.

- **`pending-confirm-timeout` restructured out of module scope + tested** (FEAT-007 / issue #5, first of the harder ones). Unlike the earlier hooks it did not end in a bare `main();` — its directory walk and `process.stderr` warning ran **at module scope** with a `process.exit()` on require, so importing it did work and then killed the process. Wrapped the execution in `main()` (early `safeExit(0)`s became returns) and extracted the decision + formatting as pure functions: `evaluateTaskFile(content, path, {now, timeoutMs})` (T4-only, planned/frozen/blocked, age must exceed the timeout — the boundary is now pinned) and `formatWarning(stale, {timeoutHours, maxShown})` (oldest-first, capped with a "+N more" tail, non-mutating). Behaviour verified against a synthetic plans tree: a 48h-old task warns, a fresh one doesn't. 18 tests.

- **Two more hooks made importable + tested** (FEAT-007 / issue #5, batch 3): `session-metrics` (`extractPatterns` is pure — success/auto-stop/high-token patterns, the >50k threshold incl. its boundary, and all three signals in one pass) and `subagent-init` (env-first phase detection, project-name and state readers). 17 tests. `sendWorkflowMetrics`/`sendAgentMetrics` (post metrics), `saveSessionState` (writes state) and `trackAgentUsage` (reads fd 0 — would block a test runner) stay unexported. `tool-call-tracer` was **skipped deliberately**: its logic runs at module scope and calls `process.exit()` on require, so making it importable means restructuring it into a `main()` first — and it reads `CLAUDE_TOOL_ARGS`, one of the env vars the hook API never sets (STORY-0010 territory).

- **Three more hooks made importable + tested** (FEAT-007 / issue #5, batch 2): `jira-auto-fetch` (ticket extraction, uppercase normalisation, `/g`-regex state safety, project allowlist, env gating — 21 tests), `update-check` (semver incl. the prerelease fix above — 20 tests), `phase-checkpoint` (cache path, read-only state/git probes — 6 tests). Repo-mutating helpers stay **unexported by design** and a test asserts it: `phase-checkpoint.createCheckpoint` runs `git add -A` + `git commit` on the real tree, and `writeCache`/`writeCacheFromFetch`/`showEnvHintOnce` write into the working repo — nothing that mutates the repo should be one `require()` away from a test runner.

- **`session-start.cjs` is importable, and its cache rules finally have a regression test.** The file ended in a bare `main();`, so requiring it ran the whole hook (wrote the cache, emitted the banner, swept retention) — which is why none of its logic was reachable from a test, and why the shipped branch-invalidation fix (`fcd1934`, FEAT-007/STORY-0029) never had one. Split the staleness decision out as a pure `cacheStaleReason(cache, {now, ttl, envrcMtime, currentBranch})` and switched the entry point to the `require.main === module` pattern the other hooks already use — **hook behaviour is unchanged** (verified: importing no longer touches `.claude/cache`; running it still emits the banner). 29 tests now cover TTL (incl. the boundary), `.envrc` mtime, precedence, the `branch_switched` guard (including the safe-by-construction case where an undetectable branch must fall back to TTL-only rather than invalidate), plus `buildContextOutput`, `listFiles` and `pruneJsonlByTimestamp` (aged-out lines dropped, malformed lines kept, all three timestamp field names). **Note for the rest of FEAT-007:** the guard *lowered* measured function coverage (32.63% → 30.4%) before the new tests brought it back — the old number was inflated by tests that required the hook and thereby ran `main()` as a side effect. Expect every hook made importable to deflate the metric until real tests replace the accidental execution. First slice of FEAT-007 / issue #5.

- **Unit tests for six previously-untested hooks** — `prompt-logger`, `auto-learn`, `lint-autofix`, `test-pattern-extractor`, `firebase-cleanup`, `compact-handoff` (83 tests), raising the `functions` coverage floor that CI has been failing on since ≥2026-07-14 (32.32% → measured in CI). Tests cover real behaviour, not padding: fail-open on malformed payloads, `/g`-regex state safety in `extractReferences`, framework-detection precedence, and the length/indicator precedence in `isLearnableFeedback`. Three functions are deliberately left uncalled and documented in-file — `cleanupDebugLog`, `saveHandoff`, and `generateCompactContext` resolve paths from the real project root at module load and would write to (or unlink from) the working repo.

### Fixed (cont.)

- **`with_lock` no longer mints duplicate IDs under CPU starvation (P0-4 regression).** The `mkdir`-spinlock in `scripts/plans/_lib.sh` broke a "stale" lock purely by age (`AF_LOCK_TIMEOUT_SEC`). Under heavy parallel load a *live but off-CPU* holder would age past the threshold, a waiter would steal its lock, and two writers would enter the read-modify-write at once → **duplicate counter IDs** — the exact P0-4 bug the lock was added to prevent, resurfacing as a flaky `next-counter-lock.test.cjs` that failed only inside the oversubscribed CI jest run. Fix: `with_lock` now prefers **`flock(1)`** — kernel-managed, released automatically when the fd closes (including on crash), so no staleness heuristic exists and a live holder's lock can never be stolen. Hosts without flock (stock macOS) fall back to the mkdir spinlock, now **liveness-gated**: the holder records its PID and a waiter breaks the lock only once that PID is dead, or (for the sub-ms mkdir→pid window) after a decoupled `AF_LOCK_STALE_SEC` (default `max(timeout,60)`). Measured on the fallback: old code minted dupes in 3/30 stress runs under load, liveness-gated 0/30 at low timeout (2/40 residual at the test's 120s timeout under 8 CPU hogs — which flock removes outright). Full scripts suite 105/105 green.
- **Pre-flight no longer bricks a session when `jq` is missing.** The Tier-1 shell linters parse the tool payload JSON with `jq`. On a machine without jq installed, `scripts/preflight/validate-tool-input.sh` read empty fields for a perfectly valid payload and FALSELY reported `preflight:tool-input FAIL: <Tool> tool missing <field>` (exit 2) — blocking **every** Bash/Read/Write/Edit call and making the whole session unusable. Now fails open, matching the repo's existing "runs with or without jq" convention: `validate-tool-input.sh` skips shape validation when jq is absent, and `hooks/pre-flight-validate.cjs` short-circuits before running any linter (new `jqAvailable()` guard), printing a one-time `install jq to re-enable checks` notice instead of blocking. Regression-tested in `__tests__/hooks/preflight-validate-stdin.test.cjs`.

### Changed

- **`.claude/CLAUDE.md` slimmed 257 → 97 lines** — the Documentation Update Rule, Frontmatter Maintenance Rule, Commands-vs-Skills architecture, and Reference Integrity contract moved to **`docs/reference/MAINTENANCE.md`** (they only apply when editing plugin source, not every session). The runtime `User Confirmation Required` directive stays; a one-line pointer + audit-script invocation replaces the moved blocks.
- **`aura-frog/CLAUDE.md` Status Line section** compressed (24 lines of render spec → 1 directive line); full spec moved to **`docs/reference/STATUSLINE.md`**.
- **De-duplicated component counts** — plugin purpose line no longer restates `15 agents + 56 skills + 24 commands`; **Resources** table is now the single source. Synced version drift: global `~/.claude/CLAUDE.md` and `.claude/CLAUDE.md` header/footer → `3.8.0-alpha.7` (matching `plugin.json`).

### Added

- **`scripts/audit/audit-refs.sh`** — extracts the 3 inline bash audit blocks (zero-orphan, zero-dead-link, `user-invocable: false`) into one runnable gate. Fixes a latent bug in the inline version (it stripped `.md`, false-flagging `agents/architect`) and filters prose enumerations like `(agents/skills/rules)`. Exits 0 clean / 1 on violation.
- **`docs/reference/MAINTENANCE.md`** — the maintainer contract (doc-update, count/version sync, frontmatter schema, commands-vs-skills, reference integrity).
- **`docs/reference/STATUSLINE.md`** — full status-line rendering reference.

### Why

The repo preaches lazy-loading (Golden Rule #2) but its always-on CLAUDE.md trio carried ~3.5K tokens of maintenance procedure, reference catalogs, and drift-prone counts. Per Karpathy's context-engineering principle (CLAUDE.md is always-on prompt budget, not documentation), this is the highest-leverage cut. Zero runtime change.

---

## [3.8.0-alpha.8] - 2026-07-16 (Design Intelligence v2 — FEAT-009 ships)

> Closes the long-blocked FEAT-009 tail and adds the missing vision + design-system-persistence layers.
> Driven by the 2026-07-16 deep-research pass (Anthropic frontend-design skill, Agent SDK vision loop,
> Google Stitch MCP, superdesign). Full design: `docs/architecture/LLD-DESIGN-INTELLIGENCE.md`.

### Added

- **`skills/design-vision-loop`** — the missing "look at it" step. Renders the running UI via the Playwright
  MCP, screenshots it across 3 viewports + dark mode, runs a deterministic tier-1 gate (the new
  design-conformance hook + console errors) **before** spending a vision call, then critiques the shots
  against the design system and iterates (max 3). Two-tier by design — Anthropic ranks rules-based feedback
  above LLM-as-judge. Ships with `references/critique-rubric.md` + `references/viewport-matrix.md`.
- **`hooks/design-conformance.cjs`** (PostToolUse `Write|Edit`) — deterministic design gate that finally
  enforces what `theme-consistency` / `design-system-usage` / `motion-design` only described in prose:
  hardcoded hex/rgb, raw px/numeric spacing, one file importing 2+ component libraries, and
  animation/transition with no `prefers-reduced-motion` guard. Warnings only, fail-open, skips token/theme
  files. 27 unit tests; RED caught two real regex bugs before merge.
- **`rules/agent/design-system-persistence.md`** — `.claude/design/design-system.md` as the durable design
  source of truth (schema + producers/consumers), so tokens/type/library survive across sessions instead of
  being re-picked each time (pattern from Stitch `design.md` / superdesign `.superdesign/design-system.md`).
- **Google Stitch MCP** — opt-in remote server in `.mcp.json` (`stitch`, http transport, `STITCH_API_KEY`),
  disabled by default like the other opt-ins.

### Changed

- **`skills/stitch-design`** rewritten — dropped the stale "Stitch has no API" claim; now prefers the MCP
  (generate/edit screens + design-system tools, Flash-for-drafts quota discipline) and keeps the manual
  copy-paste flow as a graceful fallback. Seeds `.claude/design/design-system.md` + saves screen PNGs as
  vision-loop targets.
- **`skills/frontend-aesthetics` → v2** — added Anthropic's two-pass process (compact design plan →
  self-critique against the brief before coding), named the specific AI-default clusters to avoid
  (cream+serif+terracotta, dark+acid-green, hairline-broadsheet), and a screenshot self-critique directive.
- **`skills/design-tokens`, `skills/design-expert`, `agents/frontend`** — now write/read the design SoT file.
- **Figma tool-mismatch fixed** — prompts referenced Dev-Mode-MCP tools (`get_variable_defs`/
  `get_code_connect_map`) that the installed `figma-developer-mcp` doesn't expose; corrected to
  `get_figma_data` / `download_figma_images`.
- **Counts synced** — skills 59→60, rules 71→72, hooks 48→49, MCP 10→11 across CLAUDE.md / plugin.json /
  README / stats.json.

### Note

Stitch endpoint + tool names came from research that couldn't be fully adversarially verified (session
limit); the skill instructs verifying via `list tools` on first connect and degrades to the manual path if
the server is unreachable. Tracked as STORY-0033 open risk in `docs/ROADMAP.md`.

---

## [3.8.0-alpha.7] - 2026-06-10 (Model routing: prefer the session model)

> The plugin no longer hardcodes a stronger model (Opus) for "complex" work, nor pins substantive agents to Sonnet. It now **inherits the session model** by default — so a newer/stronger model the user launches flows through automatically, with no plugin update needed to "keep up." The only deliberate override is down-shifting to `haiku` for trivial mechanical work.

### Changed

- **`rules/core/small-to-large-routing.md` rewritten** — from a `Haiku→Sonnet→Opus` ladder with "start Opus for hard problems" to **"prefer the session model; down-shift to `haiku` only for trivial work; never force-upgrade to a named model."** The session model is the ceiling; there is no escalation to a hardcoded model. Defaults table: substantive agents → **inherit**; only the trivial detectors keep `haiku`.
- **`skills/agent-detector/SKILL.md` Model Selection** — was `Quick→haiku, Standard→sonnet (opus for architecture/design), Deep→sonnet (opus for planning)`; now Quick/classification → `haiku`, **everything else inherits the session model**.
- **Stripped per-agent `model:` overrides** so they inherit the session model: `strategist`, `tester`, `security`, `devops` (were `model: sonnet`), plus reasoning skills `problem-solving`, `sequential-thinking`. Deliberate `haiku` floors kept on `scanner`, `agent-detector`, `git-workflow`, `session-continuation`.
- **Reframed model-named guidance to be capability-based** (future-proof, no stale model names): `rules/core/context-management.md` compaction strategy now keys off **context-window size** (small/mid vs large) instead of Haiku/Sonnet/Opus; `rules/workflow/dual-llm-review.md` reviewer selection now matches the **session model tier** instead of naming Opus/Sonnet/Haiku.
- Doc sync: `agents/README.md` frontmatter schema + rules (omit `model:` to inherit; `haiku` only as a cheap floor), `rules/README.md` one-line description.

### Why

New model releases no longer require a plugin update to be used for complex work — the user's session model choice is the single source of truth. Removes the anti-pattern the routing rule itself warned against ("set a fixed model per agent regardless — breaks Opus-session users' intent").

---

## [3.8.0-alpha.6] - 2026-06-10 (Status line: rate-limit usage)

> The status line gains a usage line showing how much of the rate-limit budget is spent and when it resets — from the `rate_limits` object Claude Code provides on stdin.

### Added

- **`scripts/statusline.sh` usage line** — renders `⏳ 5h {pct}% ↻{reset} │ 7d {pct}% ↻{reset}` from `rate_limits.{five_hour,seven_day}.{used_percentage,resets_at}`. Percentage is color-coded by severity (**red ≥90 · yellow ≥70 · green** otherwise); reset times are formatted from epoch to local `HH:MM` (5h) / `Day HH:MM` (7d). Present only for Claude.ai subscribers after the session's first API response — **degrades silently** when `rate_limits` is absent (no line). Parses jq-first with a grep fallback (one-lines the JSON to read the nested object). Disable: `AF_STATUSLINE_USAGE=0`.

### Changed

- Status-line header comment "Format:" block + `aura-frog/CLAUDE.md` Status Line section document the new usage line and `AF_STATUSLINE_USAGE` flag.

---

## [3.8.0-alpha.5] - 2026-06-09 (Hotfix: botched findProjectRoot() migration)

> The v3.8.0-alpha.2 `findProjectRoot()` migration inserted `const { findProjectRoot } = require('./hook-runtime.cjs');` **inside an array literal** in 4 hook files, producing a `SyntaxError: Unexpected token 'const'`. The bug stayed latent while the installed plugin was 3.7.4; updating to the 3.8.0-alpha line surfaced it ("Failed with non-blocking status code: …/af-config-utils.cjs:498"). Any hook that `require()`d an affected lib failed to load.

### Fixed

- **`SyntaxError` in 4 hook files** — hoisted the lazy `require('./hook-runtime.cjs')` out of the array literal to a valid statement position (immediately before the array, preserving the lazy-require to avoid a circular dependency with `hook-runtime.cjs`):
  - `aura-frog/hooks/lib/af-config-utils.cjs` (`isAgentTeamsEnabled`, line 498) — `af-config-utils` is required by **12 hooks**, so this was the highest-impact instance.
  - `aura-frog/hooks/lib/record-workflow-event.cjs` (`getActiveWorkflowId`)
  - `aura-frog/hooks/lib/team-bridge.cjs` (`resolveWorkflowDir`)
  - `aura-frog/hooks/subagent-init.cjs` (workflow-state path resolution)
- Verified: `node -c` clean across **all** hooks + libs (0 syntax errors); each fixed module loads and `findProjectRoot()` resolves; full suite **627/627** green.

---

## [3.8.0-alpha.4] - 2026-06-08 (Multi-line status line)

> The status line (`scripts/statusline.sh`) now renders **multi-line** and owns the full output (dir/git prefix + AF context + opt-in cost), instead of emitting only the AF segment and relying on a user shim. Fixes single-line truncation on narrow terminals and lets the layout survive plugin upgrades.

### Added

- **`scripts/statusline.sh` now owns the full multi-line status line** (was: single AF segment only):
  - **Line 1** — `➜ {dir}  git:({branch}) {✓|✗N} {↑ahead} {↓behind}   🕐 HH:MM`. Working-tree state via `git status --porcelain` (✓ clean / ✗N changed-file count); ahead/behind via `git rev-list --left-right --count @{upstream}...HEAD` (shown only when non-zero). All git calls use `--no-optional-locks`, are guarded by an `is-inside-work-tree` probe (non-git cwd skips them entirely), and degrade silently (detached HEAD / no upstream).
  - **Lines 2–3** — the AF context line is split on ` │ ` (`🐸 AF v… │ {mode} {step} │ {agent}` then `{model} │ {ctx}% ctx`) so long lines no longer clip. The exact AF substring is preserved internally before the split.
  - **Line 4 (opt-in)** — `💰 ${cost} │ +{added}/-{removed} │ ⏱ {duration} │ cc {version}`, rendered **only** when `AF_STATUSLINE_COST=1` AND the cost data is present. Cost was pulled from the always-on line in v3.7.4 ("visual noise without per-call breakdown"); this re-adds it behind a flag. Added green / removed red, line dimmed; duration `Xh Ym` / `Xm Ys` / `Zs`.
  - Parses `workspace.current_dir` → `cwd` → `$PWD` for the dir; all fields via the existing grep/sed fallback so it runs **with or without jq**; always `exit 0`.

### Changed

- **`AF_STATUSLINE_COST=1`** — new env flag to opt into the session-metrics line (line 4).
- **Shims are now thin pass-throughs** — `aura-frog/scripts/statusline-shim.sh` (and the user-installed `~/.claude/statusline-command.sh`) no longer build the dir/git prefix themselves (that moved into the plugin); they just forward stdin to the plugin script. Prevents a doubled prefix.
- Status line header comment "Format:" + examples updated to the new layout.

---

## [3.8.0-alpha.3] - 2026-06-03 (Durable project-context persistence + cross-tool porter)

> Two features. **FEAT-008** makes persisted project context actually reusable across sessions so Claude stops re-scanning the codebase every time. **FEAT-009** ships a one-command porter that exports the universal layer to GitHub Copilot, Codex, and Cursor. All work is TDD'd; +44 new tests across 4 suites, full suite green.

### Added

- **FEAT-008 — Durable project-context persistence**
  - **`aura-frog/scripts/context-snapshot.cjs`** (NEW) — generates a single SHA-stamped `snapshot.md` under `.claude/project-contexts/<name>/` by running the long-dormant `repo-map-gen.sh` + `file-registry-gen.sh` + `architecture-gen.sh` generators (which existed but were never persisted here). Freshness API: `generateSnapshot`, `readSnapshotMeta`, `isSnapshotFresh`, `getSnapshotPath`. A snapshot is "fresh" (reusable, skip re-scan) only while git HEAD + content-hash are unchanged. CLI: `node aura-frog/scripts/context-snapshot.cjs`.
  - **`aura-frog/hooks/context-auto-refresh.cjs`** (NEW) — self-healing `Stop` hook (async, debounced 60s) that regenerates the snapshot when watched dirs change, so the next session always loads fresh context without a manual re-scan. Disable: `AF_CONTEXT_AUTO_REFRESH_DISABLED=true`.
  - **Session-start staleness banner** — `session-start.cjs` now reports whether the durable snapshot is FRESH (reuse, no re-scan) or STALE (refresh hint), on both fast-path and full-path. Disable: `AF_CONTEXT_STALE_BANNER_DISABLED=true`.
- **FEAT-009 — Cross-tool porter**
  - **`aura-frog/scripts/port-plugin.cjs`** (NEW) — exports the universal layer (CLAUDE.md + 71 rules + 56 skills + 15 agents + 24 commands + MCP) to other tools' native formats: `copilot` (`.github/copilot-instructions.md` + path-scoped `.github/instructions/*.instructions.md`), `codex` (`AGENTS.md`), `cursor` (`.cursor/rules/*.mdc`), or `all`. Writes a `PORT_MANIFEST.json` per run. CLI: `node aura-frog/scripts/port-plugin.cjs <target> [--out <dir>] [--dry-run]`.
  - **`aura-frog/scripts/PORT_USAGE.md`** (NEW) — porter usage guide; pairs with `docs/PORTABILITY.md`.

### Fixed

- **Cache invalidation never fired for non-JS projects** — `af-project-cache.cjs` keyed invalidation off a 24h TTL + a `KEY_FILES` list of JS/TS/Go/Python configs. For this markdown/bash/yaml plugin none of those exist, so the cache froze (observed: `project-detection.json` stuck at 2026-02-11 reporting 11 agents / 53 skills while reality was 15 / 56). Invalidation is now **project-type-aware** (content-hash of structural dirs — `agents/`, `skills/`, `rules/`, … — discovered at depth ≤2) **+ git-HEAD-sha**, the TTL is removed, and a `CACHE_SCHEMA_VERSION` bump rebuilds old-format caches. New exports: `getGitHead`, `calculateContentHash`, `resolveWatchMode`, `findStructuralDirs`, `getCacheStaleness`.
- **Ghost-dir cache miss** — `getProjectName()` preferred `package.json` `name` (`aura-frog-dev`) over the dir basename (`aura-frog`) where context actually lives, so the cache read/wrote a path that never matched the real data → permanent cache miss. Now an existing `.claude/project-contexts/<basename>/` wins.

### Changed

- **Hooks: 45 → 46** (added `context-auto-refresh.cjs`; wired into `hooks.json` `Stop`, async).
- **`jest.config.cjs`** — added `aura-frog/scripts/__tests__` to `roots`.
- Tests: **+44** — `af-project-cache.test.cjs` (17, NEW), `context-snapshot.test.cjs` (5, NEW), `context-auto-refresh.test.cjs` (8, NEW), `port-plugin.test.cjs` (74, NEW).

### Stats

- Hooks: **46** (was 45) · Scripts: +3 new files
- Agents 15 · Skills 56 · Rules 71 · Commands 24 · MCP 8 (unchanged)

---

## [3.8.0-alpha.2] - 2026-05-28 (CWD pollution fix — `findProjectRoot()` migration)

> Hotfix on top of v3.8.0-alpha. Closes the long-standing "stray `.claude/` folders in subdirs" bug. Every hook that wrote to `.claude/cache/` or `.claude/metrics/` was using `process.cwd()` blindly — when launched from a subdir (e.g., user did `cd aura-frog && claude-code`, or a PreToolUse hook fired during a Bash command with a transient `cd`-prefix), the hook created `<subdir>/.claude/` instead of `<root>/.claude/`. This commit ships the resolver + migrates 25 hook files + 3 shell scripts onto it.

### Added

- **`findProjectRoot()`** in `aura-frog/hooks/lib/hook-runtime.cjs` — walks up from a starting dir (default `process.cwd()`) looking for `.claude/` or `.git/` marker. Honors `AF_PROJECT_ROOT` env override. Falls back to start dir if no marker found.
- **6 new tests** in `aura-frog/hooks/lib/__tests__/hook-runtime.test.cjs` covering marker discovery (called from root, called from subdir, called from deeply nested dir), env override, and fallback semantics. Total now **99 tests** (was 93).

### Changed

- **25 hook files** migrated from `path.join(process.cwd(), '.claude', ...)` to `path.join(findProjectRoot(), '.claude', ...)`:
  - Hooks: `auto-learn`, `changelog-notify`, `compact-handoff`, `feedback-capture`, `jira-auto-fetch`, `json-toon-projector`, `mcp-call-gate`, `phase-checkpoint`, `pre-flight-validate`, `prompt-logger`, `session-metrics`, `session-reset-trigger`, `session-start`, `smart-learn`, `subagent-init`, `test-pattern-extractor`, `thinking-boost`, `token-tracker`, `update-check`, `workflow-edit-learn`
  - Lib: `af-config-utils`, `af-learning`, `af-memory-loader`, `record-workflow-event`, `team-bridge`
- **3 shell scripts** picked up an equivalent `find_project_root` bash function: `aura-frog/scripts/statusline.sh`, `aura-frog/scripts/dashboard.sh`, `aura-frog/scripts/project-refresh-incremental.sh`.
  - `statusline.sh` also now prefers the `cwd` field that Claude Code passes via stdin JSON.

### Fixed

- **Stray `.claude/` folders** in 8 locations: `aura-frog/.claude`, `aura-frog/{agents,commands,docs,docs/phases,rules,skills}/.claude`, `docs/.claude`. All caches were stale (March–May), regenerate on next session in the canonical `<root>/.claude/` location. **Bug class is closed** for any caller routed through the migrated surface — verified via smoke test (token-tracker invoked from `aura-frog/skills/` writes to root `.claude/cache/`, not to `aura-frog/skills/.claude/`).

### Stats diff

- Hook files modified: 25
- Shell scripts modified: 3
- Tests: 93 → 99 (+6)
- LOC change in hook-runtime.cjs: 653 → ~720 (added `findProjectRoot` + JSDoc)

### Migration / breaking changes

- **None.** All hooks gain a new helper import; existing behavior preserved (the resolver falls back to `process.cwd()` if no marker found, matching the legacy behavior).

---

## [3.8.0-alpha] - 2026-05-27 (v3.8 hook-runtime foundation — FEAT-007 / STORY-0009 / TASK-00023 only)

> First alpha cut of the v3.8 hook refactor. **This is a pre-release: only the foundation library lands here. The other three stories (STORY-0010 env-var drop, STORY-0011 SQLite WAL, STORY-0012 perf budget) remain pending.** Use to validate the lib in isolation before the rest of FEAT-007 ships.

### Added

- **`aura-frog/hooks/lib/hook-runtime.cjs`** (653 LOC) — unified runtime utilities for hook scripts. 6 functional exports + 5 error classes + 4 back-compat re-exports + 2 internal helpers (`validateSafePath` for CWE-22 path traversal defense, `deepFreeze` for CWE-471 immutability).
  - `readHookInput()` — strict stdin JSON parser; throws typed `HookInputSchemaError` on schema gap; does NOT touch `process.env` (no silent degrade for security gates per GH#7 finding).
  - `readHookInputCompat()` — lenient counterpart with `CLAUDE_*` env-var fallback + `tool → tool_name` alias for legacy hooks. Documented as lower-integrity trust boundary.
  - `appendAuditJsonl(path, row)` — locked NDJSON appender; cross-process safe via `fs.openSync(lockPath, 'wx')` (O_EXCL) + busy-wait exp backoff + PID-liveness stale reclaim. Lock timeout configurable via `HOOK_LOCK_TIMEOUT_MS` env (default 2000ms).
  - `atomicWrite(path, content)` — write-then-rename atomic file write via `.tmp.<pid>.<6hex>` intermediate (48-bit entropy floor). Wraps fs errors in `HookIOError` preserving original message.
  - `logger(scope)` — NDJSON-on-stderr structured logger gated by `HOOK_LOG_LEVEL` env. Routes to fd 2 via `fs.writeSync` (never `process.stderr.write`; stdout reserved for hook JSON responses).
  - `safeExit(code, reason?)` — sync stderr record + `process.exit`; uses `fs.writeSync(2, ...)` for guaranteed flush before exit.
  - `withBudget(ms, fn, {label?})` — race `fn()` against a `setTimeout` budget; rejects `HookBudgetTimeout` on timeout with `.finally(clearTimeout)` cleanup + silent catch on workPromise (no unhandled rejection).
- **`aura-frog/hooks/lib/__tests__/hook-runtime.test.cjs`** (1238 LOC) — 93 jest tests covering all exports + 5 error classes + back-compat re-exports + module shape. Includes subprocess-based concurrent-write contention test (10 parallel workers).
- **GH #6 acceptance** — `hooks/lib/hook-runtime.cjs` exists with 6 documented exports + unit tests pass.

### Security hardening (Phase 4 review)

- **CWE-117 (Improper Output Neutralization for Logs):** newline-escape attacker-controlled bytes in `meta.raw` on `invalid_json` errors so downstream raw-stderr loggers cannot forge audit log lines.
- **CWE-471 (Modification of Assumed-Immutable Data):** `readHookInput` returns deep-frozen objects so nested `tool_input` / `tool_response` cannot be mutated between gate validation and tool dispatch.
- **CWE-22 (Path Traversal):** `validateSafePath` rejects `..` segments in `auditPath` / `targetPath` arguments.
- **CWE-20 (Improper Input Validation):** `HOOK_LOCK_TIMEOUT_MS` is clamped to `> 0`; negative / zero / non-finite values fall back to 2000ms default (was: `parseInt(env) || 2000` accepted `-1` as truthy → silent audit drop).
- **CWE-330 (Insufficient Randomness):** `atomicWrite` tmp suffix uses `crypto.randomBytes(6)` (48-bit entropy) — was 24-bit.
- **CWE-807 (Reliance on Untrusted Inputs):** `readHookInputCompat` JSDoc explicitly flags env-var fields as lower trust boundary; security-critical hooks MUST use strict `readHookInput`.
- **CWE-362 (Race Condition):** stale-lock reclaim race window documented (benign; `O_EXCL` ensures only one winner). STORY-0011 SQLite WAL eliminates this surface.
- **CWE-772 (Missing Release of Resource):** `withBudget` abandon semantics documented — callers must use RAII or AbortController for OS resources.
- **GH #21** — `installWatchdog` NDJSON migration deferred to STORY-0010.

### Changed

- **`jest.config.cjs`** — `roots` extended with `aura-frog/hooks/lib/__tests__` so co-located test files are discovered without moving them into `__tests__/` at repo root.

### Plan-tree state

- New feature: **FEAT-007 hook-runtime-v3.8** (planned → in_progress).
- New stories: **STORY-0009 (active), STORY-0010, STORY-0011, STORY-0012** (planned, DAG: 9 → 10/11/12).
- 5 new T4 tasks under STORY-0009; **TASK-00023 done**; TASK-00024 + TASK-00025 unblocked (parallelizable), TASK-00026 blocked on 24, TASK-00027 blocked on 25+26.
- All 8 plan-tree invariants pass (52 nodes).

### Stats diff

- Hooks lib: 4 → 5 files (added hook-runtime.cjs)
- Hook tests: +1 file, +93 tests
- LOC added: +1891 (impl 653 + tests 1238)

### Migration / breaking changes

- **None.** `hook-runtime.cjs` is purely additive. All 42 existing hooks continue using `safe-stdin.cjs` re-exports byte-for-byte. STORY-0010 begins the migration to `readHookInput` for security-critical hooks; STORY-0010's final task deletes `safe-stdin.cjs`.

---

## [3.7.4] - 2026-05-15 (Documentation cleanup — zero-feature, zero-runtime-change)

> Polish release before v3.8. Doc-only — no new features, no agents added, no skills added, no hook changes. Eliminates 122 stale command references that accumulated during the v3.6 → v3.7 transition, ships two new CI gates to prevent doc rot from recurring, and slims the README by 45%.

### Added

- **`aura-frog/scripts/ci/validate-docs-syntax.sh`** — CI guard against pre-v3.7 verb syntax. 18 BLOCKED_PATTERNS covering the `workflow:*`-prefixed lifecycle verbs, the old `agent:` / `bugfix:` / `learn:` / `project:` namespaces, and the removed phase-hook MD paths. Wired into the `validate` job in `.github/workflows/ci.yml`. Exits 0 on this branch.
- **`aura-frog/scripts/ci/validate-doc-maturity.sh`** — CI guard against doc frontmatter drift. Every `docs/**/*.md` (except `docs/showcase/`, `docs/specs/`) must carry `last_aligned_with` + `status` + `audience`. `status=current` docs warn at diff > 2 minor versions. Wired into CI right after `validate-docs-syntax`.
- **`scripts/audit/stale-cmd-check.sh`** — Broader audit tool for contributors. 3-pass detection (verb syntax · `/aura-frog:*` namespaced · backticked bare `/word`). Knows about Claude Code built-ins (`/clear` / `/compact` / `/plugin` / etc.). Modes: `--json` / `--count` / `--quiet`. Idempotent.
- **`scripts/migrate-doc-frontmatter.sh`** — One-shot backfill of frontmatter to all `docs/**/*.md`. Idempotent; per-directory defaults. Run once during v3.7.4.
- **`scripts/add-ai-banner.sh`** — One-shot inserter for the AI-consumed reference banner on `aura-frog/skills/*/SKILL.md` and `aura-frog/rules/**/*.md`. Idempotent.
- **`docs/getting-started/README.md`** — Single ordered entry index for first-time users (QUICKSTART → GET_STARTED → FIRST_WORKFLOW_TUTORIAL).
- **`docs/operations/INSTALLATION.md`** — Supplementary install paths (CLI symlink, manual install, `.envrc`, `.gitignore` hygiene) extracted from the old 472-line GET_STARTED.md.
- **`docs/README.md` "Source of Truth" section** — declares `docs/` canonical when in conflict with `aura-frog/`. 8-entry canonical-source table covering 5-phase TDD / OS model / 8 Pillars / agent selection / MCP / learning / security / installation.
- **AI-consumed banner** on every skill + rule file — 127 files (56 SKILL.md + 71 rule .md) gained a one-paragraph header pointing readers at `docs/architecture/HIERARCHICAL_PLANNING.md` / `docs/getting-started/`.

### Changed

- **`docs/getting-started/GET_STARTED.md` rewritten 472L → 148L.** Frontmatter + Prerequisites → Install → Your first workflow → What's next → Troubleshooting. v3.7.x syntax throughout; old `workflow:*` examples replaced with current `/run` + bare-verb syntax.
- **`README.md` slimmed 1294L → 720L (44% reduction).** 8 Pillars per-pillar deep-dives (568L total) collapsed to one-paragraph summaries (92L). Command Reference (103L) → single 8-row table (21L). Installation Optional Setup (43L) → 6-line bullet list pointing at INSTALLATION.md. Walkthrough / Why-Teams / Agent-Selection / Token-Budget already extraction-shape from prior cleanup; their destinations unchanged here.
- **`docs/reference/TESTING_GUIDE.md` syntax refresh** — 31 pre-v3.7 `workflow:*` references replaced; methodology framework preserved; `Last Updated` bumped to 2026-05-14; frontmatter added.
- **Bulk syntax sweep across 12 docs** — `docs/getting-started/QUICKSTART.md`, `docs/getting-started/FIRST_WORKFLOW_TUTORIAL.md`, `docs/operations/LEARNING_SYSTEM.md`, `docs/operations/TROUBLESHOOTING.md`, `docs/guides/AGENT_SELECTION_GUIDE.md`, `docs/architecture/{WORKFLOW_STATE_MANAGEMENT,WORKFLOW_DIAGRAMS,CONFIG_LOADING_ORDER,CLAUDE_FILE_ARCHITECTURE,MULTI_SESSION_ARCHITECTURE,os-architecture}.md`, `docs/getting-started/TOKEN_BUDGET.md`. ~80 individual `workflow:*` / `agent:list` / `bugfix:quick` / `learn:*` / `project:reload-env` references replaced with current syntax.
- **35 docs files gained frontmatter** (last_aligned_with + status + audience) via `migrate-doc-frontmatter.sh`. Per-dir status: getting-started=current, architecture=reference, guides=needs_review (9 docs flagged), operations=current, reference=reference, marketing/pre-v*=archive, marketing/other=current.
- **`docs/README.md` index restructured** — Getting Started section now points at the new entry index; Architecture section drops `overview.md` and labels `os-architecture.md` canonical.

### Moved (archived, history preserved)

- `docs/guides/USAGE_GUIDE.md` → `docs/marketing/USAGE_GUIDE.pre-v3.7.md` (`git mv`). Archive header points at QUICKSTART / FIRST_WORKFLOW_TUTORIAL / HIERARCHICAL_PLANNING. 21 stale refs went away by archive.
- `docs/architecture/overview.md` → `docs/marketing/overview.pre-v3.0.md` (`git mv`). Archive header points at os-architecture.md / HIERARCHICAL_PLANNING.md / aura-frog/CLAUDE.md / MCP_GUIDE.md / SECURITY_AND_TRUST.md. Pre-v3.0 content (Linear MCP, `.claude/logs/workflows/` paths) preserved for v2.x → v3.x audit.

### Removed

- Outdated install-time content from GET_STARTED.md (CLI install, manual install, env-var setup, learning-system intro, MCP intro, scripts intro, "how it works" rehash) — relocated to INSTALLATION.md or already covered in `docs/operations/{MCP_GUIDE,LEARNING_SYSTEM,SECURITY_AND_TRUST}.md`.
- README's per-pillar deep-dive sections (560 lines) — content moved to `docs/reference/BENEFITS.md Part 9`.

### Fixed

- 122 stale command references eliminated (116 caught by `validate-docs-syntax.sh`, 6 additional `/learn` bare-slash hits caught by the broader audit script).
- `docs/getting-started/TOKEN_BUDGET.md:24` — dropped stale `/run predict <task>` reference (command does not exist).
- `docs/operations/LEARNING_SYSTEM.md` `//af learn` double-slash artifact (introduced by sed sweep) corrected.

### CI

- Validate job in `.github/workflows/ci.yml` now runs 5 doc validators in sequence: `validate-toon` → `validate-config` → `validate-counts` → `check-broken-links` → `validate-readme-counts` → **`validate-docs-syntax`** (new) → **`validate-doc-maturity`** (new).

### Stats diff vs v3.7.3

- Agents: 15 (unchanged)
- Skills: 56 (unchanged) — all 56 SKILL.md files gained AI-consumed banner
- Rules: 71 (unchanged) — all 71 rule files gained AI-consumed banner
- Commands: 24 (unchanged)
- Hooks: 43 (unchanged)
- New scripts: 5 (`validate-docs-syntax.sh`, `validate-doc-maturity.sh`, `stale-cmd-check.sh`, `migrate-doc-frontmatter.sh`, `add-ai-banner.sh`)

### Plan tree (FEAT-006)

This release shipped as `FEAT-006 — Docs Cleanup & Reference-Integrity Sweep` under `INIT-001`. 8 stories: audit + decisions (STORY-0001), Phase A CI guard (STORY-0005), Phase B sweep + onboarding (STORY-0002), Phase C hierarchy consolidation (STORY-0003), Phase D README extraction (STORY-0006), Phase E maturity infrastructure (STORY-0007), Phase F AI/human boundary (STORY-0008), and close + version bump (this story — STORY-0004). All 19 T4 tasks closed in two sessions (audit / replan / Phase A + sweep / GET_STARTED / Phase C-F + close).

### Post-release follow-up — 2026-05-15 (per-step model tracking)

> Lands after the v3.7.4 doc-cleanup main release. No version bump. Pure observability addition — fail-open hooks, idle statusline output unchanged.

#### Added

- **`aura-frog/hooks/task-track-model.cjs`** — PreToolUse(Task) hook. Resolves the dispatched subagent's `model:` frontmatter, maps it to a short label (e.g. `claude-sonnet-4-6 → Sonnet 4.6`), and pushes a JSONL entry onto `.aura-frog/runtime/model-stack.jsonl`. Handles the `aura-frog:` plugin prefix; treats built-ins (Explore / general-purpose / Plan / statusline-setup) as silent no-ops.
- **`aura-frog/hooks/task-clear-model.cjs`** — PostToolUse(Task) hook. Pops the most-recent JSONL line; removes the file when the stack reaches zero. Atomic `write tmp → rename`.
- **`.aura-frog/runtime/.gitignore`** — gitignores `model-stack.jsonl` and similar transient runtime files; the .gitignore itself stays tracked.
- **`__tests__/hooks/task-track-model.test.cjs`** — jest, 41 tests covering pure helpers (model display mapping, frontmatter parse, prefix normalize, agent resolve, push/pop) + end-to-end `processPreToolUse` / `processPostToolUse`.
- **`aura-frog/docs/statusline-model-tracking.md`** — 80-line user explainer with ASCII diagram + disable + extend sections.

#### Changed

- **`aura-frog/scripts/statusline.sh`** — adds a `render_active()` block. When `.aura-frog/runtime/model-stack.jsonl` is non-empty, renders `🐸 AF v{ver} │ ▶ {phase} │ {step_model} ⏱{duration} │ session: {session_model} │ {ctx}% ctx`. When empty (or corrupted last line, or jq missing), falls through to the existing idle render byte-identically. Duration formatter handles `Ns` / `MmSSs` / `HhMMm`; UTC parsing fixed for macOS BSD `date`.
- **`aura-frog/hooks/hooks.json`** — registers both new hooks under `matcher: "Task"` (Pre + Post), async, `2>&1`. No other hook entries touched.

#### Stats diff (post-release)

- Hooks: 43 → **45** (+2)
- Tests: 368 → **409** (+41); all green; no regressions; lint clean on new files
- Version: 3.7.4 (unchanged)

---

## [3.7.3] - 2026-05-12 (Plan relocation + run linking + test-pyramid + statusline transparency)

> A consolidated release bundling six tightly-coupled shipments since v3.7.2:
>
> 1. **Plan storage restructure** — `.aura/plans/` → `.claude/plans/`, slug-aware folder schema, bidirectional run↔feature linking (PR #16).
> 2. **TTY-hang fix** — 14 hooks that called `fs.readFileSync(0)` could block forever when stdin is a TTY; now gated by `fstatSync(0)` via the new `hooks/lib/safe-stdin.cjs` helper, with Node 20/22 restored to the CI matrix (PR #17).
> 3. **README hygiene** — five stale counts corrected, 419 lines moved from `README.md` into `docs/*` (Walkthrough, Token Budget, Agent Selection, "Why Teams Ship Faster"), plus the new `validate-readme-counts.sh` CI guard (PR #18).
> 4. **Statusline transparency + agent announcements** — cost segment removed, `mode {step}` and `agent` surfaced from `run-state.json`, every phase/step dispatch must announce builder/reviewer/gate to the user (PR #19).
> 5. **E2E test-gap fix** — Phase 2 now picks the test layer (unit/integration/e2e) before writing, Playwright is the recommended e2e default with MCP integration, and UI/auth/payment tasks must add at least one e2e spec (PR #20).
> 6. **Skill-vs-Agent disambiguation** — fixes the `Agent type 'aura-frog:bugfix-quick' not found` error class by adding ⚠️ callouts in CLAUDE.md, commands, and SKILL files (also PR #4 skill review optimization upstream).

### Changed (storage layout)

- **Default plans dir: `.aura/plans/` → `.claude/plans/`.** Resolution order in scripts: explicit positional arg → `$AF_PLANS_DIR` env var → `.claude/plans/` (default) → `.aura/plans/` (legacy fallback, removed in v4.0).
- **Feature folder schema:** flat `features/FEAT-A.md` → folder `features/{ID}_{slug}/feature.md`. Same for stories (`stories/{ID}_{slug}/story.md`) and tasks (`tasks/{ID}_{slug}.md`). If a JIRA / Linear / GitHub ticket ID is attached, it's used as the prefix; otherwise the plan-orchestrator mints `FEAT-N` / `STORY-NNNN` / `TASK-NNNNN`.
- **`new-plan.sh`** writes a new `INDEX.md` on first init documenting the layout, naming convention, run-feature linking, commands, and migration path from the legacy location.

### Added (run ↔ feature linking)

- **`scripts/plans/link-run.sh`** — two-sided helper: writes `feature_id` + `feature_slug` + optional `anchor.task_id` to `run-state.json` AND appends an idempotent row to the feature's `## Runs` table. Subcommands: `link`, `unlink` (marks discarded, doesn't delete), `list`.
- **`run-state.json` gains `feature_id`, `feature_slug`, `feature_linked_at`** (and `anchor.task_id` when a specific T4 is anchored). Surfaces in `/run status` and `/run resume`.
- **`feature.md` gains a `## Runs` section** listing every `/run` invocation against the feature with status (in_progress / done / discarded) + start timestamp + anchor task. Auto-managed by `link-run.sh`.
- **`/run feature: FEAT-A <task>`** prefix anchors a new run to a feature. `run-orchestrator` Step 0c writes both sides of the link.
- **`/run resume <FEATURE_ID>`** lists runs under a feature and prompts to pick one (or auto-resumes the single in-progress run).
- **Phase 5 updates the link.** On finalize, `link-run.sh link <run-id> <feature> --status done` replaces the in-progress row.

### Helper functions in `_lib.sh`

- **`slugify <text>`** — lower-case ASCII kebab-slug, capped at 50 chars.
- **`feature_folder <id> <intent>`** — composes `{ID}_{slug}` for consistent folder naming.
- **`plans_dir [explicit]`** — 4-level resolution (arg → env → default → legacy fallback) replacing the old hardcoded `.aura/plans` default.

### Tests

- **+5 new unit tests in `plans.test.cjs`** covering `link-run.sh`: link writes both sides, idempotent re-link, list output, missing run-state refusal. Total plan-script tests now 43 (was 38).
- Existing 38 plan-script tests + 64 bare-word-router tests still green.

### Path sweep (35 files)

`.aura/plans/` → `.claude/plans/` (and `.aura/memory/` → `.claude/memory/`) across 8 agent files, 9 hooks, 12 skills, 7 rules, 11 command files, the dashboard script, and CLAUDE.md. `.aura/security/mcp-audit.jsonl` stays where it is — MCP audit is a separate concern from plans.

### Migration path

No automatic content migration — the script ships with this notice on first init:

```
ℹ Legacy .aura/plans/ detected. To migrate:
ℹ   mv .aura/plans .claude/plans
ℹ Or set AF_PLANS_DIR=.aura/plans to keep using the legacy location.
```

The legacy `.aura/plans/` fallback in `plans_dir()` is removed in v4.0.

### Deprecation timeline

- v3.7.3 (this release): `.claude/plans/` is the default. `.aura/plans/` works via fallback (with stderr warning).
- v4.0: `.aura/plans/` fallback removed. Must set `AF_PLANS_DIR=.aura/plans` to keep using the legacy location.

### Fixed — TTY hang in 14 hooks (PR #17)

- **Root cause** — `fs.readFileSync(0)` blocks indefinitely when stdin is an interactive terminal (no EOF arrives, no exception thrown). Symptom: Ubuntu Node 20/22 jobs in CI hung for 10+ minutes before the workflow timed out; locally the hook never returned.
- **`hooks/lib/safe-stdin.cjs`** — new helper that uses `fs.fstatSync(0)` to detect whether stdin is a pipe/FIFO. Returns the parsed JSON when piped; returns `null` immediately when stdin is a TTY. Synchronous, zero deps, ≤20 lines.
- **14 hooks swept** — every `readFileSync(0, 'utf8')` call in `hooks/*.cjs` replaced with `require('./lib/safe-stdin')()`. Hooks that need stdin (most `UserPromptSubmit` hooks) now no-op when invoked interactively instead of hanging.
- **CI matrix restored** — `.github/workflows/test.yml` re-adds Node 20.x + 22.x (removed in `027c2e0` while the hang was unexplained). Per-job SIGKILL timeout from `8a3fa1c` retained as belt-and-braces.

### Fixed — Stale counts + README cleanup (PR #18)

- **Five stale count references corrected** across `README.md` and `aura-frog/CLAUDE.md`: 55→56 skills, 70→71 rules, 42→43 hooks, 9→15 agents, 6→24 commands.
- **`scripts/ci/validate-readme-counts.sh`** — new CI guard with three surgical grep patterns (Markdown bold table cells, `[All Components (N)]` link labels, colon-aligned summaries) that scope the check tightly enough to avoid false positives on narrative prose. Wired into `.github/workflows/test.yml`.
- **README slimmed 1493 → 1074 lines (−419)** — four sections relocated to `docs/`:
  - "Walkthrough: Standard Path" → `docs/walkthrough/STANDARD_FLOW.md`
  - "Token Budget Reality" → `docs/guides/TOKEN_BUDGETS.md`
  - "Agent Selection" → `docs/guides/AGENT_SELECTION.md`
  - "Why Teams Ship Faster" → `docs/marketing/WHY_TEAMS_SHIP_FASTER.md`
- **Banner PNG preserved** — `assets/logo/github_banner.png` checksum unchanged; an accidental recompression during PR rebase was reverted before merge.

### Added — Statusline transparency + per-step agent announcements (PR #19)

- **New statusline format:** `🐸 AF v{version} │ {mode} {step} │ {agent} │ {model} │ {ctx}% ctx`
  - **mode** — read from `run-state.json#flow` (specific: `feature-deep`, `bugfix`, `refactor`, `test`, `security`, `review`, `deploy`, `quality`); falls back to `#complexity` (Quick/Standard/Deep/Project); `idle` when no in-progress run.
  - **step** — `P{N}` for 5-phase Deep runs (from `current_phase`); `S{N}` for bugfix's 4-step TDD (`current_step` ∈ `investigate`/`test-red`/`fix-green`/`verify`); omitted for quick/idle.
  - **agent** — `run-state.json#active_agent`, updated by run-orchestrator at every dispatch; falls back to last entry in `agents[]` array, then the session-start cache.
  - **cost segment removed** — Claude Code's `total_cost_usd` is real but adds visual noise without per-call breakdown. Use `/af status` for a richer cost+token report.
- **Mandatory builder/reviewer/gate announcements** — run-orchestrator must emit `─── Phase {N} · {Name} ─── Builder: {agent} · Reviewer: {agent}` at every phase boundary and `─── Step S{N} · {Name} ─── Dispatching {agent}…` at every bugfix step transition. Updates `run-state.json#active_agent` so the statusline reflects reality.

### Added — E2E test-gap fix (PR #20)

- **`skills/test-writer/SKILL.md#test-type-selection`** — new section forcing Phase 2 to decide unit vs integration vs e2e BEFORE writing. Trigger words requiring an e2e layer: `login`, `signup`, `checkout`, `payment`, `flow`, `journey`, `end-to-end`, `happy path`, `smoke test`, UI-bearing tasks, T2 features with user-visible acceptance criteria.
- **`skills/run-orchestrator/SKILL.md`** — Phase 2 now runs the test-type selection step explicitly. Cannot silently default to unit-only on UI/auth/payment tasks; must surface "no e2e runner detected — install playwright, use cypress, or `unit-only` to proceed" prompt when needed.
- **`agents/tester.md`** — adds "Test Pyramid (v3.7.4+) — pick the layer FIRST" section + `playwright` MCP usage guidance + runner-verification discipline (read pass/fail counts; "Tests passed" without a count = `0 tests collected` bug).
- **`skills/bugfix-quick/SKILL.md`** — Step 2 (Test RED) now includes "Pick the right layer" — UI / user-flow / auth / payment regressions get an e2e spec via Playwright MCP, not a unit test that won't actually reproduce it.

### Added — Skill-vs-Agent disambiguation

- **CLAUDE.md, `commands/run.md`, `skills/test-writer/SKILL.md`, `skills/bugfix-quick/SKILL.md`** — explicit ⚠️ callouts that `bugfix-quick`, `test-writer`, `run-orchestrator` etc. are **skills** (Skill tool), not **agents** (Agent tool). Calling them via `subagent_type: 'aura-frog:<name>'` errors with "Agent type not found". This fixes the most common new-user error class.

### Path sweep (35 files, expanded scope)

`.aura/plans/` → `.claude/plans/` (and `.aura/memory/` → `.claude/memory/`) across 8 agent files, 9 hooks, 12 skills, 7 rules, 11 command files, the dashboard script, and CLAUDE.md. `.aura/security/mcp-audit.jsonl` stays where it is — MCP audit is a separate concern from plans.

### Stats diff

| | v3.7.2 | v3.7.3 |
|---|---:|---:|
| Agents | 15 | 15 |
| Skills | 56 | 56 |
| Rules | 70 | 71 (+test-pyramid section, no new rule file) |
| Commands | 24 | 24 |
| Hooks | 43 | 43 (14 swept for TTY safety, no count change) |
| Backing scripts | 12 | 13 (+`link-run.sh`) |
| Tests | 317 | 322 (+5 link-run unit tests) |
| CI guards | 2 | 4 (+validate-readme-counts.sh, +Node 20/22 restored) |

### Merged PRs in this release

- #4 — Skill review optimization (upstream contributor)
- #16 — `.claude/plans/` relocation + slug folder schema + run↔feature linking
- #17 — TTY-hang fix via `fstatSync`-gated stdin reader
- #18 — Stale README counts, four sections relocated to `docs/`, two new CI checks
- #19 — Statusline transparency + mandatory agent announcements
- #20 — E2E test-gap fix (Phase 2 picks layer, Playwright not silently skipped)

---

## [3.7.2] - 2026-05-11 (Plan consolidation)

> Consolidates `/aura-frog:plan-*` (10 verbs) under a single dispatcher backed by the new `plan-orchestrator` skill. Ships the 9 backing scripts the existing command files always promised. Adds bare-word activation when a plan is active, plus `/run` intelligent escalation for project-scope tasks.

### Added

- **`skills/plan-orchestrator/SKILL.md`** — verb_table[11], intent_keywords[11], 3-stage routing pipeline (explicit verb → intent classifier → LLM fallback). Single owner of the plan-vocabulary dispatch.
- **`scripts/plans/_lib.sh`** — shared helpers (atomic write, get/set frontmatter, save_checkpoint, append_history, next_counter, bump_revision) with macOS BSD sed compatibility (Python fallback for JSON ops).
- **`scripts/plans/resolve-node.sh`** — node lookup: exact ID, lowercase normalisation, title-substring fallback, `--active`/`--feature`/`--story`/`--initiative` special tokens. Exit 0 single / 1 multi / 2 none.
- **9 new backing scripts** under `scripts/plans/` — `expand-node` (T1→T2→T3→T4 prep), `next-task` (pop next ready T4), `freeze-branch` (cascade-freeze descendants), `thaw-branch` (reverse freeze with conflict-resolution gate), `archive-feature` (compress completed T2+), `conflicts-scan` (list/show/resolve/history/check), `replan-node` (budget-aware), `promote-node` (bubble T4 discovery up), `undo-decision` (LIFO checkpoint restore).
- **`hooks/bare-word-router.cjs`** — UserPromptSubmit hook that fires only when `.aura/plans/active.json` exists. Routes verb-first prompts (≤5 words, first token ∈ 11-verb vocab) to `/aura-frog:plan <prompt>`. Async, ≤100ms cold-start, never blocks. Opt-out via `AF_BARE_WORD_ROUTER_DISABLED=true`.
- **`/run` intelligent escalation** — `rules/workflow/run-plan-bridge.md` extended to 8 triggers (added `word_count` weight 1 + `scope_verbs` weight 2). At weight ≥ 3 without an active plan, `run-orchestrator` Step 0 emits a 3-option prompt (`plan` / `deep` / `details`). On `plan`, writes `.claude/cache/pending-plan-bootstrap.json` with mission seed + feature seeds, then invokes `/aura-frog:plan`. Override prefixes: `/run task: <desc>`, `/run project: <desc>`. Opt-out: `AF_ESCALATION_DISABLED=true`.
- **`Project` complexity level** in `agent-detector` (only fires when bridge weight ≥ 3 + no plan; Quick/Standard/Deep classification unchanged otherwise).

### Updated

- **`commands/plan.md`** — rewritten as the single dispatcher. Documents 3-stage routing, power-user shortcuts, bare-word activation, override prefixes (`must do:` / `just do:` / `exactly:`), and the pending-plan-bootstrap.json consumption flow.
- **`commands/plan-{expand,next,status,replan,promote,archive,undo,freeze,thaw,conflicts}.md`** — collapsed to ~20-line alias stubs that delegate to `plan.md`. Each file documents the deprecation timeline (soft v3.7.2 → warning v4.0 → removed v5.0).
- **`commands/run.md`** — documents the new escalation step, override prefixes, and `AF_ESCALATION_DISABLED` env var.
- **`skills/run-orchestrator/SKILL.md`** — adds Step 0 (Escalation Check) before run-state creation (renamed Step 0b). Documents the `pending-plan-bootstrap.json` schema.

### Tests

- **`__tests__/scripts/plans.test.cjs`** — 38 unit tests against the 9 backing scripts + resolve-node.sh, using temp `.aura/plans/` fixtures. All scripts shelled out via spawnSync; assertions on observable file/JSON state.
- **`__tests__/hooks/bare-word-router.test.cjs`** — 64 tests (8 verbs × 3 cases each per the issue spec + override/plan-active/latency/crash recovery). 85% statements / 100% functions coverage. Imports via `require()` from production source (no test theater).
- Full suite: 255 + new tests pass; coverage gate unchanged at 25% floor.

### Stats diff

| | v3.7.1 | v3.7.2 |
|---|---:|---:|
| Skills | 55 | **56** (+plan-orchestrator) |
| Hooks | 42 | **43** (+bare-word-router) |
| Commands | 24 | 24 (alias stubs retained for backwards compat) |
| Backing scripts | 3 | **12** (resolve-node + _lib + 9 new) |
| Tests | 215 | **317** (+102 plan + bare-word) |

### Deprecation timeline

- `/aura-frog:plan-{expand,next,status,replan,promote,archive,undo,freeze,thaw,conflicts}` (10 aliases): **soft-deprecated v3.7.2**, warning emitted v4.0, removed v5.0. New users should prefer the consolidated `/aura-frog:plan <verb>` form. The bare-word activation (`next`, `expand FEAT-A`, etc.) works with both.

### Migration notes

- No breaking changes. Every legacy `/aura-frog:plan-<verb>` invocation continues to work via the alias stubs, which now delegate to the new backing scripts.
- Projects with `.aura/plans/active.json` will see the bare-word router suggest routes for verb-first prompts. To opt out: `export AF_BARE_WORD_ROUTER_DISABLED=true`.
- Multi-feature `/run` invocations will see the escalation prompt. To opt out per-session: `export AF_ESCALATION_DISABLED=true`. To force-bypass for one invocation: prefix with `task:` or `project:`.

### Documentation (catch-up)

- **README rewrite from v3.7.0 baseline** — Version badge bumped 3.7.0 → 3.7.2; "What's new" section restructured around the v3.7.2 plan consolidation + /run escalation + bare-word router (with a collapsed v3.7.0-highlights subsection for context). 8 Pillars status table updated (Tier 2 OPA / L3+L4 / auto-trigger moved from `v3.7.2+` to `v3.8+`). Command Reference section adds the consolidated `/aura-frog:plan <verb>` form. The Numbers table reflects updated counts. New "Honest Maturity Report" section discloses tech debt with references to issues #6/#7/#8/#9.
- **MIGRATION_TO_V3.7.md** — v3.7.2 changes prepended at the top (consolidation + bare-word + escalation), keeping the v3.7.0 historical section intact below for users still on v3.6.x.
- **LICENSE** — repo was missing the LICENSE file referenced in README. MIT license added.
- **Pre-rewrite README backup** — preserved at `docs/marketing/README.pre-v3.7.2-rewrite.md`.

---

## [3.7.1] - 2026-05-11 (CI stabilization)

> **Patch release.** An external senior review pulled HEAD post-v3.7.0 and found CI was red — the `|| true` masks we removed in v3.7.0 polish exposed three pre-existing script bugs and one ESLint v9 break. v3.7.1 closes them so CI is green on `main` and contributor PRs don't fail spurious checks. Zero behavioural change to runtime; this is plumbing.

### Fixed

- **`validate-toon.sh` exits cleanly under `set -e`** — nine occurrences of `((var++))` rewritten as `var=$((var+1))`. `((expr))` returns exit code based on the *evaluated* value, so post-incrementing from 0 returned 1 → `set -e` aborted silent. Counters survived in a subshell when the `find | while` pattern was used — rewrote as `while … < <(find …)` so `FILES_CHECKED` / `ERRORS` propagate. Default target is now `aura-frog/` instead of `.` (skips `node_modules/`, `.claude/`, `.aura/`, `.git/`, `coverage/`). Result: 221 files scanned, 0 errors locally.
- **`validate-config.sh` skips when file absent** — `ccpm-config.yaml` only exists in user projects, never in the plugin repo. Previously hard-failed; now exits 0 with an informational "skipping (normal for the plugin repo)" message. Still fails properly when the file exists and is malformed.
- **ESLint v9 flat config migration** — `.eslintrc.cjs` (legacy format, deprecated in v9.0) replaced with `eslint.config.js`. `package.json#scripts.lint` drops the `--ext .cjs` flag (no longer supported in flat config). Rule set unchanged. `npm run lint` now exits 0 with 93 informational warnings, 0 errors.
- **`generate-stats.sh` emits object form for `mcpServers`** — was hardcoded `"mcpServers": 6` which got out of sync with the `{total: 8, enabled: 6}` schema we standardised on. Now grep-counts entries + `disabled: true` flags in `.mcp.json` and emits the object. Regex fix: `[a-z0-9_-]` (includes digit + underscore) so `context7` doesn't get missed.
- **TOON drift across 6 files** — exposed once `validate-toon.sh` actually ran: `hooks[28]` → `[29]`, `scripts[26]` → `[34]`, `signals[4]` → `[5]`, `final_plan[8]` → `[9]`, `per_server[6]` → `[8]`, `patterns[12]` → `[7]`. Multi-table-in-one-fence patterns (which the validator's state machine doesn't handle) split into separate fences in `execution-rules.md`, `theme-consistency.md`, `mcp-response-logging.md`.
- **Forward-version markers** — `v3.7.1+` queued labels updated to `v3.7.2+` (since v3.7.1 *is* this release; Tier 2 OPA + L3/L4 LLM conflict + auto-trigger self-heal are queued for v3.7.2+).

### Verified locally — all 5 CI steps green

| Step | Result |
|---|---|
| `validate-toon.sh` | exit 0 · 221 files · 0 errors |
| `validate-config.sh` | exit 0 (skipped — file absent, normal) |
| `validate-counts.sh` | exit 0 · all counts match |
| `npm run lint` | exit 0 · 93 warnings · 0 errors |
| `npm test -- --coverage` | exit 0 · 215 tests · coverage above threshold |

---

## [3.7.0] - 2026-05-11 (Stable — Marketplace Publish)

> **First stable release of the v3.7.0 hierarchical-planning track.** All 5 milestones (A-E) shipped through 7 internal pre-releases (alpha.1, alpha.2, alpha.3, alpha.4, beta.1, beta.2, rc.1). This is the marketplace publish.

### Headline

**A planning-first LLM OS for software engineering.** Plans persist across sessions; every Claude decision is forensically reproducible; conflicts are detected before silent overwrites; backward-compatible — your existing `/run` workflow continues unchanged.

### 🐸 The 8 Pillars (feature highlights)

v3.7.0 lands eight composable features organized into four themes. Full marketing breakdown in [README.md § The 8 Pillars](../../README.md#-the-8-pillars-of-the-planning-first-llm-os) and engineering depth in [BENEFITS.md Part 9](BENEFITS.md#part-9--the-8-pillars-of-the-planning-first-llm-os-v370).

| # | Pillar | Status | What it solves |
|---|---|---|---|
| 1 | **Hierarchical Planning** | ✅ | Plans survive session reset · `/compact` · machine restart |
| 2 | **Reasoning Trace Audit** | ✅ | Hallucinations caught before they ship (sha256-anchored evidence) |
| 3 | **Semantic Session Reset** | ✅ | Distill an Epic into permanent memory, then reset cleanly |
| 4 | **Pre-flight Validation** | ✅ Tier 1 · 🚧 Tier 2 OPA | Block bad AI output before it hits disk |
| 5 | **Semantic Conflict Detection** | ✅ L1+L2 · 🚧 L3+L4 LLM | Prevent silent overwrites between parallel tasks |
| 6 | **Self-Healing Orchestrator** | ✅ manual · 🚧 auto-trigger | Auto-diagnose F2/F3 failures; propose patches, never auto-apply |
| 7 | **MCP Security Layer** | ✅ | Per-agent allowlist + audit + rate limits for external integrations |
| 8 | **Phase-Role Binding** | ✅ | Phase 4 reviewer MUST differ from Phase 3 builder (Generator ≠ Evaluator) |

Each pillar is independently disable-able via env var. See *Disable mechanisms* section below.

### Stats (v3.6.1 → v3.7.0)

| Component | v3.6.1 | v3.7.0 | Delta |
|---|---:|---:|---:|
| Agents | 9 | **15** | +6 |
| Skills | 44 | **55** | +11 |
| Auto-invoke skills | 5 | **9** | +4 |
| Rules | 57 | **70** | +13 |
| Commands | 6 | **24** | +18 |
| Hooks | 28 | **42** | +14 |
| MCP servers | 6 | **8** | +2 |
| Scripts | ~43 | **55** | +12 |

### What shipped (across the 7 internal pre-releases)

- **alpha.1** — Hierarchical planning foundation: T0-T4 schema, plan-loader (auto-invoke), `master-planner` / `feature-architect` / `story-planner` agents, 8 planning commands, plan-tree validator with 8 invariants, byte-identical round-trip
- **alpha.2** — Failure handling + reasoning trace: F1-F5 deterministic classifier, `replanner` agent, `reasoning-trace-recorder` (auto-invoke), `/aura-frog:trace` with hallucination surface, grounding-discipline rule, checkpoint discipline + `/aura-frog:plan-undo` with git_sha rollback
- **alpha.3** — Project-level extension creation: `extension-detector` (auto-invoke), `/aura-frog:extend` command, `extension-policy` rule — auto-detect when a new skill/rule/command would help, confirm with user, create at `.claude/` (NEVER plugin-level)
- **alpha.4** — Memory tier: `epic-summarizer` agent (T2 done → permanent_memory), `permanent-memory-loader` (auto-invoke, ≤120 tokens), `plan-archivist`, `/aura-frog:reset-session`. **Plus: deterministic JSON→TOON projection hook** (saves tokens vs. AI-side projection rule)
- **beta.1** — Pre-flight Tier 1: 7 bash linters (frontmatter, tool-input, tool-output, path-safety, command-allowlist, secret-patterns, run-all), `pre-flight-validate.cjs` hook (blocks `rm -rf /`, hostile paths, credential leaks), single-use bypass with `/aura-frog:preflight bypass`
- **beta.2** — Conflict detection + freeze: L1 (file overlap) + L2 (function overlap) bash detectors, `conflict-arbiter` agent, F6 class, 3 conflict commands (`/aura-frog:plan-freeze`, `:thaw`, `:conflicts`), branch freeze cascade (descendants only per spec §13.1)
- **rc.1** — Self-healing + MCP security: `self-healing-orchestrator` (F2/F3 only, ≥0.7 confidence, NEVER auto-applies), `mcp-call-gate.cjs` (per-agent allowlist, rate limits, sanitized audit), `db-access-policy` + `mcp-security-policy` rules, Phase 4 ≠ Phase 3 builder HARD RULE, `/aura-frog:dashboard`

### Stable polish (this release)

- **MCP allowlists on all 9 baseline agents** (security=[], scanner=[], lead=[], strategist=[context7], devops=[firebase,slack], tester=[vitest,playwright], frontend=[context7,figma,playwright], mobile=[context7,figma,playwright], architect=[context7,postgres,redis]) — gate now actually enforces, not just defaulted to backward-compat
- **README rewrite** — lead with `/aura-frog:plan` + v3.7.0 systems overview; `/run` documented as lightweight mode for one-off tasks
- **`MIGRATION_TO_V3.7.md`** — single comprehensive migration doc: what's new, what's backward-compat, opt-in features, breaking-ish changes, env var inventory, deferred work
- Version files bumped 3.7.0-rc.1 → **3.7.0**

### Backward compatibility (per spec §2 — MINOR bump)

- `/run <task>` works exactly as before
- Existing 9 agents continue to work (now with explicit `mcp_servers:` allowlists)
- Existing 6 commands unchanged
- 5-phase TDD workflow preserved (now maps to T3 Story lifecycle when planning is active)
- `.envrc` env vars all preserved; new ones added (see migration guide)
- `.mcp.json` schema preserved; 2 new servers added (postgres, redis) both `disabled: true` by default
- All existing skills/rules/hooks preserved

### Disable mechanisms (every new feature has one)

```
AF_SELF_HEAL_DISABLED=true       — disable self-healing
AF_MCP_AUDIT_DISABLED=true       — disable MCP audit log (still enforces)
AF_TRACE_DISABLED=true            — disable reasoning trace
AF_PREFLIGHT_DISABLED=true        — disable pre-flight (strongly discouraged)
AF_CONFLICT_LLM_DISABLED=true     — already off in rc.1 (L3/L4 stubs)
AF_JSON_TOON_DISABLED=true        — revert to raw JSON in context
```

### Fixed (deliverable scaffolding — 2026-05-11)

Real user-reported gap: `/run` created `run-state.json` but never materialised the per-phase markdown deliverables the `workflow-deliverables.md` rule requires (REQUIREMENTS.md, TECH_SPEC.md, TEST_PLAN.md, etc.). Run dirs were empty except for run-state.json — the orchestrator's `deliverables[]` array tracked metadata but no actual .md files hit disk.

- **NEW `aura-frog/scripts/workflow/scaffold-phase-deliverables.sh`** — idempotent script. `bash scaffold-phase-deliverables.sh <run-id> <phase|all>` creates the phase's markdown skeletons from `aura-frog/templates/` (or a minimal frontmatter+sections fallback). Phase 1 → REQUIREMENTS / TECH_SPEC / TECH_SPEC_CONFLUENCE / DESIGN_DECISIONS. Phase 2 → TEST_PLAN / TEST_CASES. Phase 3 → IMPLEMENTATION_NOTES / FILES_CHANGED. Phase 4 → CODE_REVIEW / REFACTOR_LOG. Phase 5 → QA_REPORT / IMPLEMENTATION_SUMMARY / CHANGELOG_ENTRY. Total 13 files / 5 phases.
- **5 new templates added** to bring template count 15 → **20**: `code-review.md`, `qa-report.md`, `changelog-entry.md`, `implementation-notes.md`, `files-changed.md` (frontmatter + section headers + TODO markers, ready to fill in).
- **run-orchestrator/SKILL.md gets Step 0.5** — runs the scaffold after run-state.json is written (Phase 1) and on every phase transition. Skip for Quick/direct-edit runs only.
- **workflow-deliverables.md rule** updated with the new scaffold workflow + backfill instructions for pre-v3.7.1 runs.
- **3 existing runs in this repo backfilled** (`cleanup-260511`, `review-fix-260511`, `marketing-doc-260511`) — each now has 14 files (run-state.json + 13 phase deliverables) vs. the pre-fix 1 file.
- **Idempotent** — running the scaffold twice on the same phase prints "0 added", so it's safe to call on phase re-entry / resume / modify / reject without trashing user content.

### Fixed (re-review polish — 2026-05-11, ~4h after first patch batch)

A second senior review pulled the post-fix tree and flagged 7 remaining findings (1 hot: test theater; 2 cold; 4 polish). This commit closes the highest-ROI ones.

- **Test theater killed.** All 6 hook tests (`scout-block`, `prompt-reminder`, `scope-drift`, `security-scan`, `smart-learn`, `token-tracker`) now `require()` the production hooks directly instead of re-declaring the functions inline. Each hook source got a `if (require.main === module) main(); else module.exports = {...};` guard so `main()` only runs when the file is invoked as a script. Verified end-to-end: `npx jest --coverage` reports **31.76% statement coverage** across the 6 hooks (was **0%** before — review's #1 concern). 215 tests pass against real source.
- **Coverage gate in CI.** `jest.config.cjs` gains `coverageThreshold` (statements 25 / branches 20 / functions 40 / lines 25 — set as no-regression floor at current measured level). `ci.yml` now runs `npm test -- --coverage` so the threshold gates builds. As more hooks get tests (issue [#5](https://github.com/nguyenthienthanh/aura-frog/issues/5)), the floor ratchets up toward the senior review's 60% target.
- **`tool-call-tracer` real O(1) fix.** Replaced the half-measure in-memory counter (which the reviewer correctly identified as a per-invocation cache, not an actual O(n²) fix because each hook is a fresh Node process) with a sibling `.aura/plans/traces/{TASK_ID}.count` file. Atomic write via tmp+rename. Each event reads 4 bytes, not the full trace. True O(1) per event over a task lifetime.
- **`mcp-call-gate` no longer fails open silently when agent identity is unknown.** Order: stdin JSON `data.agent / data.agent_name / data.subagent_type` → `CLAUDE_AGENT_NAME` env var → fallback `'main'` (backward-compat). When BOTH stdin and env are absent, a one-time stderr warning is emitted (`.claude/logs/.mcp-agent-hint-shown` flag-file prevents spam) so admins notice the gate is in allow-all mode rather than mistakenly trusting the "per-agent security" claim. Smoke-tested: stdin `{"agent":"architect"}` against a non-allowlisted MCP blocks correctly.
- **`hooks.json` duplicate `"async": true`** on the lint-autofix entry — removed. Caused by an earlier copy-paste; JSON.parse tolerated it but it signalled missing linter discipline.
- **`stats.json` mcpServers semantic** — changed from scalar `6` (enabled-only) to `{ total: 8, enabled: 6 }` so the same number doesn't mean two different things across `stats.json` and `CLAUDE.md`/manifest.

### Security (post-release polish — 2026-05-11)

- **`.envrc` trust gate (HIGH-severity fix)** — closes the auto-source-of-untrusted-file finding from the senior review. New helper `aura-frog/scripts/envrc-guarded-source.sh` only sources `$PWD/.envrc` when its sha256 matches an entry in `~/.config/aura-frog/envrc-trust.json`. All 8 inline `if [ -f .envrc ]; then set -a; source .envrc; …; fi` hook commands in `hooks.json` now call the gate. New CLI: `af envrc allow|revoke|status|list`. Tampering with a previously-trusted `.envrc` invalidates the trust (hash mismatch → skip). Opt-out for legacy behavior: `AF_ENVRC_UNSAFE_AUTO_SOURCE=true`. `af doctor` surfaces the trust state. Verified end-to-end: untrusted .envrc skipped, approved .envrc sourced, tampered .envrc re-skipped.
- **`escapeShellValue` backtick escape (HIGH-severity fix)** — env-file values now escape backticks, closing the path where a git branch/remote URL containing backticks would survive double-quote shell escape and command-substitute on next source. Verified: `feat/test\`curl evil\`` → `feat/test\\\`curl evil\\\``.

### Added (post-release polish — 2026-05-11)

- **Run ↔ Plan bridge** — `/aura-frog:run` now auto-anchors to the active T4 task when `.aura/plans/active.json#active.task` is set; deliverables sync back to the plan tree on Phase 5. If a Feature is active but no task is claimed, suggests `/aura-frog:plan-next`. If no plan exists and the task description hits multi-feature/epic/shipping heuristics (escalation weight ≥ 3 across 6 signals), suggests `/aura-frog:plan` bootstrap first. Reverse direction: `/aura-frog:plan-next` surfaces a `/aura-frog:run` hint when it claims a task. Force modes (`must do:`, `just do:`, `exactly:`) skip the bridge; disable globally with `AF_RUN_PLAN_BRIDGE_DISABLED=true`. New rule: `rules/workflow/run-plan-bridge.md`. Updates: `skills/run-orchestrator/SKILL.md` Phase 1 setup, `commands/run.md` protocol, `commands/plan-next.md` output template. Rule count 70 → **71** (workflow 29 → 30).

### Fixed (post-release polish — 2026-05-11)

- **Command namespace consistency** — renamed 18 `aura-*.md` command files to drop the redundant `aura-` prefix; the slash form was displaying as `/aura-frog:aura-plan` (plugin prefix + filename redundancy). New slash forms match the core `/aura-frog:run` convention: `/aura-frog:plan`, `/aura-frog:plan-expand`, `/aura-frog:trace`, `/aura-frog:heal`, `/aura-frog:mcp`, `/aura-frog:dashboard`, `/aura-frog:extend`, `/aura-frog:preflight`, `/aura-frog:reset-session`, plus 10 `plan-*` subcommands. Updated ~140 references across docs, agents, hooks, rules, scripts, READMEs to long-form (e.g. `/aura:plan:expand` → `/aura-frog:plan-expand`). `git mv` preserved history. Audit clean.
- **Doc count drift** — synced stale v3.6.x counts in `README.md` (L101 / L533 / L697-700 / L708 / L1011-1019), `CONTRIBUTING.md` (project-structure block), `docs/README.md` (Plugin Internals list), `docs/reference/BENEFITS.md` (§4.3, §5.1, §6.1, §7.x) to v3.7.0 reality (15 / 55 / 70 / 24 / 42)
- **`install.sh` removed** — deprecated since v3.6 marketplace publish; only historical reference retained in this changelog. Use `/plugin install aura-frog@aurafrog` instead.
- **`scripts/jira-fetch.sh` removed** — `hooks/jira-auto-fetch.cjs` already calls the JIRA REST API directly (verified end-to-end against `IGNT-1975` on `fwdnextgen.atlassian.net`), so the standalone CLI script duplicated logic with no callers. Hook is now the single source of truth for JIRA fetching. Updated refs in `scripts/README.md`, `rules/workflow/mcp-response-logging.md`, `docs/operations/MCP_GUIDE.md`, `docs/getting-started/GET_STARTED.md`. Confluence fetch script kept (no equivalent hook). README gains a "JIRA Ticket Auto-Fetch" entry in the *More features* section.
- **`evaluate-prompts.cjs` refresh** — version-agnostic comments for command/agent surface; `AVAILABLE_AGENTS` array updated for the 15-agent roster (added master-planner, feature-architect, story-planner, replanner, epic-summarizer, conflict-arbiter); `AVAILABLE_COMMAND_CATEGORIES` adds `aura` namespace; `AVAILABLE_SKILLS` extended with auto-invoke planners + hierarchical-planning/safety skills
- **Audit clean** — zero orphan rules, zero dead markdown links, all 55 skills carry `user-invocable: false`

### Deferred (will land in v3.7.x patch releases — NOT blockers)

- L3 (semantic LLM) + L4 (architectural LLM) full implementations + `conflict_cache.jsonl` LRU
- Pre-flight Tier 2 (OPA, optional) — `install-opa.sh` + 5 default Rego policies
- 30+20+15+10 conflict fixture suites for L1-L4 acceptance corpus per spec §28.7
- FEAT-B fixture suites: classifier 80-suite + hallucination 20 + logic-error 15 + deviation_score auto-update + trace-event latency benchmark
- 16 remaining spec §30 docs (architecture/HIERARCHICAL_PLANNING, MASTER_PLANNER, 8 guides, 3 troubleshooting) — covered in summary form by `MIGRATION_TO_V3.7.md`; standalone files in v3.7.2+

### Verification

- `validate-counts.sh`: 15 / 55 / 70 / 24 / 42 — all OK
- `validate-plan-tree.sh`: 7 nodes · 8/8 invariants (all 5 milestones ✓)
- Reference integrity: zero orphans
- Allowlist enforcement: confirmed `security` agent now blocked from `postgres` MCP (rc=2)
- Sanitizer: AWS keys / GitHub PATs / OpenAI keys / Bearer tokens all redacted
- Rate limit: 30/min hard block fires at 30th call (stress-tested)

### Pre-release tag history (internal)

```
v3.7.0-alpha.1   2026-04-29   Milestone A — Planning foundation
v3.7.0-alpha.2   2026-04-29   Milestone B — Failure + reasoning trace
v3.7.0-alpha.3   2026-05-04   Milestone C interim — Project-level extensions
v3.7.0-alpha.4   2026-05-05   Milestone C interim — Memory tier
v3.7.0-beta.1    2026-05-06   Milestone C complete — Pre-flight Tier 1
v3.7.0-beta.2    2026-05-07   Milestone D — L1+L2 conflict detection + freeze
v3.7.0-rc.1      2026-05-07   Milestone E — Self-healing + MCP security
v3.7.0           2026-05-11   Stable — marketplace publish
```

---

## [3.7.0-rc.1] - 2026-05-07 (Milestone E — Self-Healing + MCP Security + Dashboard)

> Final internal pre-release. All 5 milestones (A-E) complete. Next ship target is v3.7.0 stable (marketplace publish).

### Added — Self-healing safety gates + MCP security tier + phase-role hard rule + CLI dashboard

**Skills (2 new — 53 → 55)**
- `skills/self-healing-orchestrator/` — F2/F3 ONLY (refuses F1/F4-F6). Confidence ≥0.7 required to propose; below threshold escalates raw findings. NEVER auto-applies; user approval mandatory. Counts toward replan_budget. Per-task max 1; session cap 5. Disable via `AF_SELF_HEAL_DISABLED=true` env or `/aura-frog:heal disable` (session flag). Cross-checks ONLY context7 + permanent_memory + traces — no random web sources.
- `skills/mcp-security-auditor/` — read-side companion to `mcp-call-gate` hook. Reads `.aura/security/mcp-audit.jsonl`, projects to TOON via `json-to-toon.cjs`, surfaces blocked calls / rate-limit hits / suspicious patterns.

**Commands (3 new — 21 → 24)**
- `/aura-frog:heal diagnose|status|disable|enable|accept|decline` — self-healing orchestration. `accept <HEAL-ID>` applies a proposal as a NEW T4 task (not in-place patch). Bypass-counter + cycle-guard hardening.
- `/aura-frog:mcp status|audit|reset-limits|test` — MCP security operations. `audit --blocked-only` for forensics. `reset-limits` is logged event. `test <server>` is single-call connectivity check.
- `/aura-frog:dashboard` — terse one-screen CLI status (plan tree, active task, conflicts, memory, MCP, pre-flight). `--live` (5s refresh), `--json` (machine-readable, sanitized), `--section <name>` for slot integration.

**Rules (2 new agent-tier — workflow 29 unchanged; agent 17 → 19)**
- `rules/agent/db-access-policy.md` — DB MCPs locked down: architect + tdd-engineer only (default-deny for everyone else). Read-only by default; writes require explicit `--allow-write`. Destructive ops (DROP/TRUNCATE/DELETE without WHERE) HARD-BLOCKED unconditionally regardless of allowlist.
- `rules/agent/mcp-security-policy.md` — broader MCP framework: per-agent `mcp_servers:` allowlist (default = all backward-compat), sanitized audit log (Authorization stripped, tokens redacted), rate limits (soft 80% warn / hard 100% block), retention (`AF_MCP_AUDIT_RETENTION_DAYS=30` default).

**Rule update**
- `rules/workflow/plan-lifecycle.md` — Phase-Role binding promoted from advisory to **HARD RULE** (per spec §24, decision Q17). Phase 4 reviewer MUST NOT be the same agent as Phase 3 builder. Run-orchestrator refuses dispatch on violation; falls back to next-best reviewer; blocks phase transition if no eligible reviewer remains. Generator/Evaluator separation per Anthropic harness research.

**Hooks (1 new — 41 → 42)**
- `hooks/mcp-call-gate.cjs` — PreToolUse on `mcp__.*`. Parses `mcp__plugin_<plugin>_<server>__<method>` tool names. Enforces per-agent allowlist (reads `mcp_servers:` from agent frontmatter; null = backward-compat default of all-allowed). Tracks per-server per-session counters in `.claude/logs/.mcp-rate-counter.json`. Rate limit thresholds: soft 80% warn, hard 100% block. Runs `scripts/security/sanitize-mcp-input.sh` before audit append.

**Scripts (2 new)**
- `scripts/security/sanitize-mcp-input.sh` — strips Authorization headers, redacts AWS/GitHub/OpenAI/JWT/Bearer tokens, truncates >1KB strings. jq-based when available; sed-fallback otherwise.
- `scripts/dashboard.sh` — implementation behind `/aura-frog:dashboard`. Static / `--live` (5s loop) / `--json` / `--section` modes. Read-only — never mutates state.

**Config**
- `.mcp.json` — added `postgres` + `redis` servers (both `disabled: true` by default per spec §14.1, decision Q14 — opt-in for security)
- `plugin.json` — added `mcp_rate_limits` block with per-server overrides + `default` fallback (per spec §14.2)

### Acceptance criteria — rc.1 sub-scope

- [x] Self-healing only triggers F2/F3 (hard-coded refusal in skill body for F1/F4-F6)
- [x] Confidence < 0.7 escalates raw findings, doesn't propose
- [x] User approval required before patch applied (NEVER auto-applies — verified by skill spec)
- [x] Self-heal counts toward replan_budget
- [x] Per-agent MCP allowlist enforced by mcp-call-gate.cjs (allowlist parsed from agent frontmatter)
- [x] MCP audit log captures all calls with sanitization (smoke-tested with AWS key + GitHub PAT + Authorization header redaction)
- [x] Rate limits enforced (soft 80% warn + hard 100% block) — verified with 35-call stress test
- [x] Postgres MCP destructive ops blocked unconditionally (per `db-access-policy.md`)
- [x] AF_SELF_HEAL_DISABLED=true disables self-healing
- [x] Phase 4 reviewer ≠ Phase 3 builder formalized as HARD RULE in plan-lifecycle.md
- [x] /aura-frog:dashboard renders without errors (static + JSON modes verified)

### Verification

- `validate-counts.sh`: 15 / 55 / 70 / 24 / 42 — all OK
- `validate-plan-tree.sh`: 7 nodes · 8/8 invariants
- Reference integrity: zero orphans
- mcp-call-gate smoke tests: allowlist enforcement (rc 2 on violation), rate limit (35-call stress hits hard block correctly), sanitizer (AWS keys + GitHub PATs + Bearer tokens redacted in audit log)
- Dashboard: static + JSON modes both render cleanly

### Stats (v3.7.0-beta.2 → v3.7.0-rc.1)

- Agents: 15 (unchanged)
- Skills: 53 → **55** (+2: self-healing-orchestrator, mcp-security-auditor); auto-invoke 9 (unchanged)
- Rules: 68 → **70** (+2 agent-tier: db-access-policy, mcp-security-policy); workflow 29 unchanged but plan-lifecycle.md hard-rule promotion
- Commands: 21 → **24** (+3: /aura-frog:heal, /aura-frog:mcp, /aura-frog:dashboard)
- Hooks: 41 → **42** (+1 mcp-call-gate)
- Scripts: 52 → **55** (+3: sanitize-mcp-input + dashboard + get-plugin-prefix)
- MCP servers: 6 → **8** (+2 disabled: postgres, redis)

### Pending for v3.7.0 stable (final ship)

- 17 documentation deliverables per spec §30 (architecture/HIERARCHICAL_PLANNING, MASTER_PLANNER, llm-os update, 8 guides, 3 troubleshooting, MIGRATION_TO_V3.7)
- README.md update — lead with `/aura-frog:plan`, document `/run` as lightweight mode
- Marketplace listing update with v3.7.0 description
- Public release announcement
- Add `mcp_servers:` allowlists to existing 9 baseline agents (gate works but most currently default to all-allowed)

### Pending — deferred (will land in v3.7.x patch releases or as opt-in features)

- L3 (semantic LLM) + L4 (architectural LLM) full implementations + conflict_cache.jsonl LRU
- 30+20+15+10 conflict fixture suites for L1-L4 acceptance corpus
- Pre-flight Tier 2 (OPA, optional) — install-opa.sh + 5 default Rego policies (plan_structure, mutation_safety, grounding, token_budget, conflict_respect)
- FEAT-B deferred fixtures: classifier 80-suite + hallucination 20 + logic-error 15 + deviation_score auto-update + trace-event latency benchmark

## [3.7.0-beta.2] - 2026-05-07 (Milestone D — Conflict Detection + Freeze)

> Internal pre-release tag. Not published to marketplace. Ships L1+L2 conflict detection (deterministic bash, fast), freeze cascade, conflict-arbiter agent, F6 failure class, 3 conflict commands, 3 hooks. L3+L4 (LLM-driven semantic + architectural detection) stubbed for rc.1.

### Added — Conflict detection + freeze state machine

**Scripts (2 new under `scripts/conflicts/`)**
- `check-l1-files.sh` — file-set intersection between proposed task artifacts and pending-confirm sibling artifacts. Returns JSON `{layer, overlap, confidence, files, with}`. p95 well under 100ms (no LLM, no network).
- `check-l2-syntactic.sh` — function/class/def overlap via regex within files L1 flagged. Confidence 0.85 (lower than L1's 1.0 because regex on symbol names has false-positive risk).

**Agents (1 new — 14 → 15)**
- `agents/conflict-arbiter.md` — adjudicates conflicts. Decision table: auto_thaw / auto_discard / sequential_reorder / replan / escalate / user_priority. L3+L4 routes to user_priority (never auto-applied). Cycle guard: refuses 4th arbitration of same conflict_id.

**Skills (1 new — 52 → 53)**
- `skills/conflict-detector/SKILL.md` — orchestrates L1-L4 dispatch per spec §21.3. L1+L2 functional via the bash scripts; L3+L4 return stub findings pending rc.1 LLM dispatchers. Writes records to `.aura/plans/conflicts.jsonl` (append-only, schema per spec §21.4).

**Commands (3 new — 18 → 21)**
- `/aura-frog:plan-freeze <NODE_ID> [reason]` — manual freeze with descendant cascade (per spec §13.1, decision Q10 — descendants only, NOT siblings)
- `/aura-frog:plan-thaw <NODE_ID>` — reverse freeze with compatibility check (`git diff <blocker.git_sha>..HEAD` vs frozen sibling's planned artifacts). `--partial` keeps descendants frozen; `--discard` finalizes as discarded; `--grant-replan-budget N` overrides budget reset
- `/aura-frog:plan-conflicts list|show|resolve|history|check` — full conflict lifecycle UX. `resolve <CONFLICT-ID> <choice>` supports accept-proposed / accept-blocker / sequential / freeze-both / escalate

**Rule (1 new — 67 → 68; workflow 28 → 29)**
- `rules/workflow/conflict-arbitration-policy.md` — formalizes auto vs manual boundary (L1/L2 auto, L3/L4 manual), freeze cascade rules (Q10: descendants only), replan_budget interaction, cycle guard (3-arbitration limit), compatibility-check pseudocode

**Hooks (3 new — 38 → 41)**
- `pre-dispatch-conflict-check.cjs` — PreToolUse async on Edit|Write|Bash. Resolves siblings under same Story, runs L1, drills to L2 on low-confidence overlap. Mints CONFLICT-NNNNN, appends conflicts.jsonl + history.jsonl, emits stderr hint with `/aura-frog:plan-conflicts show` next step. Anti-block: informational only; arbiter applies actual mutations
- `post-execute-conflict-rescan.cjs` — PostToolUse async on Edit|Write. Detects recent execution_completed events, looks up frozen siblings tied to same conflict, runs `git diff <blocker.checkpoint.git_sha>..HEAD` vs frozen sibling planned artifacts, emits auto_thaw / auto_discard recommendation
- `pending-confirm-timeout.cjs` — SessionStart async. Walks T4 nodes, surfaces those in `planned`/`frozen`/`blocked` status idle >24h (configurable via `AF_PENDING_TIMEOUT_HOURS`). Cap: 5 surfaced + tail count

**Skill update**
- `skills/failure-classifier/SKILL.md` — F6 class formalized (was a TODO note). Decision rule #2: `cause: conflict OR conflict_id non-null → F6`. Output: `routes_to: conflict-arbiter` (NOT replanner).

### Acceptance criteria — beta.2 sub-scope

- [x] L1 detects file overlap on smoke fixture (1/1; 30-fixture suite deferred to rc.1)
- [x] L2 drills into overlapping files when L1 confidence < 0.95 (1/1)
- [x] CONFLICT-NNNNN records minted with proper schema; conflicts.jsonl append-only
- [x] Frozen node remains frozen until explicit thaw
- [x] Branch freeze cascades to descendants only (NOT siblings) — per spec §13.1, Q10
- [x] /aura-frog:plan-thaw runs compatibility check via git_sha
- [x] F6 class added to failure-classifier with conflict-arbiter dispatch
- [x] L1 detection well under 100ms p95 (bash + comm + sort, no LLM)
- [x] End-to-end tested: artifact map → L1 hit → CONFLICT-00001 minted → conflicts.jsonl + history.jsonl + counters.json all updated

### Verification

- `validate-counts.sh`: 15 / 53 / 68 / 21 / 41 — all OK
- `validate-plan-tree.sh`: 6 nodes · 8/8 invariants
- Reference integrity: zero orphans
- L1 + L2 smoke tests pass (4 scenarios)
- End-to-end conflict detection: TASK-00125 vs TASK-00120 sharing src/auth.py → CONFLICT-00001 logged correctly

### Stats (v3.7.0-beta.1 → v3.7.0-beta.2)

- Agents: 14 → **15** (+1 conflict-arbiter)
- Skills: 52 → **53** (+1 conflict-detector); auto-invoke 9 (unchanged)
- Rules: 67 → **68** (+1 conflict-arbitration-policy); workflow 28 → **29**
- Commands: 18 → **21** (+3: /aura-frog:plan-freeze, /aura-frog:plan-thaw, /aura-frog:plan-conflicts)
- Hooks: 38 → **41** (+3)
- MCP servers: 6 (unchanged)

### Pending for v3.7.0-rc.1 (Milestone E)

- L3 (semantic LLM) + L4 (architectural LLM) full implementations + conflict_cache.jsonl LRU
- 30+20+15+10 conflict fixture suites for L1-L4 acceptance corpus
- Pre-flight Tier 2 (OPA, optional) — install-opa.sh + 5 default Rego policies
- Self-healing orchestrator — F2/F3 propose patch, never auto-apply
- MCP security tier — per-agent allowlist, audit log, rate limits
- Phase-Role binding hard rule (Phase 4 reviewer ≠ Phase 3 builder)
- /aura-frog:dashboard CLI

### Pending — deferred FEAT-B work (rolling)

- Classifier 80-fixture suite + hallucination/logic-error fixture suites + deviation_score auto-update + trace-event latency benchmark

### Fixed (post-beta.1)

- **Agent dispatch namespacing — derived not hardcoded.** First fix wired the `aura-frog:` prefix into the dispatch table (worked, but fragile across forks/renames). Refactored to derivation: the prefix is now read at runtime from `plugin.json#name` via `scripts/get-plugin-prefix.sh` (new helper, falls back to grep when `jq` unavailable). The session-start hook (`hooks/session-start.cjs`) emits the prefix in its banner: `🔌 plugin-prefix: aura-frog (use as subagent_type prefix: \`aura-frog:<agent-id>\`)` — so the AI sees it once per session, no per-call lookup. `skills/run-orchestrator/SKILL.md` dispatch table now uses bare agent IDs (`architect`, `tester`, etc.) with a note to apply the runtime prefix at the moment of Agent tool invocation. `rules/core/agent-namespacing.md` rewritten as derivation-based: lists agent IDs (stable) and looks up the prefix from plugin.json (variable). Skills/rules/docs are now fork-safe — only `plugin.json` + `marketplace.json` need updating on rename. Rules: 66 → **67** (core 21 → **22**).

## [3.7.0-beta.1] - 2026-05-06 (Milestone C complete — Pre-flight Tier 1)

> Internal pre-release tag. Not published to marketplace. Completes FEAT-C with the pre-flight half. Tier 2 OPA Rego policies deferred to rc.1 per spec §20.4 (Tier 2 is optional).

### Added — Pre-flight Tier 1 (7 bash linters + dispatcher hook)

**Scripts (7 new under `scripts/preflight/`)**
- `validate-frontmatter.sh` — YAML frontmatter validation on plan/skill/agent/rule/command markdown
- `validate-tool-input.sh` — tool input shape sanity (required fields, absolute paths, no-op edits)
- `validate-tool-output.sh` — ANSI-escape volume, prompt-injection phrase detection, JSON sanity
- `check-path-safety.sh` — reject path traversal + system files (`/etc/passwd`, `~/.ssh/`, `~/.aws/`) + credential dirs
- `check-command-allowlist.sh` — hard-block destructive (`rm -rf /`, `mkfs.*`, fork bomb, pipe-to-sudo-shell, etc.); warn on risky (`git push --force`, `DROP TABLE`)
- `check-secret-patterns.sh` — high-confidence credential patterns (AWS/GitHub PAT/OpenAI/JWT/private keys); warn on heuristic patterns
- `run-all.sh` — orchestrator. Auto-dispatches based on `CLAUDE_TOOL_NAME` + `CLAUDE_TOOL_ARGS`. Returns highest exit code from any linter

Each linter follows spec §20.2 exit codes: 0 pass / 1 warn / 2 fail.

**Hook (1 new — 37 → 38)**
- `hooks/pre-flight-validate.cjs` — PreToolUse on Bash | Edit | Write | Read. Invokes `run-all.sh`. Exit 2 → blocks tool call. Exit 1 → warn but proceed. Exit 0 → silent. Honors `AF_PREFLIGHT_DISABLED=true` and single-use bypass via `.claude/logs/.preflight-bypass` flag file (per-call only, per spec Q7). After 3 bypasses in one session, prints warning banner.

**Skill (1 new — 51 → 52)**
- `skills/preflight-validator/` — programmatic wrapper for on-demand invocation (CI, contributor workflow, batch validation). On-demand only.

**Command (1 new — 17 → 18)**
- `commands/preflight.md` — `/aura-frog:preflight check|policies|bypass|status`. `bypass <reason>` requires reason ≥10 chars (refuses vague "test it"). Logs to history.jsonl.

**Rule (1 new — 65 → 66; workflow 27 → 28)**
- `rules/workflow/preflight-policies.md` — formalizes triggers, hard-block vs warn pattern classes, exit-code semantics, bypass policy (per-call only), 3-bypasses-warn threshold, escalation order (per-call → per-session env → permanent — strongly discouraged).

### Acceptance criteria — beta.1 sub-scope

- [x] All 7 Tier 1 linters defined; each returns 0/1/2 per spec §20.2
- [x] `pre-flight-validate.cjs` blocks tool call on exit 2; warns on exit 1
- [x] `/aura-frog:preflight bypass` is single-use (consumed on next PreToolUse)
- [x] After 3 bypasses in a session: warning banner emitted
- [x] Hook silent if `AF_PREFLIGHT_DISABLED=true`
- [x] Hook silent if `run-all.sh` missing
- [x] Smoke tests: 10/10 pass (hard-block / warn / pass for each linter; dispatcher correctness)

### Verification

- `validate-counts.sh`: 14 / 52 / 66 / 18 / 38 — all OK
- `validate-plan-tree.sh`: 5 nodes · 8/8 invariants
- Reference integrity: zero orphans
- Linter smoke tests: rm -rf / blocked, force-push warned, ls passed, /etc/passwd blocked, traversal blocked, AWS key detected, GitHub PAT detected, clean content passed, run-all dispatch correct
- Hook smoke tests: hard-block exit 2, warn exit 0 with stderr, pass exit 0 silent, AF_PREFLIGHT_DISABLED skips entirely

### Stats (v3.7.0-alpha.4 → v3.7.0-beta.1)

- Agents: 14 (unchanged)
- Skills: 51 → **52** (+1 preflight-validator); auto-invoke 9 (unchanged)
- Rules: 65 → **66** (+1 preflight-policies); workflow 27 → **28**
- Commands: 17 → **18** (+1 /aura-frog:preflight)
- Hooks: 37 → **38** (+1 pre-flight-validate)
- MCP servers: 6 (unchanged)

### Pending for v3.7.0-rc.1 (Milestone E remainder)

- **Pre-flight Tier 2 (OPA, optional)** — `install-opa.sh` (sha256-verified) + 5 default Rego policies (plan_structure / mutation_safety / grounding / token_budget / conflict_respect)
- **Self-healing orchestrator** — F2/F3 propose patch, never auto-apply
- **MCP security tier** — per-agent allowlist (`mcp_servers:` frontmatter), `mcp-call-gate.cjs` hook, audit log, rate limits
- **Phase-Role binding** — Phase 4 reviewer ≠ Phase 3 builder hard rule enforcement
- **CLI dashboard** — `/aura-frog:dashboard`

### Pending for v3.7.0-beta.2 (Milestone D)

- L1-L4 conflict detection + conflict-arbiter agent + F6 class
- 3 conflict commands (`/aura-frog:plan-freeze`, `:thaw`, `:conflicts`)
- Branch freeze cascade + auto-thaw

### Pending — deferred FEAT-B work (rolling)

- Classifier 80-fixture suite + hallucination/logic-error fixture suites + deviation_score auto-update + trace-event latency benchmark

### Added (post-alpha.4)

- **Deterministic JSON → TOON projection** — `scripts/json-to-toon.cjs` (CLI + library) projects JSON via built-in schemas (`jira` / `mcp` / `tests` / `pr` / `pkg` / `generic`) or custom dotpaths, encodes as TOON. `hooks/json-toon-projector.cjs` (PostToolUse Read | mcp__.*) shape-sniffs incoming JSON, runs the converter, emits TOON to stderr alongside the raw output. Skips small payloads (<2KB), plugin config files, non-JSON. **No AI involvement** — projection is script-side, saving the round-trip + tokens that an AI-side rule would have cost. `hooks/jira-auto-fetch.cjs` updated to call the converter for stderr emission. Hooks: 36 → **37**. Spec rationale: an originally drafted `rules/core/json-to-toon.md` rule was deleted in favor of the hook because rules are always-loaded (token cost) and ask the model to convert AFTER receiving raw JSON — a deterministic hook does the work BEFORE the model sees anything.

### Fixed (post-alpha.4)

- **Anti-overload context discipline** — added `rules/core/context-economy.md` (Critical priority, always-loaded). Addresses upstream `overloaded_error` from large context: locate-before-Read ladder (Glob → Grep paths → Grep content → targeted Read with offset+limit → full Read as last resort), skip rules for build artifacts / lockfiles / minified files, no-re-Read discipline, recovery procedure on overload error (do NOT retry with same context — distill, then resume), token budget per session class (Quick <10K / Standard <60K / Deep <150K tool-results total). Cited from run-orchestrator (Phase 1 setup), bugfix-quick (investigation step), code-reviewer (review evidence). Rules: 64 → **65** (core 20 → **21**).

## [3.7.0-alpha.4] - 2026-05-05 (Milestone C interim — Memory Tier)

> Internal pre-release tag. Not published to marketplace. Ships the memory half of FEAT-C: epic-summarizer + permanent_memory + session reset. Pre-flight half + 7 Tier 1 linters + OPA optional + deferred FEAT-B fixtures land in beta.1.

### Added — Memory tier

**Agents (1 new — 13 → 14)**
- `agents/epic-summarizer.md` — distills T2 done into a permanent_memory.md section. Confidence-scored output (items <0.7 → Tentative subsection). Hard cap: 500 tokens/Epic. Writes ONLY to `.aura/memory/`. Never includes verbatim file content (sha256 references instead).

**Skills (2 new — 49 → 51; auto-invoke 8 → 9)**
- `skills/permanent-memory-loader/` — auto-invoke. Loads permanent_memory.md summary lines (≤120 tokens always-loaded; 200 hard cap). Silent if no `.aura/memory/`. Auto-degrades by dropping Tentative → Patterns → Epic-IDs-only.
- `skills/plan-archivist/` — on-demand. Compresses completed plan-tree branches to `.aura/plans/archive/{NODE_ID}.summary.md`. Optional `--prune` removes original Story/Task files (always preserved in checkpoints).

**Commands (1 new — 16 → 17)**
- `commands/reset-session.md` — distills active Epic via epic-summarizer → permanent_memory.md → optional reset prompt. Preserves history.jsonl, plan tree, conflict cache, manual_overrides.md. Supports `--feature`, `--initiative`, `--dry-run`, `--no-prompt`.

**Rules (1 new — 63 → 64; workflow 26 → 27)**
- `rules/workflow/session-reset-policy.md` — formalizes triggers (T2 done default, T1 quarterly, manual), distillation include/exclude rules, 500/8000 token caps, confidence-tiered output, what's preserved across reset.

**Hooks (2 new — 34 → 36)**
- `hooks/feature-done-trigger-archive.cjs` — PostToolUse Edit|Write. Detects T2 status transition `active → done` via history.jsonl tail. Surfaces `/aura-frog:reset-session` suggestion.
- `hooks/session-reset-trigger.cjs` — PostToolUse Edit|Write. After epic-summarizer writes a section (within 60s window), prompts user to actually reset the session. Per-feature flag prevents spam.

### Acceptance criteria — alpha.4 sub-scope

- [x] epic-summarizer agent defined with 500-token cap + confidence tiers + .aura/memory/ write-only
- [x] permanent-memory-loader auto-invokes, ≤120 tokens, silent without `.aura/memory/`
- [x] plan-archivist defined with --prune opt-in
- [x] /aura-frog:reset-session distills and offers reset; preserves what spec §19.5 says it should
- [x] session-reset-policy formalizes triggers + caps + preservation list
- [x] feature-done-trigger-archive emits hint on T2 done detection
- [x] session-reset-trigger prompts user post-distillation (anti-spam flag)
- [x] All 4 hook scenarios tested (no plans / done detection / no recent summarize / recent summarize)

### Verification

- `validate-counts.sh`: 14 / 51 / 64 / 17 / 36 — all OK
- `validate-plan-tree.sh`: 5 nodes · 8/8 invariants
- Reference integrity: zero orphans
- Hook smoke test: silent without `.aura/plans/`, fires correctly with active.json + history.jsonl events

### Stats (v3.7.0-alpha.3 → v3.7.0-alpha.4)

- Agents: 13 → **14** (+1 epic-summarizer)
- Skills: 49 → **51** (+2); auto-invoke 8 → **9** (+permanent-memory-loader)
- Rules: 63 → **64** (+1 session-reset-policy); workflow 26 → **27**
- Commands: 16 → **17** (+1 /aura-frog:reset-session)
- Hooks: 34 → **36** (+2)
- MCP servers: 6 (unchanged)

### Pending for beta.1 (rest of FEAT-C)

- preflight-validator skill + /aura-frog:preflight command + preflight-policies workflow rule
- pre-flight-validate.cjs hook
- 7 Tier 1 bash linters + install-opa.sh (sha256 verified)
- 5 OPA Rego policies (plan_structure, mutation_safety, grounding, token_budget, conflict_respect)
- **Deferred from FEAT-B** — classifier 80-fixture suite, hallucination/logic-error fixture suites, deviation_score auto-update, trace-event latency benchmark
- Post-reset session-load benchmark (<2s target)

### Fixed (post-alpha.3)

- **JIRA auto-fetch wired** — `jira-fetch.sh` existed but had no UserPromptSubmit hook driving it. Added `hooks/jira-auto-fetch.cjs`: detects `[A-Z]{2,10}-[0-9]{1,6}` patterns in the user prompt, fetches via curl directly to the Atlassian REST API, caches per-project at `.claude/logs/jira/{TICKET_ID}.json` with 24h TTL, surfaces a one-line summary per ticket to stderr. Silent if JIRA env vars unset (one-time hint per session). Cap: 3 tickets/prompt. Optional `JIRA_PROJECT_PREFIXES` env (comma-separated) acts as an allowlist to filter false positives like `RFC-123` / `UTF-8`. Credentials never leak in error output. `run-orchestrator` skill updated to consume the cache as a canonical requirements source. Hooks: 33 → **34** (rolled into alpha.4 count of 36).

## [3.7.0-alpha.3] - 2026-05-04 (Milestone C interim — Project-level Extension Creation)

> Internal pre-release tag. Not published to marketplace. Addresses user directive 2026-05-04: auto-detect when a new skill/rule/command would help, ask for confirmation, create at project-Claude level only.

### Added — Project-level extension creation

**Skills (1 new — 48 → 49; auto-invoke 7 → 8)**
- `skills/extension-detector/` — auto-invoke. Detects strong/medium signals that a new skill/rule/command would reduce friction. NEVER writes files itself; surfaces a one-line proposal and waits for explicit `y` / `yes` confirmation. Detection budget: 1 proposal/turn, 3/session.

**Commands (1 new — 15 → 16)**
- `commands/extend.md` — `/aura-frog:extend propose|create|list|remove`. Always writes to `.claude/{skills,rules,commands}/` in the user's project — **NEVER to plugin's `aura-frog/` folder** (hard path-prefix check). Includes reference-integrity audit step + extensions.log append.

**Rules (1 new — 62 → 63; workflow 25 → 26)**
- `rules/workflow/extension-policy.md` — formalizes signal thresholds (strong/medium/weak with occurrence requirements), confirmation gate as non-negotiable, project-only write constraint, frontmatter requirements for project extensions, anti-fatigue budget caps.

### Acceptance criteria — all green for alpha.3 sub-scope

- [x] extension-detector auto-invokes only on signal threshold match (3+ for medium, 1 for strong)
- [x] /aura-frog:extend supports propose/create/list/remove
- [x] extension-policy formalizes thresholds + confirmation gate + project-only writes
- [x] Hard guardrail: write paths starting with `aura-frog/` rejected immediately
- [x] Mandatory user confirmation before any file creation
- [x] Detection budget: 1/turn, 3/session
- [x] Reference-integrity audit runs after every create

### Why ship as interim alpha.3

FEAT-C (Milestone C) standard scope is large: epic-summarizer, permanent-memory, 7 Tier 1 linters, 5 OPA policies, session reset flow. The user directive (auto-detect skills/rules/commands) is a smaller orthogonal capability. Splitting:

- **alpha.3** ships extension-detector standalone — fast feedback on the new feature
- **beta.1** ships full FEAT-C standard scope + deferred FEAT-B fixture suites

This keeps each pre-release reviewable and avoids bundling unrelated changes.

### Stats (v3.7.0-alpha.2 → v3.7.0-alpha.3)

- Agents: 13 (unchanged)
- Skills: 48 → **49** (+1 extension-detector); auto-invoke 7 → **8**
- Rules: 62 → **63** (+1 extension-policy); workflow 25 → **26**
- Commands: 15 → **16** (+1 /aura-frog:extend)
- Hooks: 33 (unchanged)
- MCP servers: 6 (unchanged)

### Pending for subsequent milestones

- **Milestone C remainder (beta.1)** — epic-summarizer, plan-archivist, permanent-memory-loader, preflight-validator, /aura-frog:reset-session, /aura-frog:preflight, session-reset-policy + preflight-policies rules, 3 hooks (feature-done-trigger-archive, pre-flight-validate, session-reset-trigger), 7 Tier 1 linters, OPA install + 5 Rego policies
- **Deferred from FEAT-B** — classifier 80-fixture suite, hallucination/logic-error fixture suites, deviation_score auto-update, trace-event latency benchmark
- **Milestone D (beta.2)** — L1-L4 conflict detection, conflict-arbiter, F6 class
- **Milestone E (rc.1)** — self-healing safety gates, MCP per-agent allowlist + audit, phase-role binding hard enforcement

## [3.7.0-alpha.2] - 2026-04-29 (Milestone B — Failure Handling + Reasoning Trace)

> Internal pre-release tag. Not published to marketplace. All 11 acceptance criteria green.

### Added — Failure handling + reasoning trace

**Plan tree**
- `.aura/plans/features/FEAT-B/feature.md` (Milestone B), INIT-001 children → `[FEAT-A, FEAT-B]`

**Agents (1 new — 12 → 13)**
- `agents/replanner.md` — F2-F4 mutation proposer (re-decompose / discard_task / reprioritize / promote / freeze). Read-only on code; only LLM-mediated planning agent (per Q1 decision).

**Skills (3 new — 45 → 48; auto-invoke 5 → 7)**
- `skills/failure-classifier/` — F1-F5 deterministic classifier. Outputs `{class, confidence, evidence, recommended_action}`. No LLM call.
- `skills/reasoning-trace-recorder/` — auto-invoke. Emits `file_read | output_claim | tool_call | tool_result | decision | phase_transition` events to `.aura/plans/traces/{TASK_ID}.jsonl`.
- `skills/plan-validator/` — wrapper over `validate-plan-tree.sh`; closes a reference gap from alpha.1 (was promised, never built).

**Rules (3 new — 59 → 62; core 18 → 20, workflow 22 → 25)**
- `rules/core/grounding-discipline.md` — `output_claim` must be preceded by a `file_read` for the named file/symbol; ungrounded claims surface in `/aura-frog:trace --hallucinations`.
- `rules/workflow/replan-thresholds.md` — `replan_budget` per tier (T2=2, T3=3, T4=0), `deviation_score` formula, freeze-on-exhaustion + cycle guard.
- `rules/workflow/checkpoint-discipline.md` — pre-mutation snapshots in `.aura/plans/checkpoints/`, retention (5 per node / 30 days / 50 MB cap), idempotent restore semantics.

**Commands (1 new — 14 → 15; +1 upgrade)**
- `commands/trace.md` — read traces by TASK_ID, filter by event type, surface ungrounded claims (`--hallucinations`).
- `commands/plan-undo.md` — full implementation (alpha.1 was a stub): LIFO checkpoint restore, idempotent (no-op on second run), refuses on missing checkpoint.

**Hooks (3 new — 30 → 33; all 5 planning hooks now wired into hooks.json)**
- `hooks/post-execute-update-node.cjs` — PostToolUse. Records execution_completed/execution_failed events to history.jsonl; surfaces failure-classifier hint on non-zero exit.
- `hooks/tdd-red-failure-tracker.cjs` — Bash PostToolUse, P2_RED only. Distinguishes `red_as_designed` from `red_unexpectedly_green` (F2 candidate).
- `hooks/tool-call-tracer.cjs` — PreToolUse + PostToolUse. Emits `tool_call`, `tool_result`, and (for Read) `file_read` events with sha256 truncated to 16 chars.
- **Wired up** in `hooks/hooks.json`: alpha.1's two hooks (`pre-execute-load-plan-context`, `session-start-restore-active`) plus the three new alpha.2 hooks now fire on the appropriate Claude Code lifecycle events. All silent on projects without `.aura/plans/`.

### Acceptance criteria — all green

- [x] failure-classifier returns F1-F5 with confidence ≥ 0.6
- [x] replanner emits proposals respecting `replan_budget`; refuses on exhaustion
- [x] reasoning-trace-recorder writes append-only `traces/{TASK_ID}.jsonl`
- [x] `/aura-frog:trace` reads traces and surfaces ungrounded claims
- [x] grounding-discipline rule defines `grounded:bool` semantics
- [x] post-execute-update-node hook records execution events to history.jsonl
- [x] tdd-red-failure-tracker hook distinguishes RED-as-designed from F2 candidate
- [x] tool-call-tracer hook emits tool_call/tool_result/file_read events
- [x] /aura-frog:plan-undo full implementation honors checkpoint LIFO + idempotent
- [x] checkpoint-discipline rule defines retention + restore semantics
- [x] replan-thresholds rule defines deviation_score + budget enforcement

### Verification

- `validate-counts.sh`: 13 agents · 48 skills · 62 rules · 15 commands · 33 hooks — all OK
- `validate-plan-tree.sh`: 4 nodes · 8/8 invariants pass
- `check-token-budget.sh`: 212 / 13,500 tokens (1% utilization, well under hard limit)
- Hook smoke test: all 5 silent-exit on no `.aura/plans/`; emit correct events on active plan tree

### Stats (v3.7.0-alpha.1 → v3.7.0-alpha.2)

- Agents: 12 → **13** (+1 replanner)
- Skills: 45 → **48** (+3); auto-invoke 5 → **7** (+plan-loader was alpha.1, +reasoning-trace-recorder)
- Rules: 59 → **62** (+3); core 18 → 20, workflow 22 → 25
- Commands: 14 → **15** (+1 /aura-frog:trace; /aura-frog:plan-undo upgraded from stub to full)
- Hooks: 30 → **33** (+3); all 5 planning hooks now wired in hooks.json
- MCP servers: 6 (unchanged)

### Pending for subsequent milestones

- **Milestone C (beta.1)** — session reset, pre-flight (Tier 1 bash + optional OPA Tier 2), epic-summarizer, permanent-memory-loader, prune-checkpoints.sh
- **Milestone D (beta.2)** — L1-L4 conflict detection, conflict-arbiter, F6 class, freeze cascade
- **Milestone E (rc.1)** — self-healing safety gates, MCP per-agent allowlist + audit, phase-role binding hard enforcement

## [3.7.0-alpha.1] - 2026-04-21 (Milestone A — Planning Foundation)

> Internal pre-release tag. Not published to marketplace. All 6 spec acceptance criteria green.

### Added — Hierarchical planning foundation

**Specs & decisions**
- `docs/specs/AURA_FROG_V3.7.0_TECH_SPEC.md` — authoritative tech spec (summary form; §3-33 transcribed per milestone)
- `docs/specs/V3.7.0_DECISIONS.md` — all 17 §32 decisions resolved with spec recommendations + env var inventory

**Plan tree (gitignored, project-local per Q2)**
- `.aura/plans/` skeleton: mission.md, INIT-001.md, FEAT-A/feature.md, .counters.json, active.json, history.jsonl

**Agents (4 new — 9 → 12)**
- `agents/master-planner.md` — kernel controller skeleton (decision engine arrives Milestone B)
- `agents/strategist.md` — T0-T1 hierarchical-planning section appended (preserves original business-strategy role)
- `agents/feature-architect.md` — T2 → T3 decomposition (read-only on code)
- `agents/story-planner.md` — T3 → T4 decomposition, pairs with TDD Phase 1

**Skills (1 new — auto-invoke)**
- `skills/plan-loader/` — `user-invocable: false`, ≤800 always-loaded tokens, auto-degradation on size

**Rules (2 new)**
- `rules/core/plan-trust-policy.md` — `trust: plan` memory tier between `trust: user` and `trust: file`
- `rules/workflow/plan-lifecycle.md` — state machine + Phase 4 reviewer ≠ Phase 3 builder hard rule

**Commands (8 new — 6 → 14)**
- `commands/plan.md` — interview-bootstrap T0/T1/T2
- `commands/plan-expand.md` — decompose node one tier down
- `commands/plan-next.md` — return next ready T4 leaf
- `commands/plan-status.md` — render plan tree + summary
- `commands/plan-replan.md` — replan flow with budget enforcement (full impl Milestone B)
- `commands/plan-promote.md` — promote node tier
- `commands/plan-archive.md` — archive completed branch with summary
- `commands/plan-undo.md` — restore from checkpoint (full impl Milestone B)

**Hooks (2 new — 28 → 30)**
- `hooks/pre-execute-load-plan-context.cjs` — PreToolUse: emits `[plan-context | trust:plan]` to stderr (silent if no `.aura/plans/`)
- `hooks/session-start-restore-active.cjs` — SessionStart: emits `🐸 Active plan` banner; appends `event: session_start` to history.jsonl

**Scripts**
- `scripts/plans/new-plan.sh` — idempotent skeleton initializer
- `scripts/plans/validate-plan-tree.sh` — enforces all 8 invariants from spec §6.7 (parent existence, children integrity, no orphans, valid status, monotonic revision, test_ref existence, DAG no-cycles, freeze_reason)
- `scripts/plans/render-plan-tree.sh` — ASCII tree renderer with status icons (○ planned, ▶ active, ✓ done, ■ blocked, ❄ frozen, ✗ discarded, ⌂ archived)
- `scripts/plans/test-roundtrip.sh` — sha256-based byte-identical round-trip test
- `scripts/plans/check-token-budget.sh` — counts plan-tree lines, hard limit 13,500

### Acceptance criteria — all green

- [x] new-plan.sh idempotent skeleton creation
- [x] validate-plan-tree.sh enforces 8/8 invariants (was 4/8 pre-alpha.1)
- [x] Plan tree byte-identical round-trip (3-node test passes)
- [x] 8 commands defined with imperative protocol
- [x] ASCII tree renders correctly
- [x] Token budget 212 / 13,500 = 1% utilization (well under hard limit)

### Stats (v3.6.1 → v3.7.0-alpha.1)

- Agents: 9 → **12** (+3, master-planner extends to 4 if counting strategist's appended role)
- Skills: 44 → **45** (+1 plan-loader; auto-invoke 5 → 5 unchanged in count, plan-loader replaces nothing)
- Rules: 57 → **59** (+2)
- Commands: 6 → **14** (+8)
- Hooks: 28 → **30** (+2)
- MCP servers: 6 (unchanged)

### Pending for subsequent milestones

- **Milestone B (alpha.2)** — failure classifier F1-F6, replanner, reasoning trace, /aura-frog:trace, replan-thresholds, checkpoint-discipline
- **Milestone C (beta.1)** — session reset, pre-flight (Tier 1 bash + optional OPA Tier 2), epic-summarizer, permanent-memory-loader
- **Milestone D (beta.2)** — L1-L4 conflict detection, conflict-arbiter, F6 class, freeze cascade
- **Milestone E (rc.1)** — self-healing safety gates, MCP per-agent allowlist + audit, phase-role binding hard enforcement

### Added

**Portability Positioning**
- `docs/PORTABILITY.md` — Layer-by-layer portability analysis (~87% markdown weighted average), adapter architecture with Mermaid diagram, event mapping table (Claude Code / Cursor / Codex), porting guide for contributors
- README "Works Across AI Coding Tools" section + Portable badge
- BENEFITS.md Part 9: "Tool-Agnostic Investment" for teams evaluating multiple AI coding tools
- Marketplace/plugin descriptions updated to mention adapter roadmap

**Behavioral CI (cc-plugin-eval integration)**
- `docs/guides/EVAL_SETUP.md` — install, config, run, troubleshooting guide
- `aura-frog/.eval-config.yaml` — Sonnet, 5 scenarios per component, $10 budget cap, read-only mode
- `aura-frog/scripts/ci/check-eval-regression.cjs` — compare against baseline, fail on <85% accuracy OR >10% drop; graceful handling of missing baseline (first-run mode)
- `.github/workflows/behavioral-eval.yml` — PR workflow triggered on skills/agents/commands/rules changes; uploads eval-results.json as artifact
- CONTRIBUTING.md "Behavioral Evaluation" section with local-run instructions + baseline-update policy
- README "Trigger Accuracy" badge linking to EVAL_SETUP
- Requires repo secret: ANTHROPIC_API_KEY

**Coverage Skills (3 new)**
- `skills/deep-debugging` — Scientific-method root-cause analysis for intermittent/flaky/race bugs. Protocol: reproduce → hypothesis tree (via tree-of-thoughts) → bisect → test one hypothesis → verify via chain-of-verification → regression test. Escalation from bugfix-quick.
- `skills/monorepo` — pnpm/yarn/npm workspaces, Turborepo, Nx, Lerna, Rust/Go workspaces. Correct package scoping, cross-package coordination, build-graph awareness. Uses `paths:` frontmatter to auto-load on workspace file detection.
- `skills/perf-profiling` — Measure-first optimization with Pareto bottleneck targeting. Language-specific profiler suggestions (clinic/py-spy/pprof/flamegraph), one-change-at-a-time discipline, flat-distribution detection for architectural calls.

### Changed

- Skills: 41 → **44** (5 auto-invoke unchanged, reference 36 → 39)
- plugin.json + marketplace.json descriptions prefix "Portable" + adapter timeline
- bugfix-quick SKILL escalates to deep-debugging for hard bugs
- commands/check.md `/check perf` delegates to perf-profiling for deep analysis
- commands/run.md documents auto-loaded skills (monorepo, perf-profiling) based on repo/task detection

### Stats

- Skills: **44** (was 41)
- Rules: 57 (unchanged)
- Agents: 9 (unchanged)
- Commands: 6 (unchanged)
- Hooks: 28 (unchanged)

### Not yet shipped

- cc-plugin-eval baseline (`aura-frog/eval-baseline.json`) — first generation requires ANTHROPIC_API_KEY; workflow handles missing baseline gracefully
- Codex/Cursor adapters — documented roadmap, target Q2 2026

---

## [3.6.1] - 2026-04-21

### Added
- **Security & discipline rules** — 7 new policy rules: `no-assumption`, `prompt-validation` (6-dim benchmark), `contextual-separation` (prompt-injection defense), `recursion-limit` (loop prevention), `observer-agent` (watchdog role), `prompt-caching` (Anthropic cache_control), `small-to-large-routing` (haiku→sonnet→opus), `dual-llm-review` (adversarial second-opinion), `immutable-workflow` (approved phases append-only)
- **`skills/prompt-evaluator`** — added Mode 3: Output Variance (run N times, score stability 0-100%)
- **`docs/reference/BENEFITS.md`** — full why-use-this-plugin doc (~460 lines, 8 parts, use cases)
- **Reference Integrity Rule** in `.claude/CLAUDE.md` — audit script + enforcement policy for future refactors
- **Reviewer cap = 2 per phase** in `cross-review-workflow.md` — analysis-paralysis defense

### Changed
- Core rule tier: 13 → 18 (added 5 rules)
- Workflow rule tier: 20 → 22 (added 2 rules)
- Total rules: 50 → 57 (18 core + 17 agent + 22 workflow)

### Fixed
- **CLAUDE.md discrepancies:** commands table was missing `/help` (now 6 commands); auto-invoke skill list incorrectly included `run-orchestrator` (which has no `autoInvoke: true` frontmatter — now correctly 5 skills)
- **Skills README count mismatch:** propagated the 6→5 auto-invoke fix across 5 files (skills/README, docs/README, root README ×3, CONTRIBUTING)
- **7 dead reference paths:** `skills/debugging/SKILL.md` → `skills/bugfix-quick/SKILL.md` (merged in v3.5); `skills/chain-of-verification.md` → `/SKILL.md` suffix; `rules/logging-standards.md` → `/agent/` tier; `rules/next-step-guidance.md` → `/workflow/` tier; `docs/WORKFLOW_DIAGRAMS.md` → `/architecture/` subdir

### Stats
- Rules: 57 (was 50)
- Core rules: 18 (was 13)
- Workflow rules: 22 (was 20)

---

## [3.6.0] - 2026-04-21

### Added
- **3 reasoning techniques from published research** (opt-in via `/run reason:` prefix; auto-enabled in specific phases)
  - `self-consistency` — N independent paths + majority vote (Wang et al. 2022) — Phase 1 Deep trade-off decisions
  - `tree-of-thoughts` — Branch/evaluate/prune/backtrack (Yao et al. 2023) — P1 architecture + P4 refactor planning
  - `chain-of-verification` — Draft → verify via tool → revise (Dhuliawala et al. 2023) — **MANDATORY in Phase 4** for factual claims
  - Each has a workflow-tier rule (policy) + reference skill (playbook)
- **Prompt validation (6-dimension benchmark)** — New core rule `rules/core/prompt-validation.md`. Every actionable prompt scored on Precondition, Context, Requirement, Criteria, Expect/Actual, Output. Complexity-gated thresholds (Quick/Standard/Deep). Threshold fail → focused questions before execution.
- **No-assumption rule** — New core rule `rules/core/no-assumption.md`. "If in doubt, ASK. Never guess, never fabricate." Concrete anti-patterns, ≤2 questions per turn, honors force-mode prefixes.
- **Agent YAML frontmatter** — All 9 agents now declare `name`, `description`, `tools` (allowlist per role), `color`, optional `model`. Security + strategist are read-only (no Edit/Write/Bash). Scanner uses haiku. Architect/frontend/mobile/lead inherit session model (Opus sessions → Opus for design work).
- **4 Mermaid diagrams in root README** — How It Works, Agent Detection, Routing Strategies, Walkthrough Sequence. High-contrast colors for GitHub light/dark mode.
- **README sections** — Full Installation with verification, Walkthrough with mock terminal transcript, Command Reference (6 commands with examples), Agent Selection Examples (10 rows), Token Budget breakdown, Troubleshooting/FAQ (7 collapsed Q&As), Compared to Other Plugins (vs wshobson/agents, Superpowers).
- **Branding image prompts** — `assets/BRANDING_PROMPTS.md` with 9 minimalist prompts for regenerating mascot/logo/banner assets via Midjourney/DALL-E/Imagen.
- **Frontmatter maintenance rule** — Added to `.claude/CLAUDE.md` so future edits preserve YAML schema + audit script for orphan/dead-link check.

### Changed
- **Commands consolidated 26→6** — `/run` (universal entry), `/check` (verification), `/design` (pre-coding), `/project` (config), `/af` (system), `/help`
- **`/run <task>` auto-detects intent** — bugfix, feature, refactor, test, deploy, review, security, quality — routes to right flow automatically
- **Context-aware actions** — During active run, bare words work: `approve`, `reject`, `modify`, `handoff`, `status`, `progress`, `rollback`, `stop`
- **Renamed workflow-orchestrator → run-orchestrator** — skill, folder, state files all updated
- **Log folder: `.claude/logs/workflows/` → `.claude/logs/runs/`** — hook code aligned to match docs (was the source of "workflow state not saving" bug)
- **Rule tier rebalanced (13/17/20)** — Frontend-specific rules moved from core to agent tier: `direct-hook-access`, `correct-file-extensions`. 3 new workflow rules (reasoning techniques). Core grew from 11 to 13 with `no-assumption` + `prompt-validation`.
- **`api-design-rules.md` slimmed 187→55 lines** — Full design guidance now defers to `api-designer` skill (eliminates rule↔skill duplication).
- **Agent framework experts add `paths:` frontmatter** — 11 framework experts (react/vue/nextjs/angular/flutter/react-native/typescript/nodejs/python/laravel/go) now auto-invoke only on matching file types for precision.
- **Discoverability pass** — Every rule now has ≥1 inbound reference from an agent/skill/CLAUDE.md (was 30 orphaned rules out of 45). Zero dead links across agents/skills/rules.

### Removed
- **Router agent deleted** (`agents/router.md` + `agents/reference/router-patterns.md`) — Functionality already lived in `agent-detector` skill with more coverage and 13× more inbound refs. Unique content (Intent Detection, Tech Detection, Fallbacks) merged into `skills/agent-detector/task-based-agent-selection.md`.

### Fixed
- **Workflow state path drift** — Hook `.cjs` scripts were writing to `.claude/logs/workflows/` while skills read from `.claude/logs/runs/`. Aligned all hook code to `runs/` with legacy fallback for users migrating from pre-3.6 state.

### Stats
- Commands: 6 (was 26)
- Agents: 9 (was 10 — router consolidated)
- Skills: 41 (was 38 — 3 reasoning techniques)
- Rules: 50 (13 core + 17 agent + 20 workflow; was 45)
- Top-level parents: 5 bundled + 1 standalone (was 10 bundled + 16 standalone)

---

## [3.5.0] - 2026-04-14

### Changed
- **Skills optimized 44→38** — Merged overlapping skills, removed empty shells, compressed all to gotchas-only format
- **Auto-invoke budget reduced 6,050→~2,850 tokens** — Removed framework-expert and testing-patterns from auto-invoke, compressed remaining 6 skills
- **10 expert skills rewritten** — Angular, Flutter, Go, Laravel, Next.js, Node.js, Python, React, React Native, Vue now focus on gotchas & decisions (~300-500 tokens each, was 850-1800)
- **6 reference skills compressed** — documentation, git-workflow, problem-solving, sequential-thinking, session-continuation, phase1-lite
- **Workflow command format updated** — All phase docs and help now use `/workflow approve` format (was `workflow:approve`)
- **Skill descriptions optimized** — Added "why this skill helps" to auto-invoke descriptions for better trigger rates

### Added
- **Merged test-writer + testing-patterns** — Single test-writer skill with AAA principles, anti-patterns, framework detection (~500 tokens)
- **Merged debugging → bugfix-quick** — Root cause investigation + TDD fix process in one skill (~400 tokens)
- **Merged design-expert + design-system-library** — Unified design skill with Context7 integration (~400 tokens)

### Removed
- **testing-patterns** — Merged into test-writer (60% content overlap eliminated)
- **debugging** — Merged into bugfix-quick (overlapping triggers resolved)
- **design-system-library** — Merged into design-expert
- **qa-expert** — Empty shell, testing-patterns covered this better
- **dev-expert** — Pure router, framework-expert handles routing
- **pm-expert** — Empty shell with no actual content

### Stats
- Skills: 38 (was 44)
- Auto-invoke skills: 6 (was 8)
- Auto-invoke tokens: ~2,850 (was 6,050)
- Total skill tokens: ~20,000 (was ~34,000)

---

## [3.4.1] - 2026-04-13

### Added
- **Prompt Quality Evaluator (Mode 2)** — Evaluate and optimize any specific prompt. Scores 5 dimensions (clarity, instruction quality, efficiency, robustness, output alignment) with 0-10 calibration. Detects anti-patterns (filler phrases, redundancy, teaching model what it knows). Outputs minimal fix + production version.

---

## [3.4.0] - 2026-04-13

### Changed
- **Commands consolidated 90→26** (71% reduction) — Merged sub-commands into 10 bundled parent files. Removed 14 redundant command files. 16 standalone files kept. Total lines: ~13,900 → ~613.

---

## [3.3.0] - 2026-04-13

### Added
- **Sprint Contract** — After Phase 1 approval, user confirms explicit "done" criteria (scope, acceptance criteria, exclusions, quality gate) before Phase 2 starts. Prevents scope drift. Skippable.
- **Weighted Code Review** — 6 review aspects now weighted by impact: Security (CRITICAL), Architecture (HIGH), Error Handling (HIGH), Test Gaps (HIGH), Type Safety (MEDIUM), Simplification (LOW). 60% of review effort on architecture + edge cases. Syntax left to linters.
- **Model-Aware Compact Strategy** — Sonnet prefers `/clear` + handoff/resume over `/compact` (reasoning degrades with compacted context). Opus handles compaction well. Haiku always prefers `/clear`.
- **Evaluator Calibration** — Structured 10-point score breakdown per review aspect with anchored calibration (9-10 production-ready, 7-8 good, 5-6 needs work, <5 changes requested). Prevents "LGTM" drift.
- **Builder ≠ Reviewer rule** — Phase 3 builder MUST NOT lead Phase 4 review. Security agent is PRIMARY reviewer, tester checks regression. Enforced in execution-rules, cross-review-workflow, code-reviewer, and Phase 4 guide.
- **PostCompact hook** (`hooks/post-compact.cjs`) — Verifies workflow state survived context compaction.
- **statusline refreshInterval** — 30s auto-refresh in settings.

### Fixed
- **Deliverables not re-saved after modify/reject** — Commands updated JSON state but never re-wrote `.md` files to disk.
- **Hooks count** — Was 35 (counted lib/ utilities). Correct: 28 executable hooks.
- **Broken `../../docs/` paths** — 10 refs from plugin files resolved above repo root.
- **prompt-logger hook** — Was reading wrong stdin field (`user_prompt` → `prompt`).
- **thinking-boost + auto-learn hooks** — Same stdin field bug.

---

## [3.2.2] - 2026-04-13

### Fixed
- **Deliverables not re-saved after modify/reject** — modify and reject commands updated workflow-state.json but never re-wrote deliverable .md files to disk. Added explicit RE-SAVE steps in modify/reject flows, enforcement in deliverables rule, and validation in post-phase hook.
- **Hooks count 35→28** — Was incorrectly counting 8 lib/ utility files as hooks. Only 27 executable .cjs hooks + 1 new PostCompact = 28.
- **Broken `../../docs/` paths** — 10 refs from plugin files resolved above repo root. Fixed to repo-root-relative with "(repo root)" note since human docs aren't shipped with plugin install.
- **Stale component counts** — Synced across plugin.json, marketplace.json, README, CONTRIBUTING, CLAUDE.md, hooks/README, CHANGELOG.

### Added
- **PostCompact hook** (`hooks/post-compact.cjs`) — Verifies workflow state survived context compaction. Checks JSON validity, phase, and agent fields.
- **statusline refreshInterval** — `refreshInterval: 30` in settings.example.json for 30s auto-refresh.
- **effort frontmatter** — workflow-orchestrator (high), code-reviewer (high), bugfix-quick (low).

---

## [3.2.1] - 2026-04-10

### Fixed
- **prompt-logger hook** — Was reading `data.user_prompt` from stdin, but Claude Code sends `data.prompt`. Prompts were never logged.
- **thinking-boost hook** — Same stdin field bug (`user_prompt` → `prompt`)
- **auto-learn hook** — Added stdin JSON parsing (was env-only), now reads `data.prompt`

---

## [3.2.0] - 2026-04-10

### Changed
- **Documentation reorganization** — Separated human docs (`/docs/`) from AI instruction files (`aura-frog/docs/`). Human docs organized into: getting-started, architecture, guides, operations, reference, showcase
- **Token optimization (62% reduction)** — Rewrote 65+ instruction files across all 3 tiers for token efficiency
  - Tier 1 (always loaded): 6,144 → 2,911 lines (53% reduction, ~9,700 tokens/session saved)
  - Tier 2 (per agent): 7,791 → 2,739 lines (65% reduction)
  - Tier 3 (per phase): 4,461 → 1,384 lines (69% reduction)
- **CLAUDE.md** — 293 → 216 lines (27%), compressed TOON tables and removed redundant sections
- **Commands count** — 87 → 90 (3 new commands tracked)
- **Hooks count** — corrected to 27 (was incorrectly counting lib/ utilities)

### Added
- `docs/README.md` — Central human documentation index with 6 categories
- `docs/getting-started/` — GET_STARTED, QUICKSTART, FIRST_WORKFLOW_TUTORIAL
- `docs/architecture/` — OS architecture, config loading, workflow state, diagrams
- `docs/guides/` — Agent selection, teams, design systems, TOON format, usage
- `docs/operations/` — MCP, troubleshooting, security, learning system, cache
- `docs/reference/` — CHANGELOG, TESTING_GUIDE
- `aura-frog/docs/os-architecture.md` — Compact TOON AI reference
- `aura-frog/docs/styling-detection.md` — Compact TOON AI reference
- `aura-frog/docs/usage-clarifications.md` — Compact TOON AI reference
- `aura-frog/templates/README.md` — Index of 15 document templates

### Removed
- `aura-frog/docs/RELEASE_NOTES.md` — Redundant with CHANGELOG.md
- `aura-frog/docs/PLUGIN_INSTALLATION.md` — Content merged into GET_STARTED.md
- `aura-frog/docs/guides/COMMANDS_GUIDE.md` — Content merged into commands/README.md

### Fixed
- Component counts synced across all files (Commands: 90, Hooks: 27, Skills: 44, Rules: 45)
- Cross-links added to 18 previously orphaned documentation files
- Global CLAUDE.md version updated from 2.2.1 to 3.2.0

---

## [3.1.0] - 2026-04-06

### Added
- **Prompt Logger hook** (`hooks/prompt-logger.cjs`) — Logs every user prompt with metadata (intent, complexity, word count, commands referenced) to `.claude/metrics/prompts/{date}.jsonl`. 30-day auto-rotation. Disable with `AF_PROMPT_LOGGING=false`.
- **Prompt Evaluator skill** (`skills/prompt-evaluator/SKILL.md`) — Analyze prompt usage patterns and get improvement suggestions. Trigger: `/prompts:evaluate`
- **Prompt Evaluate command** (`commands/metrics/prompt-evaluate.md`) — `/prompts:evaluate [--days N]` generates usage report with intent distribution, feature utilization, gaps, and a 0-100 usage score
- **Evaluate Prompts script** (`scripts/metrics/evaluate-prompts.cjs`) — Analysis engine: computes stats from JSONL logs, generates prioritized suggestions (10 rules), identifies gaps, calculates usage score

### Updated
- Skills: 43 → 44 (added prompt-evaluator)
- Commands: 86 → 87 (added prompts:evaluate)
- Hooks: 26 → 27 (added prompt-logger)
- `hooks.json` — Added prompt-logger to UserPromptSubmit (async)

---

## [3.0.0] - 2026-04-01

### LLM OS Architecture

Major architecture rewrite. Aura Frog now frames Claude Code as an Operating System — Claude as kernel, agents as processes, context window as managed RAM.

#### Added
- **OS Architecture document** (`docs/os-architecture.md`) — Process table, memory segments, 3-tier compression, context switch protocol, golden rules
- **Memory Trust Policy rule** (`rules/core/memory-trust-policy.md`) — Memory as hint + strict write discipline + retrieval hierarchy
- **3-Tier Context Compression** — MicroCompact (free, every 10 turns) → AutoCompact (/compact at 80%) → ManualCompact (session snapshot)
- **Process Table** — 10 agents mapped to PID/state/budget model with context switch protocol

#### Changed
- **CLAUDE.md** — Complete rewrite with OS framing, boot sequence, golden rules, orchestrator principles
- **README.md** — Updated positioning: "An Operating System for software engineering"
- **plugin.json** — New description with LLM OS framing
- Rules: 44 → 45 (13 core + 15 agent + 17 workflow)

#### Principles
- **Memory as Hint** — All cached context treated as hints, verified against actual files before acting
- **Strict Write Discipline** — State only updates after confirmed success
- **Lazy Load Everything** — KERNEL + INDEX on boot (<3K tokens), rest on demand
- **Orchestrate, Don't Execute** — Dispatch to right agent, verify output, advance

---

## [2.3.2] - 2026-03-30

### Fixed
- **validate-counts.sh** — Removed `-maxdepth 1` so rules in subdirs (core/agent/workflow) are counted correctly
- **profile-hooks.sh** — Fixed nanosecond math overflow (octal parsing of `069`) using `10#` prefix
- **set-active-plan.cjs** — Moved from `hooks/` to `scripts/` (was orphaned — CLI utility, not lifecycle hook)

### Fixed
- **sync-settings** — Now merges `statusLine` config from plugin (was ignored, causing broken paths)
- **statusline path** — Fixed `${CLAUDE_PLUGIN_ROOT}` (not a real var) → hardcoded paths with fallback

### Changed
- **README.md** — Marketing rewrite: benefit-first headings, side-by-side before/after, ~37% shorter
- **Socratic brainstorming** — Slimmed from 15-line detailed instructions to 3-line principle. Agent decides what to ask based on context.
- **CI scripts** — Moved validate-*.sh to `scripts/ci/`, added `generate-stats.sh`

### Updated
- Hooks count: 27 → 26 (set-active-plan moved out)
- Scripts count: 20 → 41 (actual count + moved file)
- All counts synced across README, plugin.json, marketplace.json, CLAUDE.md

---

## [2.3.1] - 2026-03-30

### Remove conversation banner — status line only

#### Removed
- **agent-identification-banner.md** rule — deleted entirely
- **BANNER_EXAMPLES.md** — no longer needed
- All banner instructions from CLAUDE.md, execution-rules, agent-detector, workflow-orchestrator, session-continuation
- Banner from session start steps (6 → 5 steps)

#### Updated
- Rules: 45 → 44 (12 core + 15 agent + 17 workflow)
- CLAUDE.md: "Do NOT render banners in conversation" is now the rule

---

## [2.3.0] - 2026-03-30

### Status Line — Banner moves to CLI status bar (0 tokens)

#### Added
- **statusline.sh** — Status line script showing agent, phase, model, context %, cost. Pure bash, no `jq` required
- **statusLine config** in `settings.example.json` — Enabled by default when settings are synced
- **One-time hint** in session-start hook — Prompts user to enable status line if not configured
- **agent/phase fields** in session cache — Status line reads current state from `.claude/cache/session-start-cache.json`

#### Changed
- **Banner rule downgraded** from CRITICAL to LOW — Status line is now primary display, conversation banner is optional
- **CLAUDE.md** — Replaced banner section with status line documentation

#### Token Savings
- ~200 tokens saved per response (no more conversation banners)
- Status line runs outside conversation context (0 token cost)

---

## [2.2.2] - 2026-03-25

### Full repo consistency pass — 116 files

#### Fixed
- **Old agent names** in rules, docs, skills, hooks, templates (30+ instances across 50+ files)
- **Version footers** removed from all rules, skills, docs, hooks, agents files
- **Count mismatches** — README/CLAUDE.md/hooks README all synced to actual: 10/43/89/45/27
- **install.sh** version synced to current
- **Broken file references** — smart-agent-detector.md → agent-detector/SKILL.md
- **Placeholder date** in documentation skill replaced
- **Stale Last Updated lines** removed from all skill files

---

## [2.2.1] - 2026-03-25

### Cleanup — Command files bulk update

#### Fixed
- **Outdated agent names in 30+ commands** — pm-operations-orchestrator→lead, qa-automation→tester, ui-expert→frontend, devops-cicd→devops, security-expert→security, etc.
- **Obsolete file references** — smart-agent-detector.md→agent-detector/SKILL.md
- **Version footers removed** from all command files
- **Stale version numbers** in banner examples updated

---

## [2.2.0] - 2026-03-24

### ClaudeKit Learnings + Showcase + CI

#### Added
- **thinking-boost.cjs** — UserPromptSubmit hook that silently enhances Claude's reasoning depth based on task complexity (3 levels). Disable with `AF_THINKING_BOOST=0`
- **6-aspect code reviewer** — Rewrote code-reviewer skill: security, types, error handling, tests, quality, simplification. TOON summary + severity ratings
- **measure-performance.sh** — Real publishable performance numbers (context overhead, token estimates, component inventory, codebase stats)
- **profile-hooks.sh** — Hook execution profiling with timing, output size, token estimates
- **af CLI wrapper** — Zero-dependency bash tool: doctor, measure, profile, version, update
- **FEEDBACK.md** — Testimonial collection guide
- **metrics:performance command** — Run performance measurement
- **metrics:hooks command** — Run hook profiling
- **CI validation workflow** — GitHub Actions: count validation, hook syntax check, file structure, performance report
- **Showcase samples** — Real workflow outputs: JWT auth (Phase 1/4/5) and pagination bugfix (Phase 1)

#### Stats
- Commands: 86 → 88 (+metrics/performance, +metrics/hooks)
- Hooks: 26 → 27 (+thinking-boost)
- Scripts: 18 → 20 (+measure-performance, +profile-hooks)

---

## [2.1.2] - 2026-03-24

### Fix — scout-block false positives on heredoc content

#### Fixed
- **scout-block.cjs** — Only checks first line of Bash commands against blocked patterns, not multiline heredoc bodies. Prevents false blocks when release notes or strings contain words like "coverage" or "target"

---

## [2.1.1] - 2026-03-24

### Maintenance — Version Sync Cleanup

#### Fixed
- **marketplace.json** — Was stuck at 2.0.0, now synced
- **`.claude/CLAUDE.md`** — Was stuck at 1.22.0, now synced

#### Removed
- **Version footers from 55+ files** — Only 4 files now carry the plugin version
- **Hardcoded versions in banner examples** — Now use `{version}` placeholder

#### Updated
- **`sync-version.sh`** — Simplified to only update 4 version files + README badge
- **Templates** — Use `[AF_VERSION]` placeholder instead of hardcoded version

---

## [2.1.0] - 2026-03-24

### Performance Optimization — 8 PERF Items

#### Added
- **3-tier rule architecture (PERF-2)** — Rules reorganized into `core/` (13), `agent/` (15), `workflow/` (17) subdirectories for selective loading. ~30-50% token reduction vs loading all 45 rules
- **Agent detection cache (PERF-4)** — Cache detection results per workflow. Skip full 5-step detection after Phase 1. ~500-1000 tokens saved per message
- **Session start TTL cache (PERF-6)** — 1-hour cache for session-start.cjs. Skips all detection on cache hit. Invalidated by TTL expiry or .envrc changes
- **Smart compact context (PERF-3)** — `generateCompactContext()` in compact-handoff.cjs writes Phase 1 decisions, modified files, and session context for post-compact resume
- **Test pattern extractor (PERF-7)** — New `test-pattern-extractor.cjs` hook extracts framework, imports, mock patterns from 3 most recent test files. Cache: `.claude/cache/test-patterns.json`
- **Incremental project refresh (PERF-8)** — New `project-refresh-incremental.sh` script. Uses `git diff` to only re-run affected generators. `/project:refresh --incremental`
- **Rate limit reminder hook** — `rate-limit-check.cjs` on Stop event reminds user to run `/usage`

#### Fixed
- **TDD phase references (PERF-5)** — `auto-test-runner.cjs` updated from `['5a', '5b', '5c']` to `['2', '3', '4']` matching 5-phase workflow
- **Non-workflow test mode (PERF-5)** — Auto-test-runner now runs when editing test files even outside a workflow

#### Updated
- **smart-learn.cjs (PERF-1D)** — Early exit for non-code files (.md, .json, .css, etc.)
- **feedback-capture.cjs (PERF-1E)** — Fast path skip for brand-new files (ctime ≈ mtime)
- **test-writer SKILL.md** — Loads test patterns from cache before writing tests
- **Rule path references** — Updated across CLAUDE.md, agents, sync-version.sh
- **Hooks:** 24 → 26 (+test-pattern-extractor, +rate-limit-check)
- **Scripts:** 17 → 18 (+project-refresh-incremental.sh)

#### Maintenance
- **Version footer cleanup** — Removed `**Version:** X.Y.Z` footers from ~55 files. Only 4 files now carry the plugin version (plugin.json, marketplace.json, CLAUDE.md, .claude/CLAUDE.md)
- **Banner examples use `{version}` placeholder** — No more hardcoded versions in example banners
- **Simplified `sync-version.sh`** — Removed broad sweep, now only updates 4 version files + README badge
- **Fixed marketplace.json** — Was stuck at 2.0.0, now synced to 2.1.0

#### Stats
- Rules: 45 (13 core + 15 agent + 17 workflow)
- Hooks: 26 (was 24)
- Scripts: 18 (was 17)
- Version files: 4 (was 60+)

---

## [2.0.0] - 2026-03-24

### Major Refactor — Agent Rename, Context Optimization, Quality Overhaul

Formerly v1.22.0, promoted to v2.0.0 for breaking changes (agent renames, module removals).

#### Added
- **`repo-map-gen.sh` script** — Generates annotated directory tree with purpose descriptions inferred from directory names, READMEs, and file types. Configurable depth (default 3). Skips node_modules, .git, dist, build, vendor
- **`file-registry-gen.sh` script** — Identifies key files (entry points, configs, hub files imported by 3+ others) and outputs YAML registry with roles and relationships. Configurable max files (default 50)
- **`architecture-gen.sh` script** — Analyzes architecture type (monorepo, plugin, fullstack, SPA, API, MVC), key dependencies with purpose annotations, design patterns (repository, service layer, middleware, hooks, etc.), and data flow patterns
- **3 new project context files** — `repo-map.md`, `file-registry.yaml`, `architecture.md` generated during `project:init` and `project:regen`
- **Smart context loading strategy** — Routes context loading by scenario: simple questions (~200 tokens), bug fixes (~800 tokens), full context (~2000 tokens), architecture decisions (~1000 tokens)
- **6 new pattern detections in context-compress.sh** — indentation style, state management, API integration pattern, component style, environment variable pattern, monorepo tool
- **`collaborative-planning` rule** — Multi-team deliberation for Deep tasks. 4 rounds: independent analysis (4 perspectives: Builder/Breaker/User/Why), cross-review + debate, use case simulation, convergence. Works with or without Agent Teams enabled
- **`strategist` agent** — Business-level thinking: ROI evaluation, MVP scoping, scope creep detection, build vs buy decisions. 4th perspective in collaborative planning ("Why build this?")

#### Updated
- **Agent rename** — All 9 non-architect agents renamed for clarity and consistency:
  - `ui-expert` → `frontend`, `mobile-expert` → `mobile`, `game-developer` → `gamedev`
  - `qa-automation` → `tester`, `security-expert` → `security`, `devops-cicd` → `devops`
  - `project-manager` → `scanner`, `pm-operations-orchestrator` → `lead`, `smart-agent-detector` → `router`
- **`context-compress.sh`** v1.1.0 → v2.0.0 — Now detects 12 patterns (was 6)
- **`project:init` command** v2.0.0 → v3.0.0 — Added Step 3b for deep context generation with Claude enrichment
- **`project:regen` command** v1.0.0 → v2.0.0 — Added Steps 4.5-4.8 for regenerating new context files
- **`project-context-loader` skill** v1.1.0 → v2.0.0 — Loads 7 context files (was 4), smart loading strategy, updated token efficiency metrics
- **Project context files** — 4 → 7 files per project
- **`.claude/CLAUDE.md`** — Updated context_files reference from 4 → 7

- **`docs/TROUBLESHOOTING.md`** — Comprehensive error recovery guide
- **`docs/guides/FIRST_WORKFLOW_TUTORIAL.md`** — Interactive step-by-step tutorial
- **`docs/RELEASE_NOTES.md`** — Human-readable release highlights
- **`commands/tutorial.md`** — Onboarding command
- **`commands/plugin/update.md`** — Plugin update instructions
- **`hooks/changelog-notify.cjs`** — Shows release highlights after update
- **Enhanced `update-check.cjs`** — Major version warning + changelog link

#### Removed
- **`model-router` skill** — Cannot switch model mid-session in Claude Code. Misleading feature. (220 lines)
- **`visual-pixel-perfect` skill + rule + hook** — Niche Figma-to-code workflow, <5% usage. (695 lines)
- **`nativewind-generator` skill** — Hyper-niche NativeWind generator. (241 lines)
- **`visual-pixel-init.cjs`** — Removed from SessionStart hooks (ran every session for unused feature)
- **17 skills set to `autoInvoke: false`** — 12 framework experts + 5 niche skills. Only bundle loaders auto-invoke now. (~9,067 lines removed from auto-invoke pool)
- **Banner policy changed** — Only at session start, phase transitions, agent switches (was every response). Saves ~3-4K tokens/session.

#### Stats
- Agents: 10 (9 renamed, +1 strategist, -1 gamedev externalized)
- Skills: 52 → 43 (-10: model-router, visual-pixel-perfect, nativewind-generator, godot-expert, seo-bundle, seo-check, seo-expert, seo-geo, seo-schema, ai-discovery-expert; +1: git-worktree)
- Rules: 49 → 45 (-5: visual-pixel-accuracy, godot-gdscript-typing, godot-scene-composition, seo-technical-requirements, ai-discovery-optimization; +1: collaborative-planning)
- Hooks: 27 → 23 (-1: visual-pixel-init; +2: phase-checkpoint, update-check; note: count is .cjs files only)
- Commands: 86 → 84 (-4: seo commands; +2: workflow/rollback, metrics/dashboard)
- Auto-invoke skills: 13 → 8 (removed model-router, seo-bundle; disabled 17 niche/framework experts)

---

## [1.21.0] - 2026-03-12

### 5-Phase Workflow Consolidation & Full Repo Cleanup

#### Added
- **`logs:cleanup` command** - Clean old log files, workflow data, and session artifacts older than X days. Supports `--dry-run` preview mode. Default threshold: 30 days
- **`requirement-challenger` rule** - Proactive critical thinking before accepting requirements. Challenges clarity, scope, assumptions, edge cases, feasibility, and alternatives. Skippable with "just do it"
- **`PHASE_5_FINALIZE.MD`** - New phase doc for Phase 5 (Finalize): documentation, notifications, workflow closure
- **`workflow:phase-2-test` command** - Execute Phase 2 test scaffolding
- **`workflow:phase-3-green` command** - Execute Phase 3 (Build GREEN)
- **`workflow:phase-4-refactor` command** - Execute Phase 4 (Refactor + Review)

#### Updated
- **9-phase → 5-phase workflow consolidation** - Phases condensed: Phase 1 (Understand + Design), Phase 2 (Test RED), Phase 3 (Build GREEN), Phase 4 (Refactor + Review), Phase 5 (Finalize). Same 2 approval gates (Phase 1 and Phase 3). Removed 9 old phase commands, added 3 new ones
- **Full repo cleanup** - Updated 130+ files: all shell scripts, commands, rules, skills, agents, docs, READMEs, and templates now consistently reference the 5-phase workflow with correct phase names
- **Shell scripts** - Rewrote phase name case statements in 6 workflow scripts (workflow-status.sh, init-workflow.sh, phase-transition.sh, save-deliverable.sh, session-handoff.sh, generate-report.sh)
- **Phase naming** - Fixed all "Technical Planning"→"Test RED", "Design Review"→"Build GREEN", "Test Planning"→"Refactor + Review" references
- **Root README.md** - Updated counts, workflow diagram, approval gates, and feature table
- **All component READMEs** - Consistent counts: 10 agents, 52 skills, 49 rules, 86 commands, 27 hooks

#### Removed
- 7 old phase docs (PHASE_2_TECHNICAL_PLANNING through PHASE_9_NOTIFICATION)
- 9 old phase commands (phase-3.md through phase-9.md)

#### Stats
- Commands: 92 → 86 (-6: 9-phase → 5-phase consolidation, +1: logs:cleanup)
- Rules: 48 → 49 (+1: requirement-challenger)
- Phase docs: 9 → 5 (+1: PHASE_5_FINALIZE.MD)

---

## [1.20.0] - 2026-02-27

### Best Practices Enforcement & Hook Optimizations

6 new hooks that automate best practices from the [AI Vibe Coding wiki](https://github.com/nguyenthienthanh/aura-frog/wiki/AI-Vibe-Coding-Best-Practices), plus critical stderr fixes and a PR template.

#### Added
- **`security-scan.cjs` hook** - PostToolUse hook that scans written files for vulnerability patterns (secrets, SQL injection, XSS, weak crypto) without requiring external tools
- **`commit-attribution.cjs` hook** - PreToolUse hook that warns when `git commit` is missing `Co-Authored-By:` AI attribution
- **`security-critical-warn.cjs` hook** - PreToolUse hook with tiered warnings (CRITICAL/HIGH/MEDIUM) for security-sensitive files (auth, payment, crypto paths)
- **`auto-test-runner.cjs` hook** - PostToolUse hook that auto-runs detected test runner during TDD phases (5a/5b/5c). Supports Vitest, Jest, Pytest, Go, Cargo, PHPUnit, Laravel
- **`token-tracker.cjs` hook** - PostToolUse hook that estimates cumulative token usage and warns at 50%/70%/85% thresholds
- **`scope-drift.cjs` hook** - UserPromptSubmit hook that detects when conversation scope diverges from the original workflow task
- **`templates/pull_request_template.md`** - PR template with AI-specific sections (attribution, security checklist, human review)
- **AI Vibe Coding wiki page** - Comprehensive best practices guide published to GitHub wiki

#### Fixed
- **`hooks.json` stderr bug** - Removed `2>&1` from 5 hooks (scout-block, task-completed, teammate-idle, prompt-reminder, subagent-init) that suppressed stderr output. Claude Code uses stderr to display block/warning messages; `2>&1` redirected them to stdout making them invisible
- **Old secrets hook replaced** - Inline bash secrets hook replaced with tiered `security-critical-warn.cjs` for graduated warnings

#### Stats
- Hooks: 21 → 27 (+6: security-scan, commit-attribution, security-critical-warn, auto-test-runner, token-tracker, scope-drift)

---

## [1.19.0] - 2026-02-09

### Major Optimization

- **Banner rule optimized** (19KB -> 5KB) — Examples moved to `docs/BANNER_EXAMPLES.md`
- **Rules consolidated** — YAGNI+DRY+KISS merged into `simplicity-over-complexity.md` (50 -> 48 rules)
- **Fasttrack merged** — Now a mode inside `workflow-orchestrator` (53 -> 52 skills)
- **Approval gates slimmed** (558 -> 96 lines) — Points to orchestrator for details
- **PreCompact hook** — Auto-save workflow state before context compaction
- **`context: fork`** — Heavy skills run in forked context
- **plugin.json** — Removed invalid `engines`, `capabilities`, `stats` fields

---

## [1.18.0] - 2026-02-09

### Agent Teams Support (Experimental)

Full Claude Agent Teams integration for real multi-agent orchestration with persistent teammates, peer-to-peer messaging, and shared task lists.

#### Added
- **Agent Teams integration** - Real multi-agent orchestration via Claude's experimental Agent Teams feature
- **`isAgentTeamsEnabled()` utility** - Detection function in `af-config-utils.cjs` checking settings.json + env
- **`teammate-idle.cjs` hook** - TeammateIdle lifecycle hook for assigning cross-review work to idle teammates
- **`task-completed.cjs` hook** - TaskCompleted lifecycle hook for validating teammate task completion quality gates
- **Team mode detection** in agent-detector skill - Decision matrix for team vs subagent mode
- **Phase team composition** in workflow-orchestrator - Per-phase lead/primary/secondary teammate assignments
- **Team task patterns** in task-based-agent-selection - Multi-domain task triggers for team activation
- **Team Lead Mode** for lead - Team creation, task distribution, cross-review coordination
- **Team Mode Behavior** sections for architect, frontend, tester, security, mobile agents
- **Team mode cross-review** in cross-review-workflow rule - Parallel reviews via teammate messaging (~59% faster)
- **Team context management** in context-management rule - Explicit context passing for independent teammates
- **Team execution rules** in execution-rules - ALWAYS/NEVER rules for team mode
- **Team banners** in agent-identification-banner - Lead + teammate banner formats
- **AGENT_TEAMS_GUIDE.md** - Complete setup and usage documentation
- **`project:sync-settings` command** - Auto-merge plugin settings (env + permissions) into project settings
- **Mandatory Teams banner** - Every banner now shows `Teams: [✓ enabled / ✗ off]` status
- **Complexity gate for teams** - Team mode ONLY for Deep + multi-domain tasks (~3x token savings on Quick/Standard)
- **Concrete parallel startup patterns** - TeamCreate → TaskCreate × N → parallel Task × N with real tool examples
- **Teammate operation guide** - Each agent now has "When Operating as Teammate" section (TaskList → claim → work → SendMessage)

#### Updated
- **`subagent-init.cjs`** - Teammate awareness via `CLAUDE_TEAMMATE_NAME` env var, team context injection
- **`hooks.json`** - Added TeammateIdle and TaskCompleted hook events (Hooks: 21 → 23)
- **Session state schema** - Added `teamMode` and `activeTeammates` fields
- **router** - Team mode output format and team vs subagent decision matrix
- **plugin.json** - Version 1.18.0, updated description
- **`project:init`** - Settings merge now includes env vars (not just permissions)
- **`project:regen`** - Added Step 5: Sync Plugin Settings (auto-merges latest plugin defaults)
- **`settings.example.json`** - Added `env` section with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` default
- **Banner format** - All 4 templates + all examples updated with Teams status line

#### Stats
- Hooks: 21 → 23 (+2: TeammateIdle, TaskCompleted)
- Agents: 11 (unchanged)
- Skills: 53 (corrected count: 13 auto-invoke + 40 reference)
- Rules: 50 (unchanged)
- Commands: 82 → 83 (+1: project:sync-settings)

---

## [1.17.0] - 2026-01-22

### Context Optimization & Agent Consolidation

Major refactoring for cost savings, better quality, and improved reasoning based on community best practices research.

#### Token Optimization Patches (NEW)

Critical patches to reduce token usage from ~200k to ~40k per workflow:

| Patch | Change | Impact |
|-------|--------|--------|
| 1. Agent Detector | `allowed-tools: NONE` (was Read, Grep, Glob) | -10-30k tokens/message |
| 2. Project Context Loader | `autoInvoke: false` (was true) | -15-25k tokens/session |
| 3. Phase 1 Token Cap | 500 token hard cap with TOON format | -5-15k tokens |
| 4. Workflow Orchestrator | Load files on-demand, not all 9+ upfront | -20-40k tokens |
| 5. Token Budget in CLAUDE.md | Phase-by-phase budget enforcement | Governance |
| 6. Phase 1 LITE skill | Ultra-compact requirements template | -10-20k tokens |

**Expected Result:** Workflow completion in ~40k tokens (was ~200k).

#### Added
- **phase1-lite skill** - Ultra-compact Phase 1 output (500 token cap, TOON only)
- **Token Budget section** in CLAUDE.md - Phase-by-phase token limits
- **model-router skill** - Auto-select Haiku/Sonnet/Opus based on task complexity (30-50% cost savings on trivial tasks)
- **framework-expert skill** - Lazy-load framework patterns on demand (~80% token reduction)
- **seo-bundle skill** - Consolidated SEO/GEO skills with lazy loading
- **testing-patterns skill** - Universal testing patterns across all frameworks
- **context-management rule** - Token awareness and model selection guidelines

#### Consolidated Agents (15 → 11)
| New Agent | Replaces | Purpose |
|-----------|----------|---------|
| **scanner** | project-detector, project-config-loader, project-context-manager | Unified project detection, config, and context |
| **architect** | backend-expert, database-specialist | System design + database architecture |
| **frontend** | web-expert, ui-designer | Frontend + design systems |

#### Bundled Commands (6 new unified commands)
| Command | Replaces | Subcommands |
|---------|----------|-------------|
| `/workflow` | 22 workflow commands | start, status, phase, next, approve, handoff, resume |
| `/test` | 4 test commands | unit, e2e, coverage, watch, docs |
| `/project` | 6 project commands | status, refresh, init, switch, list, config |
| `/quality` | 3 quality commands | lint, complexity, review, fix |
| `/bugfix` | 3 bugfix commands | quick, full, hotfix |
| `/seo` | 3 seo commands | check, schema, geo |

#### Removed (Consolidated)
- **Agent files:** backend-expert.md, database-specialist.md, web-expert.md, ui-designer.md, project-detector.md, project-config-loader.md, project-context-manager.md
- **Auto-invoke skills reduced:** Individual framework experts moved to reference skills (lazy-loaded by framework-expert)

#### Stats
- **Agents:** 11 (was 15) - 4 consolidated
- **Auto-invoke Skills:** 13 (was 28) - 15 moved to reference/bundles
- **Reference Skills:** 40 - framework experts (12), SEO experts (5), design (4), learning (2), workflow (3), others (14)
- **Total Skills:** 53 (was 48)
- **Rules:** 50 (was 49) - +1 context-management
- **Bundled Commands:** 6 entry points (replaces 41 individual commands)

#### Cost Impact
| Optimization | Savings |
|--------------|---------|
| Model routing (Haiku for trivial) | 30-50% on simple tasks |
| Framework skill bundles | ~80% framework token reduction |
| Reduced auto-invoke skills (13 vs 28) | ~50% context reduction |

#### Fixed
- **Workflow ID naming** - Now uses ticket number (JIRA-123) or short term + date (fix-payment-0122) instead of long format with full timestamp
- **Workflow logging after modify/reject** - Now logs all workflow events (approve/reject/modify) to execution.log with timestamps, tracks rejection and modification counts per phase, and displays history in workflow status. Also syncs to Supabase `af_workflow_events` table when configured.

#### Added (Supabase Schema)
- **af_workflow_events table** - Tracks all workflow events (approve/reject/modify/cancel) with phase, attempt count, and reason
- **v_workflow_events_summary view** - Summarizes events per phase
- **v_phase_rejection_rates view** - Shows rejection/modification rates per phase

---

## [1.16.0] - 2026-01-20

### Learning System v2.0: Local Storage & Smart Learning

Major improvements to the learning system with local-first storage and automatic pattern detection.

#### Added
- **Local storage by default** - Learning works without Supabase setup
  - Files stored in `.claude/learning/` directory
  - `feedback.json`, `patterns.json`, `metrics.json`, `learned-rules.md`
  - Supabase still supported for cross-machine sync
- **Smart Learn hook** - `hooks/smart-learn.cjs`
  - Auto-learns from successful Write/Edit/Bash operations
  - Detects patterns: arrow_functions, prefer_const, async_await, explicit_types
  - No user feedback required - learns from success
- **Workflow Edit Detection** - `hooks/workflow-edit-learn.cjs`
  - Detects when users edit workflow MD files directly
  - Extracts formatting/verbosity preferences from changes
- **Firebase Cleanup hook** - `hooks/firebase-cleanup.cjs`
  - Cleans up auto-created firebase-debug.log when Firebase not configured
- **Compact Handoff hook** - `hooks/compact-handoff.cjs`
  - Auto-saves workflow state before compact
  - Auto-resumes workflow context after compact
  - 30-minute window for resume

#### Updated
- **`hooks/lib/af-learning.cjs`** v2.0.0 - Dual-mode storage (local/Supabase)
  - `isLearningEnabled()` - Always true unless explicitly disabled
  - `isLocalMode()` - True when Supabase not configured
  - Auto-generates `learned-rules.md` for human-readable rules
- **`hooks/auto-learn.cjs`** v2.1.0 - Fixed task-specific filtering
  - Now properly detects corrections without requiring Supabase
  - Added `isLearnableFeedback()` to filter task-specific feedback
  - Skips feedback with file paths, specific values, camelCase identifiers
- **`hooks/hooks.json`** - Added new hooks (17 → 21)

#### Storage Modes
| Mode | When Used | Location |
|------|-----------|----------|
| **Local** | No Supabase config | `.claude/learning/` |
| **Supabase** | SUPABASE_URL + SUPABASE_SECRET_KEY set | Cloud |

#### Stats
- Hooks: 21 (was 17)
- New hooks: smart-learn, workflow-edit-learn, firebase-cleanup, compact-handoff

---

## [1.14.0] - 2026-01-14

### Visual Pixel-Perfect Testing

New skill for automated visual regression testing with implement → render → snapshot → compare → fix loop.

#### Added
- **visual-pixel-perfect skill** - `skills/visual-pixel-perfect/SKILL.md`
  - Auto-invokes on "visual test", "pixel perfect", "design match", "visual regression"
  - Implement → Render → Snapshot → Compare → Fix loop (max 5 attempts)
  - Thresholds: web <0.5%, PDF <1.0%
  - References: design-spec-schema, design-tokens-contract, diff-engine-config, render-configs, ci-integration
- **visual-pixel-accuracy rule** - `rules/visual-pixel-accuracy.md` (CRITICAL)
  - No guessing (use tokens only)
  - Pixel accuracy over code style
  - No success without diff pass
  - Frozen regions immutable
- **visual-pixel-init hook** - `hooks/visual-pixel-init.cjs`
  - Detects `.claude/visual/` folder on session start
  - Injects AF_VISUAL_TESTING, AF_VISUAL_PATH, AF_VISUAL_WEB_THRESHOLD, AF_VISUAL_PDF_THRESHOLD
- **Visual scripts** - `scripts/visual/`
  - `init-claude-visual.sh` - Initialize .claude/visual/ folder structure
  - `pdf-render.sh` - Puppeteer PDF rendering
  - `snapshot-compare.sh` - Pixelmatch diff comparison
  - `visual-test.sh` - Main test runner (npm run claude:visual-test)

#### Updated
- **`hooks/hooks.json`** - Added visual-pixel-init to SessionStart
- **`hooks/README.md`** - Documented visual-pixel-init hook, count: 15 → 16
- **`rules/README.md`** - Added visual-pixel-accuracy rule, count: 45 → 46
- **`skills/README.md`** - Added visual-pixel-perfect skill, count: 38 → 39
- **`CLAUDE.md`** - Added visual-pixel-perfect to auto-invoke skills list

#### Project Folder Structure
```
.claude/visual/
├── design/           # Reference images
├── spec/             # DesignSpec JSON files
├── tokens/           # Design tokens
├── snapshots/
│   ├── baseline/     # Approved snapshots
│   ├── current/      # Test run snapshots
│   └── diff/         # Diff images
├── tests/            # Visual test files
└── config.json       # Visual testing config
```

#### Stats
- Rules: 46 (was 45)
- Skills: 39 (was 38)
- Hooks: 16 (was 15)
- Scripts: +4 new visual scripts

---

## [1.13.0] - 2026-01-14

### Frontend Excellence + Lint Auto-Fix + Hooks Cleanup

Major frontend optimization with actionable UX/UI guidance, plus automatic linting!

#### Cleanup
- **Merged `workflow-metrics.cjs` into `session-metrics.cjs`** - Pattern extraction now happens on session stop
- **Removed unused `workflow-metrics.cjs`** - Was documented but never registered in hooks.json
- **Fixed hooks count** - Accurate count now: 15 hooks (was incorrectly 16)

#### Added
- **frontend-excellence rule** - `rules/frontend-excellence.md` (CRITICAL)
  - **UX Laws**: Fitts' (touch targets), Jakob's (standard patterns), Hick's (limit choices), Miller's (chunking)
  - **Performance Targets**: LCP <2.5s, CLS <0.1, INP <200ms, 60fps mobile, Lighthouse 90+
  - **Accessibility Checklist**: 4.5:1 contrast, 48dp touch targets, keyboard nav, ARIA patterns
  - **Mobile UX**: Thumb zones, one-handed use (49% users), iOS/Android conventions
  - **Loading States**: Skeleton screens, optimistic updates, timing guidelines
  - **Form UX**: Validation timing, error messages, autofill support
  - **Decision Trees**: Button styling, action placement, loading indicators
- **code-simplifier skill** - `skills/code-simplifier/SKILL.md`
  - Auto-invokes on "simplify", "too complex", "KISS", "over-engineered"
  - References `rules/kiss-avoid-over-engineering.md` (avoids duplication)
  - Quick reference for complexity targets and checklist
  - Links to `quality:complexity` command
- **Lint auto-fix hook** - `hooks/lint-autofix.cjs`
  - Auto-detects file type and available linters
  - Runs linter with --fix flag after Write/Edit
  - Supports: ESLint, Prettier, PHP CS Fixer, Pint, Ruff, Black, gofmt, Rubocop, rustfmt, dart format
  - Non-blocking - reports results but doesn't fail operations
  - Disable with `AF_LINT_AUTOFIX=false`

#### Updated
- **`agents/web-expert.md`** v3.0 - Added performance targets, UX laws, accessibility checklist, loading/error patterns
- **`agents/mobile.md`** v3.0 - Added touch targets, thumb zones, iOS/Android conventions, FlashList, haptics
- **`agents/ui-designer.md`** v2.0 - Added UX laws application, accessibility checks in analysis
- **`rules/README.md`** - Added frontend-excellence rule, count: 44 → 45
- **`skills/README.md`** - Added code-simplifier skill, count: 37 → 38
- **`CLAUDE.md`** - Added code-simplifier to auto-invoke skills list
- **`hooks.json`** - Added lint-autofix to PostToolUse (Write|Edit)
- **`hooks/README.md`** - Documented lint-autofix hook (#7), count: 15 → 16

#### Supported Linters
| Language | Linters |
|----------|---------|
| JS/TS/Vue | ESLint, Prettier |
| CSS/SCSS | Prettier, Stylelint |
| PHP | PHP CS Fixer, Laravel Pint |
| Python | Ruff, Black |
| Go | gofmt, goimports |
| Ruby | Rubocop |
| Rust | rustfmt |
| Dart | dart format |

#### Stats
- Rules: 45 (was 44)
- Skills: 38 (was 37)
- Hooks: 15 (was 14, +1 new, -1 removed duplicate)

---

## [1.11.1] - 2026-01-08

### Auto-Learn v2.0: Deduplication & Pattern Detection

Enhanced auto-learn hook with smart deduplication and pattern detection.

#### Updated
- **`hooks/auto-learn.cjs`** v2.0.0 - Added deduplication, pattern detection, local cache
- **`hooks/README.md`** - Updated auto-learn documentation

---

## [1.11.0] - 2026-01-08

### Auto-Learn: Automatic Feedback Detection with Deduplication & Patterns

Learning system now automatically detects corrections and approvals from your messages - no need to run `/learn:feedback` manually!

#### Added
- **Auto-learn hook v2.0** - `hooks/auto-learn.cjs`
  - Fires on every UserPromptSubmit
  - Detects correction patterns: "no", "wrong", "actually", "don't do that", "should be"
  - Detects approval patterns: "good", "great", "perfect", "looks good"
  - Auto-categorizes: code_style, testing, security, code_quality
  - **Deduplication** - Skips identical feedback within 24 hours (MD5 hash)
  - **Pattern detection** - Auto-creates learned patterns after 3+ similar corrections
  - **Local cache** - `.claude/cache/auto-learn-cache.json` for deduplication
  - **Local patterns** - `.claude/cache/learned-patterns.md` human-readable file
  - Non-blocking - never interrupts your flow

#### Updated
- **`hooks.json`** - Added auto-learn hook to UserPromptSubmit
- **`hooks/README.md`** - Documented auto-learn hook (hook #8), updated count to 15 hooks

#### How It Works
```
User: "Don't add comments everywhere"
         ↓
   [Auto-Learn Hook]
         ↓
   Hash: abc123... (check dedup cache)
         ↓
   Not duplicate → increment pattern count
         ↓
   🧠 Learning: Captured correction [code_style:minimal_comments] (2x)
         ↓
   → Recorded to Supabase + local cache

# After 3rd correction about comments:
   🧠 Learning: Pattern detected! "code_style:minimal_comments" (3 occurrences)
         ↓
   → Auto-creates learned pattern in Supabase
```

#### Stats
- Hooks: 15 (was 14)

---

## [1.10.1] - 2026-01-08

### Bug Fix: Session Hooks Not Loading Environment Variables

#### Fixed
- **Session hooks not loading .envrc** - Hooks that use Supabase (session-start, feedback-capture, session-metrics) now properly source `.envrc` before executing
  - Root cause: Node.js hooks ran as separate processes without inheriting environment variables
  - Memory auto-load was failing silently with "Learning disabled" or "Missing Supabase config"
  - Added `source .envrc` to SessionStart, PostToolUse (Write|Edit), and Stop hooks

#### How It Works Now
```bash
# Before (broken)
node "hooks/session-start.cjs"  # No env vars!

# After (fixed)
if [ -f .envrc ]; then set -a; source .envrc; set +a; fi; node "hooks/session-start.cjs"
```

---

## [1.10.0] - 2026-01-08

### Memory Auto-Load from Supabase

Learned patterns and insights now automatically load at session start!

#### Added
- **Memory auto-loader** - `hooks/lib/af-memory-loader.cjs`
  - Queries Supabase for learned patterns at session start
  - Caches results to `.claude/cache/memory-context.md`
  - 1-hour cache TTL, auto-refreshes when stale
  - Non-blocking (fails gracefully if Supabase unavailable)

- **Memory environment variables**
  - `AF_MEMORY_LOADED` - true/false
  - `AF_MEMORY_COUNT` - number of items loaded
  - `AF_MEMORY_ERROR` - error message if failed

- **Memory status in banner**
  - Shows `Memory: X items loaded` in first response
  - Shows `Memory: X items (cached)` when using cache

#### Updated
- **`session-start.cjs`** v1.1.0 - Now calls memory loader
- **`agent-identification-banner.md`** v1.10.0 - Added memory status section
- **`LEARNING_SYSTEM.md`** v1.10.0 - Documented auto-load feature
- **`CLAUDE.md`** - Added memory loading to session start steps

#### How It Works
```
Session Start
    │
    ├── 1. Check env vars
    ├── 2. Load memory from Supabase (NEW!)
    │      └── Caches to .claude/cache/memory-context.md
    ├── 3. Show banner with memory status
    └── ... rest of session start
```

#### What's Loaded
- Learned patterns (confidence ≥70%)
- Agent success rates (last 15 agents)
- Recent corrections (last 30 days)
- Recent insights (last 7 days)

---

## [1.9.3] - 2026-01-07

### Version Sync & Learn Command Execution Fixes

#### Fixed
- **Learn commands not executing** - All `/learn:*` commands now have CRITICAL execution notes
  - Commands were showing documentation but Claude wasn't executing the curl commands
  - Added explicit "MUST Execute" sections to ensure data is sent to Supabase
  - Created `scripts/learn/submit-feedback.sh` as standalone backup

- **Version sync script** - Improved `scripts/sync-version.sh`:
  - Added more files to update list (global CLAUDE.md, docs with banners)
  - Improved pattern matching for different version string formats
  - Now handles: `System: Aura Frog vX.Y.Z`, `Plugin: Aura Frog vX.Y.Z`, banner headers

#### Updated
- **`/learn:feedback`** - Added CRITICAL execution note
- **`/learn:status`** - Added CRITICAL execution note
- **`/learn:analyze`** - Added CRITICAL execution note
- **`/learn:apply`** - Added CRITICAL execution note
- **`/learn:setup`** - Added CRITICAL execution note
- **All version references** - Updated to v1.9.3 across all files

---

## [1.9.2] - 2026-01-07

### Auto-Check Environment at Session Start

#### Added
- **Mandatory env check** - Always check env vars FIRST before responding
- **Auto-reload** - Run `project:reload-env` automatically if not configured
- **Status display** - Show MCP and Learning status in first response

#### Updated
- **Session start order** - Env check is now step 1 (was step 2)
- **`rules/env-loading.md`** - Added mandatory check section

---

## [1.9.1] - 2026-01-07

### Version Consistency & Manual Feedback

#### Added
- **`/learn:feedback`** - Manual feedback submission command
  - Report successes, corrections, agent issues, workflow problems
  - Quick feedback mode with `--type` and `--message` flags
  - Interactive mode for detailed feedback

#### Fixed
- **Version references** - Updated all v1.0.0 references to v1.9.1
  - Fixed global `~/.claude/CLAUDE.md`
  - Fixed banner examples in `setup/activate.md`
  - Fixed docs: STYLING_DETECTION_GUIDE.md, AGENT_SELECTION_GUIDE.md
  - Fixed workflow/phase-1.md examples

#### Updated
- **Commands count** - Now 79 (was 77)
  - Added: `/learn:setup`, `/learn:feedback`

---

## [1.9.0] - 2026-01-07

### Learning System - Self-Improvement via Supabase

Aura Frog can now learn and improve over time by collecting feedback, tracking metrics, and applying learned patterns.

#### Added

- **Learning System** - Cloud-based learning with Supabase
  - `docs/LEARNING_SYSTEM.md` - Full setup and usage guide
  - `scripts/supabase/schema.sql` - Database schema for learning tables
  - Feedback collection (corrections, approvals, rejections)
  - Workflow metrics tracking
  - Agent performance monitoring
  - Pattern recognition and insights

- **New Skills**
  - `skills/learning-analyzer/` - Analyze patterns and generate insights
  - `skills/self-improve/` - Apply learned improvements to plugin

- **New Commands** (5)
  - `/learn:setup` - Automatic schema setup via API
  - `/learn:status` - Display learning system status
  - `/learn:feedback` - Manually submit feedback (success, correction, agent issue)
  - `/learn:analyze` - Run pattern analysis
  - `/learn:apply` - Apply learned improvements

- **Setup Script**
  - `scripts/supabase/setup-schema.cjs` - Automated schema creation

- **New Hooks**
  - `hooks/feedback-capture.cjs` - Capture user corrections (auto on Write/Edit)
  - `hooks/workflow-metrics.cjs` - Send metrics to Supabase
  - `hooks/session-metrics.cjs` - Auto-send metrics on session end
  - `hooks/lib/af-learning.cjs` - Learning system utilities

- **Updated Hooks**
  - `hooks/subagent-init.cjs` - Now tracks agent usage for learning
  - `hooks/hooks.json` - Added session-metrics to Stop event

- **Environment Variables**
  - `SUPABASE_URL` - Supabase project URL
  - `SUPABASE_PUBLISHABLE_KEY` - Public key (safe for client)
  - `SUPABASE_SECRET_KEY` - Secret key (server-side only)
  - `AF_LEARNING_ENABLED` - Enable/disable learning
  - `AF_FEEDBACK_COLLECTION` - Enable feedback capture
  - `AF_METRICS_COLLECTION` - Enable metrics tracking
  - `AF_AUTO_ANALYZE` - Auto-analysis schedule

#### Features

1. **Feedback Collection**
   - Detects user corrections to AI output
   - Captures approval/rejection reasons at gates
   - Optional quality ratings

2. **Metrics Tracking**
   - Workflow success/failure rates
   - Token usage per phase
   - Agent performance by task type
   - Test coverage trends

3. **Pattern Analysis**
   - Success patterns (what works)
   - Failure patterns (common issues)
   - Optimization opportunities
   - Agent routing recommendations

4. **Self-Improvement**
   - Review and apply suggestions
   - Auto-apply high-confidence improvements
   - Rollback support with backups

#### Stats
- Skills: 37 (was 35)
- Commands: 79 (was 73)
- Hooks: 14 (was 11)

---

## [1.8.1] - 2026-01-02

### Fix: Auto-Continue Phases Being Skipped

Fixed documentation inconsistency where auto-continue phases were being skipped entirely instead of executing and showing deliverables.

#### Fixed
- **`rules/approval-gates.md`** - Updated to v2.0.0
  - Clarified 2-gate workflow (Phase 2 & 5b only)
  - Auto-continue phases now clearly defined: Execute → Show → Continue
  - Added "Common Mistakes to Avoid" section
  - Removed old 9-gate language

- **`rules/execution-rules.md`** - Updated to v2.0.0
  - Split phase completion rules into Approval vs Auto-Continue
  - Clarified NEVER rules: "Skip auto-continue phases entirely" is forbidden
  - Added Phase Behavior Summary quick reference

- **`rules/safety-rules.md`** - Updated approval gates section
  - Shows 2-gate model with auto-continue phases
  - Added auto-stop conditions explanation

- **`README.md`** - Updated quality gates description
  - "Only 2 approval gates (Phase 2 & 5b)"

- **`CLAUDE.md`** - Updated execution rules
  - Added 2-Gate Workflow note
  - Clarified NEVER rules

- **`commands/workflow/phase-1.md`** - Fixed step 10
  - Changed "Wait for user approval" to "Auto-continue to Phase 2"

#### Key Clarification
```
Auto-continue ≠ Skip!

Approval Phases (2, 5b):     Execute → Show → WAIT → User approves → Continue
Auto-Continue Phases:        Execute → Show → Continue automatically
Auto-Stop (on blockers):     Execute → Issue found → STOP for fix
```

---

## [1.8.0] - 2026-01-01

### Streamlined Workflow with 2 Approval Gates

Reduced approval gates from 8 to 2 for faster workflow execution while maintaining quality.

#### Updated
- **`skills/workflow-orchestrator/SKILL.md`** - Streamlined workflow
  - Only 2 approval gates: Phase 2 (Design) and Phase 5b (Implementation)
  - All other phases auto-continue unless blockers hit
  - Auto-stop triggers: test failures, security issues, coverage < 80%
  - Flow: `START → Phase 1 (auto) → Phase 2 ✋ → Phases 3-5a (auto) → Phase 5b ✋ → Phases 5c-9 (auto) → DONE`

- **`rules/workflow-navigation.md`** - Updated approval gate documentation
  - Reflects new 2-gate workflow
  - Updated example showing auto-continue paths

- **`templates/project-claude.md`** - Updated template
  - Version 1.8.0
  - Removed atlassian MCP (replaced with bash scripts in 1.6.0)

#### Why This Change
- Faster feature delivery with fewer interruptions
- Critical decisions (architecture, implementation) still require approval
- Auto-stop on errors ensures quality is maintained
- TDD still enforced throughout

---

## [1.7.0] - 2025-12-26

### Fast-Track Workflow for Pre-Approved Specs

New workflow mode for executing phases 4-9 without approval gates when design/specs are already complete.

#### Added
- **`skills/workflow-fasttrack/`** - New skill for fast-track execution
  - `SKILL.md` - Full skill with spec validation, auto-execution, error handling
  - Skips phases 1-3 (requirements, design, UI breakdown)
  - Auto-executes phases 4-9 without approval gates
  - Only stops on errors (test failures, security issues, coverage < 80%)
  - TDD still enforced (RED → GREEN → REFACTOR)

#### How to Use
```
fasttrack: [paste your specs]
```
or
```
workflow:fasttrack path/to/specs.md
```
or
```
Here's my complete design. Just build it.
[specs content]
```

#### Required Spec Sections
- Overview - What we're building
- Requirements - Functional requirements
- Technical Design - Architecture/approach
- API/Interfaces - Endpoints or component APIs
- Data Model - Database/state structure
- Acceptance Criteria - Definition of done

#### Execution Flow
```
Spec Validation → Phase 4 (Test Plan) → Phase 5a (RED) →
Phase 5b (GREEN) → Phase 5c (REFACTOR) → Phase 6 (Review) →
Phase 7 (Verify) → Phase 8 (Document) → Phase 9 (Notify)
```

#### Stop Conditions
- Tests unexpectedly pass in Phase 5a (RED phase should fail)
- Tests fail after 3 implementation attempts
- Critical security vulnerability found
- Coverage below 80%
- Token limit warning

#### Stats
- **Skills:** 35 (was 34) - 24 auto-invoking + 11 reference

---

## [1.6.0] - 2025-12-26

### Godot Game Development Support

Comprehensive Godot engine support for multi-platform game development (HTML5, Android, iOS, Desktop).

#### Added
- **`skills/godot-expert/`** - New skill for Godot game development
  - `SKILL.md` - Main skill with 10 content sections (~600 lines)
  - `references/export-platforms.md` - HTML5, Android, iOS, Desktop export guides
  - `references/ui-patterns.md` - Game UI (HUD, menus, dialogs, touch controls)
  - `references/testing-gdunit.md` - GDUnit testing patterns

- **`agents/gamedev.md`** - New agent for game development
  - Detects Godot projects from `project.godot`
  - Routes to `godot-expert` skill
  - Future support for Phaser.js, Unity, Unreal

- **`rules/godot-scene-composition.md`** - Scene vs node patterns
  - When to create scenes vs add nodes
  - Composition and inheritance patterns
  - Anti-patterns to avoid

- **`rules/godot-gdscript-typing.md`** - GDScript typing rules
  - Type hints for variables, functions, signals
  - Static typing best practices
  - Performance benefits

#### Updated
- **Session-start hook** - Added Godot version detection
  - Detects `project.godot` file
  - Parses `config_version` for Godot 3.x vs 4.x
  - Sets `AF_GODOT_VERSION` environment variable

- **Documentation**
  - `CLAUDE.md` - Added godot-expert to skills (23 auto-invoking)
  - `skills/README.md` - Added skill documentation, updated counts
  - `agents/README.md` - Added gamedev agent (15 agents)
  - `rules/README.md` - Added 2 Godot rules (44 total)

#### Skill Content (godot-expert)
1. Project Structure - Directory layout, res:// paths
2. Scenes & Nodes - Composition, inheritance, instancing
3. GDScript Patterns - Typing, signals, async, classes
4. Physics & Collision - Bodies, areas, layers
5. Input Handling - Actions, events, touch
6. UI/Control Nodes - HUD, menus, themes
7. Animation & Audio - AnimationPlayer, Tweens, AudioStreamPlayer
8. Performance - Object pooling, LOD, profiling
9. Export Targets - HTML5, Android, iOS, Desktop
10. Testing - GDUnit, scene testing, mocking

#### Stats
- **Skills:** 34 (was 33) - 23 auto-invoking + 11 reference
- **Agents:** 15 (was 14)
- **Rules:** 44 (was 42)

---

## [1.5.0] - 2025-12-26

### Google Stitch AI Design Integration

New skill and commands for generating UI designs using Google Stitch AI.

#### Added
- **`skills/stitch-design/`** - New skill for AI-powered UI design generation
  - `SKILL.md` - Main skill definition with workflow instructions
  - `references/prompt-templates.md` - 5 optimized prompt templates (Dashboard, Landing, Mobile, E-commerce, Forms)
  - `references/design-checklist.md` - Comprehensive design review checklist
  - `references/export-guide.md` - How to export from Stitch to Figma/code

- **`commands/design/`** - New design command category
  - `design:stitch` - Generate optimized Stitch prompts from requirements
  - `design:stitch-review` - Process exported code and create review documents

- **Phase 3 Enhancement** - Added Step 0 "Design Approach Selection"
  - Option 1: Manual design (Figma/wireframes)
  - Option 2: AI-assisted (Google Stitch)
  - Option 3: Hybrid (Stitch prototype + manual refinement)

#### Updated
- `CLAUDE.md` - Added stitch-design to skills list (22 auto-invoking skills)
- `skills/README.md` - Added stitch-design documentation, updated counts
- `commands/README.md` - Added design category with 2 commands, updated counts
- `docs/phases/PHASE_3_DESIGN_REVIEW.MD` - Added design approach selection step

#### Workflow
```
Requirements → Generate Stitch prompt → User pastes in Stitch →
Export to Figma/code → Review & integrate → Save review doc
```

#### Review Doc Output
`.claude/workflow/stitch-design-review-{project}.md`

#### Stats
- **Skills:** 33 (was 32) - 22 auto-invoking + 11 reference
- **Commands:** 74 (was 72)
- **Command Categories:** 20 (was 19)

---

## [1.4.4] - 2025-12-25

### Cleanup & Simplification

Removed unused MCP server files, keeping only simple bash scripts for Atlassian.

#### Removed
- **`mcp-servers/`** - Removed entire folder (unused MCP server attempt)

#### Updated
- All version references updated to 1.4.4

---

## [1.4.3] - 2025-12-25

### Atlassian Scripts with TOON Format

Bash scripts for Jira and Confluence with TOON format output.

#### Added
- **`scripts/confluence-fetch.sh`** - Fetch Confluence pages in TOON format
  - By page ID: `./scripts/confluence-fetch.sh 123456789`
  - By space/title: `./scripts/confluence-fetch.sh --space PROJ --title "API Docs"`
  - `--verbose` flag for comments

#### Updated
- **`scripts/jira-fetch.sh`** - Now outputs TOON format:
  - `ticket[1]{key,summary,type,status,priority}:` - Core ticket data
  - `metadata[1]{assignee,reporter,created,updated}:` - Ticket metadata
  - `subtasks[N]{key,summary,status}:` - Child issues
  - `links[N]{type,key,summary}:` - Issue links
  - `--verbose` flag for comments
- **`docs/MCP_GUIDE.md`** - Atlassian section with script usage

#### Example Output (TOON)
```toon
ticket[1]{key,summary,type,status,priority}:
  PROJ-123,Fix login bug,Bug,In Progress,High

metadata[1]{assignee,reporter,created,updated}:
  John Doe,Jane Smith,2025-01-15,2025-01-20

labels[2]: frontend;auth
subtasks[2]{key,summary,status}:
  PROJ-124,Write tests,Done
  PROJ-125,Update docs,To Do
```

---

## [1.4.2] - 2025-12-24

### Remove Atlassian MCP

Removed Atlassian MCP from default bundled servers due to OAuth stability issues.

#### Removed
- **Atlassian MCP** - OAuth tokens expire every 55 mins, browser auth doesn't work in Claude Code's non-interactive subprocess environment

#### Added
- **`scripts/jira-fetch.sh`** - Bash script alternative for fetching Jira tickets via REST API (requires `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`)

#### Updated
- `.mcp.json` - Reduced from 6 to 5 bundled MCP servers
- `docs/MCP_GUIDE.md` - Removed Atlassian references
- `rules/agent-identification-banner.md` - Removed Atlassian examples
- `commands/mcp/status.md` - Removed Atlassian from status output

#### Stats
- **MCP Servers:** 5 (was 6)

---

## [1.4.1] - 2025-12-23

### Fixes & Code Cleanup

Code quality improvements and documentation fixes.

#### Fixed
- **Removed duplicate session state functions** - `session-state.cjs` now imports from `af-config-utils.cjs` instead of duplicating code
- **Fixed hook count mismatch** - README documented 14 hooks but only 11 exist (removed ghost JIRA/Figma/Confluence/GitHub detection sections)
- **Removed unused import** - `set-active-plan.cjs` no longer imports unused `getSessionTempPath`
- **Fixed duplicate section numbering** - hooks/README.md had two section "3"s
- **Fixed MCP package names** - Replaced non-existent `@anthropic/*` packages with real packages:
  - `atlassian`: `@anthropic/atlassian-mcp` → Official Atlassian Remote MCP (OAuth, no env vars needed)
  - `figma`: `@anthropic/figma-mcp` → `figma-developer-mcp` (maps `FIGMA_API_KEY` internally)
  - `slack`: `@anthropic/slack-mcp` → `@modelcontextprotocol/server-slack` (added `SLACK_TEAM_ID`)

#### Updated
- `hooks/lib/session-state.cjs` - v1.1.0: Uses `af-config-utils.cjs` for core operations
- `hooks/subagent-init.cjs` - v1.2.0: Removed fallback duplication, uses `af-config-utils.cjs`
- `hooks/prompt-reminder.cjs` - v1.1.0: Uses `af-config-utils.cjs` for session state
- `hooks/README.md` - Fixed to show correct 11 hooks, removed ghost sections

#### Stats
- **Hooks:** 11 (corrected from incorrect 14)
- **Skills:** 32 (corrected from 33)

---

## [1.4.0] - 2025-12-23

### Token Efficiency & Auto-Detection Improvements

Major improvements focused on token efficiency and automatic complexity detection.

#### New Features
- **SessionStart hook** - Environment injection on session startup:
  - Auto-detect project type (monorepo, library, single-repo)
  - Auto-detect package manager (npm, pnpm, yarn, bun, composer, poetry, go, cargo)
  - Auto-detect framework (Next.js, React, Vue, Laravel, Django, etc.)
  - Inject 20+ `AF_*` environment variables
  - Fires once per session (startup, resume, clear, compact)
- **Plan resolution** - Branch-matching and active plan management:
  - `AF_ACTIVE_PLAN` - Explicitly set via session (`/plan:set`)
  - `AF_SUGGESTED_PLAN` - Branch-matched hint (no stale pollution)
  - `AF_REPORTS_PATH` - Dynamic path tied to active plan
- **Cascading config** - `.af.json` configuration with precedence:
  - DEFAULT → `~/.claude/.af.json` (global) → `.claude/.af.json` (local)
  - Supports plan naming format, paths, project overrides
  - `.af.json.example` included as reference
- **set-active-plan command** - `/plan:set` to explicitly set active plan
- **SubagentStart hook** - Auto-inject context for subagents:
  - Injects current workflow phase, active plan, pending approvals
  - Passes project context automatically
  - Session state management via `/tmp/af-session-{id}.json`
  - ~200 tokens per subagent (efficient)
- **Prompt reminder hook** - Inject reminders each user prompt:
  - TDD reminder for code-related tasks
  - Security reminder for auth/password/token operations
  - Approval gate reminder for relevant phases
- **sequential-thinking skill** - Structured thinking for complex analysis:
  - Dynamic adjustment (expand/contract)
  - Revision capability
  - Branching for alternatives
  - Perfect for Phase 1 and debugging
- **problem-solving skill** - 5 techniques for different problem types:
  - Simplification Cascades (complexity spiraling)
  - Collision-Zone Thinking (innovation blocks)
  - Meta-Pattern Recognition (recurring issues)
  - Inversion Exercise (tunnel vision)
  - Scale Game (production readiness)
- **Session state library** - Shared state across hooks:
  - `hooks/lib/session-state.cjs` - CLI and programmatic interface
  - Track phase, plan, approvals, active agents
- **Model auto-selection** - Agent-detector now selects optimal model:
  - haiku for quick tasks (typo fixes, orchestration)
  - sonnet for standard implementation (coding, testing, bug fixes)
  - opus for deep analysis (architecture, security audits, migrations)
  - Detection result includes: Agent, Model, Complexity, Reason
  - Model passed to Task tool when spawning subagents
- **TOON format convention** - All structured data must use TOON:
  - Added to `rules/naming-conventions.md` (v1.2.0)
  - Converted critical rule files from markdown tables to TOON
- **git-workflow skill** - Token-efficient git operations:
  - Single compound command gathers all data (staging, security, metrics, file groups)
  - Auto-split commits into logical groups (deps, code, docs, tests)
  - Security scanning for secrets before commit
  - 2-4 tool calls vs 15 baseline (73-80% fewer)
- **scout-block hook** - Prevents wasteful token usage:
  - Blocks scanning of node_modules, dist, build, vendor, .git
  - Custom patterns via `.afignore` file
  - Cross-platform support (Node.js)
- **Auto-complexity detection** - AI detects task complexity automatically:
  - Quick (1-2 tools): Simple fixes, clear scope
  - Standard (3-6 tools): New feature, bug with context
  - Deep (7+ tools): Architecture, vague requirements
  - No need for `:fast` or `:hard` variants
- **Plan state management** - Session-based plan context:
  - `AF_ACTIVE_PLAN` - Current active plan
  - `AF_SUGGESTED_PLAN` - Branch-matched hint
  - Persists across agent handoffs

#### Updated Features
- **debugging skill** - Now with reference documents:
  - `references/systematic-debugging.md` - Four-phase process
  - `references/root-cause-tracing.md` - Call stack tracing
  - `references/verification.md` - Iron law of verification
- **Agent model specifications** - Agents now specify recommended models:
  - haiku for orchestration and simple tasks
  - sonnet for implementation
  - opus for architecture decisions
- **state-persistence skill** - Enhanced with plan state variables

#### New Files
- `hooks/session-start.cjs` - SessionStart hook with env injection
- `hooks/lib/af-config-utils.cjs` - Cascading config + project detection utils
- `hooks/set-active-plan.cjs` - Set active plan CLI command
- `.af.json.example` - Example config file with all options
- `commands/plan/set.md` - Plan set command documentation
- `skills/git-workflow/SKILL.md` - Token-efficient git operations
- `skills/debugging/references/*.md` - Debugging reference docs
- `skills/sequential-thinking/SKILL.md` - Structured thinking process
- `skills/problem-solving/SKILL.md` - 5 problem-solving techniques
- `hooks/scout-block.cjs` - Block wasteful directory scanning
- `hooks/subagent-init.cjs` - SubagentStart context injection
- `hooks/prompt-reminder.cjs` - UserPromptSubmit reminders
- `hooks/lib/session-state.cjs` - Session state management library
- `.afignore` - Custom patterns for scout-block

#### Updated Files
- `skills/agent-detector/SKILL.md` - Auto-complexity detection + model selection (v3.0.0)
- `skills/session-continuation/SKILL.md` - Merged state-persistence, added plan state variables (v2.0.0)
- `skills/dev-expert/SKILL.md` - References expert skills, keeps generic patterns only (v2.0.0)
- `rules/naming-conventions.md` - Added TOON format convention (v1.2.0)
- `rules/estimation.md` - Converted tables to TOON
- `rules/verification.md` - Converted tables to TOON
- `rules/error-handling-standard.md` - Converted tables to TOON
- `rules/api-design-rules.md` - Converted tables to TOON
- `rules/logging-standards.md` - Converted tables to TOON
- `rules/sast-security-scanning.md` - Converted tables to TOON
- `hooks/hooks.json` - Added SessionStart, scout-block, SubagentStart, UserPromptSubmit hooks
- `hooks/README.md` - Updated with new hooks (7 → 11)
- `hooks/subagent-init.cjs` - Now uses af-config-utils, shows framework/PM (v1.1.0)
- `hooks/lib/session-state.cjs` - Added projectType, packageManager, framework fields
- `skills/README.md` - Added new skills (35 → 37)
- `agents/backend-expert.md` - Model specification
- `agents/tester.md` - Model specification
- `agents/ui-designer.md` - Model specification

#### Documentation Cleanup
- **Deleted obsolete docs:**
  - `TODO.md` - Optimization complete
  - `docs/RELEASE_NOTES_V5.md` - Outdated versioning
  - `docs/SETTINGS_GUIDE.md` - Redundant with CONFIG_LOADING_ORDER
  - `docs/STORY_POINTS_GUIDE.md` - Niche agile doc
  - `docs/TOKEN_TRACKING.md` - Merged into session-continuation skill
  - `docs/RULES_COMBINATION.md` - Covered by CONFIG_LOADING_ORDER
  - `docs/SYSTEM_CLARIFICATIONS.md` - Internal implementation details
  - `docs/WORKFLOW_NAMING.md` - Niche workflow doc
  - `docs/examples/AGENT_SELECTION_EXAMPLES.md` - Merged into agent-detector
- **Deleted verbose templates:**
  - `templates/tech-spec.md` - Keeping TOON version only
  - `templates/test-plan.md` - Keeping TOON version only
- **Fixed broken cross-references** in remaining docs

#### Removed/Merged (Redundancy Cleanup)
- **Skill consolidation:**
  - `skills/state-persistence/` - Merged into `session-continuation` (90% overlap)
  - `SESSION_CONTINUATION_GUIDE.md` - Redundant with skill
- **dev-expert pattern files** (covered by individual expert skills):
  - `skills/dev-expert/react-patterns.md` - Covered by `react-expert`
  - `skills/dev-expert/vue-patterns.md` - Covered by `vue-expert`
  - `skills/dev-expert/react-native-patterns.md` - Covered by `react-native-expert`
  - `skills/dev-expert/laravel-patterns.md` - Covered by `laravel-expert`
  - `skills/dev-expert/nextjs-patterns.md` - Covered by `nextjs-expert`
- **Documentation slimmed:**
  - `docs/PLUGIN_INSTALLATION.md` - From 515 lines to 57 lines (references GET_STARTED.md)
- **Total removed:** ~1,800 lines of redundant content

#### Stats
- **Skills:** 33 → 32 (net -1: +4 new, -1 merged, -5 redundant pattern files removed)
- **Hooks:** 7 → 11 (+SessionStart, +scout-block, +SubagentStart, +UserPromptSubmit)
- **Commands:** +1 (`/plan:set`)
- **Docs:** 24 → 15 (cleanup)
- **Templates:** 16 → 14 (TOON only)
- **Token savings:** Up to 80% reduction in git operations
- **Lines removed:** ~4,800+ lines of redundant documentation and patterns

---

## [1.3.2] - 2025-12-22

### MCP Response Logging in TOON Format

Auto-save JIRA/Figma responses to logs in token-efficient TOON format.

#### New Features
- **TOON format for MCP responses** - JSON automatically converted to TOON
- **Auto-save rule** - `mcp-response-logging.md` instructs Claude to save after fetch

#### Updated Files
- **scripts/workflow/save-mcp-response.sh** - Added `json_to_toon()` converter
- **rules/README.md** - Updated rule count (39 → 40)

#### Example Output
```toon
ticket[1]{key,summary,type,status,priority}:
  PROJ-123,Fix bug,Bug,In Progress,High
```

---

## [1.3.1] - 2025-12-22

### Documentation Cleanup

Removed obsolete documentation that referenced deleted integration scripts.

#### Removed Files
- **docs/BASH_INTEGRATIONS_REFERENCE.md** - Obsolete (scripts replaced by MCP)
- **docs/INTEGRATION_SETUP_GUIDE.md** - Obsolete (1,419 lines, now use MCP_GUIDE.md)
- **docs/JIRA_WEBFETCH_SOLUTION.md** - Obsolete (MCP handles JIRA)
- **docs/PLUGIN_TROUBLESHOOTING.md** - Obsolete (moved to PLUGIN_INSTALLATION.md)
- **docs/guides/JIRA_INTEGRATION.md** - Obsolete (MCP handles JIRA)
- **docs/AGENT_IDENTIFICATION.md** - Duplicate of rules/agent-identification-banner.md
- **docs/APPROVAL_GATES.md** - Duplicate of rules/approval-gates.md
- **skills/jira-integration/** - Empty directory (dangling symlinks)
- **skills/figma-integration/** - Empty directory (dangling symlinks)

#### Updated Files
- **docs/PLUGIN_INSTALLATION.md** - Troubleshooting now references MCP
- **CONTRIBUTING.md** - Testing section uses `mcp:status` instead of jira-fetch.sh
- **hooks/hooks.json** - Removed redundant UserPromptSubmit hooks
- **commands/mcp/status.md** - New command to verify MCP server loading
- **CLAUDE.md** - Session start now includes MCP verification (step 5)

#### Stats
- **Lines removed:** ~3,500+
- **Skills:** 35 → 33 (removed empty integration dirs)
- **Docs:** Consolidated troubleshooting into PLUGIN_INSTALLATION.md

---

## [1.3.0] - 2025-12-19

### Major Cleanup - MCP Integration & Agent Consolidation

Streamlined the plugin by replacing custom integration scripts with bundled MCP servers and merging related agents.

#### New Features
- **Workflow Deliverable Saving** - Save phase deliverables (MD files) to workflow logs:
  - `save-deliverable.sh` - Save markdown content to phase folders
  - `workflow-manager.sh save` - Wrapper command for easy access
  - Tracks deliverables in workflow-state.json
- **MCP Response Logging** - Save JIRA, Figma, Confluence responses for reference:
  - `save-mcp-response.sh` - Save MCP responses to logs/{type}/
  - `workflow-manager.sh mcp-save/mcp-list/mcp-get` - Easy access commands
  - Auto-keeps "latest" file for each identifier
- **MCP in Agent Banner** - Show which MCP servers are active (single or multiple)
- **Sectioned CLAUDE.md Template** - Auto-update plugin sections, preserve user content:
  - `<!-- AURA-FROG:START -->` / `<!-- AURA-FROG:END -->` - Plugin-managed
  - `<!-- USER-CUSTOM:START -->` / `<!-- USER-CUSTOM:END -->` - User-preserved
- **claude-md-update.sh Script** - Sync plugin sections without losing customizations
- **project:init/regen Integration** - Automatically uses update script
- **Bundled MCP Servers** - `.mcp.json` auto-configures:
  - `context7` - Library documentation (MUI, Tailwind, lodash, etc.)
  - `playwright` - Browser automation and E2E testing
  - `vitest` - Test execution and coverage analysis
  - `atlassian` - JIRA + Confluence integration
  - `figma` - Design system fetching
  - `slack` - Notifications

#### Consolidated Agents (24 → 14)
- **backend-expert** - Merged: backend-go, backend-laravel, backend-nodejs, backend-python
- **web-expert** - Merged: web-angular, web-nextjs, web-reactjs, web-vuejs
- **mobile** - Merged: mobile-flutter, mobile-react-native
- **Removed** - jira-operations, confluence-operations, slack-operations (use MCP)

#### Removed Files
- **Scripts** - jira-fetch.sh, jira-sync.sh, figma-fetch.sh, confluence-operations.sh, slack-notify.sh
- **Skills** - jira-integration, figma-integration, confluence-integration (replaced by MCP)
- **Agents** - 10 individual backend/web/mobile agents (merged into 3)

#### New Files
- **docs/MCP_GUIDE.md** - Complete guide for using and creating MCP servers
- **scripts/claude-md-update.sh** - Update AURA-FROG sections in project CLAUDE.md
- **scripts/workflow/save-deliverable.sh** - Save phase deliverables (MD files) to logs
- **scripts/workflow/save-mcp-response.sh** - Save MCP responses (JIRA, Figma, etc.) to logs
- **templates/project-claude.md** - Sectioned template with auto-update markers

#### Updated Documentation
- CLAUDE.md - Added MCP servers section with auto-invocation examples
- GET_STARTED.md - Added MCP section with trigger examples
- skills/README.md - Updated skill count and MCP references
- rules/README.md - Updated version

#### Benefits
- **Cleaner plugin** - 10 fewer agents, 5 fewer scripts, 3 fewer skills
- **Native MCP** - Official MCP servers for integrations
- **Merged agents** - Still access detailed patterns via expert skills
- **Better UX** - Users don't need separate MCP installation

#### Migration
- Set env vars in `.envrc` for MCP servers:
  - `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
  - `FIGMA_API_KEY`
  - `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`

---

## [1.2.6] - 2025-12-18

### Context7 Integration - Library Documentation Optimization

Replaced static design system documentation with Context7 MCP server integration for live, up-to-date library docs.

#### Removed Files (~6,100 lines)
- **skills/design-system-library/** - Deleted 10 static documentation files:
  - ant-design.md, bootstrap.md, chakra-ui.md, headless-ui.md
  - mantine.md, material-ui.md, nativewind.md, radix-ui.md
  - shadcn-ui.md, tailwind-css.md

#### Updated Files
- **skills/design-system-library/SKILL.md** - Now references Context7 for live docs
- **rules/prefer-established-libraries.md** - Condensed with Context7 integration

#### Benefits
- **Context7 provides:** Up-to-date, version-specific library documentation
- **No more stale docs:** Always fetches current API references
- **Massive reduction:** ~6,100 lines removed from plugin

#### How to Use Context7
```
"Build a login form with Material UI" use context7
"Create dashboard with Ant Design" use context7
"lodash groupBy usage" use context7
```

---

## [1.2.5] - 2025-12-17

### Workflow & Comment Quality Improvements

Enhanced workflow visibility and comment quality standards.

#### New Features
- **Phase transition banner** - Show agent banner before each workflow phase
- **Agent visibility** - Users see which agent handles each phase

#### Rule Updates
- **smart-commenting.md** - Strengthened to "meaningful comments only"
  - Priority raised: Medium → High
  - Added anti-patterns: "new test", "new branch", "add coverage"
  - Added JSDoc rules section
- **execution-rules.md** - Added "show banner before each phase" requirement
- **agent-identification-banner.md** - Added "Phase Transition Banner" section

---

## [1.2.4] - 2025-12-17

### Plugin Optimization - Massive Token Reduction

Condensed verbose agents and commands to reduce plugin size by ~60%.

#### Condensed Agents (5 files)
- **backend-nodejs.md** - 1,182 → 100 lines (92% reduction)
- **backend-python.md** - 781 → 91 lines (88% reduction)
- **backend-laravel.md** - 766 → 95 lines (88% reduction)
- **backend-go.md** - 753 → 79 lines (89% reduction)
- **mobile-react-native.md** - 1,318 → 109 lines (92% reduction)

#### Condensed Commands (10 files)
- **project/init.md** - 1,095 → 115 lines (89% reduction)
- **refactor.md** - 932 → 95 lines (90% reduction)
- **test/document.md** - 808 → 87 lines (89% reduction)
- **review/fix.md** - 799 → 93 lines (88% reduction)
- **test/unit.md** - 702 → 102 lines (85% reduction)
- **document.md** - 697 → 87 lines (88% reduction)
- **bugfix/fix.md** - 645 → 93 lines (86% reduction)
- **setup/integrations.md** - 646 → 94 lines (85% reduction)
- **workflow/start.md** - 137 → 81 lines (41% reduction)
- **test/e2e.md** - 638 → 97 lines (85% reduction)

#### Architecture
- Agents now defer to expert skills for detailed patterns
- Commands use TOON format for compact structured data
- Removed redundant examples (users can ask for examples)
- Focused on essential information only

#### Stats (Before → After)
- **Agent lines:** ~8,500 → ~4,800 (44% reduction)
- **Command lines:** ~22,000 → ~16,600 (25% reduction)
- **Total estimated:** ~5,100 fewer lines

---

## [1.2.3] - 2025-12-16

### Session Context & Codebase Consistency

Token-efficient session context with TOON format and codebase pattern learning.

#### New Features
- **codebase-consistency rule** - Learn patterns before writing code
- **session-context.toon** - Cached codebase patterns (~150 tokens vs ~600)
- **TOON state format** - 73% token savings for workflow state

#### Updated Skills
- **project-context-loader** - Now generates session-context.toon automatically
- **state-persistence** - Migrated to TOON format for all state files

#### Updated Scripts
- **context-compress.sh** - Generates session-context.toon with pattern detection

#### Architecture
- `.claude/session-context.toon` - Cached patterns + workflow state
- `.claude/workflow-state.toon` - Detailed workflow (TOON format)
- Dynamic pattern scanning with caching (regenerate if > 1 hour)

#### Stats
- **Total Skills:** 38+ (25 auto-invoking + 13 reference)
- **Total Rules:** 38
- **Total Hooks:** 15

---

## [1.2.2] - 2025-12-15

### Backend Expert Skills & Rule Optimization

Expanded expert skills system with backend frameworks and significantly condensed verbose rules.

#### New Expert Skills (6)
- **nodejs-expert** - Express, NestJS, Fastify, async patterns, Prisma/TypeORM
- **python-expert** - Django, FastAPI, Flask, SQLAlchemy 2.0, async/await
- **laravel-expert** - Eloquent, service pattern, DTOs, queues, caching
- **go-expert** - Gin, Echo, Fiber, goroutines, channels, interfaces
- **flutter-expert** - Widgets, Riverpod, Bloc, GoRouter, forms
- **angular-expert** - Signals, RxJS, NgRx, reactive forms, OnPush

#### Rule Optimization (~85% reduction in verbose rules)
- Condensed `theme-consistency.md`: 961 → 134 lines
- Condensed `direct-hook-access.md`: 820 → 131 lines
- Condensed `smart-commenting.md`: 769 → 130 lines
- Condensed `correct-file-extensions.md`: 732 → 117 lines
- Total savings: ~2,770 lines

#### Stats
- **Total Skills:** 38+ (25 auto-invoking + 13 reference)
- **Total Rules:** 37
- **Total Hooks:** 15

---

## [1.2.1] - 2025-12-15

### Expert Skills System & Enhanced Hooks

Major update introducing framework-specific expert skills for on-demand loading and enhanced lifecycle hooks.

#### New Expert Skills (5)
- **typescript-expert** - Strict types, ESLint config, nullish handling, modern patterns
- **react-expert** - Components, hooks, performance, state management, forms
- **react-native-expert** - FlatList optimization, navigation, platform code, animations
- **vue-expert** - Composition API, script setup, Pinia, reactivity patterns
- **nextjs-expert** - App Router, Server Components, caching, Server Actions

#### New Hooks (6)
- **PreToolUse - Secrets Protection** - Warns when writing to files containing secrets
- **PreToolUse - SAST Security** - Detects security anti-patterns
- **PostToolUse - Large File Warning** - Warns when reading files >500 lines
- **UserPromptSubmit - Confluence Detection** - Auto-detects Confluence URLs
- **UserPromptSubmit - GitHub Detection** - Auto-detects GitHub PR/Issue URLs
- **SessionEnd - Uncommitted Changes** - Reminds about staged changes

#### Architecture Change
- Migrated framework-specific rules to expert skills for on-demand loading
- Removed `modern-javascript.md` and `typescript-strict-practices.md` (now in skills)
- Expert skills auto-invoke based on project context

#### Stats
- **Total Skills:** 30+ (19 auto-invoking + 12 reference)
- **Total Rules:** 37
- **Total Hooks:** 15

---

## [1.2.0] - 2025-12-11

### Token Optimization & New Rules

Major update focused on token efficiency, security rules, and multi-session support.

#### New Skills (3)
- **lazy-agent-loader** - Load agent summaries first, full definitions on demand (~94% token savings)
- **response-analyzer** - Save large outputs to temp files, load summaries (~95% savings)
- **state-persistence** - File-based workflow state for session handoffs

#### New Rules (3)
- **diagram-requirements** - Mermaid diagrams required for complex features
- **sast-security-scanning** - OWASP Top 10 + SAST scanning enforcement
- **prefer-established-libraries** - Use lodash/es-toolkit over custom utilities

#### New Documentation
- `docs/WORKFLOW_DIAGRAMS.md` - 10 comprehensive Mermaid diagrams
- `docs/MULTI_SESSION_ARCHITECTURE.md` - Token optimization & session handoff guide

#### New Scripts (5)
- `scripts/validate-toon.sh` - Validate TOON format
- `scripts/context-compress.sh` - Generate compressed project context
- `scripts/response-save.sh` - Save verbose outputs to /tmp/aura-frog/
- `scripts/session-handoff.sh` - Generate human-readable handoff documents
- `scripts/workflow/workflow-export-toon.sh` - Export workflow state in TOON

#### Stats
- **Total Rules:** 38
- **Total Skills:** 26+ (14 auto-invoking + 12 reference)

---

## [1.1.4] - 2025-12-01

### Workflow Navigation

- **New Rule:** `rules/workflow-navigation.md` - Progress bar and next phase visibility after each phase

---

## [1.1.3] - 2025-12-01

### Modern JavaScript

- **New Rule:** `rules/modern-javascript.md` - ES6+ syntax enforcement (optional chaining, nullish coalescing, destructuring, arrow functions, etc.)

---

## [1.1.2] - 2025-12-01

### Feedback Brainstorming

- **New Rule:** `rules/feedback-brainstorming.md` - Agents brainstorm feedback before implementing
- Force mode with "must do:", "just do:", "I insist"

---

## [1.1.1] - 2025-12-01

### Cleanup

- Removed multi-model selection feature (not supported by Claude Code)

---

## [1.1.0] - 2025-12-01

### Skills Standardization

Major update standardizing skill file format and streamlining plugin structure.

#### Changes
- All skills now use `SKILL.md` with frontmatter metadata
- CLAUDE.md reduced from ~190 to ~77 lines (60% reduction)
- Added Confluence integration with full CRUD operations
- Removed multi-model selection feature

#### Stats
- **Auto-Invoke Skills:** 10
- **Reference Skills:** 12+

---

## [1.0.2] - 2025-12-01

### CLAUDE.md Refactoring

- CLAUDE.md reduced from ~580 to ~187 lines (68% reduction)
- New skill: `session-manager`
- New rule: `env-loading`
- New command: `project:reload-env`

---

## [1.0.1] - 2025-11-29

### Voice Notifications: Realtime Streaming

- Voice notifications now use realtime streaming (no files created)
- Lower latency, zero disk usage
- Removed cleanup scripts (no longer needed)

---

## [1.0.0] - 2025-11-28

### Rebranding: CCPM to Aura Frog

**"Code with main character energy!"**

#### Changes
- Project renamed from "CCPM" to "Aura Frog"
- New visual identity with frog mascot
- New agent banner format with aura messages

#### Stats at Launch
- **24** Specialized Agents
- **20** Skills (9 auto-invoking + 11 reference)
- **25** Quality Rules
- **9** Workflow Phases
- **70** Commands
- **4** Integrations (JIRA, Figma, Slack, Confluence)

---

## Pre-1.0 History

### [5.2.0] - 2025-11-28
- Token optimization (30-70% reductions)
- Skills rebuilt with comprehensive content
- README professionalized with badges

### [5.1.0] - 2025-11-27
- Skills system introduced (8 auto-invoking)
- Voiceover notifications (ElevenLabs)
- Hooks system (7 lifecycle hooks)
- Dual-file loader architecture

### [5.0.0-beta] - 2025-11-26
- New agents: backend-nodejs, security, devops
- 11 new commands (security, performance, deployment)

### [4.6.0] - 2025-11-26
- Auto-approval permissions
- Agent identification system
- Adaptive styling detection

### [4.5.0] - 2025-11-25
- NativeWind integration
- ElevenLabs voice operations
- 70+ language support

### [4.4.0] - 2025-11-24
- Initial release
- 14 specialized agents
- 9-phase workflow with TDD
