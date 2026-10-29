# Test Cases Template

**Feature:** [Feature Name]  
**Test Plan:** [Link to test plan]

---

## TC-001: Component Renders

**Priority:** HIGH  
**Type:** Unit Test  
**Description:** Verify component renders correctly

**Pre-conditions:**
- Component imported
- Props provided

**Steps:**
1. Mount component with props
2. Verify element exists
3. Check content displays

**Expected Result:**
- Component visible
- Content matches props

**Test Code:**
```typescript
it('renders component', () => {
  render(<Component title="Test" />)
  expect(screen.getByText('Test')).toBeInTheDocument()
})
```

---

## TC-002: User Interaction

**Priority:** HIGH  
**Type:** Integration Test  
**Description:** User can click button

**Steps:**
1. Render component
2. Click button
3. Verify callback called

**Expected Result:**
- Callback invoked with correct params

---

[Repeat for all test cases]

