# PHASE 2: Test RED - Write Failing Tests

**Phase:** 2 of 5
**Duration:** 4-8 hours
**Goal:** Write comprehensive failing tests before implementation

---

## Objectives

1. Write ALL test cases from test plan
2. Ensure tests FAIL (no implementation yet)
3. Achieve 100% test case coverage
4. Set up test infrastructure

---

## Process

### 1. Review Test Plan

Read Phase 4 deliverable:
- Test plan document
- Test cases (all scenarios)
- Coverage goals

### 2. Set Up Test Environment

```bash
# Install dependencies
npm install --save-dev jest @testing-library/react

# Configure jest.config.js
# Set up test utilities
# Configure mocks
```

### 3. Write Test Files

```typescript
// Example: ShareModal.test.tsx
describe('ShareModal', () => {
  describe('Rendering', () => {
    it('renders modal when open', () => {
      render(<ShareModal isOpen={true} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    
    it('does not render when closed', () => {
      render(<ShareModal isOpen={false} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
  
  describe('Platform Selection', () => {
    it('shows Facebook option', () => {
      render(<ShareModal isOpen={true} />)
      expect(screen.getByText('Facebook')).toBeInTheDocument()
    })
    
    // ... more tests
  })
  
  describe('Form Submission', () => {
    it('calls onSubmit with form data', async () => {
      const onSubmit = jest.fn()
      render(<ShareModal isOpen={true} onSubmit={onSubmit} />)
      
      await userEvent.type(screen.getByLabelText('Caption'), 'Test post')
      await userEvent.click(screen.getByText('Facebook'))
      await userEvent.click(screen.getByRole('button', { name: 'Post' }))
      
      expect(onSubmit).toHaveBeenCalledWith({
        platform: 'facebook',
        caption: 'Test post'
      })
    })
  })
})
```

### 4. Run Tests - MUST FAIL

```bash
$ npm test

FAIL  src/components/ShareModal.test.tsx
  ● ShareModal › renders modal when open
    Cannot find module '../ShareModal'
    
FAIL  src/hooks/useSharePost.test.ts
  ● useSharePost › posts to Facebook
    Cannot find module '../useSharePost'

Tests: 53 failed, 0 passed, 53 total
Time: 2.341s
```

**✅ SUCCESS CRITERIA: ALL TESTS MUST FAIL**

Failure reasons should be:
- ❌ "Module not found" (component doesn't exist)
- ❌ "Function not defined" (hook doesn't exist)
- ❌ NOT logic errors (that means you implemented something!)

---

## Deliverables

### 1. Test Files
```
tests/
├── ShareModal.test.tsx (15 tests)
├── PlatformSelector.test.tsx (10 tests)
├── useSharePost.test.ts (20 tests)
└── shareApi.test.ts (8 tests)

Total: 53 tests
```

### 2. Test Report
```markdown
# Phase 2: Test Report

## Tests Written: 53
## Tests Passing: 0 ❌ (Expected!)
## Tests Failing: 53 ✅ (All fail for right reason)

## Failure Breakdown:
- Module not found: 45 tests
- Function not defined: 8 tests
- Implementation errors: 0 tests ✅

## Coverage Goals:
- Target: 85%
- Current: 0% (no code yet)

## Ready for Phase 3 (Build GREEN): ✅ YES
```

---

## Approval Gate

```
═══════════════════════════════════════════════════════════
🔴 PHASE 2 COMPLETE: Test RED - Tests Written & Failing
═══════════════════════════════════════════════════════════

📊 Summary:
53 tests written, ALL FAILING as expected ✅

📦 Deliverables:
   📄 Test files (4 files, 53 tests)
   📄 Test report
   📄 Coverage configuration

✅ Success Criteria:
   ✅ All tests written
   ✅ All tests fail with "not found" errors
   ✅ No implementation code written
   ✅ Test infrastructure ready

⚠️  CRITICAL: Tests MUST fail for correct reasons!
   ✅ "Module not found" - Good
   ✅ "Function undefined" - Good  
   ❌ "Expected X but got Y" - BAD (means you implemented!)

⏭️  Next Phase: Phase 3 - Build GREEN (Implementation)

───────────────────────────────────────────────────────────
⚠️  ACTION REQUIRED

Type "approve" → Proceed to Phase 3
Type "reject <reason>" → Revise tests
Type "modify <changes>" → Adjust tests

Your response:
═══════════════════════════════════════════════════════════
```

---

## Common Mistakes

### ❌ DON'T:
- Write implementation code
- Skip test cases
- Write tests that pass
- Ignore edge cases

### ✅ DO:
- Write comprehensive tests
- Cover all scenarios
- Ensure proper failure messages
- Set up mocks correctly

---

**Next:** Phase 3 - Build GREEN (Implementation)

