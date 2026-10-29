# Run Commands

The universal entry point. Type `/run <task>` and Archon OS auto-detects intent: feature, bugfix, refactor, test, deploy, review — then runs the right flow.

**Category:** Core
**Scope:** Session

---

## EXECUTION PROTOCOL — FOLLOW IN ORDER

When the user types `/run <task>`, Claude MUST execute these steps in order. Do NOT skip ahead to implementation.

1. **Read `skills/run-orchestrator/SKILL.md` fully.** That skill carries the playbook. This command file is documentation about /run, not the playbook itself.
2. **Run agent-detector** to classify complexity (Quick / Standard / Deep / Project) and pick the flow per the detection table below.
3. **Escalation check (v3.7.2+)** — Before creating the run state, evaluate the escalation heuristic from `rules/workflow/run-plan-bridge.md`. If the task scores weight ≥ 3 AND no plan tree exists, emit the 3-option prompt (`plan` / `deep` / `details`). See `skills/run-orchestrator/SKILL.md` Step 0 for full semantics. Override prefixes:
   - `/run task: <desc>` — force task mode (Quick/Standard/Deep), skip escalation.
   - `/run project: <desc>` — force project mode; write `.claude/cache/pending-plan-bootstrap.json` and invoke `/archon-os:plan` directly.
   - `ARCHON_ESCALATION_DISABLED=true` — opts out per-session.
4. **Create the run state file** at `.claude/logs/runs/<run-id>/run-state.json` per `skills/run-orchestrator/SKILL.md` Step 0b. **MANDATORY** — do not proceed without it. If escalation ran and the user picked `deep`, record `escalation_declined: true` in run-state.
   - **Scaffold phase deliverables** (Step 0.5): `bash "${CLAUDE_PLUGIN_ROOT}/scripts/workflow/scaffold-phase-deliverables.sh" <run-id> 1` — the per-phase .md documents (REQUIREMENTS.md, TECH_SPEC.md, …) must exist on disk before phase work starts, and again on every phase advance. The `run-deliverables-scaffold` hook backstops this on every run-state.json write, but do not rely on it silently — fill the scaffolds in; files left as templates block the approval gate (`rules/workflow/workflow-deliverables.md`). Skip only for Quick/direct runs.
5. **Apply the Run ↔ Plan bridge** (`rules/workflow/run-plan-bridge.md`):
   - `.claude/plans/active.json#active.task` set → auto-anchor; deliverables sync back to the plan tree on Phase 5.
   - Active feature without claimed task → suggest `/archon-os:plan next`.
   - No plan + escalation prompt was emitted in Step 3 (the trigger heuristic owns this case now).
   - `ARCHON_RUN_PLAN_BRIDGE_DISABLED=true` disables the bridge entirely (also disables Step 3 escalation).
6. **Announce the chosen flow** to the user transparently: "Detected: Standard → single-agent inline (no plan). Say `deep` to escalate." When anchored, also state the anchor: "Anchored to TASK-00101 (story STORY-0042, feature FEAT-A)."
7. **Then** execute the chosen flow. For Deep, follow the 5-phase workflow in run-orchestrator. For Standard/Quick, lighter flow per the table. For Project (escalated via Step 3), the run handed off to `/archon-os:plan` and this invocation terminates.

If any step fails, surface the failure to the user — do not silently fall through to direct implementation.

---

## /run <task>

Start a new run. Auto-detects intent from task description:

```toon
detection[8]{keywords,intent,flow}:
  "fix/bug/broken/crash/error/not working",bugfix,"4-step TDD: investigate → test RED → fix GREEN → verify"
  "implement/build/create/add feature/new",feature,"5-phase: design → test → build → review → finalize"
  "refactor/cleanup/restructure/improve code",refactor,"Analyze → plan → test → refactor → verify"
  "test/coverage/unit test/e2e/add tests",test,"Detect framework → analyze → write tests → verify coverage"
  "security/audit/vulnerability/scan/owasp",security,"Deps + SAST + secrets + OWASP Top 10 → report"
  "review/audit/check code/code review",review,"code-reviewer skill: 8 aspects, evidence + failure scenario per finding"
  "deploy/docker/cicd/kubernetes",deploy,"Platform detect → config → scripts → guide"
  "quality/lint/complexity/debt",quality,"Lint + format + type check + coverage + complexity → report"
```

- Generates a run ID from ticket number (e.g., `JIRA-123`) or short name + date (e.g., `fix-payment-0420`)
- State files: `.claude/logs/runs/{run-id}/run-state.json`
- Feature runs get 2 approval gates (Phase 1 design, Phase 3 build)
- Bugfix/refactor/test runs are lighter — fewer gates

**Usage:** `/run implement user profile with avatar upload`, `/run fix login button not disabling`

---

## Context-Aware Actions

When a run is active (`run-state.json` exists with `status: in_progress`), **type bare words** — no `/run` prefix needed:

```toon
actions[8]{input,action}:
  approve,"Approve current gate → advance to next phase"
  reject <reason>,"Reject → brainstorm alternatives → redo"
  modify <changes>,"Adjust deliverables without restarting phase"
  handoff,"Save a handoff named after this session (.claude/handoffs/<session-name>.md)"
  status,"Show current run progress"
  progress,"Visual timeline + token usage"
  rollback,"Revert to last checkpoint"
  stop,"Cancel current run"
```

