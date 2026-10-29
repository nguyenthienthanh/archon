# Skill: Component Design

**Category:** Design Expert  
**Priority:** High  
**Used By:** frontend agent

---

## Component Design Principles

### 1. Atomic Design

```
Atoms → Molecules → Organisms → Templates → Pages

Atoms: Button, Input, Icon
Molecules: SearchBar (Input + Button)
Organisms: Header (Logo + Nav + SearchBar)
Templates: Page layout structure
Pages: Final implementation
```

### 2. Component Anatomy

```tsx
<Component>
  {/* Container */}
  <ComponentHeader>
    {/* Icon/Avatar */}
    {/* Title */}
    {/* Actions */}
  </ComponentHeader>
  
  <ComponentBody>
    {/* Main content */}
  </ComponentBody>
  
  <ComponentFooter>
    {/* Secondary actions */}
  </ComponentFooter>
</Component>
```

### 3. Design Specifications

```markdown
## Card Component

### Structure:
- Container with shadow and border radius
- Optional image/media at top
- Content area with padding
- Optional action buttons at bottom

### Props:
- variant: 'elevated' | 'outlined' | 'filled'
- size: 'sm' | 'md' | 'lg'
- hoverable: boolean
- clickable: boolean

### Visual:
- Padding: 16px (md)
- Border radius: 12px
- Shadow: 0 2px 8px rgba(0,0,0,0.1)
- Background: white
- Border: 1px solid #e0e0e0 (outlined variant)
```

### 4. Responsive Design

```typescript
// Mobile First
<Card>
  {/* Stack vertically on mobile */}
  <CardContent direction="column">
    <Image />
    <Text />
    <Actions />
  </CardContent>
</Card>

// Tablet/Desktop
<Card>
  {/* Horizontal layout on larger screens */}
  <CardContent direction="row">
    <Image />
    <TextBlock />
    <Actions />
  </CardContent>
</Card>
```

### 5. Accessibility

```markdown
## Accessibility Checklist:

- [ ] Color contrast ratios meet WCAG AA (4.5:1)
- [ ] Focusable elements have visible focus state
- [ ] Interactive elements have min 44x44px touch target
- [ ] Proper ARIA labels
- [ ] Keyboard navigation supported
- [ ] Screen reader friendly
```

---

## Component Breakdown Example

```markdown
# SocialMediaPost Component

## Sub-components:
1. PostHeader
   - Avatar
   - Author name
   - Timestamp
   - Menu button

2. PostContent
   - Text content
   - Images/video
   - Link preview

3. PostActions
   - Like button
   - Comment button
   - Share button
   - Save button

4. PostComments (expandable)
   - Comment list
   - Comment input

## Props:
- post: Post object
- onLike: () => void
- onComment: (text: string) => void
- onShare: () => void
- showComments: boolean
```

---

## Best Practices

### Do's ✅
- ✅ Break down into reusable components
- ✅ Design for multiple states
- ✅ Consider responsive layouts
- ✅ Follow accessibility guidelines
- ✅ Document component specs

### Don'ts ❌
- ❌ Create monolithic components
- ❌ Hardcode values
- ❌ Ignore edge cases
- ❌ Forget loading/error states

---

**Used by frontend agent for component design and breakdown.**

