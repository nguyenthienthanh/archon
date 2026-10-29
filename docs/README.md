---
last_aligned_with: v3.7.3
status: current
audience: active-user
---

# Archon OS Documentation

Central index for all human-readable documentation. AI-consumed docs live in `archon-os/`.

> **Latest — v3.7.3** (2026-05-12): Plans now live at `.claude/plans/` (legacy `.aura/plans/` still works via fallback until v4.0), `{ID}_{kebab-slug}/` folder schema across all tiers, bidirectional run↔feature linking, statusline shows `mode {step} agent` (cost segment removed), Phase 2 picks unit/integration/e2e BEFORE writing (no more silent e2e skip on UI/auth/payment tasks), TTY-hang fixed in 14 hooks, Node 20/22 back in CI. See [CHANGELOG](reference/CHANGELOG.md#373---2026-05-12).
>
> **Core architecture:** [The 8 Pillars](../README.md#-the-8-pillars-of-the-planning-first-llm-os) — Hierarchical Planning · Reasoning Trace Audit · Semantic Session Reset · Pre-flight Validation · Semantic Conflict Detection · Self-Healing Orchestrator · MCP Security Layer · Phase-Role Binding. Each pillar is opt-in (a single env var disables it). Full marketing breakdown in the project README; engineering depth in [BENEFITS.md Part 9](reference/BENEFITS.md#part-9--the-8-pillars-of-the-planning-first-llm-os-v370).

---

## Source of Truth

When information lives in multiple places, **`docs/` wins**. Plugin internals (`archon-os/skills/`, `archon-os/rules/`, `archon-os/CLAUDE.md`) are AI-consumed references — optimised for Claude's execution-time loading, not for human onboarding. Every skill and rule file now carries an **AI-consumed reference** banner header pointing back at this tree.

If you find drift between `docs/` and `archon-os/`: file an issue tagged `doc-drift`. Maintainer resolves by aligning `archon-os/` to `docs/` — never the other way around.

**Key canonical sources:**

| Topic | Canonical doc |
|---|---|
| 5-phase TDD workflow | [architecture/HIERARCHICAL_PLANNING.md § 5 Stage 4](architecture/HIERARCHICAL_PLANNING.md) |
| OS mental model | [architecture/os-architecture.md](architecture/os-architecture.md) |
| 8 Pillars | [reference/BENEFITS.md Part 9](reference/BENEFITS.md#part-9--the-8-pillars-of-the-planning-first-llm-os-v370) |
| Agent selection | [guides/AGENT_SELECTION_GUIDE.md](guides/AGENT_SELECTION_GUIDE.md) |
| MCP setup | [operations/MCP_GUIDE.md](operations/MCP_GUIDE.md) |
| Learning system | [operations/LEARNING_SYSTEM.md](operations/LEARNING_SYSTEM.md) |
| Security + trust model | [operations/SECURITY_AND_TRUST.md](operations/SECURITY_AND_TRUST.md) |
| Installation supplements | [operations/INSTALLATION.md](operations/INSTALLATION.md) |

---

## Getting Started

> **Start here:** [getting-started/README.md](getting-started/README.md) is the single entry index — read in order: QUICKSTART → GET_STARTED → FIRST_WORKFLOW_TUTORIAL.

- [Getting Started Index](getting-started/README.md) — Read these in order (3 docs · 28 min total)
- [Walkthrough](getting-started/WALKTHROUGH.md) — Sample transcript of a real run (JWT auth, ~95K tokens)
- [Agent Selection Examples](getting-started/AGENT_SELECTION.md) — 10 worked examples with scoring math
- [Token Budget](getting-started/TOKEN_BUDGET.md) — Cost per workflow flavour (Quick/Standard/Deep)

---

## Architecture

- [OS Architecture](architecture/os-architecture.md) — LLM OS mental model (kernel, processes, RAM, drivers). Canonical architecture overview.
- [Hierarchical Planning — Runtime Deep Dive](architecture/HIERARCHICAL_PLANNING.md) — agent invocations, memory tiers, anti-hallucination mechanics, failure handling (v3.7.3+)
- [CLAUDE.md Architecture](architecture/CLAUDE_FILE_ARCHITECTURE.md) — How plugin and project instructions load
- [Config Loading Order](architecture/CONFIG_LOADING_ORDER.md) — Priority chain for configuration files
- [Multi-Session Architecture](architecture/MULTI_SESSION_ARCHITECTURE.md) — Parallel sessions and state management
- [Workflow State Management](architecture/WORKFLOW_STATE_MANAGEMENT.md) — State persistence and handoff
- [Workflow Diagrams](architecture/WORKFLOW_DIAGRAMS.md) — Visual 5-phase workflow reference

---

## Guides

- [Agent Selection Guide](guides/AGENT_SELECTION_GUIDE.md) — How agents are auto-selected per task
- [Agent Teams Guide](guides/AGENT_TEAMS_GUIDE.md) — Multi-agent orchestration with Claude Agent Teams
- [Team Workflow Bridge](guides/TEAM_WORKFLOW_BRIDGE.md) — Cross-team coordination and workflow integration
- [Design System Guide](guides/DESIGN_SYSTEM_GUIDE.md) — UI library selection (MUI, Tailwind, shadcn/ui)
- [Styling Detection Guide](guides/STYLING_DETECTION_GUIDE.md) — CSS framework auto-detection logic
- [TOON Format Guide](guides/TOON_FORMAT_GUIDE.md) — Token-Optimized Object Notation specification
- [Confluence Operations](guides/CONFLUENCE_OPERATIONS.md) — Confluence integration usage
- [Image Analysis](guides/IMAGE_ANALYSIS.md) — Visual analysis with Figma and screenshots

---

## Operations

- [MCP Guide](operations/MCP_GUIDE.md) — 6 bundled MCP servers, opt-in snippets, and creating your own
- [Troubleshooting](operations/TROUBLESHOOTING.md) — Common issues and fixes
- [Security & Trust](operations/SECURITY_AND_TRUST.md) — Security model and trust policies
- [Learning System](operations/LEARNING_SYSTEM.md) — Self-improving patterns (local + Supabase)
- [Project Cache](operations/PROJECT_CACHE.md) — Caching strategy and performance
- [Feedback](operations/FEEDBACK.md) — Share your experience

---

## Reference

- [Changelog](reference/CHANGELOG.md) — Full release history
- [Testing Guide](reference/TESTING_GUIDE.md) — Plugin QA and validation procedures
- [ADR-001: Graph backend for L3/L4 conflict detection](adr/ADR-001-graph-backend-for-l3-l4-conflict-detection.md) — spike/decision

---

## Showcase

- [Example Workflows](showcase/README.md) — Sample workflow outputs (JWT auth, bugfix)

---

## Plugin Internals (AI-consumed)

These live in `archon-os/` and are optimized for Claude to read:

- [Agents](../archon-os/agents/README.md) — 15 agents with capabilities
- [Skills](../archon-os/skills/README.md) — 60 skills (9 auto-invoke + 51 on-demand)
- [Commands](../archon-os/commands/README.md) — 24 commands (core `/run`, `/check`, `/design`, `/project`, `/af`, `/help` + `/archon-os:*` hierarchical-planning suite)
- [Rules](../archon-os/rules/README.md) — 72 rules (3-tier loading: 22 core / 20 agent / 30 workflow)
- [Hooks](../archon-os/hooks/README.md) — 51 lifecycle hooks
- [Templates](../archon-os/templates/README.md) — 20 document templates (incl. phase deliverable skeletons)
- [Scripts](../archon-os/scripts/README.md) — Utility scripts
