---
last_aligned_with: v4.0.0-alpha.3
status: current
audience: active-user
---

# What ships in the box

Component counts and the architecture they sit in. These numbers are generated from the
tree, not hand-maintained — `scripts/sync-version.sh` is what keeps them honest.

---

| Component | Count | Why it matters |
|-----------|:-----:|----------------|
| **Agents** | 15 | Right expert auto-selected per task (build + review + planning + safety roles) |
| **Skills** | 45 | 10 auto-invoke on context, 33 on-demand (incl. `design-vision-loop`) |
| **Commands** | 24 | Core: `/run`, `/check`, `/design`, `/project`, `/archon`, `/help` + `/archon-os:*` hierarchical-planning suite (14 user-facing + 10 legacy `/archon-os:plan-<verb>` alias stubs) |
| **Rules** | 73 | 3-tier loading (22 core + 20 agent + 30 workflow) — only what's needed |
| **Hooks** | 53 | Conditional — skip processing for non-code files (v3.7.2 adds `bare-word-router.cjs`) |
| **Backing scripts** | 12 | Hierarchical-planning operations (v3.7.2): `new-plan`, `validate-plan-tree`, `render-plan-tree` + 9 new (`expand`, `next`, `freeze`, `thaw`, `archive`, `conflicts`, `replan`, `promote`, `undo`) + `resolve-node` + `_lib` |
| **MCP Servers** | 6 | All enabled — every `.mcp.json` entry starts, so opt-in servers are unbundled ([snippets](../operations/MCP_GUIDE.md#optional-servers-not-bundled)) |
| **Tests** | 317 | Coverage gate at 25% statements floor; +102 tests in v3.7.2 (38 plan scripts + 64 bare-word router) |

Full workflow target: **≤30K tokens** across all 5 phases.

---

## Architecture — the LLM OS layout

```
Claude = Kernel          Context Window = RAM           Project Files = Disk
Agents = Processes       5-Phase TDD = Scheduler        MCP = Device Drivers
TOON = Compression       Approval Gates = Interrupts    Handoffs = IPC

archon-os/
├── agents/         15 processes (auto-dispatched per task)
├── skills/         43 skills (10 auto-invoke + 33 on-demand)
├── commands/       24 commands (core /run /check /design /project /archon /help + /archon-os:* hierarchical-planning suite)
├── rules/          72 rules (22 core + 20 agent + 30 workflow)
├── hooks/          50 lifecycle hooks (conditional execution)
├── scripts/        utility scripts (CI, plans, preflight, workflow, security, …)
├── docs/           AI reference docs (phases, TOON refs)
└── .mcp.json       6 device drivers (all enabled)
```
