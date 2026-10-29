# Decision Record — DR-NNN: [Title in assertive form, e.g. "Use Postgres over Mongo for the order store"]

<!--
4-TIER LADDER — pick the tier that matches the decision's size; do NOT default to the top tier.
What separates the tiers is the DEPTH OF ALTERNATIVES ANALYSIS, not length.

  Tier 1 · Y-statement     1 sentence.   Small decision, cheap to reverse.
  Tier 2 · ADR (Nygard)    5 sections.   Long-lived consequences, but the option is obvious.
  Tier 3 · MADR            + comparison. There are ≥2 genuinely viable options.
  Tier 4 · RFC             2 layers.     Affects multiple teams / hard to reverse.

Delete the unused tiers. Keep the `Status` block at every tier.
-->

**Status:** ideation | discussion | published | committed | abandoned
<!-- From Oxide's RFD lifecycle. `committed` = this document describes the RUNNING system,
     no longer an idea. The founding norm (IETF RFC 3, 1969): "timely rather than polished" —
     publish early with an honest status label; don't wait for perfect. -->
**Date:** YYYY-MM-DD · **Owner:** [name of the person who keeps this updated]

---

## Tier 1 — Y-statement (1 sentence)

In the context of **[use case / user story]**,
facing **[concern / constraint]**,
we chose **[option]**
to achieve **[quality attribute]**,
accepting **[trade-off]**.

> ⚠️ The "accepting" slot is mandatory, but filling it ≠ having actually weighed it.
> If you cannot name a SPECIFIC trade-off, the decision isn't ripe — move up to Tier 3.

---

## Tier 2 — ADR (Nygard, 5 sections)

### Context
What forces are pulling against each other? Describe the situation, **no solutions yet**.

### Decision
We will… *(active voice, decisive)*

### Consequences
What becomes easier, what becomes harder **after** this decision — both good and bad.

---

## Tier 3 — MADR (adds options comparison)

### Decision drivers
- [Driver 1 — e.g. operational constraint, cost, team skills]

### Considered options
1. **[Option A]**
2. **[Option B]**
3. **[Do nothing]** ← always list it, to expose the cost of standing still

### Pros / cons per option
**[Option A]**
- 👍 …
- 👎 …

### Outcome
Chose **[option]**, because [reason anchored to the drivers above].

**Confirmation:** how will we KNOW this decision is being followed in practice?
*(test, lint rule, review checklist, runtime warning — name the concrete mechanism, not "we'll
review carefully")*

**Decided by:** … · **Consulted:** … · **Informed:** …

---

## Tier 4 — RFC (two layers, after the Rust RFC template)

### Summary
One paragraph.

### Motivation
What problem is this solving? What is the expected outcome?

### Guide-level explanation
Present it as if the thing ALREADY exists and you are teaching a colleague to use it.
Introduce new concepts, explain mostly **by example**, and include sample error messages /
deprecation warnings / migration guidance where relevant.

### Reference-level explanation
The technical part. Detailed enough that: its interaction with other components is clear, the
implementation approach is clear, and **corner cases are dissected by example** — returning to the
very examples from the layer above.

### Drawbacks
**Why should we NOT do this?** *(Leaving this empty = the document loses credibility.)*

### Rationale and alternatives
Why is this design the best in the space of possible designs? Which other designs were considered
and why were they rejected? **What is the impact of not doing this at all?**

### Prior art
How have other languages / frameworks / systems solved this? *("None found" is an acceptable
answer — but say explicitly that you looked.)*

### Unresolved questions
What is deliberately left open, and where and when it will be settled.

---

## Sources of this template

| Tier | Source | Notes |
|---|---|---|
| Y-statement | Olaf Zimmermann | 5 slots; cited in the MADR paper (CEUR-WS Vol-2072) |
| ADR | Michael Nygard, 2011 | Original order: Title, Context, Decision, Status, Consequences. **The original has NO alternatives section** |
| MADR | github.com/adr/madr | Even the *minimal* variant keeps Considered Options. v3.0.0 renamed to "Markdown Any Decision Records" |
| RFC | rust-lang/rfcs `0000-template.md` | Drawbacks / Rationale-and-alternatives / Prior-art are social conventions — **no machine blocks a PR missing them** |
| Status | Oxide RFD 1 + IETF RFC 3 (1969) | 6 states, no "draft" state |

> **Evidence level:** this is **industry convention with primary sources**, not the result of a
> controlled study. No research demonstrates this template produces better decisions.
> Argument ordering (problem-first / decision-first / narrative) currently has **no evidence**
> either way — pick a house style.
