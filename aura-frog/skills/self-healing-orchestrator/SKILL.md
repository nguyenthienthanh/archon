---
name: self-healing-orchestrator
description: "Proposes patches for F2 (local-logic) and F3 (local-design) failures. NEVER applies without user approval. Confidence ≥0.7 to propose; below that, escalates raw findings. Counts toward replan_budget. Per-task: max 1; per-session: max 5."
when_to_use: "On a F2 or F3 classification, after failure-classifier emits its verdict, before master-planner decides retry/replan/escalate"
allowed-tools: Read, Glob, Grep
effort: medium
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Self-Healing Orchestrator

**STATUS — v3.7.0-rc.1.** Per-spec safety gates strictly enforced.

## Core Principle

**Self-healing PROPOSES; the user APPLIES.** A proposal goes through the same approval gate as a manual replan — there is no autonomous patch. If you find this skill applying patches without a user yes, that's a bug.

## Hard constraints (per spec §22.1)

```toon
constraints[6]{rule,enforcement}:
  "ONLY F2 (local-logic) or F3 (local-design)","Refuse if classifier returns F1/F4/F5/F6 — those need different paths"
  "ONLY proposes; NEVER applies","Output is always a proposal artifact; user runs /archon-os:heal accept <id> to apply"
  "Confidence < 0.7 → don't propose","Surface raw findings only; user decides if a fix is even reachable"
  "Counts toward replan_budget","Same node-level budget enforcement as replanner (per replan-thresholds.md)"
  "Max 1 self-heal per task","Once a task accepts a self-heal patch, no further auto-proposals for that task"
  "Session cap: 5 proposals total","Anti-fatigue + anti-loop; after 5, defer to manual /archon-os:plan-replan"
```

## Disable mechanisms (per spec §22.3, §31.3)

- **Per-session:** `/archon-os:heal disable` — sets `.claude/logs/.self-heal-disabled` flag
- **Permanent:** `AF_SELF_HEAL_DISABLED=true` in `.envrc`
- Hook integration ignores any proposal when disabled

## Flow (per spec §22.2)

```
Failure detected (F2 or F3)
    ↓
self-healing-orchestrator activated (only if budget remaining)
    ↓
Step 1: Parse error log → error class, library, line numbers
Step 2: Query context7 for known library patterns (NOT random web sources)
Step 3: Cross-reference permanent_memory.md "Gotchas discovered"
Step 4: Generate PROPOSED patch as draft (diff format, not applied)
Step 5: Score confidence: refuse if < 0.7
Step 6: Master-planner presents user prompt with diff + reasoning + confidence
Step 7: On user yes → apply as a NEW T4 task with its own approval flow
Step 8: On user no → log as `event: self_heal_declined`, increment session counter
```

## Cross-check sources (allowlist)

```toon
allowed_sources[3]{source,why}:
  context7 MCP,"Library documentation; trusted technical reference"
  permanent_memory.md,"Project's own learned wisdom; trust:file"
  recent traces (.claude/plans/traces/),"Same-project context for the failure"
```

**Forbidden sources:** Stack Overflow, blog posts, web search results — too noisy, too easy to hallucinate from.

## Output schema (proposal artifact)

```yaml
proposal_id: HEAL-<TASK_ID>-<NNN>
task_id: TASK-00101
classification: F3
confidence: 0.84
reasoning: "Test fails because async/await missing on JWT issuance call. Library docs (context7) confirm the API is async. Memory (DEC-001) decided on httpOnly cookie storage (unaffected)."
patch:
  - file: src/auth/jwt.ts
    start_line: 42
    end_line: 42
    before: "const token = issueToken(claims);"
    after: "const token = await issueToken(claims);"
acceptance_test: "jest tests/auth.test.ts → tests/auth.test.ts::should_issue_token"
risks:
  - "Caller chain may need awaiting too — check src/auth/middleware.ts callers"
  - "Latency increase ~10ms (negligible)"
budget_decrement: 1
session_proposal_count: 2 of 5
```

The proposal lives at `.claude/plans/proposals/HEAL-<TASK_ID>-<NNN>.yaml` until accepted/declined.

## Anti-patterns (each is a hard refusal)

- **Auto-applying a high-confidence proposal** — confidence is just signal; user approval is non-negotiable
- **Proposing for F4/F5** — wrong scope; F4 needs Story replan, F5 needs Feature replan, both via replanner
- **Pulling fixes from random web search** — hallucination risk; cite only context7 + permanent_memory + traces
- **Bypassing budget** — same as replanner; if budget exhausted, escalate
- **Emitting a proposal with confidence ≥0.7 but evidence < confidence** — sanity check: if you can't cite ≥2 grounded sources, drop confidence below 0.7

## Tie-Ins

- **Spec:** §22 (self-healing), §15.1 (F-class boundaries), §22.3 (disable), §31.3 (env vars)
- **Skill:** `failure-classifier` — sole producer of F2/F3 inputs
- **Agent:** `master-planner` — sole consumer of proposals (presents to user)
- **Agent:** `replanner` — alternative path for F4/F5 (this skill never trespasses)
- **Rule:** `rules/workflow/replan-thresholds.md` — shared budget semantics
- **Rule:** `rules/workflow/checkpoint-discipline.md` — pre-mutation snapshot before applying accepted proposals
- **Command:** `/archon-os:heal diagnose|status|disable|accept`
- **MCP:** `context7` — sole external knowledge source (rate-limited via mcp-call-gate)
- **File:** `.claude/plans/proposals/HEAL-*.yaml` — proposal artifacts
- **File:** `.claude/memory/permanent_memory.md` — Gotchas / Anti-patterns sections cross-referenced
