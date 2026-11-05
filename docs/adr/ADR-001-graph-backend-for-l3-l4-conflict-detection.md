---
last_aligned_with: v3.8.0-alpha.7
status: current
audience: contributor
---

# ADR-001 — Code-graph backend for L3/L4 conflict detection (spike)

**Status:** Accepted (recommendation) · **Date:** 2026-07-09 · **Story:** FEAT-011 / STORY-0028 (spike — no production code)

## Context

Archon OS ships L1 (file overlap) + L2 (function/region overlap) conflict detection today (`pre-dispatch-conflict-check.cjs`, deterministic bash/JS). L3 (semantic) and L4 (architectural) are deferred and were pencilled in as **LLM calls**. The `codebase-memory` MCP (opt-in, FEAT-011/STORY-0026) exposes `detect_changes` (impact analysis: what breaks if a node is modified/deleted) and `trace_path` (call-graph traversal). This ADR evaluates a **graph backend** vs the **LLM design** for L3/L4.

## Options compared

| Dimension | Graph backend (`detect_changes` / `trace_path`) | LLM call |
|---|---|---|
| **Determinism** | High — same input → same edges/answer | Low — sampling; flaky verdicts across runs |
| **Cost / latency** | ~1 graph query (≈3–4k tok in research) | Full prompt per check; N× on fan-out |
| **Coverage** | Structural: "does A's change break B's call path / dependency?" (L4) | Intent/semantic: "do these two changes contradict a decision?" (L3) |
| **Grounding** | Reads real edges — no hallucination | Can invent a conflict that isn't there |
| **Availability** | Opt-in only; absent on most installs; weak on macro-heavy Rust; Windows-broken | Always available |

## Findings

- **L4 (architectural)** maps almost 1:1 onto `detect_changes` + `trace_path`: "task A edits node X; does any pending-confirm task B depend on X (directly or transitively)?" is exactly an impact/reachability query. Graph is the *better* backend here — deterministic, grounded, cheap — and aligns with the plugin's "memory by layers, not retrieval; bounded token cost" philosophy far better than an LLM call.
- **L3 (semantic)** — "do two changes contradict each other's *intent*?" — is NOT a pure structural question; the graph can't reason about a decision's meaning. LLM (or an ADR/decision-log lookup) remains the right tool.

## Decision / recommendation

**DEFER implementation to a dedicated story, but adopt this shape when built:**

1. **L4 → graph backend as PRIMARY, LLM as fallback.** Use `detect_changes`/`trace_path` when `codebase-memory` is enabled; fall back to the current heuristic/LLM path when it is not. Graph must be an *optional accelerator*, never a hard dependency (most installs won't have it).
2. **L3 → keep LLM/decision-log** (graph can't judge intent), gated by `ARCHON_CONFLICT_LLM_DISABLED`.
3. Do NOT couple the conflict pipeline to a binary the plugin can't install for the user.

**Not adopted now:** writing production L3/L4 code — that is a separate story with its own tests; this spike only fixes the backend choice.

## References
- Research: [ROADMAP.md §2](../ROADMAP.md) (codebase-memory-mcp), `rules/core/context-economy.md` (code-graph opt-in discipline).
