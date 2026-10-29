---
last_aligned_with: v4.0.0-alpha.3
status: current
audience: evaluator
---

# Honest maturity report

What works well, what doesn't, what's tracked. We name it so you can plan around it.

> **Audited 2026-10-29.** Three entries in the table below were describing a world that no longer
> existed, and two of them claimed *missing* things that had in fact shipped. Corrections are marked
> inline rather than quietly deleted, because a maturity report that silently improves is one you
> cannot trust in the other direction either.

### Confidence

- **8 Pillars feature surface** — all shipped and exercised through the integration tests. Hierarchical planning, reasoning trace, conflict detection, self-healing proposals, MCP security, pre-flight, session reset, phase-role binding. Day-to-day production use is fine.
- **Plan consolidation (v3.7.2) + uniform layout (v3.7.3)** — 43 unit tests against the 9 backing scripts + `link-run.sh` using temp `.claude/plans/` fixtures. 64 tests for the bare-word router with require()-based imports (no test theater).
- **CI runs the Node 18 / 20 / 22 matrix** — the suite is now **1600+ tests across 90+ suites**, not the 317 this line claimed until 2026-10-29.

### Known tech debt (tracked openly)

| Item | Severity | Issue | Effort |
|---|---|---|---|
| 5 deferred env-var-dependent hooks still rely on undocumented `CLAUDE_TOOL_NAME` / `CLAUDE_FILE_PATHS` instead of the documented stdin-JSON contract. Only `mcp-call-gate` got the stdin fallback in v3.7.1. | medium | [#7](https://github.com/nguyenthienthanh/archon/issues/7) | ~1d |
| ~~`hooks/lib/hook-runtime.cjs` doesn't exist yet — every hook re-implements stdin parsing + audit appending + atomic writes.~~ **✅ Fixed — this was stale.** The file is 699 lines and **39 hooks require it.** | — | [#6](https://github.com/nguyenthienthanh/archon/issues/6) | done |
| ~~Append-only text logs would benefit from SQLite WAL but break "zero runtime dependencies."~~ **Closed as decided, not fixed.** `node:sqlite` needs no dependency but is **Stability 1.1/1.2 (release candidate) on every Node line**, and on Node 26.10 `require('node:sqlite').Database` is `undefined` — only `DatabaseSync` exists, so the documented API is not the shipped one. Append-only text stays. The mission constraint also relaxed from "zero runtime" to **zero NATIVE dependencies** (2026-10-29). | — | [#8](https://github.com/nguyenthienthanh/archon/issues/8) | decided |
| Hook performance budget not enforced. ~19 hooks fire on every Write/Edit; estimated 100-300ms p95 but unmeasured. | medium | [#9](https://github.com/nguyenthienthanh/archon/issues/9) | ~1d for budget + benchmark |
| ~~Node 20/22 test matrix hangs on Ubuntu CI runners; temporarily reduced to Node 18 only.~~ **✅ Fixed — this was stale.** `.github/workflows/ci.yml` runs the full `['18','20','22']` matrix. | — | — | done |
| Pillar 4 Tier 2 OPA Rego policies, Pillar 5 L3+L4 LLM conflict detection, Pillar 6 auto-trigger on F2/F3 — all in the v3.7.0 roadmap, queued for v3.8+. | feature | — | varies |
| `cc-plugin-eval` upstream npm peer-dep conflict (`madge` vs `typescript ^6`) breaks the behavioral-eval CI workflow. Not a regression in this plugin; tracked as upstream. | external | — | wait for cc-plugin-eval fix |

### What this release explicitly does NOT do

- It does not enable Tier 2 OPA pre-flight (queued v3.8+).
- It does not add L3 (semantic LLM) or L4 (architectural LLM) conflict checks. The env var `ARCHON_CONFLICT_LLM_DISABLED` is a no-op until v3.8+.
- It does not auto-apply self-heal patches — proposals only, confidence ≥ 0.7, max 5/session.
- It does not change `/run`'s 5-phase TDD flow. The escalation prompt adds an option, not a replacement.
- It does not do semantic retrieval over session history. The turn index is a **list you read**, not a search index — at 73 turns there is nothing to search. No embeddings, no vector store, no third-party key.
- It does not auto-update your project docs. That idea was considered and rejected; the reasoning is recorded in the FEAT-F plan node.

### How to assess fit

Use this checklist:

- ✅ Multi-week features, complex refactors, scope creep risk → high value
- ✅ AI hallucination concerns (reasoning trace + grounding rejects ungrounded claims) → high value
- ✅ Parallel-team work with conflict risk → L1+L2 detector catches file/function overlap
- ✅ MCP-heavy workflows (Figma + Firebase + Slack + DBs) → per-agent allowlists + audit log
- ⚠️ Single-file edits / quick prototypes → workflow overhead may not pay off; use `/run task: …` to bypass
- ⚠️ Haiku-only budget — some features (planning, conflict, design phases) prefer Sonnet/Opus
- ⚠️ Minimalist-plugin preference — Archon OS is substantial; see the component counts above (generated, not hand-written)
