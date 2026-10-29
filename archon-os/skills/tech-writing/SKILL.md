---
name: tech-writing
description: "Write professional technical documents — requirements/PRD, tech spec/design doc, low-level design, decision records, and trade-off analysis — at a formality tier matched to the task. Grounds every claim in real code or a cited source, marks what it could not verify, and refuses to pad. Use when asked to write/update a spec, requirements, design doc, LLD, ADR, RFC, or technical analysis."
autoInvoke: true
priority: high
triggers:
  - "write a spec"
  - "tech spec"
  - "design doc"
  - "requirements"
  - "PRD"
  - "low-level design"
  - "LLD"
  - "ADR"
  - "RFC"
  - "technical analysis"
  - "trade-off"
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, WebFetch
effort: high
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.

# Technical Writing

Produce documents a reviewer can **act on and argue with** — not filled-in templates.

> **Evidence policy for this skill itself.** Almost everything below is **CONVENTION** with an
> authoritative primary source, NOT measured efficacy. No study shows these structures produce better
> outcomes. The three places carrying real measurement are marked **[MEASURED]**. Never present
> convention as research-backed — that is the first thing this skill exists to stop.

---

## Step 0 — Refuse to write blind

Run `rules/core/prompt-validation.md` (6-dimension gate) BEFORE writing. Below threshold → ask the
1–2 weakest dimensions, do not guess. A doc written from guesses is worse than no doc: it looks
authoritative and is wrong.

Then answer three questions **in the output header**, so the reader sees the frame:

```toon
frame[3]{question,why}:
  Who reads this and what decision do they make with it?,"No audience ⇒ no way to judge detail level"
  What is ALREADY true (code/system) vs PROPOSED?,"The #1 source of misleading specs"
  What would make this document WRONG?,"If nothing could, it is asserting nothing"
```

---

## Step 1 — Pick the tier. Default DOWN.

Tier follows `agent-detector` complexity. **Do not scale formality with the effort you spent.**

```toon
tiers[4]{tier,complexity,doc,gate}:
  T0,Quick,"Y-statement (1 sentence) or a PR-description paragraph","Reversible? cheap to undo? stop here"
  T1,Standard,"Nygard ADR (5 sections) OR a one-page spec","Long-lived consequence but one obvious option"
  T2,Deep,"MADR + LLD sections that apply","≥2 options genuinely worth comparing"
  T3,Project,"RFC: guide-level + reference-level split","Crosses teams / hard to reverse"
```

**Escalate a tier when** ≥2 hold: multiple teams affected · hard to reverse · ≥2 credible options ·
safety/money/data-loss exposure · the reader will not be in the room to ask you.
**Never escalate** because the topic feels important.

Templates: `templates/decision-record.md` (all 4 tiers in one file — delete unused tiers),
`templates/requirements.md`, `templates/tech-spec-toon.md`, `templates/lld.md`.

### State, not polish

Stamp every document with a state from Oxide's RFD lifecycle — there is deliberately **no `draft`**:

`ideation → discussion → published → committed → abandoned`

`committed` = "this describes the system as it RUNS, not a future intention". Shipping an honestly
labelled `ideation` doc beats withholding until polished (norm inherited from IETF RFC 3, 1969:
*"Notes are encouraged to be timely rather than polished."*).

---

## Step 2 — Ground before drafting (NOT after)

**Order is load-bearing.** Extract evidence first, then write. Never draft then hunt for support.

1. **Quote first.** For any source >20k tokens, extract **word-for-word quotes** BEFORE analysing.
   Anthropic guidance, verbatim: *"ask Claude to extract word-for-word quotes first before performing
   its task. This grounds its responses in the actual text."*
2. **Every claim about this codebase needs a prior `Read`.** Per `rules/core/grounding-discipline.md`,
   a claim is grounded only if a preceding `file_read` covers the file/function/symbol it names.
   This is a deterministic check — no LLM judgement, no cost. It is the strongest tool available here.
3. **Cite inline** as `path/to/file.ts:120-134`, never "the auth module handles this".
4. **Retract what you cannot support.** After drafting, for each claim find a supporting quote; if
   none exists, **delete the claim and mark the hole** — do not soften it into vagueness.
5. **"I don't know" is a valid output.** Say *"Not verified: <what, and what would verify it>"*.
   Vendor guidance is explicit that permitting uncertainty *"can drastically reduce false information."*

Mark every non-obvious claim with its evidence level:

```toon
evidence[4]{tag,meaning}:
  [CODE],"Read in this session — cite file:line"
  [SOURCE],"External source — cite URL + verbatim quote"
  [CONVENTION],"Standard/common practice — name the standard; NOT proof it works"
  [UNVERIFIED],"Believed but not checked — say what would check it"
```

---

## Step 3 — Verify with an INDEPENDENT pass, never self-critique in place

**[MEASURED] — this is the one place with hard numbers, and they say the intuitive approach backfires.**

Intrinsic self-correction (re-read your own draft and fix it, no external input) **degrades** output.
Huang et al., *LLMs Cannot Self-Correct Reasoning Yet*, **ICLR 2024** (arXiv 2310.01798, Table 3):

