# /archon-os:plan

**Hierarchical planning entry point — all 11 plan verbs in one command.**
v3.7.2 consolidates `/archon-os:plan-*` (10 commands) into a single dispatcher that routes via the `plan-orchestrator` skill. The legacy `plan-<verb>` aliases still work as thin stubs.

**Category:** Planning
**Scope:** Project-local (writes to `.claude/plans/`)

---

## Two invocation modes

### 1. Bootstrap (no args)

```
/archon-os:plan
```

Initialises `.claude/plans/` and interview-bootstraps T0 (Mission) → T1 (Initiative) → T2 (Feature).

### 2. Verb dispatch

```
/archon-os:plan <verb> [target] [flags]
```

The 11 verbs and their backing scripts (see `skills/plan-orchestrator/SKILL.md` for the full verb table):

| Verb | Backing script | Purpose |
|---|---|---|
| `bootstrap` (default) | `new-plan.sh` | Initial T0/T1/T2 — same as no-arg form |
| `expand <id>` | `expand-node.sh` | Decompose one tier down (T1→T2 / T2→T3 / T3→T4) |
| `next` | `next-task.sh` | Dispatch next ready T4 (scans active story's task files) |
| `status` | `render-plan-tree.sh` | Render the tree as ASCII |
| `replan <id>` | `replan-node.sh` | Force replan + discard descendants |
| `promote "<note>"` | `promote-node.sh` | Bubble T4 discovery up to T2/T1 |
| `archive <id>` | `archive-feature.sh` | Compress completed T2+ to summary |
| `undo [<id>]` | `undo-decision.sh` | Restore latest checkpoint (LIFO) |
| `freeze <id>` | `freeze-branch.sh` | Cascade-freeze descendants |
| `thaw <id>` | `thaw-branch.sh` | Reverse freeze |
| `conflicts <sub>` | `conflicts-scan.sh` | List/show/resolve/history/check |

Each verb takes its own flags — see `archon-os/commands/plan-<verb>.md` for full per-verb docs (alias stubs).

---

## Power-user shortcuts

```
/archon-os:plan next                                # bare verb, no target
/archon-os:plan expand FEAT-A                       # explicit ID
/archon-os:plan expand auth                         # title substring → resolve-node.sh
/archon-os:plan freeze --active "blocked on db"     # current active.task
/archon-os:plan undo                                # last mutation, any node
/archon-os:plan conflicts list --open               # subcommand chaining
```

**Bare-word forms** (only when `.claude/plans/active.json` exists, via `hooks/bare-word-router.cjs`):

```
next                # → /archon-os:plan next
expand FEAT-A       # → /archon-os:plan expand FEAT-A
status              # → /archon-os:plan status
freeze TASK-00042   # → /archon-os:plan freeze TASK-00042
```

Guards (Phase B): all of (1) plan-active, (2) verb is first token, (3) ≤5 words total.

---

## EXECUTION PROTOCOL — FOLLOW IN ORDER

When the user invokes `/archon-os:plan <args>`, Claude MUST:

### Stage 1 — Explicit verb dispatch

1. Parse the first argument.
2. If it matches a verb in `skills/plan-orchestrator/SKILL.md#verb_table` → run the matching backing script:
   ```bash
   bash archon-os/scripts/plans/<verb>-node.sh <remaining-args>
   ```
   (Several scripts use bare names: `next-task.sh`, `freeze-branch.sh`, `thaw-branch.sh`, `archive-feature.sh`, `conflicts-scan.sh`, `replan-node.sh`, `promote-node.sh`, `undo-decision.sh`, `expand-node.sh`.)
3. Surface the script's stdout to the user verbatim. If exit != 0, surface stderr too.

### Stage 2 — Intent classification (no explicit verb)

If no first-arg verb match:

1. Load `intent_keywords[11]` from `skills/plan-orchestrator/SKILL.md`.
2. Scan args against each verb's keyword group.
3. **Single hit** → dispatch the matched verb (auto-resolve target via `resolve-node.sh` if needed).
4. **Multi hit** → ask the user: `Two intents detected: <X>, <Y>. Run one at a time — which first?`
5. **Zero hits** → fall through to Stage 3.

### Stage 3 — Bootstrap / LLM fallback

1. If no args AND no plan tree exists → run **bootstrap protocol** below.
2. If args present but ambiguous → echo the 11-verb vocabulary and the closest matches by edit distance; do NOT auto-dispatch.

---

## Bootstrap protocol (no args, no plan tree)

1. Run `bash archon-os/scripts/plans/new-plan.sh` (idempotent).
2. Run `bash archon-os/scripts/plans/validate-plan-tree.sh` — abort on invariant fail.
3. Read `.claude/plans/mission.md` and `.claude/plans/active.json`.
4. **If mission.md is the default stub** → interview the user for the actual mission (1–3 sentences). Write to mission.md.
5. **If no T1 exists** → interview for the active initiative. Mint INIT-NNN via `.counters.json`, write `.claude/plans/initiatives/INIT-NNN.md` per Tech Spec §6.3.
6. **If no T2 exists under the active T1** → interview for the active feature. Mint FEAT-N, write `.claude/plans/features/FEAT-N/feature.md` per Tech Spec §6.4.
7. **Update `active.json`** — point at the new active T2.
8. **Append to `history.jsonl`** — `event: plan_init` with timestamp + nodes created.
9. **Render** the plan tree: `bash archon-os/scripts/plans/render-plan-tree.sh`.
10. **Announce next:** "Plan initialized. Run `/archon-os:plan expand FEAT-N` to decompose into Stories, or `/archon-os:plan status` for the tree."

If any step fails, surface the error — do NOT silently fall through.

### Interview style

One question at a time, concrete:
- **Mission:** "In one sentence, what does this project exist to do?"
- **Initiative:** "What multi-week effort are you currently driving toward? (e.g., 'Ship v2.0 with auth + billing')"
- **Feature:** "What single user-facing capability are you working on now?"

If user is uncertain, save what they DO know and mark `status: planned` so they can refine later.

---

## Pending bootstrap from /run escalation (Phase C)

If `.claude/cache/pending-plan-bootstrap.json` exists, prefer its contents over interview:

1. Read the file — schema:
   ```json
   {
     "from_run_id": "auth-260511",
     "mission_seed": "<user task description>",
     "feature_seeds": ["auth", "billing", "dashboard"],
     "created_at": "2026-05-11T16:00:00Z"
   }
   ```
2. Use `mission_seed` as the mission stub instead of the static interview.
3. Mint one Feature per item in `feature_seeds` (skip duplicates).
4. Delete the scratch file after bootstrap completes.

---

## Force overrides

```
must do: <verb> ...        # skip Stage 2, run Stage 1 only; treat as --force
just do: <verb> ...        # same
exactly: <verb> ...        # same
```

These prefixes also bypass confirmation prompts in scripts that have them (freeze/thaw/replan/archive).

---

## Disable mechanism

```
AF_PLAN_ROUTING_DISABLED=true
```

When set, this command falls through to the legacy `plan-*.md` alias stubs only — Stage 2 keyword routing is skipped.

---

## Related

- **Skill:** `skills/plan-orchestrator/SKILL.md` (verb table + intent keywords + routing pipeline)
- **Hook:** `hooks/bare-word-router.cjs` (Phase B — short bare-word activation)
- **Rule:** `rules/workflow/run-plan-bridge.md` (`/run` ↔ plan anchor)
- **Scripts:** `archon-os/scripts/plans/{_lib,resolve-node,expand-node,next-task,freeze-branch,thaw-branch,archive-feature,conflicts-scan,replan-node,promote-node,undo-decision}.sh`
- **Spec:** `docs/specs/AURA_FROG_V3.7.0_TECH_SPEC.md` §6, §10.1
- **Legacy aliases:** `commands/plan-{expand,next,replan,promote,archive,status,undo,freeze,thaw,conflicts}.md` — ~10-line stubs that delegate to this command
