---
name: conflict-detector
description: "L1-L4 conflict detection between a proposed T4 task and pending-confirm sibling tasks. L1 (file overlap) + L2 (function/region overlap) ship in v3.7.0-beta.2 as deterministic bash. L3 (semantic LLM) + L4 (architectural LLM) are stubbed for v3.7.0-rc.1."
when_to_use: "Before dispatching a T4 task that may overlap with siblings; on /archon-os:plan-conflicts check; from pre-dispatch-conflict-check hook"
allowed-tools: Bash, Read, Glob, Grep
effort: low
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Conflict Detector

**STATUS — v3.7.0-beta.2.** L1+L2 functional; L3+L4 stubbed pending LLM-dispatch infrastructure in rc.1.

## Five conflict types (per spec §21.1)

```toon
types[5]{type,definition,detection_layer,cost}:
  C1,File-level overlap,L1,free
  C2,Function/region overlap,L2,cheap (~10ms regex)
  C3,Schema/contract conflict,L2,cheap
  C4,Semantic intent conflict,L3,LLM (stubbed in beta.2)
  C5,Architectural conflict,L4,LLM-rare (stubbed in beta.2)
```

## Layer dispatch (per spec §21.3)

```
ON dispatch_request(task):
    L1 = check-l1-files.sh         ← always run, free
    IF L1.overlap AND L1.confidence >= 0.95:
      RETURN conflict(L1)
    IF L1.overlap (low confidence):
      L2 = check-l2-syntactic.sh   ← drill into overlapping files
      IF L2.overlap:
        RETURN conflict(L2)

    IF task.tier <= 2 OR task.creates_new_pattern:
      L4 = check-architectural (LLM, stubbed)  ← skipped in beta.2
      IF L4.contradicts: RETURN conflict(L4)

    IF task.parent has any pending-confirm sibling:
      L3 = check-semantic (LLM, stubbed)       ← skipped in beta.2
      IF L3.contradicts: RETURN conflict(L3)

    RETURN clear
```

## Disable

Set `AF_CONFLICT_LLM_DISABLED=true` to short-circuit L3+L4 dispatch even after they land in rc.1+ — useful for cost-sensitive sessions. L1+L2 (deterministic bash) always run; the env var only affects the LLM-backed layers. In v3.7.0-beta.2 / rc.1 it is effectively a no-op because L3+L4 are already stubbed; documented for forward compatibility with v3.7.x patch releases.

## Behavior

1. Resolve proposed task's `artifacts[].path` from its plan node frontmatter
2. Resolve pending-confirm siblings (status: planned with parent T3 active, or status: blocked-on-confirm)
3. Run `scripts/conflicts/check-l1-files.sh` with task + siblings artifact lists
4. If L1 returns overlap with confidence < 0.95 OR file-overlap is ambiguous → run `check-l2-syntactic.sh` on the overlapping files
5. **L3 (semantic)**: in beta.2, return `{layer:L3, status:stubbed_for_rc1}`. In rc.1, dispatch an LLM call comparing intents; cache result in `conflict_cache.jsonl`.
6. **L4 (architectural)**: in beta.2, return `{layer:L4, status:stubbed_for_rc1}`. In rc.1, dispatch an LLM call comparing against `permanent_memory.md` decisions.
7. Append finding to `.claude/plans/conflicts.jsonl` (per spec §21.4) if conflict found

## Conflict record schema (.claude/plans/conflicts.jsonl)

```json
{
  "conflict_id": "CONFLICT-00007",
  "detected_at": "2026-05-07T10:30:00Z",
  "detected_by": "pre-dispatch-conflict-check.cjs",
  "layer": "L1",
  "type": "file_overlap",
  "participants": [{"task": "TASK-00125", "role": "proposed"},
                   {"task": "TASK-00120", "role": "pending-confirm"}],
  "overlap": {"files": ["src/auth.py"], "functions": null, "schema_elements": null},
  "confidence": 1.0,
  "arbitration": null,
  "actions_taken": [],
  "resolution": null,
  "resolved_at": null
}
```

`conflict-arbiter` agent fills in `arbitration` and `resolution` later.

## Latency targets (per spec §21.7)

```toon
latency[6]{layer,p95,hard_cap}:
  L1,<100ms,500ms
  L2,<300ms,1s
  L3 cached,<50ms,100ms
  L3 cold,<3s,10s (rc.1)
  L4 cached,<50ms,100ms
  L4 cold,<8s,20s (rc.1)
```

If hard cap hit: log warning, **proceed assuming conflict** (fail-safe — better to slow down than to silently overwrite).

## What this skill does NOT do

- Does NOT execute L3/L4 in beta.2 (stubs return placeholder findings)
- Does NOT mutate plan tree state (writes to conflicts.jsonl only; conflict-arbiter agent does the freeze/replan/escalate)
- Does NOT decide resolution (that's conflict-arbiter)
- Does NOT block tool calls directly (pre-dispatch-conflict-check hook does, based on this skill's findings)
- Does NOT cross project boundaries — per project, per .claude/plans/

## Tie-Ins

- **Spec:** §21 (full conflict detection)
- **Scripts:** `scripts/conflicts/check-l1-files.sh`, `scripts/conflicts/check-l2-syntactic.sh`
- **Agent:** `conflict-arbiter` — sole consumer of conflict findings (decides resolution)
- **Hook:** `hooks/pre-dispatch-conflict-check.cjs` — primary auto-trigger (PreToolUse)
- **Hook:** `hooks/post-execute-conflict-rescan.cjs` — re-runs detection on frozen tasks after blocker `done`
- **Command:** `/archon-os:plan-conflicts` — manual list/show/resolve
- **Rule:** `rules/workflow/conflict-arbitration-policy.md` — arbiter decision table
- **Rule:** `rules/workflow/plan-lifecycle.md` — frozen state semantics + cascade
- **Future (rc.1):** L3/L4 LLM dispatchers + `conflict_cache.jsonl` LRU
