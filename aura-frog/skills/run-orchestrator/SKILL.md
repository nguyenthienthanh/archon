---
name: run-orchestrator
description: "Execute 5-phase TDD workflow for complex features. Use when the user invokes /run, asks to build/create/implement a feature, requests a complex multi-file change, or types 'fasttrack:'. Enforces phase gates, sprint contracts, and builder!=reviewer discipline."
when_to_use: "/run, build feature, create feature, implement feature, complex task, multi-file implementation, fasttrack: <spec>"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
effort: high
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Run Orchestrator

For complex features / multi-file changes requiring TDD. NOT for: bug fixes (use the `bugfix-quick` **skill** via the Skill tool — it is NOT an agent), quick edits (direct).

## Step 0 — Escalation Check (precondition, v3.7.2+)

Before creating run-state.json, screen the task description for project-level scope via the bridge heuristic in `rules/workflow/run-plan-bridge.md`. The 8-trigger rubric (multi_feature, multi_week, shipping_scope, scale_words, cross_session, user_explicit, word_count, scope_verbs) sums to a weight; if weight ≥ 3 AND no plan tree exists (`.claude/plans/active.json` missing), emit this 3-option prompt:

```
Your task scores ≥3 on the escalation heuristic — multi-feature / multi-session scope.
Options:
  plan    — bootstrap /archon-os:plan first (writes pending-plan-bootstrap.json)
  deep    — proceed with normal Deep flow (escalation_declined: true recorded)
  details — show breakdown of which signals fired, re-ask
```

**Honour the answer:**

- `plan` → write `.claude/cache/pending-plan-bootstrap.json` (schema below) and invoke `/archon-os:plan`. Do NOT proceed to Step 0b until the plan returns.
- `deep` (or legacy alias `proceed`) → set `escalation_declined: true` in the run-state when it's created. Continue.
- `details` → render which signals fired with weights, then re-ask.

**Skip the prompt when:**

- `.claude/plans/active.json` exists → fall through to Step 1 (plan_anchored / plan_idle states from `run-plan-bridge.md` apply).
- `AF_ESCALATION_DISABLED=true` env var is set.
- Task description has an override prefix: `task:` (force task mode, skip ask) or `project:` (force project mode, skip ask + write scratch file).
- Force prefixes `must do:` / `just do:` / `exactly:` are present (these bypass the entire bridge per the bridge rule).

### pending-plan-bootstrap.json schema

```json
{
  "schema_version": 1,
  "from_run_id": "auth-260511",
  "mission_seed": "<verbatim user task description>",
  "feature_seeds": ["auth", "billing", "dashboard"],
  "created_at": "2026-05-11T16:00:00Z",
  "trigger_weight": 5,
  "signals_fired": ["multi_feature", "shipping_scope", "scope_verbs"]
}
```

`feature_seeds` are extracted as comma-or-plus-separated noun phrases from the task; the plan command interview-confirms before minting Feature nodes. The file is deleted by `commands/plan.md` after consumption.

## Step 0b — Create the Run State (MANDATORY, BEFORE ANY OTHER WORK)

The moment you decide a `/run` invocation will use this orchestrator, write the initial state file. **Do NOT proceed without it.** Without the file, `/run status`, `/run resume`, and `/run handoff` cannot work — they all read from this file.

```bash
# Generate run-id: ticket prefix (JIRA-123) or short-name + YYMMDD (auth-260424)
RUN_ID="<derived from task or ticket>"
mkdir -p ".claude/logs/runs/${RUN_ID}"
```

Then write `.claude/logs/runs/${RUN_ID}/run-state.json` with this skeleton:

```json
{
  "run_id": "<RUN_ID>",
  "task": "<verbatim user task>",
  "status": "in_progress",
  "complexity": "<Quick|Standard|Deep|Project — from agent-detector>",
  "flow": "<direct|bugfix|refactor|test|feature-standard|feature-deep|security|review|deploy|quality>",
  "started_at": "<ISO 8601 UTC>",
  "current_phase": 1,
  "current_step": "<bugfix steps: investigate|test-red|fix-green|verify · otherwise omit>",
  "active_agent": "<lead|architect|frontend|… — read by scripts/statusline.sh>",
  "phases": {},
  "agents": [],
  "deliverables": [],
  "observations": [],
  "approvals": [],
  "tokens_used": 0
}
```

