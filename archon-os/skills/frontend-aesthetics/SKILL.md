---
name: frontend-aesthetics
description: "Anti-AI-slop taste layer for UI output — distinctive typography, dominant+accent color hierarchy, and implementation-matched polish. Use when building or restyling a UI/landing/component that should look designed rather than defaulted, or when the user asks for something 'beautiful', 'distinctive', 'less generic', or 'not another Tailwind template'."
when_to_use: "make UI distinctive / beautiful / less generic, typography choice, color hierarchy, restyle a bland component, avoid AI-default look"
user-invocable: false
---

> **AI-consumed reference.** Produce taste; do not re-implement enforcement. This skill *complements* `rules/agent/design-system-usage.md` + `rules/agent/theme-consistency.md` (which enforce token usage) and `rules/agent/accessibility-rules.md` (which enforces a11y) — cross-link, don't duplicate.

# Frontend Aesthetics

Raise output from *consistent & correct* to *distinctive*. **Default style (overridable by the host project): flat, clean, accessible, ONE restrained accent — no neon, no glow, no gradient-mesh, no sparkle.** "Distinctive" = tasteful type + cohesive tokens + dominant color + sharp accent, NOT flashy maximalism. This default loses to the host project's own design language: if the project's `CLAUDE.md`, design system, or brand explicitly calls for neon/glow/gradients (gaming, nightlife, crypto, …), follow the project — the constraint is anti-slop, not anti-brand.

> **Why this matters (Anthropic, *Improving frontend design through skills*):** generic "AI-look" UI is
> distributional convergence — safe choices dominate training data, so sampling drifts to them. A taste
> layer + an explicit plan-then-critique step is the documented corrective. This skill is that layer.

## Two-pass process (do this BEFORE writing any UI code)

**Pass 1 — compact design plan.** Write a short plan, not code:
- **Color:** 4–6 named hex values with role names (derive from ONE hue — see `design-tokens`).
- **Type:** ≥2 type roles (display / body / mono) + the deliberate scale jumps (e.g. 14→20→40).
- **Layout:** a sentence of intent + a rough ASCII wireframe of the key screen.
- **Signature element:** the ONE distinctive thing that makes this product not-generic (a specific
  treatment of nav / hero / card / empty-state — pick one, commit).

**Pass 2 — self-critique the plan against the brief.** Before building: if any part of the plan reads
like the generic default you'd produce for *any* similar page — rather than a choice made for *this*
brief — revise it, and say what you changed and why. Only then write code.

Persist the result: if `.claude/design/design-system.md` has no `Signature` / `DoDont`, write them
(see `rules/agent/design-system-persistence.md`).

## Typography (the fastest tell of AI-default)
- **Avoid** the default tells: Inter, Roboto, Open Sans, Arial, raw system-ui.
- **Reach for** a curated pairing instead: IBM Plex Sans/Serif, Newsreader, Space Grotesk, Bricolage Grotesque, Playfair Display (display only), JetBrains Mono (code/labels).
- **Pair with contrast:** one expressive display/serif + one clean sans. Make weight & size jumps *deliberate and large* (e.g. 14 → 20 → 40, not 16 → 18 → 22) — timid scales read as generic.

## Color
- **Dominant + sharp accent**, not an evenly-distributed rainbow: one color owns ~70% of the surface, the accent is used *sparingly* for the single primary action (ties to the house "1 primary action per screen" rule).
- Derive the palette from ONE hue (see the `design-tokens` skill for OKLCH generation) so it reads as a system.
- Accessible-first: verify text/background contrast meets WCAG AA *before* aesthetics.

## Banned AI-default clusters (name them to avoid them)
These are *defaults, not choices* — they show up regardless of subject. If the plan lands on one by
accident, treat it as a signal to re-pick:
- **Warm cream** (`#F4F1EA`-ish) background + high-contrast serif + terracotta accent.
- **Near-black minimal** + a single acid-green / electric accent.
- **Hairline-rule "broadsheet"** — thin gray dividers everywhere as the whole personality.
- The type tells already listed above (Inter / Roboto / Open Sans / raw system-ui).
Any of these is *legitimate for a specific brief* — but only if chosen for that brief, never as the fallback.

## Verify with your eyes (screenshot self-critique)
When the environment can render (dev server / artifact), **critique your own work as you build by taking
screenshots** — don't ship UI you haven't looked at. For the full render → screenshot → critique → iterate
loop (multi-viewport + dark mode + conformance rubric), hand off to the `design-vision-loop` skill.

## Match ambition to implementation
Only promise polish you'll actually build. A "distinctive" spec with a half-built component reads worse than a restrained one done fully. Ship the smaller, coherent version.

**See also:** `rules/agent/theme-consistency.md`, `rules/agent/accessibility-rules.md`, `rules/agent/design-system-persistence.md`, the `design-tokens` skill, and the `design-vision-loop` skill.