| Model · benchmark | initial | round 1 | round 2 |
|---|---|---|---|
| GPT-4 · GSM8K | 95.5 | 91.5 | 89.0 |
| GPT-3.5 · CommonSenseQA | 75.8 | 38.1 | 41.8 |

The reported gains in earlier self-correction work came from **oracle labels**; *"the improvements
vanish when oracle labels are not available."* Multi-agent debate does **not** rescue it — at matched
budget it loses to plain self-consistency (GSM8K: debate 83.2 @6 responses vs self-consistency 85.3
@6; 83.0 @9 vs 88.2 @9, Table 7).

**Therefore: never grade your own draft in the draft's context.** Do this instead:

1. Draft.
2. Plan verification questions against the draft.
3. **Answer each question independently — fresh context, without the draft visible.** This is the
   load-bearing detail of Chain-of-Verification (Dhuliawala et al., arXiv 2309.11495): *"answers
   those questions independently so the answers are not biased by other responses."* Verify inside
   the draft's context and the effect is lost.
4. Revise against the answers.

Use the `chain-of-verification` skill for this loop. **Prefer an EXTERNAL verifier wherever one
exists** — run the test, execute the snippet, `curl` the endpoint, read the migration. A tool result
beats any amount of model deliberation.

> **Limit, stated by the vendor:** *"while these techniques significantly reduce hallucinations, they
> don't eliminate them entirely. Always validate critical information."* Do not promise a clean doc.

---

## Step 4 — Requirements: use the C/R/A triad

**ISO/IEC/IEEE 29148:2018** is the normative standard (active; superseded IEEE 830-1998 via the 2011
edition, which also replaced IEEE 1233 and IEEE 1362). It separates characteristics of an individual
requirement (§5.2.5) from characteristics of a **set** (§5.2.6), plus language criteria (§5.2.7) and
attributes (§5.2.8). The clause text is paywalled — do not quote names as if read from it.

**INCOSE GtWR v4** (INCOSE-TP-2010-006-04, 2023) is society **guidance**, not a standard, and is
free. Use it as the working rubric:

```toon
individual[9]{id,characteristic}:
  C1,Necessary
  C2,Appropriate
  C3,Unambiguous
  C4,Complete
  C5,Singular
  C6,Feasible
  C7,Verifiable
  C8,Correct
  C9,Conforming
```

```toon
set[6]{id,characteristic}:
  C10,Complete
  C11,Consistent
  C12,Feasible
  C13,Comprehensible
  C14,Able to be validated
  C15,Correct
```

*(Complete/Feasible/Correct deliberately appear in both lists — they mean different things about one
requirement vs about the set.)*

**Lintable subset of R1–R42.** GtWR has 42 rules in 14 quality-focus groups, but INCOSE §1.8 states
NLP/AI tools *"do not address all the rules"* and validation *"cannot be done without the project
team doing the analysis manually."* **Never advertise "42 automated checks."** Mechanically checkable:

```toon
lint[6]{rule,check}:
  R7,"Ban vague terms: some / any / several / many / about / approximate"
  R8,"Ban escape clauses: as appropriate / as required / to the extent practical / if practicable"
  R18-R23,"Singularity — one 'shall' per statement; flag 'and'/'or' joining obligations"
  R32,"Quantifiers — flag all/every/none without a defined scope"
  R33-R35,"Tolerance/quantification — flag a number with no unit or no tolerance"
  R36-R40,"Uniformity — same term for same concept throughout"
```

Everything else needs human/LLM judgement. Say so.

**Attributes per requirement** — GtWR A1–A49 recommended minimum (marked `*` in the source). This is
the traceability schema; put it in front-matter:

`Rationale · Trace to Parent · Trace to Source · Verification Success Criteria · Verification
Strategy · Verification Method · Unique ID · Owner · Priority · Criticality · Risk`

**Traceability wording.** 29148 §3.1.23 defines it as *"the derivation path (upward) and
allocation/flow-down path (downward)"* with parent/child terminology. **The standard does not use the
word "bidirectional"** — quote the upward/downward wording instead.

---

## Step 5 — LLD: there is no standard. Say so, then use the menu.

**Do not claim LLD has a canonical form.** IEEE Std 1016-2009 states outright: *"The demarcation
between architecture, high-level and detailed design varies from system to system and is beyond the
scope of this standard."* Its only template (Annex C) is **informative** and organised by
viewpoint/view pairs, not by the familiar section list.

The nearest authority is IEEE 1016-2009's **twelve design viewpoints**, whose use IS normative where
applicable — §5.1: *"A design viewpoint defined in this clause shall be used in the SDD whenever
applicable to the design subject."* Treat it as a **menu, not a checklist**:

`Context · Composition · Logical · Dependency · Information · Patterns · Interface · Structure ·
Interaction · State dynamics · Algorithm · Resources`