**Keep `current_phase` / `current_step` / `active_agent` in sync with reality** — `scripts/statusline.sh` reads them on every prompt to render the status bar. Stale values mean the user sees "P1 / lead" while you're actually executing P3 work via `architect`.

**Announce to user transparently:**

> "Detected: `<complexity>` complexity → `<flow>` flow. State file: `.claude/logs/runs/${RUN_ID}/run-state.json`. Say `deep` to escalate, `quick` to downgrade, or proceed."

For Deep runs, follow with the per-phase team announcement (see §5-Phase Workflow below): builder / reviewers / gate / dispatching-now. For Standard/Quick, one line: `🛠 Dispatching <agent> (<mode> / single-agent inline).`

This step is non-negotiable. If you skip it, /run status will show nothing and the user loses observability.

### Step 0c — Feature linking (v3.7.3+)

After writing run-state.json, register the run against its feature if anchored:

**Path A — `/run feature: FEAT-X <task>` prefix:**

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/plans/link-run.sh" link "${RUN_ID}" "<FEATURE_ID>" --status in_progress
# If a specific task is anchored, add: --anchor TASK-NNNNN
```

This writes both sides of the run ↔ feature link:
1. `run-state.json` gets `feature_id`, `feature_slug`, `feature_linked_at` (and `anchor.task_id` if `--anchor` passed)
2. The feature's `feature.md` gets a row in its `## Runs` table (creates the section if absent)

**Path B — Existing `active.json#active.task` set:**

The Run ↔ Plan bridge (Step 1) already anchors via `active.task`. After Step 1 confirms an anchor, also call link-run.sh so the feature.md side stays in sync.

**Path C — `/run resume <FEATURE_ID>`:**

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/plans/link-run.sh" list "<FEATURE_ID>"
```

Surface every row to the user; prompt to pick one (or auto-resume if only one is `in_progress`). Then `/run resume <run-id>` continues normally.

**On Phase 5 (Finalize) — update the link:**

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/plans/link-run.sh" link "${RUN_ID}" "${FEATURE_ID}" --status done
```

Same idempotent helper — overwrites the existing row with the new status. No duplicate entries.

---

## Step 0.5 — Scaffold Phase-1 Deliverables (MANDATORY for Standard/Deep)

Run-state.json tracks metadata; **the real deliverables are markdown files on disk**. Before announcing Phase 1, scaffold the Phase-1 documents so the work has a place to land:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/workflow/scaffold-phase-deliverables.sh" "${RUN_ID}" 1
```

This creates (idempotent — never overwrites):

```toon
phase1_files[4]{filename,purpose}:
  REQUIREMENTS.md,User stories + acceptance criteria + scope
  TECH_SPEC.md,AI-readable TOON: architecture + files + APIs + risks
  TECH_SPEC_CONFLUENCE.md,Human-readable spec for Confluence / PRs
  DESIGN_DECISIONS.md,Low-level design choices + tradeoffs
```

**On each phase transition**, re-invoke the scaffold for the next phase:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/workflow/scaffold-phase-deliverables.sh" "${RUN_ID}" <next_phase>
```

Phase mapping the scaffold creates:

```toon
scaffold_map[5]{phase,files}:
  1,"REQUIREMENTS · TECH_SPEC · TECH_SPEC_CONFLUENCE · DESIGN_DECISIONS"
  2,"TEST_PLAN · TEST_CASES"
  3,"IMPLEMENTATION_NOTES · FILES_CHANGED"
  4,"CODE_REVIEW · REFACTOR_LOG"
  5,"QA_REPORT · IMPLEMENTATION_SUMMARY · CHANGELOG_ENTRY"
```

**Skip Step 0.5 only for Quick/direct-edit runs** — those don't have phase deliverables. Bugfix/refactor/test/feature runs all use it.