Force mode (skip brainstorming): prefix with `must do:`, `just do:`, `exactly:`.

**Mode-override prefixes** (v3.7.2+, control the escalation check):

- `/run task: <desc>` — force task mode; skip the project-mode escalation check.
- `/run project: <desc>` — force project mode; write `pending-plan-bootstrap.json` and route to `/archon-os:plan`.
- `ARCHON_ESCALATION_DISABLED=true` — per-session opt-out of the escalation check.

**Feature anchor prefix** (v3.7.3+, link a run to a T2 feature):

- `/run feature: FEAT-A <desc>` — anchor a new run to the named feature. After Step 0b (run-state creation), call `scripts/plans/link-run.sh link <run-id> FEAT-A --status in_progress` to write both sides: `run-state.json#feature_id` + the feature's `## Runs` table. Deliverables sync back to the plan tree on Phase 5.
- `/run feature: JIRA-1234 <desc>` — same, with a ticket-ID-prefixed feature folder.
- The feature must already exist (`/archon-os:plan` first if not). For a fresh feature + run, use `/run project: <desc>` (escalates to plan bootstrap, then anchors).

> ⚠️ **Anchoring to a plan never skips the 5-phase TDD.** A `/run` anchored to FEAT-A still runs Phase 1 → 2 → 3 → 4 → 5 against the task. The plan tree feeds Phase 1 (acceptance criteria, design notes) and Phase 2 (test scaffolds) — it does **not** replace them. **Phase 2 (Test RED) is mandatory** even when the plan already documents acceptance criteria, because acceptance criteria are intent and failing tests are executable contracts. One `/run` covers one task's full 5-phase cycle; iterating a feature means looping `/archon-os:plan next` + `/run` per task.

---

## /run status

Show active run: phase, progress %, deliverables, agents, time elapsed, token usage, next actions. `--detailed` for per-phase timestamps.

---

## /run resume <id-or-feature>

Resume a saved run or handoff. Three forms:

- **`/run resume <session-name>`** (e.g., `/run resume lam-truyen`) — resume a named handoff. Handoffs are saved per session under `.claude/handoffs/<name>.{json,md}`, named after the session title (`/rename` → auto title → `session-<id8>`). Print it with `node "${CLAUDE_PLUGIN_ROOT}/hooks/compact-handoff.cjs" --show <name>`, re-read the project's plan docs it lists, then continue. Checked first; falls through to the forms below when no handoff matches.

- **`/run resume <run-id>`** (e.g., `/run resume auth-260512`) — direct resume by run ID. Loads `.claude/logs/runs/<run-id>/run-state.json`, validates git state, restores context, continues from last phase.
- **`/run resume <FEATURE_ID>`** (e.g., `/run resume FEAT-A`, `/run resume JIRA-1234`) — feature-anchored resume. Looks up the feature's `## Runs` table via `scripts/plans/link-run.sh list <FEATURE_ID>`, surfaces all linked runs with their status (in_progress / done / discarded), and prompts to pick one. If only one in-progress run exists, resumes it directly.

Both forms validate the run still matches the current git branch and warn if the working tree has diverged from the run's last checkpoint.

---

## /run progress

Visual timeline: progress bar, phase completion, velocity (phases/hr), token usage %, estimated time remaining.

---

## /run rollback [phase]

Revert to a git checkpoint. `--list` shows available checkpoints. Requires user confirmation.

---

## Feature Run: 5-Phase Workflow

```toon
phases[5]{phase,name,gate}:
  1,"Understand + Design",APPROVAL
  2,"Test RED",Auto
  3,"Build GREEN",APPROVAL
  4,"Refactor + Review",Auto
  5,"Finalize",Auto
```

- Sprint Contract negotiated after Phase 1 approval
- Builder ≠ Reviewer enforced in Phase 4
- Auto-stop: tests pass in RED, tests fail after refactor, coverage <80%, token limit
- Fast-track: `/run fasttrack: <specs>` skips Phase 1

---

## Bugfix Run: 4-Step TDD

1. **Investigate** — read error, reproduce, trace root cause
2. **Test RED** — write failing test that reproduces bug
3. **Fix GREEN** — minimal fix at root cause
4. **Verify** — full test suite, no regressions

Escalate to `skills/deep-debugging/SKILL.md` when the bug is intermittent, race-condition-flavored, or resists quick fix.

---

## Auto-Loaded Skills Based on Repo

When a run starts, `run-orchestrator` detects repo traits and loads relevant skills:

- Detects `pnpm-workspace.yaml` / `turbo.json` / `nx.json` / `lerna.json` / `go.work` → loads `skills/monorepo/SKILL.md` for package-scope discipline
- Performance keywords in task ("slow", "latency", "optimize speed") → loads `skills/perf-profiling/SKILL.md`
- Detection happens via `skills/agent-detector/SKILL.md` every message

---

## Related

- **Skills** (invoke via the Skill tool, NOT the Agent tool — they're not agents): `run-orchestrator` (feature runs), `bugfix-quick` (bugfix runs), `test-writer` (test runs), `session-continuation` (handoff/resume)
- **Phase guides:** `docs/phases/PHASE_[N]_*.MD`
