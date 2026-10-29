---
last_aligned_with: v4.0.0-alpha.2
status: current
audience: contributor
---

# ADR-003 — Session memory: read the transcript, do not build a store

**Status:** Committed · **Date:** 2026-10-29 · **Node:** FEAT-B

## Context and problem statement

The goal was never a memory product. It is one concrete thing: **a long session
that compacts repeatedly, where work from three turns ago must stay reachable.**

`docs/ROADMAP.md` §2 asked how to *build* persistent memory and compared four
designs (code-graph MCP, vector search, a linked-markdown vault, the existing
file registry). Measurement invalidated the premise:

> **Claude Code already writes the store.** Every turn lands in
> `~/.claude/projects/<slug>/<session-id>.jsonl`. Measured on one real session:
> **3.5 MB, 1620 lines, 73 user prompts**, each record carrying `timestamp`,
> `uuid`, `parentUuid`, `cwd` and `gitBranch`.
>
> **Compaction shrinks the context window. It does not touch that file.**

So the problem was not *"the agent loses memory"*. It was: **the memory is intact
on disk and nothing reads it back.**

The plumbing was already there too — `PreCompact`, `PostCompact`, `SessionStart`
and `Stop` were all wired to `compact-handoff.cjs`, which already read the
transcript. The defect was that it threw almost everything away. A real handoff
on disk:

```
recent_prompts: []
context:        {}
title:          null
session_id:     null
```

Hooks fired, a file was written, and nothing survived.

## Decision drivers

- No third-party key and no install-time compilation (zero **native**
  dependencies).
- The injection budget is hard: **SessionStart hook output is capped at 10,000
  characters** and silently dropped past it.
- No second source of truth. Decisions already live in
  `.claude/plans/history.jsonl` and the plan tree.

## Considered options

1. **A `node:sqlite` episodic store** plus a session-start code graph (the
   original "ArchonGraph" two-layer design).
2. **Vector retrieval** over session history.
3. **A turn index: a derived pointer list over the transcript.**
4. **Do nothing** — keep the handoff as it was.

## Decision outcome

**Option 3.** `hooks/lib/turn-index.cjs` renders one line per turn —
`#NN │ hh:mm │ headline │ files │ cmds │ branch │ uuid` — refreshed at `Stop` and
before a compaction, injected at `SessionStart` (which is also the
post-compaction entry point, `source: "compact"`). Each line carries the turn's
`uuid`, so the agent reads **that exact turn** rather than trusting a summary of
it.

### Why the others were rejected

**Option 1 — a second log.** The transcript already *is* the log, and a second
log is precisely what this feature exists to avoid. Independently, `node:sqlite`
is **Stability 1.1/1.2 (release candidate) on every Node line — never Stability
2**, and on Node 26.10 `require('node:sqlite').Database` is **`undefined`**; only
`DatabaseSync` exists. The documented API is not the shipped API.

**Option 2 — vector retrieval.** Two reasons, and the second is decisive:

1. There is no first-party embeddings endpoint (the official recommendation is a
   third-party provider), so this means an API key plus a vector store — breaking
   the no-key install.
2. **The corpus is 73 items, not 73,000.** Approximate nearest-neighbour search
   over 73 rows is absurd. It is a list you read.

Reason 2 settles it alone: **even with free, first-party, zero-latency vectors,
this would still be the wrong tool at this size.** Reason 1 only decides how
badly it fails.

**Option 4 — do nothing.** Rejected by the handoff above.

### Consequences

Three defects were fixed on the way, all ending in a handoff that could resume
nothing:

| Defect | Cause | Fix |
|---|---|---|
| `recent_prompts: []`, `session_id: null` | a hook invoked without stdin gets no `transcript_path`, and the code treated that as "no transcript exists" | `resolveTranscript()` falls back to discovering the newest transcript for this project |
| `context: {}` | every field came from an env var, every env var was unset, and `JSON.stringify` drops `undefined` | each field falls back to the thing on disk that answers it — branch from git, name from the manifest, anchor from `active.json` |
| prompts clipped at 300 chars each | shorter than most real requests here, so the handoff kept each ask's opening clause and dropped what to do | one stated budget spent newest-first, so a long request survives whole |

**Two invariants** keep the index from becoming the thing it replaces:

- **It is a derived cache.** Every write rebuilds it from the transcript, so
  deleting it is harmless and a rebuild is byte-identical (tested). Nothing may be
  written only to the index.
- **It points at decisions, it does not restate them.** A decision summarised in
  two places is a decision that can disagree with itself.

**Scoped to this session.** Injection happens only when the session is continuing
its own work — a resumed handoff of ours, or a post-compact start. A fresh session
shown other sessions' handoffs gets no index: those prompts are not its to read.
`source: clear` injects nothing.

**Overflow tiers and says so**, naming the compressed range and the files those
turns touched. Silent truncation was not an option: an index that quietly stops at
`#40` reads exactly like a session that only ever had 40 turns.

### Confirmation

- A delete-and-regenerate test proves the index is rebuildable and byte-identical.
- A cold-resume test proves the task is reconstructible from the handoff alone.
- A source grep proves nothing off-machine is reached for.
- Measured: a rendered line is ~120 chars, so **73 turns ≈ 8,760 characters**
  against the 10,000 cap — 1.1× headroom, meaning tiering is needed at roughly
  **80 turns**, not at turn one.
- Live-verified on the real transcript: **17 turns indexed, injected payload 5,853
  of 10,000 characters.**

## More information

- `docs/architecture/MULTI_SESSION_ARCHITECTURE.md` — the operative documentation
- `docs/ROADMAP.md` §2.4 — where the original four-approach comparison is closed
- ADR-002 — the dispatch decision that leans on the handoff-loss finding here
