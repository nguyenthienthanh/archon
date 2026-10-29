# /archon-os:plan-promote &lt;note&gt;

**Bubble a T4 discovery up to T2 or T1.** Alias for `/archon-os:plan promote "<note>"` (v3.7.2+).

---

## Usage

```
/archon-os:plan-promote "Existing module X already provides Y — scope shrinks"
/archon-os:plan-promote --to FEAT-007 "Auth needs Redis, not in scope"
/archon-os:plan-promote --to INIT-001 "Need new initiative for migration"
```

## Delegation

```bash
bash aura-frog/scripts/plans/promote-node.sh "<note>" [--to <ID>] [--source <ID>]
```

The script:
1. Resolves source (default: `active.task`) and target (default: source's grandparent — T4 → T2).
2. Appends `<source>@<ts>: <note>` to the target's `## Discoveries` section (creates if absent).
3. Bumps target's `revision`.
4. Appends `history.jsonl event=promote`.

What's promotable (architectural / design / scope-altering — NOT implementation details, test failures, file edits). Promotion does NOT auto-replan — it flags for review. Use `/archon-os:plan replan` to act on the discovery.

Full protocol in `commands/plan.md`. Cannot promote from `discarded|archived` nodes.

**Deprecation timeline:** soft-deprecated v3.7.2, warning v4.0, removed v5.0.
