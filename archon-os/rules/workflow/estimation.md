> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Estimation Guide

Estimate tasks using story points, time, and risk assessment.

---

## Story Points (Fibonacci)

```toon
story_points[7]{points,complexity,example}:
  1,Trivial,Typo fix / config change
  2,Simple,Single function / minor UI tweak
  3,Small,New component / API endpoint
  5,Medium,Feature with multiple files / integration
  8,Large,Cross-cutting feature / refactor
  13,Very Large,New module / architecture change
  21,Epic,Major feature / needs breakdown
```

**Rule:** If >13, break into smaller tasks.

---

## Time Estimates

```toon
time_estimates[7]{points,solo_dev,with_review}:
  1,1-2 hours,2-4 hours
  2,2-4 hours,4-6 hours
  3,4-8 hours,1 day
  5,1-2 days,2-3 days
  8,2-4 days,3-5 days
  13,1 week,1-2 weeks
  21,2+ weeks,Break down first
```

**Includes:** Development + testing + code review

---

## Risk Assessment

### Risk Levels

```toon
risk_levels[4]{level,impact,probability,action}:
  🟢 Low,Minor,Unlikely,Proceed
  🟡 Medium,Moderate,Possible,Monitor
  🟠 High,Significant,Likely,Mitigate
  🔴 Critical,Severe,Expected,Block until resolved
```

### Common Risks

```toon
common_risks[6]{risk,indicators,mitigation}:
  Technical,New tech / complex logic,Spike/POC first
  Scope creep,Vague requirements,Clarify before start
  Dependencies,External APIs / other teams,Identify early / mock
  Breaking changes,Shared code / public API,Feature flag / versioning
  Performance,Large data / real-time,Load test early
  Security,Auth / user data / payments,Security review
```

---

## Quick Estimation Template

```markdown
## Estimate: [Task Name]

**Story Points:** [1/2/3/5/8/13]
**Time:** [X hours/days]
**Confidence:** [High/Medium/Low]

### Risks
| Risk | Level | Mitigation |
|------|-------|------------|
| [Risk 1] | 🟡 | [Action] |

### Assumptions
- [Assumption 1]
- [Assumption 2]
```

---

## Estimation Factors

Weight these when estimating:

```toon
estimation_factors[4]{factor,weight,questions}:
  Scope,40%,How many files? Clear requirements?
  Complexity,30%,New patterns? Edge cases?
  Uncertainty,20%,Familiar tech? Known unknowns?
  Risk,10%,What can break? Dependencies?
```

---

## Anti-Patterns

❌ **Avoid:**
- Padding estimates "just in case"
- Estimating without understanding scope
- Ignoring testing/review time
- >13 points without breakdown
- 0% confidence estimates

✅ **Do:**
- Ask clarifying questions first
- Include all phases (dev + test + review)
- Flag high-risk items explicitly
- Break large tasks into 3-5 point chunks
- Re-estimate when scope changes

---

