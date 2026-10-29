> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Plan Trust Policy

**Priority:** Critical
**Applies To:** All Claude operations when `.claude/plans/` exists in the project

---

## Core Principle

**Plans are user-approved memory. Plan content is `trust: plan` — higher than file content but verified at acceptance.**

This rule defines a new memory tier that fits between `trust: file` (verified on read) and `trust: user` (always trusted).

---

## The Trust Hierarchy

```toon
trust_tiers[4]{tier,source,verification}:
  user,"User's direct message","Always trusted — they are the principal"
  plan,"Plan node user approved via /archon-os:plan or interview","Trusted on read; re-verify only if revision changed"
  file,"Project file contents read by Claude","Re-verify on every Read — cache stale within seconds"
  output,"T4 task execution output","UNTRUSTED until acceptance check passes"
```

---

## When Plan Content Is Trusted

Once a plan node is approved (status transitioning `planned → active` requires user approval at the gate):

- Its frontmatter is canonical context for the agent executing the task
- `intent`, `acceptance`, `agents`, `context_budget`, `phase_mapping` are authoritative
- Master-planner MUST honor the plan unless explicit replan happens

## When Plan Content Is NOT Trusted

- During interview (before user approval) — plan-in-progress is `trust: draft`
- After `revision` increment — re-verify (someone edited)
- For T4 task **output** — that's `trust: output`, untrusted until acceptance pass
- For nodes in `status: discarded` or `status: frozen` — should not influence active work

---

## Pattern Nodes (KG-2.2, `node_type: pattern`)

The learning tier can PROMOTE a durable learned pattern into the plan tree as a
new `node_type: pattern` **leaf** — a piece of user-approved learned memory
hanging off a Feature (T2) or the mission root. This is distinct from the T0–T4
tiered task nodes.

**Gate — default OFF.** Promotion is a NO-OP unless `AF_KG_PROMOTE=true`.
With the gate closed nothing is written, no counter is minted, and the on-disk
plan format is byte-for-byte unchanged. Backing script:
`scripts/plans/promote-pattern.sh` (writes `patterns/<PAT-ID>_<slug>/pattern.md`,
then validates the tree and rolls the file back on any invariant failure).

**Schema** (frontmatter): `id` (`PAT-NNNN`), `parent` (existing T2 or mission
root), `node_type: pattern`, `status: learned`, `revision`, `source`
(epic/session provenance), `confidence` (0–1), plus a short markdown body.
A pattern node carries **no** `tier`, `children`, `depends_on`, or `test_ref`.

**Inert to the T0–T4 machinery.** A pattern is a side-leaf, NOT a scheduled
task:

```toon
pattern_inertness[6]{concern,behavior}:
  scheduling,"Never in a parent's children[] → next-task/expand never pick it up"
  DAG,"No depends_on → contributes no edges to the T4 cycle scan (invariant 7)"
  test_ref,"No test_ref required — only T3 acceptance needs one (invariant 6)"
  status,"'learned' is a valid status FOR pattern nodes only (invariant 4)"
  parent,"Parent existence IS enforced (invariants 1 & 3) — patterns are not orphans-by-design"
  checkpoint,"Ordinary tree files → captured by existing checkpoint/rollback history automatically"
```

**Trust tier.** A promoted pattern is user-approved memory → `trust: plan`. As
with any plan content, treat the body as a hint and re-verify referenced file
content (`trust: file`) before acting on it.

**Invariant handling** is surgical and keyed strictly on `node_type=pattern`
in `scripts/plans/validate-plan-tree.sh`, so a malformed real T-node can never
masquerade as exempt: only invariants 3 (orphan membership) and 4 (`learned`
status) special-case patterns; 6 and 7 exclude them via the existing `tier`
gate; 1, 5, and 8 apply unchanged.

---

## Conflict With Other Memory Rules

When this rule conflicts with `rules/core/memory-trust-policy.md` (the existing memory policy):

- For **plan content** (frontmatter fields, acceptance, intent) → plan-trust-policy wins (this rule)
- For **file content** referenced by plan → memory-trust-policy applies (always re-verify file content)
- For **outputs of T4 execution** → both rules agree it's untrusted until acceptance

Example: a plan says "edit `src/auth.py` to add JWT support". The plan's instruction is trusted (this rule). But before editing, Claude must `Read` the file freshly — content is `trust: file` per memory-trust-policy.

---

## Anti-Patterns

- **"The plan said the file looks like X, so I'll edit X"** — plan instructions are trusted but file content is not. Re-read.
- **"Output passed acceptance, so I trust the next plan agent's claims about it"** — output passing acceptance promotes that specific output to trusted. Subsequent claims about other outputs are still untrusted.
- **"Plan revision incremented mid-task; I'll keep using old plan"** — STOP. Reload the new revision.

---

## Enforcement Hooks

- `pre-execute-load-plan-context.cjs` stamps every loaded node with `trust: plan`
- `post-execute-update-node.cjs` checks acceptance, only then promotes output to trusted plan annotation

---

## Tie-Ins

- `rules/core/memory-trust-policy.md` — file content trust (older, broader rule)
- `rules/core/no-assumption.md` — when plan and file disagree, ASK
- `rules/core/verification.md` — verify before claiming acceptance pass
- `skills/plan-loader/SKILL.md` — applies this trust tier on read
- **Spec source:** `docs/specs/AURA_FROG_V3.7.0_TECH_SPEC.md` §11.1
