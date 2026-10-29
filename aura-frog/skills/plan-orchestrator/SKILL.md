---
name: plan-orchestrator
description: "Route hierarchical-planning intents to the correct backing script. Use when the user invokes /archon-os:plan (with or without subcommand), mentions plan verbs (expand/next/replan/promote/archive/freeze/thaw/undo/status/conflicts), or types a plan-vocabulary bare word with .claude/plans/active.json present. Owns verb table, intent classifier, and 3-stage routing pipeline."
when_to_use: "/archon-os:plan, /archon-os:plan-*, hierarchical planning verbs, bare-word routing while plan active, plan tree mutation, T0-T4 decomposition"
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
effort: medium
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Plan Orchestrator

Single entry point for the 11-verb hierarchical-planning vocabulary. Routes user intent → backing script in `aura-frog/scripts/plans/`. Replaces 10 separate command files with one consolidated dispatcher.

**Owner command:** `commands/plan.md` (single user-facing command)
**Bare-word router:** `hooks/bare-word-router.cjs` (active-plan vocabulary)
**Data model:** `.claude/plans/` per Tech Spec §6

---

## verb_table[11]

```toon
verbs[11]{verb,tier_in,tier_out,script,mutates_active_json}:
  bootstrap,—,T0+T1+T2,new-plan.sh,true
  expand,T1/T2/T3,T2/T3/T4,expand-node.sh,false
  next,T3,T4,next-task.sh,true
  status,—,—,render-plan-tree.sh,false
  replan,T1-T4,T1-T4,replan-node.sh,false
  promote,T4,T1/T2,promote-node.sh,false
  archive,T2+,T2+,archive-feature.sh,false
  undo,T1-T4,T1-T4,undo-decision.sh,true
  freeze,T1-T4,T1-T4,freeze-branch.sh,false
  thaw,T1-T4,T1-T4,thaw-branch.sh,false
  conflicts,—,—,conflicts-scan.sh,false
```

`bootstrap` is the unprefixed `/archon-os:plan` (no verb) — T0/T1/T2 interview. Every other verb requires an explicit target node ID or option flags.

---

## intent_keywords[11]

Used by Stage 2 of the routing pipeline when the user's input has no explicit verb prefix. Match by stemmed substring (case-insensitive).

```toon
keywords[11]{verb,phrases}:
  bootstrap,"plan|bootstrap|set up the plan|init plan|new plan"
  expand,"expand|decompose|break down|drill down|split into stories|split into tasks"
  next,"next|next task|what's next|claim next|dispatch next|pick up"
  status,"status|tree|render|show plan|where are we|progress"
  replan,"replan|rework|reset|redo plan|discard plan|change plan"
  promote,"promote|surface|bubble up|elevate|discovery|insight up"
  archive,"archive|compress|wrap up|finalize feature|close out"
  undo,"undo|rollback|revert|restore|step back"
  freeze,"freeze|pause|halt|park|block|stop work on"
  thaw,"thaw|unfreeze|resume|continue|unblock"
  conflicts,"conflict|collision|overlap|incompatible|conflicts list|conflict check"
```

A user utterance like "let's expand FEAT-A into stories" matches `expand` via `expand|decompose`. "rollback" matches `undo`. "what's next" matches `next`.

---

## 3-stage routing pipeline

When invoked (via `/archon-os:plan <input>` or bare-word router), execute in order — stop at the first stage that produces a single match.

### Stage 1 — Explicit verb prefix (deterministic)

Pattern: `<verb> [<target_id_or_flags>]` where `<verb>` ∈ verb_table.

Examples:
- `expand FEAT-A` → run `expand-node.sh FEAT-A`
- `next` → run `next-task.sh`
- `freeze TASK-00042 --reason "blocked on db schema"` → run `freeze-branch.sh TASK-00042 --reason "..."`
- `conflicts list --open` → run `conflicts-scan.sh list --open`

If the first token matches a verb in verb_table → dispatch directly. Skip Stage 2/3.

**Legacy command shape support:** If invoked via a `plan-<verb>.md` alias stub (e.g. `/archon-os:plan-expand FEAT-A`), treat as Stage 1 with the verb implied — the stub file passes the verb explicitly.

### Stage 2 — Intent classification (keyword match)

If Stage 1 doesn't match, scan input against `intent_keywords`. Match each keyword group; collect verbs whose phrases appear in the input.

- **Single match** → run `resolve-node.sh` against any node-shaped token (matches `^(MISSION|INIT|FEAT|STORY|TASK)-[A-Z0-9]+$` OR title substring), then dispatch the matched verb.
- **Multi-match** (e.g. "expand and replan FEAT-A" hits both `expand` + `replan`) → surface to user: `Two intents detected: expand, replan. Run one at a time — which first?`
- **Zero matches** → fall through to Stage 3.

### Stage 3 — LLM fallback (ambiguous)

No explicit verb, no keyword match. Surface a structured prompt:

```
Couldn't auto-route this. The plan vocabulary is: bootstrap, expand, next, status,
replan, promote, archive, undo, freeze, thaw, conflicts. Closest matches: <top 2 by
edit distance>. Reply with a verb or `/archon-os:plan status` to see the tree.
```

Do not guess. Do not auto-dispatch in Stage 3.

---

## Node resolution

