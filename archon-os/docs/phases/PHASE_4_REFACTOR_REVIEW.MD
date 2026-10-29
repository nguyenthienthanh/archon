# PHASE 4: Refactor + Review - Improve Code Quality

**Phase:** 4 of 5
**Duration:** 2-4 hours
**Goal:** Refactor code while keeping tests green

---

## Agent Assignment (Builder ≠ Reviewer)

- **Refactor (builder):** Same agent as Phase 3 — they know the code
- **Review (reviewer):** DIFFERENT agent — security (PRIMARY) + tester (regression check)
- **Rule:** The Phase 3 builder must NOT lead the Phase 4 code review

---

## Objectives

1. Improve code quality
2. Remove duplication
3. Optimize performance
4. Tests MUST still pass

---

## Refactoring Targets

### 1. Remove Duplication

```tsx
// Before: Duplication
function validateEmail(email: string) {
  return email.includes('@')
}
function validateUsername(username: string) {
  return username.length > 3
}

// After: Extract common
function validate(value: string, rule: ValidationRule) {
  return rule(value)
}
```

### 2. Improve Naming

```tsx
// Before: Unclear
const fn = (x) => x * 2
const temp = data.filter(d => d.active)

// After: Clear
const double = (num) => num * 2
const activeUsers = users.filter(user => user.active)
```

### 3. Extract Complex Logic

```tsx
// Before: Complex component
function UserCard({ user }) {
  return (
    <div>
      {user.isPremium && user.hasActiveSubscription && !user.isTrialing
        ? <Badge>Premium</Badge>
        : null}
    </div>
  )
}

// After: Extract logic
function shouldShowPremiumBadge(user) {
  return user.isPremium && user.hasActiveSubscription && !user.isTrialing
}

function UserCard({ user }) {
  return (
    <div>
      {shouldShowPremiumBadge(user) && <Badge>Premium</Badge>}
    </div>
  )
}
```

### 4. Optimize Performance

```tsx
// Before: Re-creates function every render
function Component() {
  const handleClick = () => { /* logic */ }
  return <Button onClick={handleClick} />
}

// After: Memoize
function Component() {
  const handleClick = useCallback(() => { /* logic */ }, [])
  return <Button onClick={handleClick} />
}
```

---

## Process

### 1. Run Tests Before Refactoring

```bash
$ npm test
Tests: 53 passed ✅
Coverage: 87% ✅
```

### 2. Refactor Code

Make improvements while watching tests

### 3. Run Tests After Each Change

```bash
$ npm test --watch
Tests: 53 passed ✅ (Still passing!)
```

### 4. Verify Coverage Maintained

```bash
Coverage: 87% ✅ (Unchanged or improved)
```

---

## Deliverables

```markdown
# Phase 4: Refactoring Report

## Changes Made:
1. Extracted 3 utility functions
2. Improved variable naming (8 changes)
3. Reduced complexity in ShareModal
4. Added useMemo for expensive calculations
5. Removed duplicate validation logic

## Metrics:
- Code complexity: Reduced from 8.2 to 5.1
- Duplication: Reduced from 15% to 3%
- Maintainability index: Improved from 62 to 78

## Tests Status:
- Tests: 53/53 passing ✅
- Coverage: 87% ✅ (maintained)
- Performance: +12% faster
```

---

## Approval Gate

```
═══════════════════════════════════════════════════════════
♻️  PHASE 4 COMPLETE: Refactor + Review
═══════════════════════════════════════════════════════════

📊 Summary:
Code refactored, tests still green, quality improved ✅

📦 Deliverables:
   📄 Refactored code
   📄 Refactoring report
   📄 Complexity metrics

✅ Success Criteria:
   ✅ All tests still pass
   ✅ Coverage maintained (87%)
   ✅ Code quality improved
   ✅ No new bugs introduced

⏭️  Next Phase: Phase 5 - Finalize

───────────────────────────────────────────────────────────
⚠️  ACTION REQUIRED

Type "approve" → Proceed to Phase 5

Your response:
═══════════════════════════════════════════════════════════
```

---

**Next:** Phase 5 - Finalize

