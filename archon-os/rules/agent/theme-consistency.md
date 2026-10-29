> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Theme Consistency - No Hardcoded Values

**Priority:** Critical
**Applies To:** All UI code (React Native, Vue.js, React.js, Next.js)

---

## Core Principle

**Use theme/design system values. Never hardcode colors, spacing, or sizes.**

> **Generator vs enforcer:** this rule *enforces* token usage. To *generate* the token system in the first place (a cohesive OKLCH palette + semantic light/dark from one `--brand-hue`, as a Tailwind v4 `@theme` block or CSS-variables fallback), use the `design-tokens` skill — don't hand-pick scattered colors.

---

## Quick Reference

```toon
bad_patterns[3]{category,example}:
  Colors,"backgroundColor: '#FF0000'"
  Spacing,"padding: 16"
  Sizes,"fontSize: 16"
```

```toon
good_patterns[3]{category,example}:
  Colors,"backgroundColor: colors.error"
  Spacing,"padding: space[4]"
  Sizes,"fontSize: sizes.text.md"
```

---

## What NOT to Do

### Hardcoded Colors

```typescript
// ❌ BAD
<View style={{ backgroundColor: '#FFFFFF', color: 'red' }} />
<div :style="{ color: '#333333', backgroundColor: 'rgb(255,255,255)' }">
```

### Hardcoded Spacing

```typescript
// ❌ BAD
<View style={{ padding: 16, margin: 8, gap: 12 }} />
```

### Hardcoded Sizes

```typescript
// ❌ BAD
<View style={{ width: 320, height: 48, borderRadius: 8, fontSize: 16 }} />
```

---

## What TO Do

### Use Theme Values

```typescript
// ✅ GOOD - React/React Native
const { colors, space, sizes, borderRadius } = useTheme();

<View style={{
  backgroundColor: colors.background.primary,
  padding: space[4],
  borderRadius: borderRadius.md,
}}>
  <Text style={{ color: colors.text.primary, fontSize: sizes.text.md }}>
    Hello
  </Text>
</View>
```

```vue
<!-- ✅ GOOD - Vue.js -->
<template>
  <div :style="{
    backgroundColor: theme.colors.background.primary,
    padding: theme.space[4],
    color: theme.colors.text.primary,
  }">
    Hello
  </div>
</template>
```

---

## Allowed Exceptions

```toon
exceptions[5]{value,reason}:
  'transparent',No theme equivalent needed
  0,Zero is universal
  '100%',Percentage-based layouts
  'auto',CSS auto value
  Calculations,Based on theme values (space[4] * 1.5)
```

---

## Theme Structure

```typescript
interface Theme {
  colors: {
    primary: { 50-900 };           // Color scale
    success, error, warning, info;  // Semantic
    background: { primary, secondary, tertiary };
    text: { primary, secondary, disabled };
    border: { default, light, dark };
  };
  space: { 0-20 };                 // 4px scale (0,4,8,12,16...)
  sizes: { text, button, icon, container };
  borderRadius: { none, sm, md, lg, xl, full };
  shadows: { sm, md, lg, xl };
}
```

---

## Code Review Checklist

- [ ] No hex colors (#FFFFFF)
- [ ] No RGB/RGBA values
- [ ] No named colors ('red', 'blue')
- [ ] No hardcoded numbers for spacing
- [ ] All values from theme
- [ ] Dark mode supported

---

