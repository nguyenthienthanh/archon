> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Grounding Discipline

**Priority:** Critical
**Applies To:** Every Claude turn that produces an `output_claim` event during active T4 execution

---

## Core Principle

**An output claim is "grounded" only when ≥1 prior `file_read` event in the same task trace covers the file/function/symbol the claim names.**

If no precedent exists, the claim is flagged `grounded: false` — i.e., a potential hallucination — and surfaces in `/archon-os:trace --hallucinations`.

This is the cheapest hallucination filter: a deterministic check on append-only trace events. No LLM call.

---

## What counts as a "claim"

An `output_claim` event is emitted when Claude:

1. Names a specific file path (`src/auth/jwt.ts`)
2. Names a function/class/method (`verifyToken`, `class JwtService`)
3. Asserts behavior of code (`uses HS256`, `returns Promise<User>`)
4. References a config field, env var, or schema column

Claims that do NOT need grounding:
- General reasoning (`we need to check the test runs first`)
- Plan content quotations (already trust:plan)
- User-message quotations (already trust:user)

---

## Grounded vs. ungrounded — examples

| Claim | Prior file_read? | Grounded |
|-------|------------------|----------|
| `verifyToken is exported by src/auth/jwt.ts` | yes — Read on src/auth/jwt.ts in same trace | ✓ |
| `verifyToken uses HS256` | only Read on the file, but content didn't include HS256 substring | ✗ flag |
| `JWT settings live in config/auth.yaml` | no Read on config/auth.yaml in trace | ✗ flag |
| `tests should fail before fix` | not a file/symbol claim | n/a |

---

## Enforcement

The `reasoning-trace-recorder` skill emits `output_claim` events. The `tool-call-tracer` hook ensures `file_read` events precede them when applicable.

The grounding check is **post-hoc**: claims are recorded with `grounded: false`, and `/archon-os:trace --hallucinations` surfaces them.

In Milestone E (rc.1), pre-flight will block actions that depend on ungrounded claims (e.g., editing a file that was never read first).

---

## Anti-patterns

- **"I know `verifyToken` exists because I've seen this pattern before"** — that's a hallucination risk. Read the file first.
- **"The README says it works this way"** — README content is `trust: file`; cite the README in the same trace via Read.
- **"Plan says we use JWT"** — plan content is `trust: plan` and grounded by definition. But specific function names mentioned in claims about *implementation* still need file_read backing.

---

## Confidence + thresholds

The grounding check itself is binary (grounded or not). Tools layered on top of it can use it as a confidence signal:

- failure-classifier may down-rank F2/F3 confidence if recent claims were ungrounded
- replanner refuses to act on proposals containing ≥3 ungrounded claims in the trace tail

---

## Tie-Ins

- **Skill:** `reasoning-trace-recorder` — produces the events this rule evaluates
- **Hook:** `tool-call-tracer` — emits `file_read` events with sha256
- **Command:** `/archon-os:trace` — surfaces ungrounded claims
- **Rule:** `rules/core/no-assumption.md` — same spirit; ask when uncertain
- **Rule:** `rules/core/verification.md` — verify before claiming success
- **Spec:** `docs/specs/ARCHON_V3.7.0_TECH_SPEC.md` §11.1
