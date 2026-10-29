> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# TDD Workflow Rules

**Purpose:** Enforce Test-Driven Development

---

## TDD Cycle

```
RED (Phase 2): Write failing tests → auto-continue
GREEN (Phase 3): Make tests pass → APPROVAL GATE
REFACTOR (Phase 4): Improve code → auto-continue
```

---

## Blocking Rules

BLOCK execution if:
- No test file exists for implementation target
- Tests don't fail in RED phase (expected to fail)
- Coverage below threshold after GREEN phase
- Tests broken after refactoring

---

## Phase Requirements

```toon
phases[3]{phase,must_have,deliverables}:
  RED,"Test file created + all tests FAIL + cases cover requirements","*.test.tsx / *.spec.ts + failure report"
  GREEN,"All tests PASS + min code + coverage meets threshold + linter passes","Implementation + pass report + coverage report"
  REFACTOR,"All tests STILL PASS + no behavior changes + coverage maintained","Refactored code + quality metrics"
```

---

## Coverage Thresholds

```toon
coverage[5]{scope,target}:
  Overall,80%
  Critical business logic,90%
  UI components,70%
  Utility functions,95%
  API clients / hooks,85%
```

**Exempt:** config files, type definitions (*.d.ts), constants, mock data, test utilities.

---

## Test Quality

- Arrange/Act/Assert pattern
- "should...when..." naming: `it('should display error when API returns 400')`
- Test behavior, not implementation details
- One concern per test
- No time-dependent / flaky tests — use `waitFor` instead of `setTimeout`
- Cover: happy path, errors, edge cases, boundary conditions, state transitions
