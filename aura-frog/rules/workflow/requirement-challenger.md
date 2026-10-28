> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Requirement Challenger

**Priority:** HIGH
**Applies:** Phase 1, `modify`, `/run`

**Pairs with:** `rules/core/prompt-validation.md` (6-dim benchmark — run that FIRST) and `rules/core/no-assumption.md` (never guess — ask).

---

## Core Rule

**Think critically before accepting requirements. Analyze gaps, assumptions, and ambiguities.**

**Order of operations at Phase 1 start:**
1. Score the prompt via `rules/core/prompt-validation.md` (6 dimensions, threshold by complexity)
2. If score fails → ask focused questions per `rules/core/no-assumption.md`
3. Once the prompt passes validation, apply this rule's deeper challenge (scope, edge cases, feasibility below)

---

## Skip Challenge When

- Override phrases: "just do it", "skip challenge", "no questions", "I've thought it through", "exactly as described"
- Trivial tasks (typo fixes, formatting, config)
- Quick complexity (per agent-detector)

---

## Challenge Framework

```toon
challenge_areas[6]{area,question_pattern,example}:
  Clarity,"Specific enough to implement?","'Add auth' → What type? OAuth? JWT? Session?"
  Scope,"What are we NOT building?","'Add user management' → CRUD only? Or roles/permissions?"
  Assumptions,"What's assumed but not stated?","'Use the database' → Which one? New table or existing?"
  Edge Cases,"What could go wrong?","'Handle payments' → Refunds? Failed charges? Currency?"
  Feasibility,"Works within constraints?","'Real-time sync' → Stack supports WebSockets?"
  Simpler Alternative,"Simpler way to achieve this?","'Build custom chart lib' → Use Recharts/D3 instead?"
```

### Challenge Depth

```toon
depth[3]{complexity,level,max_questions}:
  Quick,Skip,0
  Standard,Light (1-2 key questions),2
  Deep,Full (3-5 across areas),5
```

---

## Socratic Onboarding Protocol (Phase 1 Inception Gate)

Before writing any code or locking the Sprint Contract, engage the user in a disciplined Socratic discovery:

1. **Context Grounding (Read Before Asking):**
   - Read relevant existing code/specs first. Never ask questions that 10 seconds of grepping would answer.

2. **The 3 Mandatory Socratic Probes:**
   - **Probe 1 — Scope & Non-Goals:** *"What are we explicitly NOT building in this run?"*
   - **Probe 2 — Failure Modes & Edge Cases:** *"What should happen when X fails, times out, or returns empty?"*
   - **Probe 3 — Architectural Dependencies:** *"Are there downstream systems or database models that must be preserved?"*

3. **Present 2 Architectural Trade-Off Approaches:**
   - **Option A (KISS / Minimalist):** Fast, low-complexity, minimal blast radius.
   - **Option B (Scalable / Decoupled):** More modular, future-proof, slightly higher initial effort.
   - *Ask user:* *"Do you prefer Option A or Option B before we lock the Sprint Contract?"*

---

## Flow

1. **Analyze** what was asked & inspect relevant files
2. **Execute Socratic Probes** (1-3 crisp questions)
3. **Present 2 Trade-off Options**
4. **Lock Sprint Contract**: Only proceed to Phase 2 (Test RED) after user alignment.

---

## Integration

- **Phase 1:** Fires BEFORE generating requirements output
- **`modify`:** Fires when modification could expand scope
- **`/run`:** Fires immediately after task description

Complements `feedback-brainstorming.md`: Challenger validates WHAT, brainstorming validates HOW.

---

## Behavior

- Challenge vague requirements, ask about scope, surface assumptions
- Keep challenges concise (not interrogation), max 5 questions
- Always offer "proceed with defaults" option
- Never re-challenge after user confirms

---
