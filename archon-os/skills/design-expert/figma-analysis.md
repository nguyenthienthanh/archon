# Skill: Figma Analysis

**Category:** Design Expert  
**Priority:** High  
**Used By:** frontend agent

---

## Analyzing Figma Designs

### 1. Component Identification

Extract components from design:
- Buttons, inputs, cards
- Headers, footers
- Navigation elements
- Modal/dialog structures

### 2. Design Tokens

```typescript
// Extract from Figma
colors: {
  primary: '#FF5733',
  secondary: '#3498db',
  text: '#2c3e50',
  background: '#ecf0f1'
}

typography: {
  headingLarge: { size: '32px', weight: '700', lineHeight: '40px' },
  body: { size: '16px', weight: '400', lineHeight: '24px' }
}

spacing: {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px'
}

borderRadius: {
  sm: '4px',
  md: '8px',
  lg: '12px'
}
```

### 3. Responsive Breakpoints

```typescript
breakpoints: {
  mobile: '< 768px',
  tablet: '768px - 1024px',
  desktop: '> 1024px'
}
```

### 4. Component Specifications

```markdown
## Button Component

### Variants:
- Primary (filled, brand color)
- Secondary (outlined)
- Text (no background)

### States:
- Default
- Hover (darken 10%)
- Active (darken 20%)
- Disabled (opacity 0.5)

### Sizes:
- Small: height 32px, padding 8px 16px
- Medium: height 40px, padding 12px 24px
- Large: height 48px, padding 16px 32px
```

---

## Best Practices

### Do's ✅
- ✅ Extract reusable design tokens
- ✅ Identify component variants
- ✅ Document all states
- ✅ Check responsive behavior
- ✅ Verify accessibility (contrast ratios)

### Don'ts ❌
- ❌ Hardcode colors/spacing
- ❌ Ignore hover/focus states
- ❌ Miss error states

---

**Used by frontend agent for Figma design analysis and component extraction.**