When a verb takes a `<target>` arg, the target may be:
1. **Full ID** (`FEAT-A`, `TASK-00042`) — exact match required.
2. **Title substring** (`auth-flow`) — case-insensitive substring of the node's `intent:` frontmatter field.
3. **Special tokens** — `--active` resolves to `active.task` from `active.json`. `--feature` resolves to `active.feature`.

Delegate to `scripts/plans/resolve-node.sh <input>` — exit 0 single match, 1 multi-match (print candidates), 2 no match.

---

## Atomicity contract (applies to every mutating verb)

Every backing script that writes a node file must:
1. **Read** the current `.claude/plans/active.json` and target node file.
2. **Save checkpoint** to `.claude/plans/checkpoints/<NODE_ID>.<ISO8601>.json` containing pre-mutation state + git SHA.
3. **Mutate** the target file with `revision += 1`.
4. **Validate** via `bash scripts/plans/validate-plan-tree.sh` — abort + restore checkpoint if any invariant fails.
5. **Append** `history.jsonl` decision event: `{ts, verb, target, before_revision, after_revision, agent}`.
6. **Atomic write** — write to `<file>.tmp`, then `mv` over the target. Never partial-write a node file.

---

## Backing scripts

| Script | Owner verb | Purpose |
|---|---|---|
| `new-plan.sh` | bootstrap | Init `.claude/plans/` skeleton (existing, idempotent) |
| `expand-node.sh` | expand | Decompose T2→T3 or T3→T4. Dispatches feature-architect or story-planner agent. |
| `next-task.sh` | next | Dispatch next ready T4 — reads `graph-index.json` when the project has a fresh one, else rescans the active T3's task files. `--rebuild` regenerates the index. |
| `freeze-branch.sh` | freeze | Cascade-freeze descendants. Save checkpoint, refuse on done/archived. |
| `thaw-branch.sh` | thaw | Reverse freeze. Validate blocker resolved + git-diff compatibility per §21.6. |
| `archive-feature.sh` | archive | Compress completed T2 to summary + move originals to `archive/`. |
| `conflicts-scan.sh` | conflicts | Wrap L1+L2 detection (conflict-detector hook). List/show/resolve/history/check. |
| `replan-node.sh` | replan | Mutate target + descendants. Budget-aware (refuse if `replan_count >= replan_budget`). |
| `promote-node.sh` | promote | Bubble T4 discovery up to T2/T1 — append to `discoveries[]`, increment revision. |
| `undo-decision.sh` | undo | Restore latest `.claude/plans/checkpoints/<id>.*.json` (LIFO). |
| `resolve-node.sh` | (helper) | Resolve `<input>` to node ID. Exit 0/1/2. |

Existing: `new-plan.sh`, `validate-plan-tree.sh`, `render-plan-tree.sh`. All others new in v3.7.2.

### `graph-index.json` — the adjacency cache

`<plans_dir>/graph-index.json` holds one record per node (`tier`, `status`,
`parent`, `children`, `depends_on`, `path`, `intent`), so the questions asked on
every dispatch and every render — who is my parent, which tasks under this story
are ready — do not require re-walking the tree and re-parsing frontmatter out of
every `.md`. Built and maintained by `hooks/lib/vault-index.cjs`.

```toon
graph_index[5]{aspect,behaviour}:
  Opt-in,"Nothing creates it implicitly. `next-task.sh --rebuild`, `render-plan-tree.sh --rebuild` or `validate-plan-tree.sh --rebuild` writes it the first time."
  Maintained,"`_lib.sh#set_field` patches the affected entry after each mutation — one file read, not a rescan. No-op when the index does not exist."
  Self-healing,"Readers reject it when a node file is missing, newer than the index, or any directory changed since the build (which is how a newly created task is caught), and fall back to their own scan."
  Authority,"The .md files are the source of truth. validate-plan-tree.sh never READS the index — it PRODUCES one, and only from a tree whose invariants passed."
  Disable,AF_GRAPH_INDEX_DISABLED=true
```

The index can only ever cost time, never accuracy: every consumer keeps the
filesystem scan as its fallback, and takes it whenever the index is absent,
stale or disabled.

---

## Bare-word activation

When `.claude/plans/active.json` exists, the user may type a verb as the first token of a short message and have it route here. `hooks/bare-word-router.cjs` handles detection; this skill receives the routing hint and dispatches per Stage 1.

Activation conditions (all must hold):
- `.claude/plans/active.json` is present and parseable.
- First token of the user prompt is a member of `verb_table[].verb`.
- Total word count ≤ 5 (so "next" routes but "next steps are unclear" doesn't).

When a verb requires a target but none is given, suggest the most likely:
- `next` → run; needs nothing.
- `expand` → suggest active.feature or active.story.
- `freeze`/`thaw`/`replan`/`promote`/`undo` → suggest `active.task` if set.

---

## Override prefixes

User can bypass the router and force a verb:
- `must do: <verb> <args>` → Stage 1 only; never fall through.
- `just do: <verb> <args>` → same.
- `exactly: <verb> <args>` → same.

These prefixes also bypass any confirmation prompts in the backing scripts (treat as `--force`).

---

## Disable mechanism

- `AF_PLAN_ROUTING_DISABLED=true` → skill exits early, `/archon-os:plan` falls back to direct script invocation per command file protocol.

---

## Related Rules

- `rules/workflow/run-plan-bridge.md` — anchor /run to active T4.
- `rules/core/plan-trust-policy.md` — when memory vs plan tree conflict, prefer plan.
- `rules/workflow/checkpoint-discipline.md` — checkpoint format + when required.
