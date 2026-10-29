---
name: motion-design
description: "Restrained, accessible web motion — Framer Motion declarative patterns and CSS-only staggered reveals for high-impact moments, always bundle-aware and reduced-motion-safe. Use when adding animation/transitions to a UI (entrance reveals, list stagger, page/route transitions, micro-interactions) or when motion feels janky, heavy, or gratuitous."
when_to_use: "add animation / motion / transitions, entrance reveal, staggered list, page transition, micro-interaction, reduce motion, framer-motion bundle cost"
user-invocable: false
---

> **AI-consumed reference.** Taste + technique for motion; the perf ceiling is owned by `rules/agent/frontend-excellence.md` — cross-reference its budget, don't restate it.

# Motion Design

Motion should *clarify*, not decorate. Small, fast, purposeful. **House style: subtle — no bouncy/springy overshoot as decoration, no infinite loops competing for attention.**

## `prefers-reduced-motion` is MANDATORY
Every motion example MUST honor it — non-negotiable. Wrap transitions so reduced-motion collapses them to an instant (opacity-only or none):
```css
@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation: none !important; transition: none !important; } }
```
In Framer Motion, gate variants on `useReducedMotion()` and drop transforms.

## Two tools, matched to impact
- **CSS-only for reveals/stagger** (cheapest, no JS): stagger via `animation-delay: calc(var(--i) * 60ms)` on a keyframed fade-up. Use for hero/list entrance where you don't need interaction.
- **Framer Motion for stateful/interactive** motion: declarative `variants` + `initial/animate`, shared layout, gesture. Prefer it only where CSS can't express the state.

## Bundle discipline
Framer Motion is heavy — use **`LazyMotion` + `m.` components** (load `domAnimation` features on demand) instead of the full `motion.` import. This keeps it within the `frontend-excellence` perf budget.

## Audit before shipping
- **AnimatePresence gaps:** exit animations silently do nothing unless the leaving element is wrapped in `<AnimatePresence>`. Check every conditional/route unmount.
- Reduced-motion path actually tested (not just declared).

**See also:** `rules/agent/frontend-excellence.md`, and the `frontend-aesthetics` skill.
