---
name: permanent-memory-loader
description: "Loads permanent_memory.md summary lines (≤120 always-loaded tokens, hard cap 200). Surfaces durable wisdom from past Epics into the current session. Silent if .claude/memory/ does not exist."
when_to_use: "Every Claude turn when .claude/memory/permanent_memory.md exists; loads section headers + 1-line summaries only, never the full body"
autoInvoke: true
allowed-tools: Read, Glob
effort: low
user-invocable: false
---

# Permanent Memory Loader

Auto-invoke complement to `epic-summarizer`. Read-only.

## Behavior (in order)

1. **Detect:** if `.claude/memory/permanent_memory.md` does NOT exist → exit silently
2. **Read** the file. For each `## Epic: <ID> — <intent>` section, apply the **dual-read rule** (below) to load only its heading + one summary line — **never the full body / subsections.**
3. **Compose** a compact block: 1 line per Epic (heading + its one summary line, ≤120 chars)
4. **Stamp** `trust: file` per `rules/core/memory-trust-policy.md`

## Dual-read rule (v2 fast-path + v1 fallback)

Sections come in two shapes; both load, and the loader picks per section:

- **v2 (fast-path):** if the section body's first line is an `<!-- af-memory:v2 epic=… confidence=… items=… -->` marker, load exactly **three lines** — the `## ` heading, that marker line, and the single one-line human summary immediately after it. Never read the prose subsections or typed entries.
- **v1 (fallback, backward-compat):** if the section has **no** `af-memory:v2` marker, load the `## ` heading + the **first non-empty line** after it. Existing v1 files are never rewritten or migrated — they keep working unchanged.

Exact lines loaded per section:

```toon
dualread[2]{shape,detect,lines_loaded}:
  v2,"body starts with <!-- af-memory:v2 ... -->","## heading + marker line + next 1-line summary"
  v1,"no af-memory:v2 marker","## heading + first non-empty line"
```

The marker's `confidence=`/`items=` fields are available cheaply for degradation decisions without touching the body.

## Token budget

```toon
budget[3]{layer,target,hard_cap}:
  always_loaded,120,200
  per_epic_summary,12,20
  per_subsection_line,1,2
```

Budget exceeded → degrade (drop Tentative → trim patterns → Epic IDs only → skip if file > 8000 tokens).

## Constraints

Never loads full Epic bodies or `manual_overrides.md`; never writes; never decides from memory content. Epics older than 90 days are prefixed `(>90d may be outdated)`.

**Detail (example output, degradation ladder, staleness, tie-ins):** `skills/permanent-memory-loader/reference.md` — load on demand only.
