---
last_aligned_with: v3.7.3
status: reference
audience: contributor
---

# Aura Frog Benefits — Why Use This Plugin

**Purpose:** Explain every capability Aura Frog adds on top of base Claude Code — what it is, how it's applied, why you need it, and concrete use cases.

**Format per section:** What · How applied · Why you need it · Use cases.

---

## Part 1 — Workflow Discipline

### 1.1. 5-Phase TDD Workflow with Approval Gates

**What:** Every non-trivial task runs through Understand → Test RED → Build GREEN → Refactor + Review → Finalize. Two human approval gates (Phase 1 and Phase 3) punctuate the flow.

**How applied:** `skills/run-orchestrator/SKILL.md` fires on `/run <task>` and coordinates phase transitions. State is persisted to `.claude/logs/runs/<id>/`.

**Why you need it:** Unstructured LLM coding produces untested code. The 5 phases force tests *before* implementation and put a human in the loop at design and post-build checkpoints.

**Use cases:**
- Building a feature that will ship to production
- Any multi-file change where test coverage matters
- Handover work between sessions (state survives handoff)

---

### 1.2. Immutable Workflow (`rules/workflow/immutable-workflow.md`)

**What:** Once a phase is approved, its deliverables are frozen. Later phases can read but not silently edit.

**How applied:** Orchestrator checks phase status before every Write to `.claude/logs/runs/<id>/phase-N/`. Changes require explicit `/run reopen <N>`.

**Why you need it:** Without immutability, P3 can silently rewrite P1's spec, invalidating the user's approval. Audit trails lie. Cross-review breaks down.

**Use cases:**
- Regulated environments (SOC2, ISO) that require decision audit
- Multi-agent workflows where reviewer trusts the prior phase
- Resume-after-handoff — state is as-approved, not as-drifted

---

### 1.3. Cross-Review Discipline — Reviewer Cap = 2 (`rules/workflow/cross-review-workflow.md`)

**What:** Builder ≠ reviewer. Phase 4 reviewer can NOT be the Phase 3 builder. Max 2 reviewers per phase.

**How applied:** Rule enforces role separation. Phase 4 spawns `security` + `tester` in fork contexts, never the original builder.

**Why you need it:** Self-review has blind spots (confirmation bias). 3+ reviewers create analysis paralysis and design-by-committee. Two cross-functional reviewers is the sweet spot.

**Use cases:**
- Security-sensitive code that a backend dev wrote
- Refactors where the refactorer might miss their own regressions
- Team-mode workflows with parallel review

---

## Part 2 — Reasoning Quality

### 2.1. Self-Consistency (`rules/workflow/self-consistency.md`, `skills/self-consistency/SKILL.md`)

**What:** For ambiguous trade-off decisions, generate N=3 independent reasoning paths, take majority vote. Based on Wang et al. 2022.

**How applied:** Phase 1 design when complexity = Deep AND trade-off exists. Opt-in via `/run reason: sc <task>`.

**Why you need it:** Single-path reasoning locks onto the first plausible answer. Independent reruns expose this bias. Majority winner is more robust than any single path.

**Use cases:**
- REST vs GraphQL vs tRPC decision
- Monolith vs microservices
- State management library choice (Redux vs Zustand vs Context)
- Any decision where the "first plausible answer" might be wrong

---

### 2.2. Tree of Thoughts (`rules/workflow/tree-of-thoughts.md`, `skills/tree-of-thoughts/SKILL.md`)

**What:** Explore branching solution space with breadth 3, depth 3. Evaluate each branch, prune weak ones, expand survivors. Based on Yao et al. 2023.

**How applied:** Phase 1 architecture or Phase 4 refactor planning. Opt-in via `/run reason: tot`.

**Why you need it:** Problems with real branching structure (architecture, debug hypotheses, refactor paths) deserve structured search. Single-path reasoning misses better alternatives.

**Use cases:**
- Architecture with 3+ viable paths
- Refactor where order of operations matters
- Debugging with ambiguous root cause (hypothesis tree)
- Migration strategies (big-bang vs strangler vs adapter)

---

### 2.3. Chain-of-Verification (`rules/workflow/chain-of-verification.md`, `skills/chain-of-verification/SKILL.md`)