**Gate enforcement** (per `rules/workflow/workflow-deliverables.md`): before showing a Phase N approval gate, verify the Phase N files exist AND have non-template content. Files that still match the template byte-for-byte mean the work wasn't done — block the gate and prompt the user to fill them in.

---

## Pre-Execution (Phase 1 setup)

1. agent-detector → select lead, complexity, model
2. **Apply context-economy** — locate before Read, use Glob/Grep first, slice large files with `offset`+`limit`, delegate broad exploration to Explore subagent. See `rules/core/context-economy.md`. **If you hit `overloaded_error`, do NOT retry with the same context — distill, then resume.**
3. **Validate prompt (6-dim benchmark)** — score per `rules/core/prompt-validation.md`. If below threshold, ask focused questions before proceeding (see `rules/core/no-assumption.md`)
4. **Check for JIRA ticket context** — if the user prompt or `RUN_ID` matches `[A-Za-z]{2,10}-[0-9]{1,6}`, the `jira-auto-fetch.cjs` hook fires on `UserPromptSubmit` and writes `.claude/logs/jira/{TICKET_ID}.json` (TICKET_ID is always UPPERCASE — the hook normalises). Read it as the canonical requirements source (description + comments). Reference the ticket key in run-state under `context.jira_ticket`.

   **There is no CLI script and no Atlassian MCP — the hook IS the integration.** Do not search `scripts/`, `.claude/scripts/`, or `.mcp.json` for a Jira fetcher; you will not find one. Source of truth: `aura-frog/hooks/jira-auto-fetch.cjs`. The standalone `scripts/jira-fetch.sh` was removed in v3.7.0 post-release polish.

   If `.claude/logs/jira/{TICKET_ID_UPPER}.json` is missing despite the user mentioning a ticket, the hook silently skipped for one of three reasons — surface this to the user and ask how to proceed:
   - **Env not set:** missing `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` in `.envrc` (plus `af envrc allow` if the trust gate is enabled). Tell the user to set them, then re-prompt.
   - **JIRA_PROJECT_PREFIXES filtered it out:** the env allowlist excluded this project prefix.
   - **JIRA API failed:** `aura-frog/hooks/jira-auto-fetch.cjs` writes `[jira-auto-fetch] WARN: fetch failed for <id>` to stderr; check there.

   When env is unavailable in this environment (e.g. no `.envrc` access), continue the run by asking the user to paste the task description inline — do not invent a fallback fetch path.
5. **Run ↔ Plan bridge** — apply `rules/workflow/run-plan-bridge.md`:
   - If `.claude/plans/active.json#active.task` is set → **auto-anchor** run-state to that T4; Sprint Contract seeds from the task's acceptance criteria; Phase 5 syncs status back to the plan tree.
   - If `active.feature` is set but `active.task` is null → suggest `/archon-os:plan-next` to claim a task first (user may reply `proceed` to run inline).
   - If no plan exists and the task description triggers ≥3 escalation weight (multi-feature, multi-week, shipping/rollout/epic keywords) → suggest `/archon-os:plan` to bootstrap T0-T2 first. Honor `proceed` to run inline.
   - Disable with `AF_RUN_PLAN_BRIDGE_DISABLED=true`. Force-mode prefixes (`must do:`, `just do:`, `exactly:`) skip the bridge.

   > ⚠️ **Anchoring does NOT skip phases.** The plan tree feeds Phase 1 (acceptance criteria → Sprint Contract; design notes → architecture inputs) — it does **not** replace Phase 1 or Phase 2. **All 5 phases run per task even when anchored.** A common failure mode is interpreting "the feature is already designed in the plan tree" as a license to skip straight to Phase 3 / Build GREEN. That is wrong. Phase 2 (Test RED) is mandatory — it converts the plan's acceptance criteria into executable failing tests before any code is written. Skipping Phase 2 because the plan exists is the bug we're trying to prevent. If you find yourself implementing without a failing test, stop and write the test first.
   >
   > Iterating a whole feature: a single `/run` cycles through Phase 1 → 5 for **one task**. To complete a multi-task feature, repeat `/archon-os:plan next` (or just type `next` while a plan is active) to claim the next ready task, then re-enter `/run` which auto-anchors. Each task gets its own full 5-phase cycle. This is the contract — not "one /run per feature".
