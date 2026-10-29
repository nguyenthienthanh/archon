---
last_aligned_with: v4.0.0-alpha.3
status: current
audience: active-user
---

# Archon OS Documentation

Everything human-readable lives here. The files under `archon-os/` are written for Claude to
load at execution time — accurate, but not where you want to start.

**New here?** [Getting started](getting-started/README.md) → three docs, about 28 minutes.
**Upgrading from Aura Frog (v3)?** [MIGRATION_V4.md](operations/MIGRATION_V4.md).
**Want to hack on it?** [Contributor docs](contributing/README.md).

---

## Pick your path

| I want to… | Go |
|---|---|
| Install it and run something | [getting-started/QUICKSTART.md](getting-started/QUICKSTART.md) |
| Set it up properly | [getting-started/GET_STARTED.md](getting-started/GET_STARTED.md) |
| Follow a hands-on tutorial | [getting-started/FIRST_WORKFLOW_TUTORIAL.md](getting-started/FIRST_WORKFLOW_TUTORIAL.md) |
| Read a real run instead of doing one | [getting-started/WALKTHROUGH.md](getting-started/WALKTHROUGH.md) |
| Know what it will cost in tokens | [getting-started/TOKEN_BUDGET.md](getting-started/TOKEN_BUDGET.md) |
| Understand the eight core features | [reference/PILLARS.md](reference/PILLARS.md) |
| Decide whether to adopt it | [reference/MATURITY.md](reference/MATURITY.md) · [reference/COMPARISON.md](reference/COMPARISON.md) |
| Fix something that broke | [operations/TROUBLESHOOTING.md](operations/TROUBLESHOOTING.md) |
| Upgrade from v3 | [operations/MIGRATION_V4.md](operations/MIGRATION_V4.md) |
| Contribute code | [contributing/README.md](contributing/README.md) |

---

## Getting started

Read in order; each one assumes the last.

- [Index](getting-started/README.md) — the reading order, with time estimates
- [Quickstart](getting-started/QUICKSTART.md) — install and first command
- [Get started](getting-started/GET_STARTED.md) — proper setup, project init, optional extras
- [First workflow tutorial](getting-started/FIRST_WORKFLOW_TUTORIAL.md) — a feature, start to finish
- [Walkthrough](getting-started/WALKTHROUGH.md) — transcript of a real run (JWT auth, ~95K tokens)
- [Agent selection examples](getting-started/AGENT_SELECTION.md) — 10 worked examples with the scoring
- [Token budget](getting-started/TOKEN_BUDGET.md) — cost per strategy, measured

---

## Understanding it

- [The 8 Pillars](reference/PILLARS.md) — the eight features, what each prevents, how to switch it off
- [Routing](reference/ROUTING.md) — how Quick / Standard / Deep is chosen, and the full prompt-to-code flow
- [Benefits](reference/BENEFITS.md) — the engineering reasoning behind each pillar
- [Why teams ship faster](marketing/WHY_TEAMS_SHIP_FASTER.md) — the case, with examples
- [What ships in the box](reference/COMPONENTS.md) — component counts and directory layout
- [Honest maturity report](reference/MATURITY.md) — what works, what doesn't, what we got wrong
- [Compared to other plugins](reference/COMPARISON.md) — different optimisation targets, not competitors

---

## Architecture

- [OS architecture](architecture/os-architecture.md) — kernel, processes, RAM, drivers. The canonical overview.
- [Hierarchical planning — runtime deep dive](architecture/HIERARCHICAL_PLANNING.md) — agent invocations, memory tiers, anti-hallucination, failure handling
- [CLAUDE.md architecture](architecture/CLAUDE_FILE_ARCHITECTURE.md) — how plugin, project and user instructions load
- [Config loading order](architecture/CONFIG_LOADING_ORDER.md) — the precedence chain
- [Multi-session architecture](architecture/MULTI_SESSION_ARCHITECTURE.md) — parallel sessions and state
- [Workflow state management](architecture/WORKFLOW_STATE_MANAGEMENT.md) — persistence and handoff
- [Workflow diagrams](architecture/WORKFLOW_DIAGRAMS.md) — the 5 phases, visually
- [Design intelligence (LLD)](architecture/LLD-DESIGN-INTELLIGENCE.md) — low-level design of the design subsystem

---

## Guides

- [Agent selection](guides/AGENT_SELECTION_GUIDE.md) — how an agent is picked per task
- [Agent teams](guides/AGENT_TEAMS_GUIDE.md) — parallel agents with cross-review
- [Team workflow bridge](guides/TEAM_WORKFLOW_BRIDGE.md) — cross-team coordination
- [Design system](guides/DESIGN_SYSTEM_GUIDE.md) — MUI, Tailwind, shadcn/ui selection
- [Styling detection](guides/STYLING_DETECTION_GUIDE.md) — CSS framework auto-detection
- [TOON format](guides/TOON_FORMAT_GUIDE.md) — Token-Optimized Object Notation
- [Confluence operations](guides/CONFLUENCE_OPERATIONS.md) — Confluence integration
- [Image analysis](guides/IMAGE_ANALYSIS.md) — Figma and screenshot input
- [Eval setup](guides/EVAL_SETUP.md) — behavioural evaluation harness