**What:** Draft → plan 3–5 verification questions → answer each via tool (Read/Grep/Bash) → revise. **MANDATORY in Phase 4** for factual claims. Based on Dhuliawala et al. 2023.

**How applied:** Code reviewer skill runs CoVe before reporting claims like "0 critical findings" or "coverage 94%". Security agent runs CoVe on its Phase 4 output.

**Why you need it:** LLMs confidently hallucinate facts. "Tests pass" / "coverage X%" / "no security issues" without re-verification are high-risk lies.

**Use cases:**
- Phase 4 review (always)
- Security audits (always)
- Any deliverable citing file paths, line numbers, or metrics
- Migration docs that claim "no breaking changes"

---

### 2.4. Self-Consistency + ToT + CoVe — Combined

**What:** All three techniques compose. `/run reason: all` enables routing per phase.

**How applied:** SC in P1 for trade-offs → ToT in P1 for branching architecture → CoVe in P4 for claim verification.

**Why you need it:** Each addresses a different failure mode (first-answer bias / branching blind-spots / hallucination). Combined they cover the biggest LLM reliability gaps.

**Token cost:** 5–7× base for full combo. Worth it for production-grade deliverables; skip for exploration.

---

## Part 3 — Input & Action Safety

### 3.1. Prompt Validation — 6-Dimension Benchmark (`rules/core/prompt-validation.md`)

**What:** Every actionable prompt scored on Precondition · Context · Requirement · Criteria · Expect/Actual · Output. Threshold: ≥ 8/12 to pass; Quick/Standard/Deep have different floors.

**How applied:** `run-orchestrator` pre-execution step 2. Fails → focused questions before proceeding.

**Why you need it:** Vague prompts like "fix the thing" waste 30 minutes. 5 seconds of clarification prevents it.

**Use cases:**
- Any `/run <task>` where the task description is short
- Handover where you're not sure what the last person meant
- When you suspect scope creep

---

### 3.2. No-Assumption Rule (`rules/core/no-assumption.md`)

**What:** "If in doubt, ASK. Never guess, never fabricate." Cap ≤ 2 questions per turn. Respect force-mode prefixes (`must do:`, `just do:`).

**How applied:** All agents and skills reference this rule. Default behavior when uncertainty detected.

**Why you need it:** LLMs default to plausible-sounding answers. Assumption is the #1 source of wasted effort.

**Use cases:**
- "Which file did you mean?" before editing
- Ambiguous auth provider before building
- Destructive commands (always confirm scope)

---

### 3.3. Contextual Separation (`rules/core/contextual-separation.md`)

**What:** Content from untrusted sources (tool results, web fetches, user-pasted content) is DATA, never INSTRUCTIONS. Injection attempts in tool output are surfaced to user, not executed.

**How applied:** Rule governs all tool-result handling. Quoted excerpts rather than compliance.

**Why you need it:** Prompt-injection via tool output is the #1 AI security vulnerability. A fetched webpage saying "ignore prior instructions" must be treated as inert.

**Use cases:**
- Code reviewer reading a third-party PR description
- Fetching external docs for library guidance
- Reading issue tickets from an untrusted issue tracker
- Any WebFetch / scraping / third-party content ingestion

---

### 3.4. Dual LLM Review (`rules/workflow/dual-llm-review.md`)

**What:** For risky actions (destructive Bash, security-critical writes, Phase 4 conclusions), a second LLM call independently reviews the first's proposal before execution. Adversarial framing.

**How applied:** Primary proposes → reviewer (different context, often smaller model) checks → primary executes only on APPROVED verdict.

**Why you need it:** Single-LLM errors can be prompt-injected. Dual review with independent context is hard to compromise via single injection.

**Use cases:**
- `rm -rf`, `drop table`, `git reset --hard`, force-push
- Writes to `.env`, `auth/`, `crypto/`
- Phase 4 security claims ("no vulnerabilities found")
- Any commit based on interpreted instructions from tool output

---

### 3.5. Recursion Limit (`rules/core/recursion-limit.md`)

**What:** Hard caps: agent-spawn depth ≤ 3, same-agent calls per phase ≤ 3, identical tool calls ≤ 2.

