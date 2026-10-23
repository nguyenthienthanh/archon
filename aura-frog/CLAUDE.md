# Aura Frog OS — Plugin for Claude Code

**System:** Aura Frog v3.8.0-alpha.21 | **Format:** [TOON](https://github.com/toon-format/toon)
**Purpose:** Planning-first LLM OS. Agents + skills + commands + 5-phase TDD + hierarchical planning (T0-T4) + memory tier + pre-flight + L1/L2 conflicts + freeze cascade + self-healing safety gates + MCP security tier + MCP servers. Component counts: see **Resources** below (single source).

---

## 🐸 The 8 Pillars (v3.8.0-alpha.10)

Eight composable features compose into one planning-first LLM OS. Each pillar is independently disable-able via env var. Full marketing: `README.md § The 8 Pillars`. Engineering depth: `docs/reference/BENEFITS.md` Part 9.

```toon
pillars[8]{n,name,theme,status,disable_env}:
  1,Hierarchical Planning,Structure,shipped,—
  2,Reasoning Trace Audit,Accountability,shipped,AF_TRACE_DISABLED
  3,Semantic Session Reset,Memory,shipped,—
  4,Pre-flight Validation,Accountability,"shipped (Tier 1); Tier 2 OPA v3.7.2+",AF_PREFLIGHT_DISABLED
  5,Semantic Conflict Detection,Resilience,"shipped (L1+L2); L3+L4 LLM v3.7.2+",AF_CONFLICT_LLM_DISABLED
  6,Self-Healing Orchestrator,Resilience,"shipped (manual); auto-trigger v3.7.2+",AF_SELF_HEAL_DISABLED
  7,MCP Security Layer,Security,shipped,AF_MCP_AUDIT_DISABLED (audit only)
  8,Phase-Role Binding,Structure,shipped,—
```

---

## OS Mental Model

Claude is the **kernel** — orchestrates, dispatches, verifies. Does not execute everything directly.

```toon
os_map[5]{concept,implementation}:
  Kernel,Claude + orchestrator rules
  Processes,15 agents (PID + state + budget)
  RAM,Context window (managed segments)
  Scheduler,5-phase TDD workflow
  Drivers,6 MCP servers (auto-invoked; all enabled)
```

---

## Boot Sequence

```toon
boot[5]{step,action,cost}:
  1,Check & load .envrc,~0
  2,Load KERNEL rule index (core_paths — bodies on demand),~300
  3,Detect agent + model,~200
  4,Load project context (on demand),~500-2000
  5,Verify MCP servers,~100
```

CRITICAL: Check env FIRST. If missing → `/project env`.

---

## Golden Rules

```toon
rules[8]{rule,detail}:
  Never assume,"Ask when in doubt — see rules/core/no-assumption.md"
  Lazy load,"KERNEL on start — everything else on demand"
  One agent at a time,"Save state before switching"
  TOON for data,"Run state + handoffs + MCP responses"
  Compact proactively,"MicroCompact every 10 turns — AutoCompact at 80%"
  TDD mandatory,"RED → GREEN → REFACTOR"
  Memory as hint,"Verify against actual files before acting"
  Write after verify,"No state updates until confirmed successful"
```

---

## Status Line (0 tokens)

Owned end-to-end by `scripts/statusline.sh` — multi-line, 0 conversation tokens. **Do NOT render banners in conversation.** Full rendering spec (lines, env toggles `AF_STATUSLINE_USAGE`/`AF_STATUSLINE_COST`, shim): `docs/reference/STATUSLINE.md`. Setup: `/project sync`

---

## MCP Servers

```toon
mcp[6]{name,purpose,requires}:
  context7,Library docs,None
  playwright,Browser automation + E2E (headless+isolated; browser is lazy — close it when done),None
  vitest,Test execution + coverage,None
  firebase,Firebase management,firebase login
  figma,Design files,FIGMA_API_TOKEN
  slack,Notifications,SLACK_BOT_TOKEN
```

Auto-invoked by context. Config: `.mcp.json`

**Every entry in `.mcp.json` starts — there is no opt-in tier.** Claude Code ignores `"disabled": true` (measured: `chrome-devtools` was marked disabled and still ran 6 processes incl. a real Chrome), so a server is kept off by being **absent**, not flagged. postgres / redis / chrome-devtools / codebase-memory / stitch are therefore unbundled; copy-pasteable snippets to add one to a project's own `.mcp.json`: `docs/operations/MCP_GUIDE.md § Optional Servers`.

**Browser hygiene:** the playwright Chrome launches lazily (first `browser_*` call) and does **not** close itself — always `browser_close` when a browser task finishes. The `playwright-reaper` SessionStart hook is the backstop: it kills only *orphaned* playwright processes (a headless Chrome whose MCP server died → `ppid 1`, running for days), never a live session's browser or your normal Chrome. Disable with `AF_PLAYWRIGHT_REAPER_DISABLED=true`.

---

## Process Table

```toon
agents[15]{pid,name,domain,budget}:
  01,lead,Workflow coordination,3K
  02,architect,System design + DB + backend,4K
  03,frontend,React/Vue/Angular/Next.js,4K
  04,mobile,React Native/Flutter/Expo,4K
  05,strategist,ROI + MVP + scope creep + T0/T1,3K
  06,security,OWASP + vulnerability + SAST,3K
  07,tester,Jest/Cypress/Playwright + coverage,4K
  08,devops,Docker/K8s/CI-CD,3K
  09,scanner,Project detection + context,2K
  10,master-planner,Plan tree owner + decisions,3K
  11,feature-architect,T2 → T3 decomposition,3K
  12,story-planner,T3 → T4 decomposition,3K
  13,replanner,F2-F4 mutation proposals,3K
  14,epic-summarizer,T2 done → permanent_memory distillation,3K
  15,conflict-arbiter,Adjudicates L1-L4 conflicts (auto/manual decisions),3K
```

Agent selection handled by `skills/agent-detector/SKILL.md` (haiku, priority highest, auto-invoke every message).

---

## Auto-Invoke Skills

Skills with `autoInvoke: true` in frontmatter are *eligible* to fire without an
explicit invocation — they are matched against each message and load when their
trigger applies, which is not the same as loading on every message. The trigger
column below is the real gate: `agent-detector` is the only one that genuinely
runs every turn; the rest wait for the intent or the file they name.

⚠️ **Skills vs agents — different tools.** Everything in this section is a **skill** (file: `aura-frog/skills/<name>/SKILL.md`), invoke via the **Skill tool**. Do NOT call these names via the Agent tool's `subagent_type` — that errors with "Agent type 'aura-frog:<name>' not found". The 15 agents live in `aura-frog/agents/*.md` and are listed in the Process Table above.

```toon
skills[9]{name,trigger}:
  agent-detector,Every message (priority highest, haiku)
  bugfix-quick,Bug fix request
  test-writer,Test request
  code-reviewer,Code review
  code-simplifier,Simplify/KISS
  plan-loader,.claude/plans/ exists (auto)
  reasoning-trace-recorder,active.task set during T4 execution (auto)
  extension-detector,Repeated patterns or 'we should have a skill for X' signals (auto)
  permanent-memory-loader,.claude/memory/permanent_memory.md exists (auto)
```

**`run-orchestrator` is NOT auto-invoke** — it fires on `/run` command or intent-detected via description match (complex feature, multi-file work, `fasttrack:` prefix). Listed separately to avoid confusion. **Also a skill, not an agent.**

33 reference skills loaded on-demand. Full list: `skills/README.md`

---

## Orchestrator Principles

```toon
principles[5]{principle}:
  Orchestrate not execute — dispatch to right agent
  Review agent output before advancing phases
  Specify exactly — no vague delegation
  One agent RUNNING — save state before switching
  Verify then write — no updates until confirmed
```

---

## 5-Phase Workflow

```toon
phases[5]{phase,name,gate,budget}:
  1,Understand + Design,APPROVAL,3500
  2,Test RED,Auto,1500
  3,Build GREEN,APPROVAL,4000
  4,Refactor + Review,Auto,1500
  5,Finalize,Auto,800
```

2 gates only (P1 & P3). Target: ≤30K tokens.

## Complexity Routing

```toon
routing[3]{level,approach}:
  Quick,Direct edit — no run
  Standard,plan mode → /run
  Deep,Full 5-phase + collaborative planning
```

---

## Context Management

```toon
segments[4]{segment,budget}:
  KERNEL + INDEX,~3K (never evict)
  STACK (agent),4K (evict on switch)
  HEAP (project),8K (LRU compact)
  BUFFER (tools),4K (evict after use)
```

Compression: MicroCompact (10 turns / >60%) → AutoCompact (>80% /compact) → ManualCompact (handoff).
Details: `rules/core/context-management.md`

## Rule Loading

```toon
tiers[3]{tier,count,when}:
  Core (rules/core/),22,Path index every session — bodies on demand
  Agent (rules/agent/),20,Per-agent type
  Workflow (rules/workflow/),30,Per-phase
```

**Core rule paths (read on-demand when the topic comes up):**

```toon
core_paths[22]{topic,path}:
  TDD discipline,rules/core/tdd-workflow.md
  Approval gates,rules/core/approval-gates.md
  Execution rules,rules/core/execution-rules.md
  No assumption,rules/core/no-assumption.md
  Prompt validation (6-dim),rules/core/prompt-validation.md
  Contextual separation (injection defense),rules/core/contextual-separation.md
  Recursion limit,rules/core/recursion-limit.md
  Observer role,rules/core/observer-agent.md
  Memory trust,rules/core/memory-trust-policy.md
  Plan trust (hierarchical planning),rules/core/plan-trust-policy.md
  Grounding discipline (anti-hallucination),rules/core/grounding-discipline.md
  Context mgmt,rules/core/context-management.md
  Context economy (anti-overload),rules/core/context-economy.md
  Agent namespacing (Agent tool calls),rules/core/agent-namespacing.md
  Prompt caching,rules/core/prompt-caching.md
  Small-to-large routing,rules/core/small-to-large-routing.md
  Code quality,rules/core/code-quality.md
  Naming,rules/core/naming-conventions.md
  Simplicity,rules/core/simplicity-over-complexity.md
  Verification,rules/core/verification.md
  Env loading,rules/core/env-loading.md
  Library choice,rules/core/prefer-established-libraries.md
```

**Agent & workflow rules:** listed in each agent's "Related Rules" section and in `run-orchestrator` SKILL.md per-phase index. Model loads them when the agent/phase activates.

---

## Commands

```toon
commands[13]{cmd,subs}:
  /run,"<task> (auto-detect intent) + context-aware: approve/reject/modify/handoff/status/progress/rollback/stop"
  /check,"(all)/review/security/perf/complexity/debt/coverage/deps"
  /design,"api/db/doc"
  /project,"init/detect/status/list/switch/refresh/regen/env/sync"
  /af,"status/agents/metrics/learn/setup/update/mcp/prompts/skill"
  /help,"<topic> — plugin overview, per-command help, agent routing guide, hook reference"
  /aura-frog:plan,"plan/expand/next/replan/promote/archive/status/undo + /aura-frog:trace (forensic reproducibility) + freeze/thaw/conflicts (L1-L4 + arbiter)"
  /aura-frog:heal,"diagnose/status/disable/enable/accept/decline — self-healing F2/F3 with confidence ≥0.7 + user approval"
  /aura-frog:mcp,"status/audit/reset-limits/test — per-agent allowlist + rate limits + sanitized audit log"
  /aura-frog:dashboard,"static / --live / --json / --section — CLI status backed by scripts/dashboard.sh"
  /aura-frog:extend,"propose/create/list/remove — project-level skill/rule/command authoring (NEVER plugin-level)"
  /aura-frog:reset-session,"distill active Epic via epic-summarizer → permanent_memory.md → optional reset"
  /aura-frog:preflight,"check/policies/bypass/status — Tier 1 bash linters (path safety, command allowlist, secret patterns, frontmatter)"
```

---

## Agent Teams (Experimental)

Gate: Deep + 2+ domains → team. Otherwise → subagent.
Guide: `docs/guides/AGENT_TEAMS_GUIDE.md` (repo root, not shipped with plugin)

## Learning System

`/af learn status` | `/af learn feedback` | `/af learn analyze` | `/af learn apply`

---

## Resources

```toon
resources[8]{name,location}:
  Agents (15),agents/
  Commands (24),commands/
  Rules (72),rules/{core|agent|workflow}/
  Skills (43),skills/
  Hooks (52),hooks/
  MCP (6),.mcp.json (all enabled; postgres/redis/chrome-devtools/codebase-memory/stitch unbundled — see docs/operations/MCP_GUIDE.md)
  AI References,docs/
  Human Docs,docs/README.md (repo root)
```

---

**Version:** 3.8.0-alpha.21
