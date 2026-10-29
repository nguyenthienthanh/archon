> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Frontend Excellence - UI/UX & Performance Guide

**Category:** Frontend Development
**Priority:** Critical
**Applies To:** frontend, mobile, all frontend skills

---

## Performance Targets

```toon
web_targets[6]{metric,target}:
  LCP (Largest Contentful Paint),<2.5s
  FID/INP (First Input Delay),<100ms
  CLS (Cumulative Layout Shift),<0.1
  TTI (Time to Interactive),<3.8s
  Bundle Size (initial JS),<150KB gzipped
  Lighthouse Score,90+ all categories
```

```toon
mobile_targets[5]{metric,target}:
  App Launch,<2s cold start
  Frame Rate,60fps constant
  Touch Response,<100ms feedback
  Memory,<200MB active
  Battery,Minimal drain
```

---

## UX Laws

### Fitts' Law: Size & Distance

Primary buttons: 48x48px (touch), 44x44px (web). Place frequent actions in thumb-reach zone (bottom 40% of mobile screen). Make primary buttons larger than secondary.

### Jakob's Law: Familiar Patterns

```toon
standard_patterns[8]{action,expected}:
  Login,"Email + Password + Forgot link + Social"
  Search,"Icon left + input + clear when filled"
  Navigation,"Logo left (home) + nav center/right + user far right"
  Forms,"Labels above + error states + progress"
  Lists,"Pull-to-refresh + pagination/infinite scroll"
  Modals,"X top-right + click outside to close"
  Settings,"Grouped sections + toggles + back nav"
  Checkout,"Progress steps + summary sidebar + secure indicators"
```

### Hick's Law: Limit Choices

Max 5-7 nav items, 1 primary + 2 secondary buttons (hide rest in menu), 3-5 onboarding steps.

### Miller's Law: Chunk Information

Group content in 7+/-2 chunks. Phone: xxx-xxx-xxxx. Forms: sections of 3-5 fields.

---

## Accessibility (Non-Negotiable)

```toon
a11y_musts[8]{requirement,implementation}:
  Color contrast,4.5:1 normal text / 3:1 large text
  Focus indicators,2px solid outline on all interactive elements
  Keyboard nav,Tab through all + Enter/Space to activate
  Alt text,Descriptive for info images / empty for decorative
  Form labels,Every input has label (htmlFor matches id)
  Error identification,Text + icon — not just color
  Heading hierarchy,h1 -> h2 -> h3 in order
  Motion,Respect prefers-reduced-motion
```

Use native HTML elements over ARIA when possible. `<button>` not `<div role="button">`.

---

## Mobile UX

### Thumb Zones

```toon
thumb_zones[3]{zone,placement,use_for}:
  Easy (bottom center),Primary actions,Submit / add / next
  OK (middle/sides),Secondary actions,Navigation
  Hard (top corners),Rarely used,Settings / close
```

### Platform Conventions

- **iOS:** Large titles, swipe back, bottom tabs (max 5), sheets from bottom
- **Android:** Top app bar, FAB for primary, top tabs with swipe, Material ripple

---

## Loading & Feedback

```toon
feedback_timing[5]{delay,response}:
  0-100ms,None needed
  100-300ms,Subtle indicator (button state)
  300-1000ms,Spinner or progress
  1000ms+,Skeleton screen matching content layout
  10s+,Background with notification
```

Use skeleton screens (not spinners) for content loading. Use optimistic updates for instant-feel actions.

---

## Form UX

- Labels above inputs (never placeholder as label)
- Validate on blur, clear errors on fix, validate all on submit
- Use correct input types (email/tel/url) for mobile keyboards
- Enable autocomplete attributes

```toon
error_messages[3]{bad,good}:
  "Invalid input","Email must include @ symbol"
  "Required","Please enter your name"
  "Error","Password must be at least 8 characters"
```

---

## Visual Hierarchy

```toon
spacing_scale[6]{name,size,use}:
  xs,4px,Tight inline
  sm,8px,Related elements
  md,16px,Component padding
  lg,24px,Section separation
  xl,32px,Major sections
  2xl,48px,Page sections
```

```toon
visual_priority[4]{priority,treatment}:
  Primary action,Solid bg + contrasting text + larger
  Secondary action,Outline/ghost + smaller
  Tertiary/links,Text only + underline or color
  Disabled,Opacity 0.5 + no pointer
```

---

## Error Prevention & Recovery

- Use constraints (date picker > text input)
- Provide undo for 5s after destructive actions
- Auto-save drafts every 30s
- Show actionable error messages with retry/alternative actions
- Graceful degradation with cached data on network failure

---

## Pre-Ship Checklist

- [ ] Keyboard navigation works for full flow
- [ ] Screen reader content makes sense
- [ ] Contrast 4.5:1 text, 3:1 large
- [ ] Lighthouse 90+ all categories
- [ ] LCP <2.5s, CLS <0.1, FID <100ms
- [ ] Touch targets 48x48dp on mobile
- [ ] Loading states for all async ops
- [ ] Error states with recovery actions
- [ ] **Looked at it** — ran the `design-vision-loop` (screenshot across viewports + dark mode, critiqued vs design system) and it PASSED; verdict attached

---
