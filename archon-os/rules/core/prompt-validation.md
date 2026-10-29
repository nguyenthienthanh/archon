> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Prompt Validation — 6-Dimension Benchmark

**Priority:** Critical
**Applies To:** Workflow-triggering prompts (`/run`, `/check`, `/design`) + any actionable prompt with detected ambiguity

---

## Core Principle

**Every actionable prompt must pass a 6-dimension quality check. If it doesn't, ask before executing.**

This rule pairs with `rules/core/no-assumption.md` — "never assume" is the principle, this is the concrete framework.

---

## The 6 Dimensions

| # | Dimension | What it answers | Example (present) | Example (missing) |
|---|-----------|-----------------|-------------------|-------------------|
| 1 | **Precondition** | What must be true before starting? | "After `project:init` has run, and branch is clean" | — |
| 2 | **Context** | What's the relevant background? | "Next.js 14 app, Tailwind, Supabase auth" | — |
| 3 | **Requirement** | What does the user want done? | "Add JWT auth with refresh token rotation" | "Fix the thing" |
| 4 | **Criteria** | How do we judge success? | "5 tests pass, 0 critical security findings, coverage ≥ 80%" | "Make it work" |
| 5 | **Expect/Actual** | What's expected vs actual? | "Currently uses session cookie; want stateless JWT" | "Something's broken" |
| 6 | **Output** | What deliverable gets produced? | "Middleware, `/login` + `/refresh` endpoints, test file" | "Fix it" |

---

## Scoring

Each dimension scores 0, 1, or 2:

- **0 = missing** (not addressed at all)
- **1 = partial** (implied but not explicit)
- **2 = clear** (stated or derivable)

**Max total:** 12

**Pass criteria (ALL must hold):**
- Total score ≥ 8/12 (67%)
- Requirement (#3) and Output (#6) both ≥ 1

**Fail triggers:**
- Total < 8/12
- **OR** ≥ 3 dimensions score 0
- **OR** Requirement = 0 (can't act without knowing what)
- **OR** Output = 0 (can't judge done without knowing deliverable)

---

## Action on Fail

1. Score the prompt (quick mental pass, ~5 seconds)
2. Identify top 1–2 missing/weakest dimensions
3. Ask a focused question per `rules/core/no-assumption.md` style (≤2 questions, offer options if possible)
4. Wait for user response before executing

**Example:**

> Your prompt scored 5/12 — needs clarification before I can start:
> - **✗ Criteria missing:** How do we know when this is done? (e.g., specific test passing, behavior observable in UI)
> - **✗ Expect/Actual unclear:** What's the current behavior vs what you want?
>
> Can you clarify those two?

---

## Complexity-Based Thresholds

Not every prompt needs all 6 dimensions. Match rigor to task size:

| Complexity | Required dimensions (must ≥ 1) | Pass threshold |
|------------|--------------------------------|----------------|
| **Quick** (typo, one-liner) | Requirement + Output | Any ≥ 4/12 |
| **Standard** (feature, 2-5 files) | Req + Output + Criteria + Context | ≥ 7/12 |
| **Deep** (architecture, 6+ files) | All 6 dimensions | ≥ 9/12 |

---

## Exceptions — Skip Validation

- **Force-mode prefixes:** `must do:`, `just do:`, `exactly:`, `skip validation:`, `no discussion` → execute literally, don't validate
- **Retry / modify of already-validated workflow** → inherit prior scoring
- **Direct edits** (user typed exact file + change) → no workflow invoked, no validation needed

---

## When Applied

| Command/Action | Validate? |
|----------------|-----------|
| `/run <task>` | **Yes** — always |
| `/check`, `/design` | **Yes** if task description is non-trivial |
| `/project init` | No — fixed setup flow |
| `/af <subcmd>` | No — admin commands |
| `/run modify <changes>` | No — inherits original run's validation |
| Direct edits (Quick tier, no `/run`) | Only if ambiguous |
| Phase 1 requirements gathering | **Yes** — reference this rule in `requirement-challenger.md` |

---

## How to Score Quickly (mental checklist)

For each dimension, ask yourself:

1. **Precondition:** "Do I know the env / git / setup state?" → Y/N/Partial
2. **Context:** "Do I know the framework, stack, relevant code?" → Y/N/Partial
3. **Requirement:** "Can I summarize what to build in one sentence?" → Y/N/Partial
4. **Criteria:** "Can I write the acceptance test right now?" → Y/N/Partial
5. **Expect/Actual:** "Do I understand the current state and target state?" → Y/N/Partial
6. **Output:** "Can I list the files I'll create/modify?" → Y/N/Partial

Y = 2, Partial = 1, N = 0. Sum → pass or ask.

---

## Tie-Ins

- `rules/core/no-assumption.md` — asking is preferred over guessing
- `skills/prompt-evaluator/SKILL.md` — full prompt quality analysis tool
- `rules/workflow/requirement-challenger.md` — Phase 1 validation layer (uses this rule)
- `skills/run-orchestrator/SKILL.md` — pre-execution step invokes this validation
