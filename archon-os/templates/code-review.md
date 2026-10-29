# Code Review

> **Phase:** 4 (Refactor + Review)
> **Reviewer:** _security + tester (MUST NOT be Phase 3 builder)_
> **Status:** TODO

---

## Summary

_One-paragraph verdict: approve / changes-required / block._

## Coverage by Aspect

```toon
review[8]{aspect,verdict,blocker_count,notes}:
  security,_,_,_
  correctness,_,_,_
  compatibility,_,_,_
  architecture,_,_,_
  error_handling,_,_,_
  test_gaps,_,_,_
  type_safety,_,_,_
  simplicity,_,_,_
```

## Findings

### Blocking
_Must change before merge. Each: `file:line` — defect · Scenario · Fix (see `skills/code-reviewer`)._

### Non-blocking
_Should fix; merge allowed. Nits prefixed `Nit:`._

### Praise
_What's done well — calibrates reviewer signal._

## Verification

- [ ] All Phase 1 acceptance criteria satisfied
- [ ] Tests still pass (paste counts)
- [ ] No new lint errors
- [ ] No secret patterns introduced
- [ ] No breaking change (or versioned + migration note)
- [ ] Phase 3 builder did NOT also review this code

## Sign-off

| Reviewer agent | Decision | Timestamp |
|---|---|---|
| `security` | _approve / changes-required_ | _ISO 8601_ |
| `tester` | _approve / changes-required_ | _ISO 8601_ |
