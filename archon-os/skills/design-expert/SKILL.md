---
name: design-expert
description: "UI/UX design expertise — component design, design system selection, responsive layout. Includes auto-detection from package.json and Context7 integration for library docs."
autoInvoke: false
priority: medium
triggers:
  - "design component"
  - "design system"
  - "component library"
  - "Material UI"
  - "Tailwind"
  - "shadcn"
  - "responsive layout"
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Design Expert

## When to Use

Component design, design system selection/setup, responsive layouts, Figma analysis.

**Read the design SoT first.** If `.claude/design/design-system.md` exists, it is the project's committed
design system — honor its library / palette / type choices instead of re-recommending. Only run the selection
logic below when no SoT file exists yet (then persist the choice — see `rules/agent/design-system-persistence.md`).

---

## Principles

```toon
principles[4]{principle}:
  Atomic design: Atoms → Molecules → Organisms → Templates → Pages
  Mobile-first: design for smallest then enhance
  Design tokens: colors/spacing/typography as variables not magic values
  Consistency: one library per project — don't mix
```

## Design System Selection

```toon
selection[4]{use_case,recommendation}:
  Enterprise,"Ant Design, MUI, Mantine"
  Modern Web,"Tailwind + shadcn/ui"
  Mobile (RN),NativeWind
  Prototyping,"Bootstrap, Tailwind"
```

## Auto-Detection

Detect from package.json: `@mui/material` → MUI, `antd` → Ant Design, `tailwindcss` → Tailwind, `@chakra-ui/react` → Chakra, `nativewind` → NativeWind, `@mantine/core` → Mantine.

## Implementation

**Use Context7** for current library docs. Add "use context7" to fetch version-specific API.

---

## Responsive Breakpoints

Mobile: <768px | Tablet: 768-1024px | Desktop: >1024px

---

## Figma sync discipline

The installed `figma` MCP is **`figma-developer-mcp` (Framelink)** — it exposes `get_figma_data`
(layout + styles + text + component tree) and `download_figma_images`. It does **not** expose the
Dev-Mode-MCP tools `get_variable_defs` / `get_code_connect_map` — don't call those; they error on this server.

Treat Figma as a *source*, not a regenerator:

- **Sync tokens, don't re-pick.** Call `get_figma_data`, read the colors/typography/spacing out of its
  style + node data, and feed them INTO the `design-tokens` skill's OKLCH system + `.claude/design/design-system.md`
  (one source of truth) — never hand-copy hexes into components. Figma styles → `--brand-hue`/semantic tokens.
- **Reuse existing components, don't duplicate.** There is no Code Connect map on this server, so before
  generating a node, name-match its Figma layer name against `src/components/` and compose the existing
  component if one matches. Regenerating existing components is the #1 source of design-system drift.
- **Assets:** pull images/icons with `download_figma_images` rather than re-tracing them.
