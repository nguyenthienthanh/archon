---
name: deep-debugging
description: "Systematic debugging protocol for bugs that resist quick fixes. Use bisection, hypothesis trees, and scientific method when a bug isn't obvious from the stack trace. Goes beyond bugfix-quick for production-grade root cause analysis."
when_to_use: "bug not obvious, intermittent failure, production issue, bisect, systematic debugging, hard bug, root cause analysis, deep debug, flaky test, heisenbug, race condition"
allowed-tools: Read, Grep, Glob, Bash
effort: high
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Deep Debugging

For bugs where `bugfix-quick` fails. Apply scientific method, not vibes.

**Escalation path:** `bugfix-quick` (< 15 min, clear cause) → `deep-debugging` (scientific method)
**Uses:** `tree-of-thoughts` skill for hypothesis trees, `chain-of-verification` for claim validation

---

## When to Use vs. bugfix-quick

| Signal | Use |
|--------|-----|
| Stack trace points to clear line | bugfix-quick |
| Reproduces 100% of the time | bugfix-quick |
| Happens in known edge case | bugfix-quick |
| Intermittent / flaky | **deep-debugging** |
| Multiple plausible causes | **deep-debugging** |
| "Works on my machine" class | **deep-debugging** |
| Timing / race conditions | **deep-debugging** |
| Production-only, can't repro locally | **deep-debugging** |

---

## The Protocol

### Step 1 — Reproduce reliably

Cannot debug what you can't reproduce. Goals:

- Minimum reproduction case (strip all non-essential code)
- Document trigger conditions (env, timing, order of operations)
- If intermittent: repeat N times, calculate failure rate

**If can't reproduce: STOP.** You can't debug. Alternative: add observability (logging, metrics, traces) to production to catch the next occurrence. Don't guess.

### Step 2 — Form a hypothesis tree (via tree-of-thoughts)

Don't jump to the first suspicion. Enumerate possibilities:

```
Root: Login fails intermittently in production
├── Branch A: Session store issue
│   ├── A1: Redis connection pool exhausted
│   ├── A2: Cookie domain mismatch
│   └── A3: Session expiry race condition
├── Branch B: Load balancer / infra
│   ├── B1: Sticky session misconfigured
│   └── B2: TLS termination timing
└── Branch C: Auth service
    ├── C1: JWT clock drift
    └── C2: Rate limit hit
```

Score each branch 0-10 on:
- Fits observed symptoms
- Matches recent changes (diff since last known good)
- Matches failure pattern (timing, frequency, environment)

Prune branches below 5/10. Expand survivors.

### Step 3 — Bisect when possible

If bug was introduced recently:

```bash
git bisect start
git bisect bad HEAD
git bisect good <known-good-commit>
git bisect run ./scripts/reproduce-bug.sh  # automated narrowing
```

Bisection narrows to a single commit in O(log n) steps.

If not in git history — **bisect the codebase**:
- Comment out half the suspect module
- Does the bug persist? Narrow to the remaining half.
- Repeat until one file/function isolates it.

### Step 4 — Test hypothesis (one at a time)

For the top-scoring hypothesis:

1. **Predict:** "If A1 is true, then metric X should show pool saturation at failure time"
2. **Observe:** run the experiment or check the metric
3. **Match?**
   - Yes → likely cause, go to Step 5
   - No → prune this hypothesis, move to next

**Anti-pattern:** changing multiple things at once. You won't know which fix worked.

### Step 5 — Verify root cause (via chain-of-verification)

Before claiming the fix:

1. Draft explanation of root cause + fix
2. Generate 3–5 verification questions:
   - "Does the fix change the failure rate from X% to 0%?"
   - "Does removing the fix reintroduce the bug?"
   - "Do similar code paths have the same issue (broader impact)?"
3. Answer each via tool (test, metrics, code search) — not from memory
4. Revise explanation based on actual results

Outcome: high-confidence claim backed by evidence, not "works on my machine."

### Step 6 — Write the regression test

Bug without a regression test = bug that returns. Add a test that:

- Fails on the unfixed code
- Passes on the fixed code
- Documents the exact scenario (comment the *why* — timing, race, input shape)

---

## Anti-Patterns

- **Blame the flake** — "Just retry the test." 80% of flaky tests are real bugs exposing timing issues; investigate instead of masking.
- **Shotgun fixes** — changing 5 things hoping one works. You learn nothing about root cause.
- **Reasoning from stack trace only** — the stack trace shows *where* it crashed, not *why*.
- **Skipping reproduction** — if you can't reproduce, you can't verify the fix. Get reproduction first.
- **No regression test** — fix without test = bug waiting to come back. Always close with a test.

---

## Output Format

```markdown
## Bug: [short description]

**Symptoms:** [what the user observed]
**Reproduction:** [minimum case, N trials, failure rate]
**Root Cause:** [verified explanation]
**Evidence:** [verification questions answered]
**Fix:** [what changed + commit ref]
**Regression Test:** [test file + name]
**Similar Impact:** [other places checked — immune / also vulnerable]
```

---

## Tie-Ins

- `skills/bugfix-quick/SKILL.md` — escalate here if quick path fails
- `skills/tree-of-thoughts/SKILL.md` — hypothesis branching
- `skills/chain-of-verification/SKILL.md` — verify root cause claim
- `rules/core/no-assumption.md` — don't guess at causes
- `rules/core/verification.md` — prove before shipping
- `rules/core/simplicity-over-complexity.md` — once root cause is known, the fix should be minimal — resist the urge to refactor "while we're here"