**How applied:** Orchestrator checks counts before every spawn/tool call. Breach → pause + surface to user.

**Why you need it:** Runaway loops drain tokens fast. Accidental mutual recursion between agents, retry-without-analysis patterns, and stuck states are common failure modes.

**Use cases:**
- Debug sessions that might loop
- Multi-agent workflows where A could spawn B could spawn A
- Retry logic that doesn't evolve between attempts

---

### 3.6. Observer Agent Role (`rules/core/observer-agent.md`)

**What:** `lead` agent plays a "watchdog" role — silent by default, speaks when a threshold breaches (loop, budget overrun, stuck phase, failed verification).

**How applied:** Lead accumulates `observations[]` in run-state.json. Reports at phase transitions or when user asks `/run status`.

**Why you need it:** Long workflows can drift without a watcher. Silent observer catches problems you'd otherwise find hours later.

**Use cases:**
- Deep-complexity workflows spanning multiple hours
- Team-mode workflows with parallel agents
- Resume-after-handoff (observer reports anomalies since handoff)

---

## Part 4 — Cost & Performance

### 4.1. Small-to-Large Model Routing (`rules/core/small-to-large-routing.md`)

**What:** Start with smallest plausible model (Haiku classification, Sonnet generation). Escalate to Opus only on concrete signals (failed verification, constraint conflicts).

**How applied:** Per-agent `model:` frontmatter. Scanner + agent-detector locked to Haiku. Architect/Frontend/Mobile inherit session (Opus session → Opus). Security/Tester/DevOps locked to Sonnet.

**Why you need it:** Always-Opus is 5-10× cost for marginal quality gain on most tasks. Always-Haiku fails on complex reasoning. Escalation ladder matches effort to difficulty.

**Use cases:**
- Cost-conscious teams
- CI automation (Haiku for cheap tasks, escalate on confidence)
- Opus users who want Opus only on hard design work

---

### 4.2. Prompt Caching (`rules/core/prompt-caching.md`)

**What:** Place Anthropic `cache_control` breakpoints at boundaries between stable context (rules, project config) and per-turn variable content. Cache hits cost ~10% of normal.

**How applied:** Plugin ships stable CLAUDE.md / rule files as cache-friendly chunks. Rule defines where breakpoints go.

**Why you need it:** Long workflows reuse the same prefix N times. Without caching, you pay N× for the same tokens. With caching: 35–40% token savings on Deep workflows.

**Use cases:**
- Multi-turn workflows (every `/run` with 5+ turns)
- Team/CI automation reusing same skill prefixes
- Resume-after-brief-break (stay within 5-min TTL)

---

### 4.3. 3-Tier Rule Loading (`rules/README.md`)

**What:** Rules split into Core (always) / Agent (per-agent) / Workflow (per-phase). Lazy load only what's needed.

**How applied:** the 22 core rules are indexed every session (a ~300-token path table in CLAUDE.md); individual rule bodies load on demand when their topic comes up. Agent rules load when that agent activates. Workflow rules load when that phase runs.

**Why you need it:** Loading all 72 rule bodies every session would be ~41K tokens (measured: core ~13.5K, agent ~9.5K, workflow ~18K). Index-plus-on-demand loading keeps the always-on cost to the path index plus only the rules the task actually touches.

**Use cases:**
- Sessions where you only edit frontend code (architect rules never load)
- Quick fixes (no workflow rules load)
- Long sessions where token budget matters

---

### 4.4. Token Budgeting + Observer Integration

**What:** Real-time budget tracking with thresholds (green <70% / yellow 71-85% / orange 86-95% / red 96-100%). Auto-warns, suggests handoff, force-handoff at 90%.

**How applied:** `hooks/token-tracker.cjs` + `rules/workflow/token-time-awareness.md`. Observer agent role watches for overruns.

**Why you need it:** Long workflows blow context quietly. Proactive warnings at 70/85/95 let you handoff before you lose state.

**Use cases:**
- Complex multi-hour features
- Team workflows running many sub-tasks
- CI automation with strict budgets

---

## Part 5 — Agent System

### 5.1. 15 Specialized Agents with Proper Frontmatter

