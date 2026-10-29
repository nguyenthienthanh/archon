# Design — [System / feature name]

**Status:** ideation | discussion | published | committed | abandoned
**Owner:** [who keeps this updated] · **Date:** YYYY-MM-DD
**Read by:** [who reads this, to make what decision]

<!--
❗ READ BEFORE FILLING IN

1. THERE IS NO STANDARD FOR "LLD". IEEE Std 1016-2009 says it outright: "The demarcation between
   architecture, high-level and detailed design varies from system to system and is beyond the
   scope of this standard." Do not tell anyone this document follows some LLD standard.

2. DO NOT SPLIT HLD/LLD INTO 2 FILES. Every standard checked (ECSS-E-ST-40C, DoD DI-IPSC-81435A,
   NASA NPR 7150.2) keeps architectural AND detailed design in the SAME document, split by
   review milestone (PDR/CDR), not by file.

3. THE SECTIONS BELOW ARE A MENU, NOT A CHECKLIST. Delete any section this system doesn't have.
   An empty or filler-filled section damages the document more than its absence.
   IEEE 1016 §5.1: a viewpoint "shall be used ... whenever APPLICABLE to the design subject".

4. WHERE TO STOP (the only checkable criterion found, from ECSS-E-ST-40C Rev.1, normative):
   detail down to where units "can be coded, compiled, and tested", and describe interfaces well
   enough to "allow coding without requiring further information". Beyond that level the CODE is
   the source of truth — more LLD is waste and will drift from the code.
-->

---

## 1. Context — what exists, what is proposed

> Keep **[EXISTING]** and **[PROPOSED]** separate in every statement. Mixing the two is the number
> one source of misreading in design documents. Every claim about current code must cite
> `path/file.ts:120-134`.

## 2. Non-goals

This document **deliberately does not** address: …

## 3. Components & dependencies
*(IEEE 1016 Composition 5.3 · Dependency 5.5)*

## 4. Data model
*(Information viewpoint 5.6)* — schema, constraints, indexes, expected data volumes.

## 5. Interface / API contract
*(Interface viewpoint 5.8)* — for each interface: type, format, units, value range, precision,
timing/volume/ordering constraints, error handling and recovery, synchronization.
**Sufficiency test:** someone else can code against it without asking follow-up questions.

## 6. Flows & state
*(Interaction 5.10 · State dynamics 5.11)* — sequences for the main paths; a state machine if
explicit states exist. **A diagram may only exist if it shows something prose cannot express.**

## 7. Error handling
For each failure mode: detected by what → response → who gets notified → how it recovers.
Include **silent** failures (empty result, exit 0 doing nothing) — not just exceptions.

## 8. Concurrency & contention
What runs in parallel, what resources are shared, how locking works, have deadlock/races been
considered.

## 9. Resources & capacity
*(Resources viewpoint 5.13)* — CPU/RAM/disk/quota/rate limits. **Every number needs a source.**
No measurement yet → write `[UNVERIFIED]` plus how it will be measured; don't invent
"1000 concurrent users".

## 10. Operations *(keep if the system needs it — NO standard mandates this)*
- **Idempotency** — what happens on a double run?
- **Observability** — it breaks at 3 AM; where do you look?
- **Migration / rollback** — how do you roll back, and what happens to data already written?

> These three sections have **no published standard behind them** — they are good engineering, not
> compliance requirements. Keep them because the system needs them, not because the template has
> them.

## 11. Traceability: requirement → design → test

| Requirement | Component | Test |
|---|---|---|
| REQ-001 | `src/…` | `…test.ts::…` |

*(ECSS mandates a forward + backward trace matrix in the design document; that convention is
borrowed from aerospace — **an analogy, not a compliance requirement** for ordinary projects.)*

## 12. Risks & open questions
Risks must state **real exposure**. A table where every row reads MEDIUM/MEDIUM should be deleted.

---

### Sources
IEEE Std 1016-2009 (12 design viewpoints; demarcation out of scope) · ECSS-E-ST-40C Rev.1 Annex F
(SDD DRD, normative, freely downloadable; stopping criterion at 5.5.2) · DoD DI-IPSC-81435A ·
NASA NPR 7150.2 SWE-111.

**Evidence level: [CONVENTION].** No study demonstrates this structure yields better designs.
ECSS/DoD/NASA belong to safety-of-life and defense-procurement domains — borrowing their structure
is **analogy, not compliance**.
