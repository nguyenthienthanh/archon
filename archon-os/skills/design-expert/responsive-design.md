# Skill: Responsive Design Patterns

**Category:** Design Expert
**Used By:** frontend

---

## Overview

Creating adaptive layouts that work seamlessly across all devices and screen sizes.

---

## Breakpoints

### CSS (Mobile First)

```css
/* Default: Mobile */
.container { padding: 16px; }

/* Small (576px): Mobile Landscape */
@media (min-width: 576px) { .container { padding: 20px; } }

/* Medium (768px): Tablet Portrait */
@media (min-width: 768px) { .container { padding: 24px; max-width: 720px; margin: 0 auto; } }

/* Large (1024px): Tablet Landscape / Desktop */
@media (min-width: 1024px) { .container { padding: 32px; max-width: 960px; } }

/* Extra Large (1280px): Desktop */
@media (min-width: 1280px) { .container { padding: 40px; max-width: 1200px; } }
```

### React Native

```typescript
import { Dimensions } from 'react-native'

export const BREAKPOINTS = {
  PHONE_SMALL: 320, PHONE_MEDIUM: 375, PHONE_LARGE: 414,
  TABLET_SMALL: 768, TABLET_LARGE: 1024
}

export function useDeviceType() {
  const { width } = Dimensions.get('window')
  return {
    isPhone: width < BREAKPOINTS.TABLET_SMALL,
    isTablet: width >= BREAKPOINTS.TABLET_SMALL
  }
}
```

---

## Fluid Typography

```css
/* CSS Clamp - no media queries needed */
h1 { font-size: clamp(2rem, 5vw, 4rem); }
h2 { font-size: clamp(1.5rem, 3vw, 2.5rem); }
p { font-size: clamp(1rem, 2vw, 1.125rem); }
```

```jsx
// Tailwind
<h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl">Responsive</h1>
```

---

## Flexible Layouts

### CSS Grid (Auto-fit)

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
}
```

### Flexbox

```css
.flex-container {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.flex-item {
  flex: 1 1 300px; /* Grow, shrink, min 300px */
}
```

---

## Responsive Images

```jsx
// Picture element with sources
<picture>
  <source media="(min-width: 1024px)" srcSet="/large.jpg" />
  <source media="(min-width: 768px)" srcSet="/medium.jpg" />
  <img src="/small.jpg" alt="Responsive" loading="lazy" />
</picture>

// React Native
<Image
  source={{ uri: imageUrl }}
  style={{ width: '100%', aspectRatio: 16/9 }}
  resizeMode="cover"
/>
```

---

## Touch Targets

```css
/* Minimum 44x44px for accessibility */
.touch-target {
  min-width: 44px;
  min-height: 44px;
  padding: 12px;
}
```

---

## Testing Checklist

- [ ] Phone Portrait (375px)
- [ ] Phone Landscape (667px)
- [ ] Tablet Portrait (768px)
- [ ] Tablet Landscape (1024px)
- [ ] Desktop (1280px+)
- [ ] Touch targets ≥ 44px
- [ ] Readable text at all sizes
- [ ] Images scale properly

---

## Best Practices

### Do's ✅
- Mobile-first approach
- Use relative units (rem, %, vw)
- Test on real devices
- Use CSS clamp() for fluid sizing
- Ensure touch targets ≥ 44px

### Don'ts ❌
- Fixed pixel widths
- Media queries without testing
- Ignore landscape orientation
- Tiny touch targets
- Hide content instead of reflowing

---