6. Load project context
7. Verify complexity — suggest lighter approach if simple
8. **Socratic Onboarding & Discovery (Standard/Deep only)** — Before locking spec, interview user using the 3 mandatory Socratic Probes per `rules/workflow/requirement-challenger.md`:
   - *Probe 1: Scope & Non-goals* (What is explicitly NOT included?)
   - *Probe 2: Failure Modes & Edge Cases* (What happens when external services fail, timeouts trigger, or data is invalid?)
   - *Probe 3: Architecture & Dependencies* (Which subsystems touch this change, and what are the performance/security boundaries?)
   - Present **2 Trade-off Approaches** (e.g., Fast/Minimal vs. Robust/Extensible).
9. **Challenge requirements** (`rules/workflow/requirement-challenger.md`) — Never accept vague prompts passively; refine edge cases and clarify ambiguities with the user.
10. **Sprint Contract** — negotiate "done" criteria before Phase 2 (anchor-aware: cannot weaken plan acceptance without `manual_override.json` audit entry)

## 5-Phase Workflow

```toon
phases[5]{phase,name,builder,reviewer,gate}:
  1,"Understand + Design",architect,"tester+security+strategist",APPROVAL
  2,"Test RED",tester,"architect (feasibility)",Auto
  3,"Build GREEN","architect/frontend/mobile","tester+security",APPROVAL
  4,"Refactor + Review","P3 builder refactors","security+tester (NOT P3 builder)",Auto
  5,"Finalize",lead,—,Auto
```

**Builder != Reviewer.** Details: `rules/workflow/cross-review-workflow.md`

### Phase 1 output budget — HARD CAP 500 tokens

Phase 1 produces a requirements table, not an essay. The whole point of the
approval gate is that a human reads the output; four paragraphs restating the
task get skimmed, and the design decisions inside them get skimmed with them.

```toon
# Phase 1: Requirements
# Task: {one-line description}

scope[3-5]{item,type,priority}:
  {feature},{new|change|fix},{must|should|nice}

acceptance[3-5]{id,criteria}:
  AC1,{testable criterion}

tech_notes[1-3]{area,constraint}:
  {area},{constraint or decision}

risks[0-2]{risk,mitigation}:
  {risk},{mitigation}

# Phase 1 COMPLETE | Next: Phase 2 (Test RED) | Gate: APPROVAL
```

- TOON tables only — no prose paragraphs
- MAX 5 rows per table, ONE line per row
- No repetition, no explanations — data only
- Over 500 tokens means it is wrong, not thorough

(Absorbed from the former `phase1-lite` skill, which nothing loaded: it was
`autoInvoke: false`, `user-invocable: false`, and triggered only on the literal
phrase "phase 1 lite". The cap belongs where Phase 1 actually runs.)

### Mandatory transparency — announce who's doing what (v3.7.4+)

At every phase transition AND every agent dispatch, surface the team to the user in the response message. Format:

```
─── Phase {N} · {Name} ────────────────────────────────────
  Builder:   {agent-id}              (writes the deliverable)
  Reviewers: {agent-id}, {agent-id}  (verify after; never the same as Builder)
  Model/Effort: {model} · {effort}   (from the agent frontmatter / call override)
  Gate:      APPROVAL | Auto
  Dispatching: {agent-id} now…
```

Also update `run-state.json#active_agent`, `#active_agent_model`, and `#active_agent_effort` to the currently-dispatching agent so the statusline (`scripts/statusline.sh`, which renders `▶ agent │ Model · effort ⏱dur`) reflects it. Read the per-phase assignment from the `phases[5]` table above. Per-task agent selection within a phase (e.g. P3 picking `frontend` vs `mobile` vs `architect`) goes through `agent-detector` — surface the selection result with one line:

```
  agent-detector → frontend (score 115, primary)
                    reasons: form +35, login +30, UI intent +50
```

This is non-negotiable for Deep runs. Skipping it means the user can't tell which agent wrote which artifact when reviewing the deliverable at gate time.

For Standard/Quick runs (single agent inline), one-line announcement at start suffices:

```
🛠 Dispatching frontend (Standard / single-agent inline).
```

### Phase 2 — Test type selection (v3.7.4+, fixes silent unit-only default)

`tester` in Phase 2 MUST pick the right test layer BEFORE writing tests. The pre-v3.7.4 default was implicitly "unit tests only" because the run-orchestrator didn't say otherwise — even for UI/auth/payment tasks where an e2e spec is the meaningful safety net. Fixed by following `skills/test-writer/SKILL.md#test-type-selection`:

```toon
phase2_layers[3]{layer,framework_default,when_to_write}:
  unit,jest/vitest,"every Phase 2 — fast feedback on isolated logic"
  integration,jest/vitest with real DB,"task spans 2+ modules or hits a DB query path"
  e2e,playwright (preferred) | cypress | detox,"task contains UI / auth / payment / 'flow' / 'journey' / 'end-to-end' OR Phase-1 acceptance references user-visible behavior"
```

`tester` MUST surface the layer choice to the user before writing the first test:

```
🧪 Phase 2 plan: unit (vitest) + e2e (playwright)
   - Unit: 4 specs for password validator + token signer
   - E2E:  1 happy-path spec (login → dashboard) + 1 failure-path (bad password)
   - No integration layer (auth doesn't cross a DB module in this PR)
```

If the project has no e2e runner configured but the task warrants one, the orchestrator asks the user to pick: install Playwright, use an existing runner, or explicitly accept unit-only with a recorded `escalation_declined: e2e` note in run-state.json.

**Verification (also v3.7.4+):** After `npx playwright test` (or equivalent), read the runner output. "Tests passed" with no pass count = `0 tests collected` = bug. Same discipline applies to all runners.

## Execution Model — Subagent Isolation (Deep tasks)

Context pollution is the #1 failure mode for multi-phase TDD: P1 research artifacts still live in the window when P3 tries to build, so the model gets distracted by outdated design notes.

**For Deep complexity runs, each phase spawns a fresh subagent via the Agent tool.** The orchestrator (main thread) stays lean — it dispatches, verifies deliverables, and holds approval gates. It does NOT do the phase work itself.

> **Critical: plugin agents are namespaced — by the plugin's runtime name, not a hardcoded string.** When you invoke the Agent tool, `subagent_type` is `${PLUGIN_PREFIX}:<id>` where `PLUGIN_PREFIX` comes from `plugin.json#name` (or run `bash scripts/get-plugin-prefix.sh`). Bare `architect` is NOT valid — the tool errors with `agent type 'architect' not found`. Built-in Claude Code agents (general-purpose, Explore, Plan, statusline-setup) stay unprefixed. See `rules/core/agent-namespacing.md` for full details.

The dispatch table below uses **bare agent IDs**. Apply the runtime prefix at the moment you call the Agent tool — don't bake the literal "aura-frog" into your call.

```toon
execution[5]{phase,agent_id,main_thread_role}:
  1,architect,"dispatch + hold gate"
  2,tester,"verify tests fail as expected"
  3,"architect or frontend or mobile (per artifact)","dispatch + hold gate"
  4,"security (primary) + tester","verify builder≠reviewer; reviewers follow skills/code-reviewer → CODE_REVIEW.md"
  5,inline (lead),"finalize — no fork needed"
```

When you call Agent: read the prefix once per session (cheapest: from the session-start banner emitted by `hooks/session-start.cjs`), then compose `subagent_type: ${prefix}:${agent_id}`.

Each subagent returns a concise report. Main thread does NOT re-read phase research files. For Standard/Quick runs, inline execution is fine — the isolation cost only pays off when phases would otherwise compete for the same context budget.

## Phase Transitions

- P1→P2: Approval required. Blocker: no design approved.
- P2→P3: Auto if tests fail as expected. Blocker: tests pass.
- P3→P4: Approval required. Blocker: tests still failing.
- P4→P5: Auto if tests pass + no critical issues.
- P5→Done: Auto. Blocker: coverage <80%.

## Approval Gates (Phase 1 & 3 only)

Show deliverables → user types `approve` / `reject <reason>` / `modify <changes>` (context-aware, no prefix needed).
Force skip brainstorming with "must do:" / "just do:".

