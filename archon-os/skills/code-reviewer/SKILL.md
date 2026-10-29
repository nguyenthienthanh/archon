---
name: code-reviewer
description: "8-aspect evidence-based code review/audit (security, correctness, compatibility, architecture, error handling, test gaps, type safety, simplicity) built on Google eng-practices, OWASP Top 10:2025, CWE Top 25, SemVer. Every finding needs file:line + a concrete failure scenario. Use when the user asks to review/audit code, check a PR, review before merge, in TDD Phase 4, via /check review or /run review."
autoInvoke: true
priority: high
triggers:
  - "review code"
  - "code review"
  - "audit code"
  - "before merge"
  - "/check review"
allowed-tools: Read, Grep, Glob, Bash
effort: high
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Sources and quotes for every standard below: `references/standards.md`.


# Code Reviewer

Runs in: TDD Phase 4 (reviewer ≠ Phase 3 builder), `/check review [path|PR]`, `/run review <target>`, or on request.

## Bar

Approve when the change **definitely improves code health**, even if not perfect. Technical facts beat opinions; the project's style guide and linters settle style — don't repeat them.

## Process

1. Scope: `git diff --name-only <base>...HEAD` (or the given path/PR). Read diff hunks + immediate callers/callees, not whole files.
2. Size check: >400 changed lines → review in file groups and state which groups were covered. Never claim full coverage you didn't do.
3. Read every changed line. Run the 8 aspects, CRITICAL-priority ones first.
4. Verify each candidate finding (below), drop the unproven, report.

## 8 Aspects

```toon
aspects[8]{aspect,priority,checks}:
  Security,CRITICAL,"OWASP Top 10:2025 (list below) · CWE Top 25 · secrets · untrusted input reaching queries/shell/HTML/paths · authz on every protected action"
  Correctness,CRITICAL,"Does it do what the task intends? Off-by-one, null/empty/boundary input, wrong operator/condition, races and shared state, time zones, partial failure leaving bad state"
  Compatibility,CRITICAL,"No breaking change: public API/CLI/config/schema/file format/defaults/output shape unchanged unless versioned; observable behavior others rely on (Hyrum's law); migration or deprecation path"
  Architecture,HIGH,"Right layer, SRP, coupling, fits existing patterns; reuse over new helper"
  Error Handling,HIGH,"Swallowed errors, empty catch, fail-open on exceptions (OWASP A10), missing cleanup, errors that leak secrets/internals"
  Test Gaps,HIGH,"Changed behavior without a test; missing edge/failure-path test; tests that can't fail"
  Type Safety,MEDIUM,"any/unchecked casts, unhandled null, unvalidated external data"
  Simplicity,MEDIUM,"Over-engineering, speculative code, dead code, unnecessary comments (rules below)"
```

Spend most effort on the three CRITICAL-priority aspects. Priority says where to look; severity (below) comes from impact.

### Security — OWASP Top 10:2025

A01 Broken Access Control · A02 Security Misconfiguration · A03 Software Supply Chain Failures · A04 Cryptographic Failures · A05 Injection · A06 Insecure Design · A07 Authentication Failures · A08 Software or Data Integrity Failures · A09 Security Logging and Alerting Failures · A10 Mishandling of Exceptional Conditions.

AI-generated code fails security checks often (~45% in Veracode's tests) — review it as untrusted, never skim it.

### Compatibility — what counts as breaking

Removing/renaming an exported symbol, flag, env var, config key, route or field · changing a signature, default, return/output format, error type/message users parse, ordering, or file/storage location without migration · tightening accepted input. If breaking is intended: SemVer MAJOR + migration note, or keep the old path working with a deprecation.

### Simplicity — KISS, zero over-engineering

Flag (Google's definition): code **more generic than needed** or **functionality not needed now**. Signals: single-use abstraction/interface/factory, config or params nothing varies, speculative hooks "for later", wrappers that only forward, new dependency for a few lines, deep nesting (nesting raises cognitive complexity), dead or commented-out code.

Comments explain **why**, never **what**. Flag comments that restate the code, narrate changes ("added X", "fixed bug"), or are stale; never ask for comments on self-explanatory code. Rule: `rules/workflow/smart-commenting.md`.

## Verify before reporting

LLM reviewers produce many plausible-but-wrong findings. Each finding must pass:

1. **Evidence** — exact `file:line` you read.
2. **Failure scenario** — concrete input/state → wrong output, crash, leak or broken caller. No scenario → drop it or downgrade to a question.
3. **Refute pass** — try to disprove it (is it guarded elsewhere? caller never passes that value? test covers it?). Survives → report.

Factual claims ("tests pass", "0 critical", "coverage N%") follow CoVe: `skills/chain-of-verification/SKILL.md`.

## Report

```
[blocking|non-blocking|nit] [ASPECT] file:line — defect
  Scenario: <input/state → wrong result>
  Fix: <smallest change>
```

```toon
severity[3]{label,meaning}:
  blocking,"Must fix before merge — the scenario shows a security hole, broken caller, wrong result or data loss"
  non-blocking,"Should fix; merge allowed"
  nit,"Optional polish, never blocks — prefix Nit:"
```

Order by severity. Mention something done well only if it is specific. No filler, no restating the diff.

## Decision

- **APPROVED** — 0 blocking, change improves code health.
- **CHANGES REQUESTED** — any blocking finding (always: secrets, injection, missing authz, unversioned breaking change, data loss).

Per-aspect score (9-10 ready · 7-8 minor · 5-6 needs work · <5 changes requested) — prevents LGTM drift. In Phase 4 write it to `CODE_REVIEW.md` (`templates/code-review.md`).

---

## Related Rules

- `rules/core/simplicity-over-complexity.md` — YAGNI/DRY/KISS
- `rules/workflow/smart-commenting.md` — WHY not WHAT
- `rules/core/code-quality.md` — Coverage, typing, error handling baseline
- `rules/core/verification.md` — Verify before approving
- `rules/core/context-economy.md` — Diff hunks + callers, not whole files
- `rules/agent/sast-security-scanning.md` — Security patterns
- `rules/agent/error-handling-standard.md` — Error-handling review
- `rules/workflow/cross-review-workflow.md` — Builder ≠ Reviewer
- `rules/workflow/chain-of-verification.md` — **MANDATORY** for factual claims in review output
- `rules/workflow/dual-llm-review.md` — Second opinion for destructive-op / security-critical findings
