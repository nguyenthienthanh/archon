---
last_aligned_with: v4.0.0-alpha.3
status: current
audience: contributor
---

# Contributor docs

[CONTRIBUTING.md](../../CONTRIBUTING.md) is the process: fork, branch, test, PR, release. This
tree is the *mechanism* — how the pieces fit together, and the conventions that will get your
PR sent back if you don't know about them.

Read [CONTRIBUTING.md](../../CONTRIBUTING.md) first if you haven't. Then come here when you
need to know why something is shaped the way it is.

---

## Start here

| Topic | Doc |
|---|---|
| The mental model — kernel, processes, RAM, drivers | [architecture/os-architecture.md](../architecture/os-architecture.md) |
| What ships in the box, and the directory layout | [reference/COMPONENTS.md](../reference/COMPONENTS.md) |
| How instructions load (plugin vs project vs user) | [architecture/CLAUDE_FILE_ARCHITECTURE.md](../architecture/CLAUDE_FILE_ARCHITECTURE.md) |
| Configuration precedence | [architecture/CONFIG_LOADING_ORDER.md](../architecture/CONFIG_LOADING_ORDER.md) |
| Running and extending the test suite | [reference/TESTING_GUIDE.md](../reference/TESTING_GUIDE.md) |
| Behavioural evals | [guides/EVAL_SETUP.md](../guides/EVAL_SETUP.md) |

---

## The subsystems

### Hooks — `archon-os/hooks/`

53 lifecycle hooks, each its own process launched by Claude Code. They are the only part of
Archon OS that is not portable markdown, which makes them the part most worth keeping small.

- **Shared runtime:** `hooks/lib/hook-runtime.cjs` — stdin parsing, locked NDJSON appends,
  atomic writes, structured logging, budget timeouts. 34 direct importers. Use it rather than
  re-implementing; a hook that parses stdin by hand will be asked to change.
- **Fail-open is the contract.** A hook that throws must not block the tool call it was
  observing. Observability is not the critical path.
- **Blast radius before you edit:**
  `node "$CLAUDE_PLUGIN_ROOT/hooks/code-map-digest.cjs" --rdeps <path>`
- Inventory and per-hook notes: [archon-os/hooks/README.md](../../archon-os/hooks/README.md)

### Scripts — `archon-os/scripts/`

Pure bash and plain `.cjs`, no build step. Plan-tree operations live in `scripts/plans/`,
pre-flight linters in `scripts/preflight/`, CI gates in `scripts/ci/`.

Reference: [archon-os/scripts/README.md](../../archon-os/scripts/README.md)

### Agents, skills, rules — markdown

This is most of the plugin, and the reason ~87% of it ports to other tools
([PORTABILITY.md](../PORTABILITY.md)).

- Agents: [archon-os/agents/README.md](../../archon-os/agents/README.md)
- Skills: [archon-os/skills/README.md](../../archon-os/skills/README.md)
- Rules: [archon-os/rules/README.md](../../archon-os/rules/README.md)
- Dispatch model (specialist / observer / verifier):
  [adr/ADR-002-flat-three-role-dispatch.md](../adr/ADR-002-flat-three-role-dispatch.md)

### State on disk

| Path | Holds | Committed? |
|---|---|---|
| `.claude/plans/` | Plan tree, checkpoints, traces, `history.jsonl` | Yes — it's the plan |
| `.claude/logs/runs/<id>/` | Run state and phase deliverables | Yes |
| `.claude/memory/` | Distilled permanent memory | Yes |
| `.claude/cache/` | Derived caches — code map, project cache | No |
| `.archon/runtime/` | Per-machine, per-session runtime state | No |

**Derived means rebuildable.** If deleting a file loses information, it does not belong in
`cache/` or `.archon/runtime/`.

---

## Conventions that will get a PR sent back

**Environment variables are `ARCHON_*`.** The pre-v4 `AF_*` and `AURA_FROG_*` prefixes are
bridged for compatibility (`hooks/lib/env-compat.cjs`, `scripts/lib/env-compat.sh`) and removed
in v5. New code reads only `ARCHON_*`. Background:
[MIGRATION_V4.md](../operations/MIGRATION_V4.md).

**A rename needs a fallback when the file is the user's.** `.archonignore`, `.envrc`
approvals, and in-flight runtime state all kept their legacy paths readable, because an upgrade
cannot rewrite a file in someone else's repo or home directory. A rename that silently drops
their configuration is a bug, not a cleanup.

**Env files are parsed, never executed.** `.env` / `.env.local` / `.envrc` go through
`hooks/lib/env-resolver.cjs`, which reads key-value pairs without `eval` or `source`. The one
place that does source an `.envrc` (`scripts/envrc-guarded-source.sh`) gates it behind a sha256
the user approved by hand — cloning a hostile repo must not execute its `.envrc`.

**Tests get an isolated filesystem and an explicit environment.** The suite often runs inside a
Claude Code session that has the plugin's own variables exported, so a test that relies on a
variable being *absent* must set `ARCHON_ENV_COMPAT_OFF=true` rather than deleting names one by
one — see the note in `__tests__/hooks/post-compact-plan-context.test.cjs`.

**Counts are generated.** Component numbers in docs come from `scripts/sync-version.sh`. Don't
hand-edit them; run it.

**Reference integrity is gated.** `bash scripts/audit/audit-refs.sh` catches dead links, dead
file references, and orphan rules. Run it before you push.

---

## Before you push

```bash
npm install
npm test                           # 100 suites · 1800+ tests
npm run lint
bash scripts/audit/audit-refs.sh   # dead links, orphan rules
```

The coverage gate is a **no-regression floor**, not a target — it sits just under the measured
level so a drop fails CI while normal jitter does not. If you raise coverage, raise the floor in
`jest.config.cjs` and say so in the PR.

---

## Decision records

Choices with consequences get written down rather than argued twice.

- [ADR-001 — Graph backend for L3/L4 conflict detection](../adr/ADR-001-graph-backend-for-l3-l4-conflict-detection.md)
- [ADR-002 — Flat three-role dispatch](../adr/ADR-002-flat-three-role-dispatch.md)
- [ADR-003 — Session memory: read the transcript](../adr/ADR-003-session-memory-read-the-transcript.md)

Known gaps and open debt, named rather than hidden:
[reference/MATURITY.md](../reference/MATURITY.md) · [ROADMAP.md](../ROADMAP.md)
