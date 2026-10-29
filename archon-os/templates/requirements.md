# Requirements — [Feature name]

**Status:** ideation | discussion | published | committed | abandoned
**Owner:** [who is accountable] · **Date:** YYYY-MM-DD · **Ticket:** [JIRA-…]
**Read by:** [who reads this, to make what decision]

---

## Problem

What is wrong/missing today, measured how? **No solutions yet.**

## Non-goals

Deliberately NOT doing: …

## What success looks like

**Measurable** criteria, with the measurement method. If no real number exists yet, write
`[UNVERIFIED] — will measure via …`; do not invent thresholds.

---

## Requirements

<!--
Each requirement carries the minimal attribute set (INCOSE GtWR v4, A1–A49, the `*`-marked subset).
This is the trace hook: requirement → design → test.
-->

### REQ-001 — [name]

> **Statement:** [Subject] **shall** [action] [condition] [measurable constraint].

| Attribute | Value |
|---|---|
| Rationale | *why this is needed — without this cell, C1 Necessary cannot be checked* |
| Trace to Parent | REQ-… or the originating need |
| Trace to Source | who/which document asked for it |
| Verification Method | test / analysis / inspection / demo |
| Verification Success Criteria | **exactly what happening counts as pass** |
| Owner | |
| Priority · Criticality · Risk | |

---

## Quality gate — GtWR v4 (INCOSE, guidance)

Check **each** requirement (C1–C9):

| | Pass? |
|---|---|
| C1 Necessary — would anything be lost if removed | ☐ |
| C2 Appropriate — right level of abstraction | ☐ |
| C3 Unambiguous — only one possible reading | ☐ |
| C4 Complete — no follow-up questions needed to understand it | ☐ |
| C5 Singular — exactly **one** obligation | ☐ |
| C6 Feasible — achievable within real constraints | ☐ |
| C7 Verifiable — **there is a way to prove it is met** | ☐ |
| C8 Correct — describes the actual need | ☐ |
| C9 Conforming — follows the agreed sentence pattern | ☐ |

Check the **whole set** (C10–C15):

| | Pass? |
|---|---|
| C10 Complete — set covers everything, no missing area | ☐ |
| C11 Consistent — no internal contradictions | ☐ |
| C12 Feasible — achievable **taken together** | ☐ |
| C13 Comprehensible — the set still reads as a whole | ☐ |
| C14 Able to be validated — provably the right thing | ☐ |
| C15 Correct | ☐ |

### Machine-checkable lint (subset of R1–R42)

- **R7** — ban vague terms: *some, any, several, many, about, approximate*
- **R8** — ban escape clauses: *as appropriate, as required, to the extent practical, if practicable*
- **R18–R23** — one `shall` per sentence; warn on `and`/`or` joining two obligations
- **R32** — `all/every/none` must come with a defined scope
- **R33–R35** — numbers must carry units and tolerance
- **R36–R40** — one concept, one term, throughout

> ⚠️ Only ~10–12 of the 42 rules are machine-checkable. INCOSE §1.8 says outright that NLP/AI tools
> *"do not address all the rules"* and that validation *"cannot be done without the project team
> doing the analysis manually."* **Do not advertise "42 automated checks".**

---

## Traceability

29148 §3.1.23 defines traceability as *"the derivation path (upward) and allocation/flow-down path
(downward)"*, using parent/child terminology. **The standard does NOT use the word "bidirectional"**
— quote it as up/down, exactly.

| Requirement | Parent | Design | Test |
|---|---|---|---|
| REQ-001 | | | |

---

## Assumptions · Constraints · Dependencies

For each item, state **what breaks if it is wrong**. An assumption with no consequence is not worth
writing down.

---

### Sources
**ISO/IEC/IEEE 29148:2018** — the normative standard in force (superseded IEEE 830-1998 via the 2011
edition; the 2011 edition also superseded IEEE 1233 and 1362). Separates characteristics of an
individual requirement (§5.2.5) from characteristics of the **set** (§5.2.6), plus language criteria
(§5.2.7) and attributes (§5.2.8). *Clause content is paywalled — don't cite clause names as if read
from the standard.*
**INCOSE GtWR v4** (INCOSE-TP-2010-006-04, 2023) — **society guidance, not a standard**; free; the
source of C1–C15, R1–R42 and A1–A49 above.

**Evidence level: [CONVENTION].** No study demonstrates that requirements written to C1–C15 have
fewer defects.
