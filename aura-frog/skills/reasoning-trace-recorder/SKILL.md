---
name: reasoning-trace-recorder
description: "Auto-invokes for every Claude turn during active T4 task execution. Emits append-only trace events (file_read, output_claim, tool_call, decision) to .claude/plans/traces/{TASK_ID}.jsonl. Source of grounding-discipline checks. Disable: AF_TRACE_DISABLED=true."
when_to_use: "Every Claude turn during active T4 execution; silent if no .claude/plans/active.json or no active.task or AF_TRACE_DISABLED=true"
autoInvoke: true
allowed-tools: Read, Bash
effort: low
user-invocable: false
---

# Reasoning Trace Recorder

Forensic reproducibility. Append-only; never calls an LLM, never edits plan files or prunes traces.

## Behavior

1. **Detect:** no `.claude/plans/active.json`, or `active.task` null, or `AF_TRACE_DISABLED=true` → exit silently
2. **Append** one JSON line per emitted event to `.claude/plans/traces/{TASK_ID}.jsonl` (one file per T4 task)

## Event types

`file_read` · `output_claim` (with `grounded: bool` + `grounded_by`) · `tool_call` · `tool_result` · `decision` · `phase_transition`.

**Grounding rule (spec §11.1):** an `output_claim` is grounded when ≥1 prior `file_read` in the same trace covers the named file/function/symbol. Ungrounded claims are flagged and surfaced via `/archon-os:trace --hallucinations`.

## Budget

≤500 events per task target; >1000 events → `trace_overflow` flag via post-execute-update-node hook.

**Detail (JSON schema, per-type payload fields, tie-ins):** `skills/reasoning-trace-recorder/reference.md` — load on demand only.
