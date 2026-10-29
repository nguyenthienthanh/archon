> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Accessibility (a11y) Rules

**Category:** Code Quality
**Priority:** High
**Applies To:** All UI development

---

## Core Principle

**Build for everyone. Use semantic HTML first, ARIA sparingly, and test with keyboard + screen reader.**

**Related:** `rules/agent/frontend-excellence.md` (UX laws), `skills/design-expert/SKILL.md` (component design), `skills/test-writer/SKILL.md` (test patterns).

---

## WCAG Compliance

| Level | Target |
|-------|--------|
| A | All projects (minimum) |
| AA | Production apps (recommended) |
| AAA | When specified |

---

## Quick Rules

```toon
a11y_rules[6]{rule,implementation}:
  Button != div,Use <button> — never div with onclick
  Links have text,Visible text or aria-label
  Images have alt,Descriptive alt or alt="" for decorative
  Forms have labels,<label> with htmlFor or aria-label
  Focus visible,Never remove outline
  Color not sole indicator,Add icons/text alongside color
```

---

## Keyboard Navigation

All interactive elements must be focusable with visible focus indicators. Logical tab order. Escape closes modals. Arrow keys navigate menus.

---

## Color Contrast (AA)

| Text Size | Minimum Ratio |
|-----------|---------------|
| Normal (<18px) | 4.5:1 |
| Large (>=18px bold, >=24px) | 3:1 |

---

## ARIA Essentials

```html
<!-- Icon buttons -->
<button aria-label="Close dialog"><CloseIcon /></button>

<!-- Expandable -->
<button aria-expanded="false" aria-controls="panel">Toggle</button>

<!-- Live regions -->
<div aria-live="polite">5 new messages</div>
<div aria-live="assertive" role="alert">Error occurred</div>

<!-- Form errors -->
<input aria-invalid="true" aria-describedby="error-id" />
<span id="error-id" role="alert">Invalid email</span>
```

---

## Mobile

| Requirement | Minimum |
|-------------|---------|
| Touch target size | 44x44px |
| Touch target spacing | 8px |
| Text scaling | Support up to 200% |

---

## Testing

- **Automated:** axe DevTools (0 violations), Lighthouse a11y >= 90, jest-axe tests
- **Manual:** Tab through page, screen reader test, zoom 200%, check contrast, test without mouse

---