## Auto-Stop Triggers

P2: tests pass when should fail. P4: tests fail after refactor. P5: coverage <80%. Any: token limit 75%→warn, 85%→handoff, 90%→force.

## State

Run state: `.claude/logs/runs/{run-id}/run-state.json`. Load phase guide on-demand: `docs/phases/PHASE_[N]_*.MD`.

## Fast-Track

`/run fasttrack: <specs>` — skips P1, auto-executes P2-P5 without gates. Requires: Overview, Requirements, Technical Design, API, Data Model, Acceptance Criteria.

---

## Reasoning Techniques (opt-in via `reason:` prefix)

Advanced reasoning techniques for high-stakes or branching decisions. Auto-enabled only when complexity = Deep AND the task matches the trigger (see each rule). Otherwise opt-in.

| Prefix | Fires | Where | Cost |
|--------|-------|-------|------|
| `/run reason: sc <task>` | Self-Consistency (3 paths vote) | Phase 1 design | ~3× base |
| `/run reason: tot <task>` | Tree of Thoughts (branch/prune) | Phase 1 + Phase 4 | ~3–4× base |
| `/run reason: cove <task>` | Chain-of-Verification | Phase 4 claims | ~2–3× base |
| `/run reason: all <task>` | All three, auto-routed per phase | As above | ~5–7× base |

**Phase 4 always runs CoVe on factual claims** ("tests pass", "coverage X%", "0 critical findings") — this is non-negotiable per `rules/workflow/chain-of-verification.md`.

Full rules:
- `rules/workflow/self-consistency.md`
- `rules/workflow/tree-of-thoughts.md`
- `rules/workflow/chain-of-verification.md`

Skills (playbooks):
- `skills/self-consistency/SKILL.md`
- `skills/tree-of-thoughts/SKILL.md`
- `skills/chain-of-verification/SKILL.md`

---

## Related Rules (load per phase as needed)

**Core (applies every phase):**
- `rules/core/tdd-workflow.md` — RED → GREEN → REFACTOR discipline
- `rules/core/approval-gates.md` — Human-in-the-loop enforcement
- `rules/core/execution-rules.md` — ALWAYS/NEVER orchestration rules
- `rules/core/verification.md` — Verify before claiming done

**Phase 1 (Understand + Design):**
- `rules/workflow/requirement-challenger.md` — Challenge assumptions
- `rules/workflow/collaborative-planning.md` — Deep-task 3-perspective deliberation
- `rules/workflow/impact-analysis.md` — Impact/effort matrix
- `rules/workflow/estimation.md` — Scope estimation
- `rules/workflow/priority-hierarchy.md` — Prioritization
- `rules/workflow/diagram-requirements.md` — Mermaid diagrams for complex phases

**Phase 3 (Build GREEN):**
- `rules/workflow/project-linting-precedence.md` — Project config wins
- `rules/workflow/post-implementation-linting.md` — Lint after each file
- `rules/workflow/smart-commenting.md` — WHY not WHAT

**Phase 4 (Refactor + Review):**
- `skills/code-reviewer/SKILL.md` — The review itself: 8 aspects, verified findings, blocking/non-blocking/nit
- `rules/workflow/cross-review-workflow.md` — Builder ≠ Reviewer
- `rules/workflow/post-implementation-linting.md` — Final lint gate

**Phase 5 (Finalize):**
- `rules/workflow/git-workflow.md` — Commit + push discipline

**Cross-phase:**
- `rules/workflow/workflow-deliverables.md` — What each phase must produce
- `rules/workflow/workflow-navigation.md` — Phase transition rules
- `rules/workflow/next-step-guidance.md` — What to show at gates
- `rules/workflow/token-time-awareness.md` — Budget tracking
- `rules/workflow/feedback-brainstorming.md` — On reject/modify
- `rules/workflow/mcp-response-logging.md` — Log large MCP responses
- `rules/workflow/immutable-workflow.md` — Approved phases are append-only
- `rules/workflow/dual-llm-review.md` — Second LLM review for destructive ops / security-critical writes
