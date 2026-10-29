# Archon OS — Planning-First AI Engineering Operating System

**System:** Archon OS v4.0.0-alpha.1 | **Format:** [TOON](https://github.com/toon-format/toon)
**Philosophy:** Claude is the **Kernel** — orchestrates, verifies, and schedules. 15 specialized agent processes, 5-phase TDD scheduler, TOON-compressed state, multi-session memory, and deterministic safety gates.

---

## 🏛️ The 8 Pillars & OS Mental Model

```toon
os_map[5]{concept,implementation}:
  Kernel,Claude + orchestrator rules
  Processes,15 agents (PID + state + token budget in agents/)
  RAM,Context window (3-tier: KERNEL 3K, STACK 4K, HEAP 8K)
  Scheduler,5-phase TDD workflow (RED → GREEN → REFACTOR)
  Drivers,6 MCP servers (context7, playwright, vitest, firebase, figma, slack)
```

```toon
pillars[8]{n,name,theme,status,disable_env}:
  1,Hierarchical Planning,Structure,shipped,—
  2,Reasoning Trace Audit,Accountability,shipped,ARCHON_TRACE_DISABLED
  3,Semantic Session Reset,Memory,shipped,—
  4,Pre-flight Validation,Security,shipped,ARCHON_PREFLIGHT_DISABLED
  5,Conflict Detection,Resilience,shipped,ARCHON_CONFLICT_LLM_DISABLED
  6,Self-Healing Gate,Resilience,shipped,ARCHON_SELF_HEAL_DISABLED
  7,MCP Security Layer,Security,shipped,ARCHON_MCP_AUDIT_DISABLED
  8,Phase-Role Binding,Structure,shipped,—
```

---

## ⚡ Golden Rules (Zero Assumption & Strict Discipline)

```toon
rules[8]{rule,detail}:
  Never assume,"Ask when in doubt — probe constraints before implementing (rules/core/no-assumption.md)"
  TDD mandatory,"RED (failing test) → GREEN (minimal fix) → REFACTOR (rules/core/tdd-workflow.md)"
  Lazy load,"AGENTS.md on start — all domain rules and skills loaded strictly on demand"
  Passive 12-factor env,"Cascade: process.env → .env.local → .env → .envrc (never eval/source shell files)"
  One agent at a time,"Save state before switching agent processes"
  TOON for data,"Run state + handoffs + MCP responses use Token-Optimized Object Notation"
  Prompt cache first,"Static instructions at top; never inject dynamic timestamps into system headers"
  Write after verify,"Zero state or code updates until verified against actual files"
```

---

## 🔄 5-Phase TDD Workflow & Complexity Routing

```toon
phases[5]{phase,name,gate,token_budget}:
  1,Understand + Design (Socratic Discovery),APPROVAL,3500
  2,Test RED (Executable Contract),Auto,1500
  3,Build GREEN (Sprint Contract),APPROVAL,4000
  4,Refactor + Review (Builder != Reviewer),Auto,1500
  5,Finalize (State & Plan Sync),Auto,800
```

```toon
routing[3]{level,approach,criteria}:
  Quick,Direct edit (no run),Single-file typo / rename / doc fix
  Standard,Inline single-agent run,1-3 files with clear root cause
  Deep,Full 5-phase TDD + Socratic discovery,Multi-file / architectural / schema / security
```

---

## 🤖 Process Table (15 Specialized Agents)

*Selection handled by `skills/agent-detector/SKILL.md` (priority highest, Haiku/Flash).*

**Dispatch is flat: three roles, no departments** (`rules/workflow/three-role-dispatch.md`, 2026-10-29).

```toon
dispatch_roles[3]{role,job,hard_constraint}:
  specialist,"Owns one job end to end, independently","May not hand its own job to a peer and then bless the result"
  observer,"Watches: progress, stalls, scope drift, budget","Does not do the work and does not grade it"
  verifier,"Grades the result + confidence score","Not the producer, not the producer's context, no debate"
```

`orchestrator → specialist → verifier`, observer attached rather than interposed.
A fourth layer requires a recorded context reason — an org chart is not one.
**`lead` coordinates and observes; the final verdict belongs to the independent
verifier**, because an agent asked to grade its own output agrees with itself.

```toon
agents[15]{pid,name,domain,tools}:
  01,lead,Workflow coordination & loop watchdog,Read Grep Glob Edit Write Bash Skill
  02,architect,System design + DB + backend architecture,Read Grep Glob Edit Write Bash Skill
  03,frontend,React / Vue / Angular / Next.js / Tailwind,Read Grep Glob Edit Write Bash Skill
  04,mobile,React Native / Flutter / Expo,Read Grep Glob Edit Write Bash Skill
  05,strategist,ROI + MVP + scope challenge + T0/T1,Read Grep Glob Skill (Read-only)
  06,security,OWASP 2025 + SAST + credential leak audits,Read Grep Glob Skill (Read-only)
  07,tester,Jest / Vitest / Playwright / TDD enforcement,Read Grep Glob Edit Write Bash Skill
  08,devops,Docker / K8s / GitHub Actions CI-CD,Read Grep Glob Edit Write Bash Skill
  09,scanner,Project detection & stack context,Read Grep Glob Bash Skill (Haiku)
  10,master-planner,Plan tree controller (.claude/plans/),Read Write Edit Glob Grep Bash Skill
  11,feature-architect,T2 Feature → T3 Story decomposition,Read Glob Grep Bash Skill
  12,story-planner,T3 Story → T4 Task DAG generation,Read Glob Grep Bash Skill
  13,replanner,F2-F4 failure mutation proposals,Read Glob Grep Edit Write Skill
  14,epic-summarizer,T2 done → permanent memory distillation,Read Write Glob Grep Bash Skill
  15,conflict-arbiter,L1-L4 parallel task conflict adjudication,Read Glob Grep Edit Write Skill
```

---

## 🎯 Commands Reference

```toon
commands[13]{cmd,purpose}:
  /run,"Universal execution entrypoint: <task> with auto-detected intent (5-phase TDD)"
  /check,"Code quality, security SAST, performance profiling, coverage audit"
  /design,"API endpoints, database schema, tech spec, architecture documentation"
  /project,"Detect stack, refresh context snapshots, env inspection, settings sync"
  /archon,"System status, agent roster, prompt metrics, learning loop (/af alias supported)"
  /help,"Interactive plugin documentation and routing guide"
  /archon:plan,"Hierarchical planning engine: plan/expand/next/replan/promote/archive/status/undo"
  /archon:heal,"Self-healing diagnostic: propose safe patches for F2/F3 failures"
  /archon:mcp,"MCP rate limit monitoring, per-agent access control, sanitized audit"
  /archon:dashboard,"Terminal dashboard for active runs, plans, and metrics"
  /archon:extend,"Project-level extension authoring (skills/rules/commands in .claude/)"
  /archon:reset-session,"Distill active epic into permanent memory and prepare fresh session"
  /archon:preflight,"Tier 1 bash safety linters (path safety, secret patterns, command allowlist)"
```

---

## 📚 Core Rule Paths (Indexed — Loaded Strictly on Demand)

```toon
core_paths[12]{topic,path}:
  TDD discipline,rules/core/tdd-workflow.md
  Approval gates,rules/core/approval-gates.md
  Execution rules,rules/core/execution-rules.md
  No assumption,rules/core/no-assumption.md
  Context economy,rules/core/context-economy.md
  Prompt caching,rules/core/prompt-caching.md
  Model quota routing,rules/core/small-to-large-routing.md
  Code quality,rules/core/code-quality.md
  Simplicity (YAGNI/KISS),rules/core/simplicity-over-complexity.md
  Verification rule,rules/core/verification.md
  Passive env loading,rules/core/env-loading.md
  Plan trust policy,rules/core/plan-trust-policy.md
```

*Agent & Workflow rules: loaded per active agent (in `rules/agent/`) and phase (in `rules/workflow/`).*

---

## 📦 Resources (Single Source of Component Counts)

```toon
resources[8]{name,location}:
  Agents (15),agents/
  Commands (24),commands/
  Rules (72),rules/{core|agent|workflow}/
  Skills (43),skills/
  Hooks (53),hooks/
  MCP (6),.mcp.json
  AI References,docs/
  Human Docs,docs/README.md
```

---

**Version:** 4.0.0-alpha.1 | **Single Source of Truth:** `aura-frog/AGENTS.md`