```toon
folklore[10]{section,backing}:
  Data model,"[CONVENTION] IEEE 1016 Information viewpoint 5.6 · NASA data structures · DoD DID"
  API contract / interfaces,"[CONVENTION] IEEE 1016 Interface 5.8 · ECSS 5.5 · DoD 4.3"
  Sequence diagram,"[CONVENTION] IEEE 1016 Interaction 5.10 · ECSS 4.2 dynamic architecture"
  State diagram,"[CONVENTION] IEEE 1016 State dynamics 5.11 · ECSS 4.3 behaviour"
  Error handling,"[CONVENTION] DoD DI-IPSC-81435A 4.2 + 5.x(f)(5) exception and error handling"
  Concurrency,"[CONVENTION] DoD DID 4.2 concurrent execution · IEEE 1016 Resources 5.13"
  Capacity planning,"[CONVENTION] NASA NPR 7150.2 hardware utilization · DoD DID 4.1"
  Idempotency,"[UNVERIFIED] NO primary-standard backing found — include only if the system needs it"
  Observability,"[UNVERIFIED] NO primary-standard backing found — include only if the system needs it"
  Migration / rollback,"[UNVERIFIED] NO primary-standard backing found — include only if the system needs it"
```

The last three are good engineering and belong in most real designs — just never cite a standard for
them, and never add a section the system does not actually need.

**Stopping criterion** — the only operational one found, from ECSS-E-ST-40C Rev.1 (normative, free):
refine *"into lower levels containing software units that can be coded, compiled, and tested"*, and
specify interfaces precisely enough *"to allow coding without requiring further information."*
Depth is set by **codeability and testability**, not by page count. Past that point the code is the
source of truth and more LLD is waste.

**HLD/LLD are not separate artifacts** in any standard checked — ECSS, DoD DI-IPSC-81435A and NASA
NPR 7150.2 all put architectural AND detailed design in ONE document, split by review milestone
(PDR vs CDR), not by document. Default to one design doc with sections.

> **Domain caveat:** ECSS, DoD and NASA are safety-critical / defence-acquisition regimes. Borrowing
> their structure is **analogy, not compliance**. Never imply a project must satisfy them.

---

## Step 6 — Anti-slop gate. Cut before shipping.

Delete anything matching these. A shorter honest document beats a complete-looking empty one.

```toon
cut[8]{smell,fix}:
  "Section with no content specific to THIS system","Delete the section, not fill it"
  "'robust/scalable/seamless/best-practice' with no number or mechanism","Name the mechanism or cut"
  "Restating the template's own prompt text","Delete"
  "A requirement nobody can test","Add Verification Success Criteria or drop it (C7)"
  "Alternatives listed but never compared","Compare on the stated drivers, or drop to a lower tier"
  "Risk table where every risk is MEDIUM/MEDIUM","Real exposure or delete the table"
  "Numbers with no source (200ms, 1000 users)","Measure it, cite it, or mark [UNVERIFIED]"
  "A diagram restating the text","Delete — a diagram must show what prose cannot"
```

**Mandatory in every doc T1+:**
- **Non-goals** — what this deliberately does NOT do
- **Drawbacks** — *"Why should we NOT do this?"* Empty here destroys the document's credibility
- **Impact of doing nothing** — the cost of standing still
- **Owner + date + state** — an unowned doc is a dead doc

**[MEASURED]** Unowned docs decay by default: Google reported ~90% of GooWiki documents had **no
views or updates** in the months before deprecation, and documentation became the **#1 complaint** on
its internal developer surveys (*Software Engineering at Google*, ch.10). Caveat honestly — these are
self-reported internal figures with no published year, sample size or method, and era-specific to
before docs moved into source control.

**Therefore ship docs INTO the repo beside the code they describe**, with an owner, and change them
in the same commit as the code. Google's six prescriptions — policy, source control, clear ownership,
review on change, tracked issues, periodic evaluation — are **[CONVENTION]**, explicitly not measured;
that chapter concedes freshness/accuracy tooling *"has still not caught up."*

---

## Ordering is NOT settled

Problem-first vs decision-first vs Amazon narrative: **no evidence survived in either direction**
across two research passes. Follow the house style if one exists; otherwise problem-first is a
defensible default. **Do not claim a standard requires an ordering** — the belief that the Rust RFC
template mandates problem-first was checked and did not hold up.

## Do NOT encode these — checked and refuted

```toon
refuted[4]{belief,status}:
  "Google mandates a template-driven design-doc gate before major projects","Refuted 0-3"
  "ISO/IEC/IEEE 42010 requires recording rationale for rejected alternatives","Refuted 0-3 — that convention is ADR/MADR/Rust RFC"
  "The Rust RFC template mandates problem-first ordering","Refuted 1-2"
  "adr.github.io names exactly four canonical ADR families","Refuted 0-3"
```

## Still unverified — do not cite as fact

LLM-as-judge reliability figures (Cohen's κ gaps, position-bias numbers) and ALCE citation-quality
numbers were **never verified** across two research passes. Do not quote them. No benchmark for
AI-generated **technical documentation** quality was established to exist — the honest statement is
*"not established"*, not *"does not exist"*.

## Related

`rules/core/grounding-discipline.md` · `rules/core/prompt-validation.md` · `rules/core/verification.md`
· `skills/chain-of-verification` · `rules/workflow/workflow-deliverables.md` · `skills/documentation`
(runbooks) · `templates/decision-record.md`
