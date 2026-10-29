# Confluence Page Template

**Wiki-markup format, paste straight into Confluence.** This is the HUMAN-readable version — the
AI-readable one is `TECH_SPEC.md` (TOON). The two must tell the same truth; divergence is a bug.

<!--
FILL-IN RULES:
- Delete every section that doesn't apply. An empty section is worse than a missing one.
- Every claim about code must cite `path/file.ts:120-134`. Can't cite it ⇒ delete it.
- Every number needs a source. Can't measure it ⇒ write [UNVERIFIED] + how it will be measured. DO NOT invent.
- Keep [EXISTING] and [PROPOSED] clearly separated.
-->

---

h1. [Feature name]

*Ticket:* [JIRA-…] | *Date:* [YYYY-MM-DD] | *Owner:* [name] | *Status:* ideation / discussion / published / committed / abandoned

{info}
*Read by:* [who reads this, to make what decision]
*Status* follows Oxide's RFD lifecycle — _committed_ means this page describes the RUNNING system,
not an intention. There is no _draft_ state: publish early with an honest label rather than hold
back for perfection.
{info}

----

h2. Problem

What is wrong/missing today, measured how. *No solutions yet.*

h2. Non-goals

Deliberately NOT doing: …

h2. Decision

We will … *(active voice, decisive)*

h3. Considered options

|| Option || Pros || Cons || Why chosen / rejected ||
| A | | | |
| B | | | |
| Do nothing | | | |

{warning}
*Why should we NOT do this?* — Leaving this empty costs the document its credibility. Name real
drawbacks.
{warning}

----

h2. Design

Architecture, components, data flow. A diagram may *only* exist if it shows something prose cannot
express — a diagram restating the paragraph above it gets deleted.

h3. Interface / API

For each interface: type, format, units, value range, timing constraints, error handling.
*Sufficiency test:* someone else can code against it without asking follow-up questions.

h3. Failure modes

|| How it fails || Detected by || Response || Who gets notified ||
| | | | |

Remember *silent* failures — exit 0 doing nothing, empty payloads — not just exceptions.

----

h2. Success criteria

Measurable, with the measurement method. Not measured yet → `[UNVERIFIED] — will measure via …`

h2. Test results

|| Metric || Value || Source ||
| | | |

{note}
Only fill in numbers that ACTUALLY RAN. A test table full of ✅ nobody ran is the fastest way to
make a document worthless.
{note}

----

h2. Risks

|| Risk || Real exposure || Mitigation ||
| | | |

Every row reads MEDIUM/MEDIUM ⇒ delete the whole table, it says nothing.

h2. Open questions

What is deliberately left open, where and when it gets settled.

----

_Generated with [Archon OS|https://github.com/nguyenthienthanh/archon] · Updated: [YYYY-MM-DD]_
