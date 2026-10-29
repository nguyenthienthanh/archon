---
name: chain-of-verification
description: "Draft → generate verification questions → answer independently via tools → revise. Catches hallucinated facts in reports and reviews. MANDATORY for Phase 4 security/test claims. Paper: Dhuliawala et al. 2023."
when_to_use: "phase 4 review, security audit conclusions, test coverage claims, documentation with specific file or line references, reason: cove, before approval gate"
allowed-tools: Read, Grep, Glob, Bash
effort: high
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Chain-of-Verification

Catch hallucinations by forcing the model to verify its own claims via tools.

**Governed by:** `rules/workflow/chain-of-verification.md` (when / why — MANDATORY in Phase 4)

---

## When NOT to Use

- Simple file-list reports with no factual claims
- Quick fixes that don't produce any claim
- User uses `just do:` (but still verify destructive claims)
- Already ran CoVe on this exact content (cache in memory)

---

## The 4-Step Protocol

### Step 1 — Draft

Generate the answer/report as normal. Do NOT optimize for correctness yet.

### Step 2 — Plan verifications

List **3–5 focused questions** that would disprove the draft. Each question must be:
- **Answerable via tool** (Read/Bash/Grep/Glob) — not from memory
- **Independent** — doesn't assume the draft is correct
- **Specific** — targets a concrete claim, not a vibe

### Step 3 — Execute verifications

For each question, run the tool and record the **actual result**. Don't reason about what "should" be — record what IS.

### Step 4 — Revise

Compare each claim in the draft against verification results:
- Claim verified → keep
- Claim contradicted → fix
- Claim unverifiable → soften ("appears to…" or remove)

---

## Example — Phase 4 Security Review

### Draft

```
Security review of /api/users endpoint:
- ✓ No SQL injection risks (uses parameterized queries)
- ✓ Rate-limited at 100 req/min
- ✓ Input validated before DB write
- ⚠ Password comparison timing-safe
```

### Plan Verifications

```
Q1: Does src/api/users/route.ts use parameterized queries?
    → grep "raw\|concat" src/api/users/

Q2: Is there a rate-limit middleware on /api/users?
    → grep "rateLimit\|rate-limiter" src/api/users/ src/middleware/

Q3: Is input validated before any DB call?
    → Read src/api/users/route.ts — check order of validation vs DB call

Q4: Does password comparison use timing-safe function?
    → grep "timingSafeEqual\|bcrypt.compare" src/

Q5: What's the actual rate limit value?
    → grep -A 3 "rateLimit" src/middleware/
```

### Execute

```
Q1 result: 0 matches for raw/concat SQL in users/. Uses Prisma ORM.
           → CLAIM VERIFIED

Q2 result: Found src/middleware/rate-limit.ts, applied to /api/*
           → CLAIM VERIFIED

Q3 result: Read route.ts line 12-18: Zod schema parses BEFORE prisma.user.create
           → CLAIM VERIFIED

Q4 result: Found bcrypt.compare in auth service
           → CLAIM VERIFIED (bcrypt.compare is timing-safe by design)

Q5 result: Rate limit = 60 req/min, NOT 100 as draft claimed
           → CLAIM CONTRADICTED
```

### Revise

```
Security review of /api/users endpoint:
- ✓ No SQL injection risks (Prisma ORM, 0 raw queries) — VERIFIED
- ✓ Rate-limited at 60 req/min (not 100 as initially drafted) — CORRECTED
- ✓ Input validated via Zod before DB write — VERIFIED
- ✓ Password comparison timing-safe (bcrypt.compare) — VERIFIED
```

---

## Common Claim Types That Need CoVe

| Claim pattern | Verification |
|---------------|--------------|
| "X tests pass" | Run the tests, count actual pass/fail |
| "Coverage Y%" | Run coverage tool, read actual number |
| "No security issues" | Grep for known anti-patterns, read flagged files |
| "Function foo exists in bar.ts" | Glob/Read to confirm |
| "API returns 200 for valid input" | Run the request or Read the handler |
| "Tests take X seconds" | Actually run and time them |
| "File has N lines" | `wc -l` on the file |
| "This change broke nothing" | Run full test suite |

---

## Anti-Patterns

- **Verification from memory** — "I think Prisma uses parameterized queries, so ✓" — NO. Run the grep.
- **Leading questions** — "Is the code secure?" — too vague. "Does `src/api/users/route.ts` use raw SQL?" — specific.
- **Skipping when tired** — CoVe is most important when model is confident. Run it.
- **Too many questions** — 10+ questions becomes its own source of drift. Cap at 5.
- **Revising in place without noting changes** — always flag what was corrected so user sees the catch.

---

## Tie-Ins

- `rules/workflow/chain-of-verification.md` — policy (MANDATORY for Phase 4)
- `rules/core/verification.md` — the general principle CoVe implements concretely
- `rules/core/no-assumption.md` — CoVe is what "never assume" looks like post-draft
- `skills/code-reviewer/SKILL.md` — applies CoVe to factual claims in review output; per-finding evidence/scenario/refute check
- `skills/bugfix-quick/SKILL.md` — verification step in root-cause diagnosis (debugging merged into bugfix-quick in v3.5)