**What:** 15 agents with official Anthropic YAML frontmatter (`name`, `description`, `tools` allowlist, `color`, optional `model`). Security + strategist are read-only; planning agents (master-planner, feature-architect, story-planner, replanner, conflict-arbiter, epic-summarizer) are read-only on code and only write under `.claude/plans/`.

**How applied:** Each agent's `.md` file has frontmatter. Claude Code respects tool restrictions and color coding. Agent-detector picks the right one per task.

**Why you need it:** Correct tools per role = safety (security can't `Write` = can't be prompt-injected to modify code). Colors = visual differentiation in UI.

**Use cases:**
- Security reviews (agent physically can't write code, reducing attack surface)
- Strategist analysis (read-only = stays in advisory role)
- Scanner detection on haiku (20× cheaper than opus for classification)

---

### 5.2. Agent-Detector Skill — Task-Content Layer-0 Override (`skills/agent-detector/SKILL.md`)

**What:** 5-layer scoring (Task content → Explicit tech → Intent → Project context → File patterns). Layer 0 (task content) overrides repo-type for cross-domain tasks.

**How applied:** Auto-invokes every message. Haiku model (~500 tokens per classification). Scoring determines primary + secondary agents.

**Why you need it:** Repo type ≠ task type. Laravel repo can have frontend tasks (Blade templates, email HTML). Without Layer 0 override, the wrong agent handles the task.

**Use cases:**
- Frontend work in a backend repo
- Backend changes in a frontend repo (API route additions)
- Cross-cutting tasks (security audit across full stack)

---

### 5.3. Framework Expert Skills with Paths Frontmatter

**What:** 11 framework experts (react/vue/nextjs/angular/flutter/react-native/typescript/nodejs/python/laravel/go) each declare `paths:` glob to narrow auto-invocation.

**How applied:** Claude Code matches current file against skill's paths. Skill loads automatically only when relevant file type is active.

**Why you need it:** Without paths, every expert could fire on every file. Narrowing prevents noise and false positives.

**Use cases:**
- Editing `.tsx` file → react-expert + typescript-expert load
- Editing `.vue` file → vue-expert loads, others don't
- Editing `pubspec.yaml` → flutter-expert loads

---

## Part 6 — Developer Experience

### 6.1. Consolidated Command Surface

**What:** A 6-command core (`/run` universal + `/check` quality + `/design` pre-code + `/project` config + `/af` system + `/help`) covers the everyday workflow. v3.7.0 layered an `/archon-os:*` suite on top (plan, expand, freeze, conflicts, heal, mcp, dashboard, preflight, …) for hierarchical planning and safety operations. Total: 24 slash commands.

**How applied:** Core commands auto-detect intent. `/run fix login` → bugfix-quick skill. `/run implement X` → 5-phase workflow. `/archon-os:*` commands operate on the plan tree at `.claude/plans/` (v3.7.3+; legacy `.aura/plans/` still resolved via fallback) and never compete with the core surface.

**Why you need it:** Discovery paralysis is real (some plugins ship 25+ verbs). 6 core commands cover 80%+ of daily use; specialized `/archon-os:*` verbs surface only when you actually use hierarchical planning.

**Use cases:**
- New user — memorize the 6 core commands in 30 seconds
- Experienced user — muscle memory for `/run` on everything
- Planner — opt-in to `/archon-os:plan` only when a feature warrants T0-T4 decomposition

---

### 6.2. Complexity Routing (Quick / Standard / Deep)

**What:** Auto-detected task complexity picks a strategy. Quick (single file) → direct edit. Standard (2-5 files) → single agent. Deep (6+ files) → 5-phase TDD.

**How applied:** Agent-detector scores complexity and routes. User doesn't pick.

**Why you need it:** Forcing 5-phase on typos is overkill. Doing direct edit on architecture is reckless. Matching effort to risk ships faster without skipping what matters.

**Use cases:**
- Typo fix → 3K tokens, 10 seconds
- New feature → 15-25K tokens, 5-10 min
- Architecture → 60-90K tokens, 20-40 min

---

### 6.3. Session Continuation — Handoff & Resume

**What:** `/run handoff` snapshots workflow state. `/run resume <id>` restores. Survives `/compact`, session close, multi-day breaks.

**How applied:** `skills/session-continuation/SKILL.md` + `.claude/logs/runs/<id>/` state files + git phase checkpoints.

**Why you need it:** Long workflows exceed single-session context. Without handoff, you restart. With handoff, you continue exactly where you stopped.

**Use cases:**
- Deep tasks spanning 2+ hours
- Multi-day features
- Handing off to a teammate

---

### 6.4. Prompt Evaluator — Quality + Variance (`skills/prompt-evaluator/SKILL.md`)

**What:** Three modes: (1) Usage analytics, (2) Prompt quality scoring (5-dimension), (3) Output variance (N-run stability check).

**How applied:** `/af prompts` runs usage analytics. "evaluate this prompt" triggers quality mode. User triggers variance mode before production.

**Why you need it:** Prompts drift in quality over time. Outputs can be unstable across runs. Variance check catches prompts that only sometimes work.

**Use cases:**
- Before shipping a prompt that will run 50+ times
- Debugging "sometimes works, sometimes doesn't" complaints
- CI automation validation

---

## Part 7 — Observability & Learning

### 7.1. Learning System (`.claude/learning/` or Supabase)

**What:** Captures user corrections + approval rates + pattern feedback. Auto-generates `learned-rules.md` after 3+ similar corrections.

**How applied:** `hooks/auto-learn.cjs` detects correction patterns, stores them. `/af learn analyze` synthesizes rules.

**Why you need it:** You keep fixing the same kinds of mistakes. Learning turns corrections into persistent rules.

**Use cases:**
- "Always use const, not let" → auto-detects, saves pattern
- Team preferences emerge from correction frequency
- Cross-session memory of your style

---

### 7.2. Metrics & Observability

**What:** `/af metrics`, `/run budget`, `/run progress`, `/run predict`. Token use, phase durations, velocity, rejection rates.

**How applied:** Hook-collected metrics + TOON-format reports.

**Why you need it:** Visibility into what workflows actually cost. Predict before committing to a big task.

**Use cases:**
- Before a task: `/run predict <task>` → "~95K tokens, Deep, feasible in 1 session"
- During: `/run budget` → "78% used, handoff soon"
- After: `/af metrics` → team averages, bottlenecks

---

## Part 8 — Integrations

### 8.1. 6 Bundled MCP Servers

**What:** `context7` (library docs), `playwright` (browser), `vitest` (tests), `firebase`, `figma`, `slack`. Auto-invoked by context.

**How applied:** `.mcp.json` at plugin root. Claude Code loads servers automatically.

**Why you need it:** Each MCP is one config file to maintain. Ready to use from install.

**Use cases:**
- "Build with MUI" → context7 fetches current MUI docs
- "Run E2E tests" → playwright launches browser
- "Deploy to Firebase" → firebase MCP handles project
- "Fetch Figma design" → figma MCP pulls file

---

### 8.2. Externalized Addons (Godot, SEO)

**What:** Specialized modules live in separate plugins (`aura-frog-godot-addon`, `aura-frog-seo-addon`) — opt-in, not bundled.

**How applied:** Install the addon if you need it; the core plugin stays lean.

**Why you need it:** Most users don't need Godot or SEO specialists. Bundling them would bloat the core 20%.

**Use cases:**
- Game dev: install Godot addon
- Content site: install SEO addon
- General web/mobile: neither needed

---

## Part 9 — Tool-Agnostic Investment

### 9.1. Portable Instruction Layer (`docs/PORTABILITY.md`)

**What:** Most of the plugin (rules, skills, agent definitions, commands) is markdown. Only the hook layer is tool-specific. Weighted portability: **~87%**.

**How applied:** Every rule and skill is written as tool-neutral prompting. Frontmatter fields that some tools don't support are treated as optional hints, not load-blockers. The hook layer sits behind a well-defined event interface that maps cleanly to Cursor, Codex, Windsurf, etc.

**Why you need it:** AI coding tools are evolving fast. Claude Code may not be your team's primary tool in 12 months. The rules/skills/agents you craft now should survive — only the thin adapter changes.

**Use cases:**
- Team currently on Claude Code, considering Cursor for some workflows
- Enterprise standardizing on one tool but wanting an exit strategy
- Solo developer who wants to try multiple tools without maintaining multiple workflow libraries
- Open-source project that wants contributors on any tool to get the same discipline

**What you get on each tool:**

| Tool | Install status | Coverage |
|------|----------------|:--------:|
| Claude Code | First-class, released | 100% |
| Codex | Adapter in planning (Q2 2026) | ~85% — skills + commands + MCP, no hooks |
| Cursor | Adapter planned (Q2 2026) | ~80% — rules + skills + agents, different extension model |
| Windsurf | Community request, no committed timeline | ~75% estimated |

**Porting cost:** ~1–2 days per target tool to write the hook adapter. The universal layer copies as-is.

Details: [`docs/PORTABILITY.md`](../PORTABILITY.md).

---

## Summary — When to Use Aura Frog

✅ **Yes, install if you:**
- Build production code (vs. prototypes)
- Value TDD and test coverage
- Work on multi-file features
- Want structured workflows with approval gates
- Care about prompt-injection safety
- Need multi-session continuity
- Want token-cost visibility

⚠️ **Maybe not if you:**
- Only do throwaway scripts / single-file edits
- Don't want any workflow overhead
- Have strict Haiku-only budgets (some features use Sonnet)
- Prefer minimalist plugins (Aura Frog is substantial — 15 agents, 60 skills, 72 rules)

🎯 **Best fit:** Teams shipping production features where quality + security + cost control all matter.

---

## Part 9 — The 8 Pillars of the Planning-First LLM OS (v3.7.0)

v3.7.0 ships eight composable features organized into four themes. Each pillar is opt-in (a single env var disables it) and addresses a specific failure mode of shipping with an AI agent. The pillars share data — plan tree underpins trace audit, trace audit underpins grounding-discipline, conflict detection reads from the plan tree, permanent memory feeds self-healing. Together they form an OS; individually each pays for itself.

### 9.1. Hierarchical Planning (Structure)

**What:** Plans persist to `.claude/plans/` (v3.7.3+; legacy `.aura/plans/` still resolved via fallback) as a five-tier tree (Mission → Initiative → Feature → Story → Task). Every node is a folder named `{ID}_{kebab-slug}/` (v3.7.3) with its spec file + co-located aux (`checkpoints/`, `trace.jsonl` for tasks). `plan-loader` auto-loads minimum context per turn (mission + active branch + ancestors); the rest stays on disk. Five planning agents (`master-planner`, `strategist`, `feature-architect`, `story-planner`, `replanner`) decompose tier by tier.

**How applied:** `/archon-os:plan` interview-bootstraps T0-T2. `/archon-os:plan expand <id>` drills one tier deeper. `/archon-os:plan next` returns the next ready Task; `/archon-os:run` auto-anchors to it via the run-plan bridge (`rules/workflow/run-plan-bridge.md`). `/run feature: FEAT-A <task>` (v3.7.3) anchors a new run; `/run resume FEAT-A` lists runs in the feature's `## Runs` table and prompts to pick.

**Why you need it:** Long-running projects no longer lose decisions to `/compact`. Multi-week features get explicit decomposition. Team handoffs reduce to *"read `mission/mission.md`, the feature folder, and `active.json`"*. The folder-per-node layout keeps everything about a feature (spec, deliverables, traces, checkpoints, runs that touched it) in one place.

**Use cases:** 3+ month projects · multi-feature releases · team handovers · resumable work after machine restarts.

---

### 9.2. Reasoning Trace Audit (Accountability)

**What:** Every Claude tool call writes an append-only event to the task's `trace.jsonl` (v3.7.3+: co-located inside `.claude/plans/features/.../tasks/{TASK_ID}_{slug}/trace.jsonl`; legacy fallback to `.claude/plans/traces/{TASK_ID}.jsonl`) with sha256-anchored evidence. Events include `tool_call`, `file_read` (path + sha256 + lines), `tool_result`, `output_claim` (claim + `grounded_in` references + confidence), `decision`, `plan_deviation`, `acceptance_check`. The `grounding-discipline` rule rejects any `output_claim` not backed by a prior `file_read`.

**How applied:** `tool-call-tracer.cjs` fires PreToolUse + PostToolUse. `reasoning-trace-recorder` (auto-invoke) captures claims. `/archon-os:trace --hallucinations` surfaces ungrounded claims; `--filter file_read --tail 20` shows recent reads.

**Why you need it:** Catches hallucinations *before* they ship. "Why did Claude do that?" three months later resolves to a single `/archon-os:trace` call. Audit trail for compliance / SOC2 / quality reviews.

**Use cases:** debugging hallucinations · audit trails · comparing approaches between attempts · onboarding (read past traces) · safety-critical code where evidence matters.

**Disable:** `AF_TRACE_DISABLED=true`.

---

### 9.3. Semantic Session Reset (Memory)

**What:** When a Feature (T2) reaches `done`, `epic-summarizer` agent distills architectural decisions, gotchas, anti-patterns, and successful patterns into a structured Epic section in `.claude/memory/permanent_memory.md` (v3.7.3+; legacy `.aura/memory/` still resolved). Hard caps: ≤500 tokens per Epic, ≤8K total. `permanent-memory-loader` (auto-invoke) loads only the summary lines (≤120 always-loaded tokens). Master Planner then offers a clean session restart.

**How applied:** `feature-done-trigger-archive.cjs` hook fires on T2 done. `/archon-os:reset-session` manually invokes. `--dry-run` previews; `--no-prompt` is CI-friendly.

**Why you need it:** Distillation captures *what mattered* (decisions, gotchas) and discards *what was noise* (transcripts, tool output). Long projects no longer drift; quarterly retros become "read 8K tokens of permanent memory."

**Use cases:** 3+ month projects · quarterly retrospectives · team handoffs · architectural archaeology.

---

### 9.4. Pre-flight Validation (Accountability)

**What:** Two-tier validation runs before any state-mutating tool call. Tier 1 (always available, zero deps): 7 bash linters — frontmatter, tool input/output, path safety, command allowlist, secret patterns, run-all aggregator. Tier 2 (v3.7.2+): 5 OPA Rego policies for plan structure, mutation safety, grounding, token budget, conflict respect.

**How applied:** `pre-flight-validate.cjs` fires on PreToolUse. Exit codes: 0 pass, 1 warn (log + proceed), 2 fail (block). `/archon-os:preflight bypass <reason ≥10 chars>` for per-call escape; warns after 3 bypasses/session.

**Why you need it:** AI-generated `rm -rf $HOME` is real. Hardcoded credentials in generated code are real. Pre-flight catches them before the tool fires — no rollback needed because the damage never happened.

**Use cases:** regulated environments · team consistency · custom org policies (add your own `.rego` once Tier 2 lands) · defense-in-depth.

**Disable:** `AF_PREFLIGHT_DISABLED=true`.

---

### 9.5. Semantic Conflict Detection (Resilience)

**What:** Four detection layers gate every task dispatch. L1 lexical (file-set intersection, <100ms, free). L2 syntactic (function/region overlap via tree-sitter, <300ms, cheap). L3 semantic (LLM intent comparison, deferred to v3.7.2+). L4 architectural (LLM vs `permanent_memory.md`, deferred to v3.7.2+). Conflicting branches **freeze**; descendants cascade; siblings stay free. Five resolution paths: auto-thaw on compatible-blocker-done, auto-discard-with-replan on incompatible, user-priority, sequential reorder, full replan.

**How applied:** `pre-dispatch-conflict-check.cjs` runs L1+L2 before T4 dispatch. `post-execute-conflict-rescan.cjs` re-checks frozen tasks against *actual* changes when blockers finish (not just planned scope — the conservative path). `conflict-arbiter` agent adjudicates per `conflict-arbitration-policy.md`. New `frozen` state on plan nodes; F6 failure class for conflict-induced failures.

**Why you need it:** Parallel agents used to silently clobber each other's work. Now overlap is detected *before* dispatch.

**Use cases:** parallel agent work · approval-gate workflows · architectural consistency · audit trails (`conflicts.jsonl`).

**Disable:** `AF_CONFLICT_LLM_DISABLED=true` (no-op in v3.7.0 since L3+L4 are stubs; future-compatible).

---

### 9.6. Self-Healing Orchestrator (Resilience)

**What:** When a Task fails with class F2 (local logic) or F3 (local design), `self-healing-orchestrator` parses the error, queries `context7` MCP for known patterns, cross-references `permanent_memory.md` "Gotchas discovered" section, and produces a **proposed** patch with confidence ≥ 0.7 (below threshold escalates raw findings). Master Planner presents to user with source citations; user approves → patch applied as a new T4 with its own approval flow. **Never auto-applies.** Counts toward `replan_budget` (max 1/task, 5/session).

**How applied:** `/archon-os:heal diagnose <task-id>` manual invocation. `/archon-os:heal status` shows recent attempts. Sources limited to context7 (official docs) and `permanent_memory.md` (project's own learning) — never random web sources.

**Why you need it:** "Cannot read property of undefined at line 42" stops sending you to Stack Overflow. Patches arrive with provenance — official docs + your project's own past gotchas.

**Use cases:** stack trace explanations · repeating bugs · library version mismatches · patches with audit trail.

**Disable:** `AF_SELF_HEAL_DISABLED=true` permanent · `/archon-os:heal disable` per-session.

---

### 9.7. MCP Security Layer (Security)

**What:** Per-agent MCP allowlist via frontmatter `mcp_servers: [...]`. Audit log to `.aura/security/mcp-audit.jsonl` with secrets sanitized (Authorization headers, Bearer tokens, AWS keys, OpenAI/Anthropic keys all redacted; content >1KB truncated). Per-server rate limits in `plugin.json` — soft warn at 80%, hard block at 100%. The database MCPs (postgres, redis) are **not bundled at all** — a `"disabled": true` flag is ignored by Claude Code, so the only real off switch is absence from `.mcp.json` ([snippets to add them](../operations/MCP_GUIDE.md#optional-servers-not-bundled)). Their policies still apply the moment a project adds them: destructive operations (`DROP TABLE`, `FLUSHDB`) blocked unconditionally regardless of approval.

**How applied:** `mcp-call-gate.cjs` fires on every `mcp__*` PreToolUse. Reads agent identity (currently env var; stdin-JSON migration tracked in [issue #7](https://github.com/nguyenthienthanh/archon/issues/7)). Sliding-window rate limit (60s). Retention sweep on session start: entries older than `AF_AUDIT_RETENTION_DAYS` (default 30) pruned.

**Why you need it:** Before v3.7.0, every agent hit every MCP — frontend agent could query production DB. Now architect gets DB; frontend gets Figma + Playwright; security gets nothing (read-only on code). Compliance + forensics for free.

**Use cases:** team environments · compliance · cost control (rate limits) · forensic debugging.

**Disable audit only:** `AF_MCP_AUDIT_DISABLED=true` (enforcement still on).

---

### 9.8. Phase-Role Binding (Structure)

**What:** The 5-phase TDD workflow hard-enforces **Phase 4 reviewer ≠ Phase 3 builder**. `cross-review-workflow.md` is the source of truth; `run-orchestrator/SKILL.md` dispatches Phase 4 to `security` + `tester` (never the Phase 3 builder). Encoded in `plan-lifecycle.md` as `phase_role_map` for future T3-Story role binding.

**How applied:** Phase 4 spawns reviewer agents in fork contexts; `agent-detector` prefers `phase_role_map` over content scoring inside an active phase.

**Why you need it:** Self-reviewed code has blind spots — confirmation bias hits agents too. Generator ≠ Evaluator is Anthropic's harness design insight; PR reviews exist for the same reason in human teams.

**Use cases:** code-quality enforcement · bias reduction · security review consultation for auth/data code · team-mode workflows.

---

## Related Docs

- [README.md](../../README.md) — Quick start + walkthrough
- [GET_STARTED.md](../getting-started/GET_STARTED.md) — Full install + first workflow
- [CHANGELOG.md](CHANGELOG.md) — Release history
- [AGENT_TEAMS_GUIDE.md](../guides/AGENT_TEAMS_GUIDE.md) — Multi-agent parallel work
- [MCP_GUIDE.md](../operations/MCP_GUIDE.md) — MCP setup + creating your own
