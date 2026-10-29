# Vision Critique Rubric

Score each captured screenshot against these dimensions. A single hard FAIL = ITERATE. Conformance target
is `.claude/design/design-system.md` when present; otherwise the Pass-1 design plan from `frontend-aesthetics`.

```toon
rubric[8]{dimension,pass_condition,common_defects}:
  token-conformance,"colors/type/spacing come from the design system","off-palette hex, timid type scale, ad-hoc spacing"
  hierarchy,"exactly ONE primary action stands out per screen","two competing CTAs, no clear focal point, flat emphasis"
  spacing-rhythm,"consistent scale; related items grouped, unrelated separated","cramped clusters, uneven gaps, no vertical rhythm"
  responsive,"no overflow/clipping/overlap at 375 / 768 / 1440","h-scroll on mobile, text clipped, controls off-screen, broken grid"
  dark-mode,"parity with light — contrast holds, no invisible text","white-on-white, un-themed hardcoded surfaces, lost borders"
  contrast-a11y,"text/background meets WCAG AA","low-contrast body text, accent-on-accent labels"
  signature,"the intended distinctive element is present and intact","generic default shipped instead of the planned signature"
  spec-match,"layout matches the Stitch/Figma reference at structure level","regions reordered, key component missing, proportion drift"
```

## Scoring discipline

- **Look before scoring.** Cite what you see in the screenshot ("the two buttons at 375px both use the
  accent, so hierarchy is ambiguous"), not what the code *should* produce.
- **Per-viewport.** A defect at one width is still a defect — record which viewport.
- **Expected vs actual.** Every defect names the element, the viewport, the expected state (from the design
  system), and the actual observed state. Vague notes ("feels off") are not actionable — resolve them into
  a concrete dimension above or drop them.
- **Layout-level for spec-match.** Compare structure/hierarchy/rhythm against the reference; do NOT demand
  pixel-perfection — Stitch itself doesn't guarantee it.
