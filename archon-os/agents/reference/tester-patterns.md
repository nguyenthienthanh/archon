# Tester Agent - Reference Patterns

**Source:** `agents/tester.md`
**Load:** On-demand when deep testing expertise needed

---

## Testing Frameworks by Platform

```toon
frameworks[4]{platform,unit,component,e2e}:
  React Native + Expo,"Jest + RNTL",@testing-library/react-native,"Detox 20.x / Appium"
  Vue.js,"Vitest + Vue Test Utils",@testing-library/vue,"Playwright / Cypress"
  React / Next.js,"Jest / Vitest",@testing-library/react,"Playwright / Cypress"
  Laravel,PHPUnit,"PHPUnit + Database","Pest / PHPUnit Feature tests"
```

---

## Test Plan Structure

A test plan covers: Objectives + success criteria, Scope (in/out), Strategy by test type (unit/integration/E2E/perf/security) with targets, Environment (platforms/devices/APIs/data), Automation framework + CI integration, Entry/exit criteria, Risks + mitigation, Schedule.

---

## Automation Patterns

### Mocking Strategy

Mock external dependencies (APIs, navigation, stores) at boundary. Use factory pattern for test data:

```typescript
// testUtils/factories.ts
export const createMockUser = (overrides = {}) => ({
  id: 'user-123', name: 'Test User', email: 'test@example.com', ...overrides,
});
```

### CI/CD Integration

Run tests in CI with frozen lockfile. Publish coverage (Cobertura XML) and test results (JUnit XML).

### Coverage Thresholds

Set global thresholds (statements: 80%, branches: 75%, functions: 80%, lines: 80%). Override per-directory for critical paths.

### Flaky Test Management

Track tests with >5% failure rate. Max 2 retries. Fix root cause within 1 sprint.

### Reporting

- **Coverage:** HTML + Cobertura XML
- **Results:** JUnit XML
- **E2E:** Screenshots on failure + video + logs

---

## Test Writing Principles

**Structure:** Arrange/Act/Assert. One assertion concept per test. `beforeEach` for setup, clear mocks between tests.

**Naming:** `should [expected behavior] when [condition]` — e.g., "should display error message when API returns 400".

**Coverage:** Happy path + validation + error scenarios (timeout, rate limit, 401) + edge cases (disconnected, partial failure) + concurrency (duplicate prevention) + accessibility (ARIA labels, keyboard nav).

---

## Anti-Patterns to Avoid

**Testing implementation details:** Test observable behavior (rendered output), not internal hooks/state.

**Flaky timers:** Use `waitFor()` instead of `setTimeout` in assertions.

**Multiple concerns per test:** One test = one behavior. Split "tests everything" into focused tests.

---

## Test Review Principles

Tests should be: organized by feature/behavior, independent (no shared state), using factories (no hardcoded values), no `test.skip`/`test.only` in committed code, readable with "why" comments, fast (<5s per suite), with expensive operations mocked.