---

## Operations

- [Installation supplements](operations/INSTALLATION.md) — CLI symlink, env vars, per-token notes
- [Migrating to v4](operations/MIGRATION_V4.md) — the Aura Frog → Archon OS rename, and what still works
- [Troubleshooting + FAQ](operations/TROUBLESHOOTING.md) — symptom-first fixes
- [MCP guide](operations/MCP_GUIDE.md) — the 6 bundled servers, opt-in snippets, writing your own
- [Security & trust](operations/SECURITY_AND_TRUST.md) — threat model and trust boundaries
- [Learning system](operations/LEARNING_SYSTEM.md) — self-improving patterns (local + Supabase)
- [Project cache](operations/PROJECT_CACHE.md) — invalidation strategy and performance
- [Feedback](operations/FEEDBACK.md) — tell us what broke

---

## Contributing

- [Contributor docs](contributing/README.md) — subsystems, conventions, what gets a PR sent back
- [CONTRIBUTING.md](../CONTRIBUTING.md) — the process: fork, branch, test, PR, release
- [Testing guide](reference/TESTING_GUIDE.md) — running and extending the suite
- [Maintenance](reference/MAINTENANCE.md) — maintainer runbook
- [Statusline](reference/STATUSLINE.md) — what each segment means and how to install it

### Decision records

- [ADR-001 — Graph backend for L3/L4 conflict detection](adr/ADR-001-graph-backend-for-l3-l4-conflict-detection.md)
- [ADR-002 — Flat three-role dispatch](adr/ADR-002-flat-three-role-dispatch.md)
- [ADR-003 — Session memory: read the transcript](adr/ADR-003-session-memory-read-the-transcript.md)

---

## Reference

- [Changelog](reference/CHANGELOG.md) — full release history
- [Roadmap](ROADMAP.md) — what's queued and why
- [Portability](PORTABILITY.md) — what moves to other AI coding tools, and what doesn't
- [Architecture v4 proposal](proposals/ARCHITECTURE_V4_PROPOSAL.md) — the thinking behind v4
- [Showcase](showcase/README.md) — sample workflow outputs

---

## Where the truth lives

When two files disagree, **`docs/` wins.** The plugin internals (`archon-os/skills/`,
`archon-os/rules/`, `archon-os/AGENTS.md`) are tuned for Claude's execution-time loading, not
for human onboarding, and every one of them carries a banner pointing back here.

Found drift? File an issue tagged `doc-drift`. It gets resolved by aligning `archon-os/` to
`docs/` — never the reverse.

**Canonical source per topic:**

| Topic | Canonical doc |
|---|---|
| 5-phase TDD workflow | [architecture/HIERARCHICAL_PLANNING.md § 5 Stage 4](architecture/HIERARCHICAL_PLANNING.md) |
| OS mental model | [architecture/os-architecture.md](architecture/os-architecture.md) |
| The 8 Pillars | [reference/PILLARS.md](reference/PILLARS.md) |
| Agent selection | [guides/AGENT_SELECTION_GUIDE.md](guides/AGENT_SELECTION_GUIDE.md) |
| MCP setup | [operations/MCP_GUIDE.md](operations/MCP_GUIDE.md) |
| Learning system | [operations/LEARNING_SYSTEM.md](operations/LEARNING_SYSTEM.md) |
| Security + trust model | [operations/SECURITY_AND_TRUST.md](operations/SECURITY_AND_TRUST.md) |
| Installation supplements | [operations/INSTALLATION.md](operations/INSTALLATION.md) |
| v3 → v4 rename | [operations/MIGRATION_V4.md](operations/MIGRATION_V4.md) |

---

## Plugin internals (written for Claude)

Accurate, but execution-oriented. Use the docs above for onboarding.

- [Agents](../archon-os/agents/README.md) — 15 agents and their tool scopes
- [Skills](../archon-os/skills/README.md) — 45 skills (10 auto-invoke + 35 on-demand)
- [Commands](../archon-os/commands/README.md) — 25 commands
- [Rules](../archon-os/rules/README.md) — 73 rules, 3-tier loading
- [Hooks](../archon-os/hooks/README.md) — 53 lifecycle hooks
- [Templates](../archon-os/templates/README.md) — document templates, incl. phase deliverables
- [Scripts](../archon-os/scripts/README.md) — CI, plans, preflight, workflow, security
