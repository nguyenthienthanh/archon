---
last_aligned_with: v3.8.0-alpha.10
status: current
audience: contributor
---

# Architecture v4 Proposal — Archon OS

**Status:** DRAFT — awaiting maintainer approval. No code in this document has been applied.
**Basis:** 33 adversarially-verified audit findings (2026-08-11 full-repo audit, 42-agent workflow) + platform research with sources. Every claim below cites either a repo file or a URL.
**Scope:** structural changes only. The four quick-fix groups (hooks runtime, plan-tree correctness, tests/CI, docs/budget) land independently of this proposal.

---

## 1. Current architecture (as measured, not as documented)

Archon OS layers a "planning-first LLM OS" over Claude Code:

- **Prose control plane** — CLAUDE.md kernel doc, 25 command files, 60 skill dirs, 73 rule files, 25 agent files. Enforced by description-matching and instruction text.
- **Deterministic plane** — ~51 CJS hook scripts registered via `hooks/hooks.json`, now mostly funneled through `dispatch.cjs` (one node process per chain).
- **Shared substrate** — the plan tree (`.claude/plans/`: `active.json`, features/stories/tasks markdown, traces, conflicts.jsonl), mutated by hooks and `scripts/plans/`, narrated by skills.

The 5-phase `/run` flow and the plan tree are **not** duplicated — `rules/workflow/run-plan-bridge.md` genuinely bridges them (audit confirmed; earlier suspicion withdrawn).

## 2. Verified structural problems

| # | Problem | Evidence |
|---|---------|----------|
| P1 | **Auto-invoke layer rests on frontmatter the platform ignores.** 9 skills declare `autoInvoke: true` / `priority` / `triggers` — fields `docs/reference/MAINTENANCE.md` §2 itself lists as *not official*. 37 skills use non-official `triggers:` vs 23 using official `when_to_use`. Only description text actually drives invocation. Plan-context loading and trace recording are *already* enforced by real hooks (`pre-execute-load-plan-context.cjs`, `tool-call-tracer.cjs`) — the skills duplicating them are redundant. | `skills/agent-detector/SKILL.md:4`, `MAINTENANCE.md` §2, `archon-os/CLAUDE.md` "Auto-Invoke Skills" |
| P2 | **Session/workflow state has no owner.** Phase/workflow state lives in ≥6 stores — `os.tmpdir()/af-session-{ppid}.json`, `.claude/cache/workflow-state.json`, `.claude/logs/workflows/<id>/workflow-state.json`, `active-workflow.txt` (two candidate dirs), `.claude/workflows/current-phase.txt` — and each hook resolves them in a *different order* (`compact-handoff.cjs`: files→env; `subagent-init.cjs`: env→files; `session-metrics.cjs`: pointer→mtime). Two hooks can disagree about the current phase. `compact-handoff.cjs` never even requires the `session-state.cjs` library. | `compact-handoff.cjs:26`, `subagent-init.cjs:53-78,167-169`, `session-metrics.cjs:28-66` |
| P3 | **Always-loaded context budget is broken and misreported.** Core rules tier ≈10k words while every budget doc claims ~2k tokens; every-turn skills burn ~13k words/turn; with 60 skills the plugin almost certainly overflows Claude Code's skill-listing budget (1% of context window; overflow silently drops descriptions of least-used skills — killing their triggering). | `rules/README.md:14`, `skills/permanent-memory-loader/SKILL.md`, [docs: skills](https://code.claude.com/docs/en/skills) |
| P4 | **Dead config layer.** `ccpm-config.yaml` ships a 9-phase workflow nothing reads; `.mcp.json` carries 5 `disabled: true` servers that Claude Code starts anyway (measured: ~3.3 GB across wrappers); CI commits derived `stats.json` back to main after nearly every merge. | `ccpm-config.yaml:29`, `.mcp.json`, `.github/workflows/ci.yml:151` |

## 3. Target architecture — five workstreams

### W1 — Single state owner (highest impact)

One module owns session/workflow state; everything else goes through it.

