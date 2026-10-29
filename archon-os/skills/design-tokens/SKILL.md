---
name: design-tokens
description: "Generate a cohesive color-token system from ONE OKLCH brand hue — primary/secondary/background/foreground/muted/border with semantic light + dark, emitted as a Tailwind v4 @theme block or a CSS-variables fallback. Use when starting a design system, defining brand colors, setting up theming/dark-mode, or replacing scattered hardcoded colors with a derived palette."
when_to_use: "design system setup, brand color palette, OKLCH tokens, dark mode theming, generate CSS variables / Tailwind @theme, single-hue palette"
user-invocable: false
---

> **AI-consumed reference.** This skill *produces* tokens; `rules/agent/theme-consistency.md` *enforces* their use. Generator vs enforcer — do not restate OKLCH logic in the rule or token-usage rules here.

# Design Tokens (OKLCH, single-source)

One hue drives the whole system. OKLCH keeps perceptual lightness constant across hues, so derived shades stay legible and dark mode is a lightness flip, not a re-pick.

## Derivation (single source: `--brand-hue`)
- **primary** `oklch(0.55 0.18 H)` · **primary-hover** `oklch(0.48 0.18 H)`
- **secondary** `oklch(0.55 0.07 H)` (same hue, low chroma)
- **muted** `oklch(0.55 0.02 H)` · **border** `oklch(0.90 0.01 H)`
- **background/foreground**: light = `oklch(0.99 0.005 H)` / `oklch(0.20 0.02 H)`; dark = flip → `oklch(0.16 0.02 H)` / `oklch(0.95 0.01 H)`.

Keep chroma restrained (house style: one dominant hue + sharp accent, no rainbow).

## Detect Tailwind v4 vs v3, emit accordingly
- **v4** (`@import "tailwindcss"` / `@theme` in CSS, no `tailwind.config.js` colors) → emit an `@theme` block.
- **v3** (`tailwind.config.{js,ts}` present) → emit CSS variables + reference them in `theme.extend.colors`.

## Worked example — `--brand-hue: 265`
**Tailwind v4:**
```css
@theme {
  --color-primary: oklch(0.55 0.18 265);
  --color-primary-hover: oklch(0.48 0.18 265);
  --color-secondary: oklch(0.55 0.07 265);
  --color-muted: oklch(0.55 0.02 265);
  --color-border: oklch(0.90 0.01 265);
  --color-background: oklch(0.99 0.005 265);
  --color-foreground: oklch(0.20 0.02 265);
}
```
**CSS-variables fallback (v3 / no-Tailwind), with dark mode:**
```css
:root {
  --brand-hue: 265;
  --primary: oklch(0.55 0.18 var(--brand-hue));
  --background: oklch(0.99 0.005 var(--brand-hue));
  --foreground: oklch(0.20 0.02 var(--brand-hue));
  --border: oklch(0.90 0.01 var(--brand-hue));
}
.dark {
  --background: oklch(0.16 0.02 var(--brand-hue));
  --foreground: oklch(0.95 0.01 var(--brand-hue));
  --border: oklch(0.30 0.02 var(--brand-hue));
}
```
Change `--brand-hue` alone to re-skin the entire product.

## Persist to the design SoT

After generating the token system, **write it to `.claude/design/design-system.md`** in the host project
(create `.claude/design/` if absent) so it survives across sessions and later components conform to it —
don't re-derive fresh tokens every session. Fill the `Brand` (the `--brand-hue` + named hex values),
`Type`, and `Spacing` sections; set `Source: generated`. Merge, don't clobber, if the file already exists.
See `rules/agent/design-system-persistence.md` for the file contract.

**See also:** `rules/agent/theme-consistency.md` (enforces token usage), `rules/agent/design-system-persistence.md` (the SoT file), and the `frontend-aesthetics` skill (color hierarchy).
