> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Chain-of-Verification (CoVe)

**Priority:** CRITICAL
**Applies:** Phase 4 review (security + test claims), before Phase 5 finalize

**Paper:** Dhuliawala et al. 2023 — *Chain-of-Verification Reduces Hallucination in Large Language Models*

---

## Core Principle

**Don't trust a draft answer. Generate verification questions, answer them independently, revise the original.**

Pattern: **Draft → Plan Verifications → Execute Verifications → Final Revised**.

This catches hallucinated API names, wrong line numbers, fabricated test results, unsupported security claims.

---

## When to Apply

| Situation | Apply CoVe? |
|-----------|:----------:|
| Phase 4 review finalizing claims ("0 critical security findings", "94% coverage") | ✓ **MANDATORY** |
| Security audit conclusions | ✓ **MANDATORY** |
| Test execution claims in deliverables | ✓ **MANDATORY** |
| Documentation referencing specific file/line numbers | ✓ |
| Simple deliverable reports (just file list) | ✗ — no factual claims to verify |
| Quick fixes | ✗ unless the fix makes a factual claim |
| User uses force-mode prefix | partial — still verify destructive claims |

**Opt-in trigger:** User adds `reason: cove` / `reason: all` to `/run <task>`.

---

## The 4-Step Protocol

1. **Draft** — generate the answer/report as normal
2. **Plan verifications** — list 3–5 verification questions (focused, answerable, independent of draft)
3. **Execute verifications** — answer each question via tool (Read/Bash/Grep), NOT from draft memory
4. **Revise** — update draft based on verification findings; flag any claim that didn't verify

### Example (Phase 4 security review)

```
Draft: "No SQL injection risks found in /api/users endpoint"

Verifications:
  Q1: Does /api/users use parameterized queries? → grep for prepared statement patterns
  Q2: Are there any string-concat SQL calls? → grep for ` "SELECT " + `
  Q3: Is input sanitized before DB? → Read the actual handler

Execute:
  Q1: ✓ Uses Prisma ORM (parameterized by design)
  Q2: ✓ 0 matches for string-concat SQL
  Q3: ✓ Zod schema validates input before any DB call

Final: "Verified: no SQL injection risks in /api/users (Prisma ORM + Zod input validation)"
```

---

## Why CoVe Matters

Most hallucinations are "plausible-sounding facts the model wasn't actually checking." CoVe forces the model to go back to the source. 2023 paper showed ~30% reduction in factual errors on similar tasks.

**For a TDD plugin, this matters in Phase 4** — where the deliverables make claims ("tests pass", "coverage X%", "0 security findings") that users will trust.

---

## Token Cost

- ~2–3× base Phase 4 cost (6K → 15K typical)
- Far cheaper than the cost of a false claim slipping into production
- Always on for Phase 4 — non-negotiable

---

## Tie-Ins

- `rules/core/verification.md` — CoVe is the **concrete mechanism** for the "verify before claiming done" principle
- `rules/core/no-assumption.md` — CoVe is what "never assume" looks like post-draft
- `rules/workflow/self-consistency.md` — SC picks an answer; CoVe checks its facts. Orthogonal.
- `rules/workflow/tree-of-thoughts.md` — CoVe validates ToT's chosen leaf
- `skills/chain-of-verification/SKILL.md` — concrete playbook
- `skills/code-reviewer/SKILL.md` — applies CoVe to factual claims in review output; per-finding evidence/scenario/refute check