- Extend `hooks/lib/session-state.cjs` into the **only** read/write path for phase + workflow identity. One canonical file, one documented schema, atomic writes (tmp+rename, already the repo idiom).
- Formalize what the repo already half-does: **append-only JSONL as the source of truth** (traces, checkpoints, history), with the canonical state file as a *snapshot/projection* of the log. This is the convergent pattern across mature harnesses (pi-mono AgentHarness, OpenHands SDK, AgentLog — all append-only JSONL with a single harness-owned writer; [deepwiki: pi-mono](https://deepwiki.com/badlogic/pi-mono/3.3-agentharness-and-hooks-system), [event-sourcing for agent state](https://tianpan.co/blog/2026-04-10-agent-state-event-stream-immutable-event-sourcing)).
- Migration shim: for one minor release the module *writes* the canonical file and *mirrors* to legacy paths; readers switch immediately; legacy writes deleted next release.
- **Deliberately rejected:** DB-style locking (2PL/OCC) for plan-tree concurrency. CoAgent (arXiv 2606.15376) measured both on real multi-agent workloads: 2PL deadlocks 0.81/trial with no speedup; OCC costs 1.83× tokens for 0.93× speed. Detect-and-notify with agent-side repair — which the existing L1-L4 conflict ladder already resembles — empirically wins. Keep the ladder; give it the fixed rescan logic from fix-group B; add only the *narrow* claim-lock in `next-task.sh` (mkdir-based, crash-safe) because task claiming is a millisecond-scale critical section, not an agent-length transaction.

### W2 — Kill the pseudo-autoInvoke layer

- Migrate all 37 skills from `triggers:` → official `when_to_use`; delete `autoInvoke`/`priority` fields everywhere.
- Every-message guarantees move to the layer that can actually guarantee them: **hooks**. `UserPromptSubmit` already injects context deterministically; agent-detector's routing table becomes a hook-injected reminder (or an honest description-matched skill with no every-message claim).
- Delete the two skills that duplicate existing deterministic hooks (plan-loader narration, trace-recorder narration) or reduce them to thin docs pointing at the hooks.
- Fix `archon-os/CLAUDE.md` "Auto-Invoke" section to describe the real mechanism.
- Official boundary ([best-practices](https://code.claude.com/docs/en/best-practices)): facts → CLAUDE.md; procedures → skills; must-happen-every-time → hooks.

### W3 — Hook hygiene (keep dispatch, align it with the platform)

The platform contract ([docs: hooks](https://code.claude.com/docs/en/hooks)): matcher filtering is free; `if` conditions filter with zero process spawn; all matching hooks run in parallel, independent, non-deterministic order; only exit 2 blocks; **exit-1 stderr goes only to the debug log**; UserPromptSubmit hooks are killed at 30s; **all SessionEnd hooks share a 1.5s combined budget**.

- `dispatch.cjs` stays — official guidance itself says "batch related checks into one hook script", and the decider/claude-hooks community dispatcher validates the pattern — but chains must respect independence: exit 1 never cancels siblings (fixed in group A), and any hook that must block asynchronously gets its own entry (documented limit).
- Move every self-filtering hook's cheap precondition into hooks.json `if` conditions / tighter matchers, so non-matching tool calls spawn nothing.
- Audit SessionStart/SessionEnd/Stop chains against their real time budgets (SessionEnd 1.5s shared is a probable silent-kill today).
- Anything advisory becomes `async: true`; stop relying on exit 1 as a user-visible signal (it isn't — debug log only).
- Never `> name` un-merge/merge stderr casually: on PreToolUse, stderr is what the model sees on a block.

### W4 — Context budget diet

- `archon-os/CLAUDE.md` → ~60 lines of universal facts + a pointer manifest (progressive disclosure; [source](https://alexop.dev/posts/stop-bloating-your-claude-md-progressive-disclosure-ai-coding-tools/)). Procedures move to skills; enforcement moves to hooks; anything a linter enforces gets deleted from prose.
- Skill listing: run `/doctor` to measure the listing's real cost; mark workflow-style skills `disable-model-invocation: true` (zero listing cost, still user-invocable); shorten descriptions with trigger keywords first (1,536-char per-skill truncation); keep SKILL.md bodies <500 lines with detail in `references/` files.
- Re-measure the rules tiers honestly (`wc -w`), publish real numbers, and fold rarely-loaded rule content into skill `references/` (skills are the platform's only true lazy-load primitive).
- Front-load the critical 5k tokens of every auto-triggered skill body — that's all that survives post-compaction re-attachment.

### W5 — Config cleanup

- Delete `ccpm-config.yaml` (+ example) — nothing reads it.
- Delete the five `disabled: true` entries from `.mcp.json` — Claude Code ignores the field and starts them anyway (measured GBs of resident wrappers). Users who want them re-add locally.
- Stop committing `stats.json` from CI; generate on demand or publish as a CI artifact. Halves bot noise in history.
- Fold `commands/*.md` into skills over time — the platform has merged commands into skills and recommends the skill form ([plugins-reference](https://code.claude.com/docs/en/plugins-reference)). Verify any hook matching bundled MCP tools uses the scoped `mcp__plugin_archon-os_<server>__<tool>` name (unscoped names silently never fire).

## 4. Migration path

Each phase is independently shippable and reversible; no big-bang.

| Phase | Contents | Risk |
|-------|----------|------|
| 0 (done separately) | Quick-fix groups A–D | low |
| 1 | W5 config cleanup + W3 matcher/`if`/async pass | low — deletions and metadata |
| 2 | W4 context diet (CLAUDE.md, skill descriptions, honest budgets) | low — prose only, measurable via `/doctor` |
| 3 | W2 pseudo-autoInvoke removal | medium — behavior visible in routing; ship behind one release with both mechanisms live |
| 4 | W1 state owner + event-log formalization | highest — touches every state-reading hook; shim release then cutover |

## 5. Trade-offs and benefits per workstream

Baselines below are measured on this repo at v3.8.0-alpha.10, not estimated. Every workstream is independently shippable — none is a prerequisite for another, so the table in §5.6 is a menu, not a sequence.

### W1 — Single state owner + JSONL event log

**Benefits**

- **Eliminates a whole bug class, not an instance.** 8 files read session/workflow state today and resolve it in *different orders* (`compact-handoff`: files→env; `subagent-init`: env→files; `session-metrics`: pointer→mtime). Two hooks can currently report different phases in the same session. One owner makes that unrepresentable.
- **Crash-survivable by construction.** An append-only log's worst failure is a torn last line, which parses as one bad record; a torn read-modify-write of a JSON state file loses the whole document.
- **Replay for free.** Reconstructing "what did the harness think was happening at 14:32" stops requiring a re-run — this is the property that makes production incidents debuggable at all.
- **Schema changes land in one place** instead of 6 stores with 6 fallback chains.

**Trade-offs**

- **Highest blast radius of the five.** Every state-reading hook is touched. A hook missed in the sweep silently reads a dead path after the legacy files go — the failure is quiet, which is the dangerous kind.
- **Two-release minimum.** Dual-write mirroring, then cutover. You cannot land this in one PR honestly.
- **Reads get slower and more indirect.** "Current phase" becomes a projection over a log rather than one `readFileSync`. Snapshots bound it, but snapshots are more machinery.
- **Log growth is now survivable but not free** — the retention sweep shipped in alpha.10 covers it; without that this workstream would be trading one leak for another.

**Cost:** largest. **Do it when** state disagreement actually bites (a wrong-phase bug in the wild), or before any feature that adds a 7th store.

### W2 — Retire the pseudo-`autoInvoke` layer

**Benefits**

- **Stops the docs lying.** `MAINTENANCE.md` §2 already lists `autoInvoke`, `priority` and `triggers` as *not official*, while `CLAUDE.md` claims platform enforcement ("Only skills with `autoInvoke: true` … fire on every message"). One of those is wrong today.
- **Frees skill-listing budget.** 60 skills against a 1%-of-context listing budget; on overflow Claude Code silently drops descriptions starting with the least-invoked skills — stripping the very trigger keywords those skills need. Shorter, honest descriptions mean *more* skills actually reachable, not fewer.
- **Behaviour becomes what the platform guarantees**, so it stops changing when the platform changes.

**Trade-offs**

- **37 skills change frontmatter** (`triggers:` → `when_to_use:`) — mechanical, but a broad diff that touches almost every skill file and will conflict with any in-flight skill work.
- **Routing may fire less eagerly.** `agent-detector`'s "every message" was never enforced, so nothing *regresses* — but expectations built on the claim will feel a difference. Mitigation is real: plan-context loading and trace recording already have deterministic hook enforcement (`pre-execute-load-plan-context`, `tool-call-tracer`), so only advisory routing is affected.
- **Each of the 9 `autoInvoke` skills needs a decision** — real hook enforcement, or accept it is advisory. That is 9 judgement calls, not a sweep.

**Cost:** medium, mostly mechanical. **Do it when** you want the docs to be trustworthy, or when a skill stops triggering and nobody can explain why (that is the listing-overflow symptom).

### W3 — Hook hygiene against the platform contract

**Benefits**

- **Non-matching tool calls spawn nothing.** Matcher and `if` filtering happen before any process starts; a hook that self-filters in JS has already paid for the process. This is the cheapest latency win available.
- **Respects budgets that are silently enforced today.** All SessionEnd hooks share **1.5s combined**; UserPromptSubmit is capped at 30s. Hooks over budget are killed without a message — so a hook can be "installed" and never run.
- **Advisory work leaves the critical path** via `async: true`.

**Trade-offs**

- **`if` conditions and in-script guards are not identical**, so each migration needs its own test. This is per-chain work, not a sweep.
- **Going async gives up the ability to block.** Correct for advisory hooks, wrong for gates — and the distinction has to be made hook by hook, by someone who knows which is which.
- **Slow by design.** Incremental, one chain at a time, with the reward spread thin.

**Cost:** low per chain, moderate in total. **Do it when** touching a chain for another reason — this is the workstream that should ride along rather than be scheduled.

### W4 — Context budget diet

**Benefits**

- **The most measurable of the five.** Core rules tier is **10,201 words (~13.5K tokens)** against docs that claimed ~2K; `CLAUDE.md` is **287 lines** against the ~60-line guidance. `/doctor` and `/context` give a before/after number, so the win is verifiable rather than asserted.
- **Compounds every session, forever** — unlike a latency fix that only pays on the hot path.
- **Fixes skill triggering as a side effect** (same listing-overflow mechanism as W2).

**Trade-offs**

- **Moved-to-on-demand is not the same as available.** Content the model must fetch is content it may not fetch. Anything load-bearing that moves out of always-loaded can silently stop being applied — and the failure looks like the model "just deciding differently", which is nearly impossible to attribute.
- **Requires measurement discipline**, not just editing. Cutting without `/doctor` before-and-after is how you lose something important and never know.
- **Judgement-heavy.** The official test — "would removing this cause Claude to make mistakes?" — has no mechanical answer.

**Cost:** low mechanically, high in care. **Do it when** you can measure, and cut in small increments you can attribute.

### W5 — Delete the dead config layer

**Benefits**

- **Already partly proven.** The MCP half shipped in alpha.10: five `disabled: true` entries removed after measuring that Claude Code ignores the flag and `chrome-devtools` was running anyway with 6 processes.
- **Dead config actively misleads.** `ccpm-config.yaml` describes a 9-phase workflow the runtime does not implement; anyone reading it to understand the system learns something false.
- **Halves the commit history noise** if CI stops committing derived `stats.json` back to main — which is also what cancels the `test (20)`/`test (22)` jobs on main today via concurrency.

**Trade-offs**

- **`ccpm-config.yaml` is not as dead as the audit claimed.** Verified: `archon-os/scripts/ci/validate-config.sh` and `scripts/sync-version.sh` both reference it, plus 4 docs. Deleting it means touching a CI gate — so this is a real change, not a file removal.
- **Dropping the `stats.json` auto-commit removes a self-healing property.** Counts currently self-correct on every merge; without it, drift returns unless `validate-counts.sh` + `validate-readme-counts.sh` are trusted to catch it. They are stricter than they were (alpha.10 hardened both), but the safety net moves from "fixed automatically" to "build fails".
- **Users who opted into a removed MCP server must re-add it by hand.** `MCP_GUIDE.md` now carries per-server snippets, which makes this an inconvenience rather than a loss — but it is still a manual step imposed on someone else.

**Cost:** lowest. **Do it when** — now; it is the natural next increment and the only one whose first half is already in production.

### 5.6 Comparison

| | Benefit size | Blast radius | Reversible? | Measurable? | Best trigger |
|---|---|---|---|---|---|
| **W5** config | moderate, immediate | small (CI + config) | yes, trivially | yes (process count, commit count) | now |
| **W4** context | large, compounding | none at runtime | yes (git revert) | **yes** (`/doctor`) | when you can measure each cut |
| **W3** hooks | moderate, per-chain | small per chain | yes | partly (latency per chain) | ride along with other chain work |
| **W2** autoInvoke | moderate + honesty | wide diff, shallow depth | yes | partly (listing budget) | when docs must be trustworthy |
| **W1** state | largest, structural | **whole hook layer** | **no** — two-release migration | weakly (absence of a bug class) | when state disagreement bites |

The ordering above is deliberately *not* by benefit size. W1 has the biggest payoff and sits last because it is the only one you cannot cheaply undo.

## 6. Risks

- **W1 cutover:** a hook missed in the sweep reads a legacy path after deletion → one release of dual-write mirroring + a grep-gate in CI (`rg 'workflow-state.json|current-phase.txt'` outside the state module fails the build).
- **W2:** description-matched routing may fire less eagerly than the prose claimed. Mitigation: the deterministic pieces are hooks already; only advisory routing changes.
- **W3 `if` conditions:** behavior differences between `if` and in-script guards must be tested per hook — move incrementally, one chain at a time.
- **W4:** a load-bearing instruction moved out of always-loaded fails silently and unattributably. Mitigation: measure with `/doctor` before and after each increment, and move prose in small enough steps that a regression can be tied to one change.
- **W5:** `ccpm-config.yaml` has live references in `validate-config.sh` and `sync-version.sh` — deleting the file without updating both breaks CI. Dropping the `stats.json` auto-commit shifts count drift from self-healing to build-failing.
- **Plugin dev loop:** hook/agent/MCP changes need `/reload-plugins` or restart (SKILL.md hot-reloads) — phase 3/4 testing must account for it.

## 7. Explicitly out of scope

- No message bus / HTTP coordination between agents (JSONL + single writer is sufficient at this scale).
- No database locking for the plan tree (CoAgent evidence above).
- No rewrite of dispatch.cjs (it is sound; semantics aligned in group A).
