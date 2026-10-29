> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Design System Usage

**Priority:** High
**Enforcement:** Code Generation + Code Review Phase
**Applies To:** All UI code (React, Vue, Angular, React Native, Next.js)

---

## Core Principle

**Use the project's established design system consistently. Never mix design systems or create custom styles that bypass it.**

---

## Detection

Before generating UI code, detect the design system:

```toon
detection[3]{method,what_to_check}:
  package.json,"@mui/material → MUI, antd → Ant Design, tailwindcss → Tailwind, @chakra-ui/react → Chakra, nativewind → NativeWind"
  Config files,"tailwind.config.js → Tailwind, components.json → shadcn/ui"
  Import patterns,"from '@mui/' → MUI, from 'antd' → Ant, from '@/components/ui/' → shadcn/ui"
```

If multiple or no systems detected, ask user.

---

## Anti-Patterns

```toon
anti_patterns[4]{pattern,example}:
  Mixing systems,"import Button from '@mui/material' + Input from 'antd'"
  Bypassing system,"style={{ marginTop: '17px', color: '#333' }} when Tailwind available"
  Native over component,"<button> when shadcn/ui Button exists"
  Hardcoding values,"padding: '16px', backgroundColor: '#f5f5f5' — use theme tokens"
```

---

## Correct Usage by System

```toon
system_patterns[4]{system,pattern}:
  Tailwind,"className='bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg'"
  MUI,"<Button variant='contained' sx={{ borderRadius: 2 }}>"
  Chakra,"<Button colorScheme='blue' size='md' borderRadius='lg'>"
  shadcn/ui,"import { Button } from '@/components/ui/button'"
```

---

## Selection Guide

| Project Type | Recommended | Alternative |
|--------------|-------------|-------------|
| Enterprise Web | Ant Design | MUI |
| Modern SaaS | shadcn/ui + Tailwind | Mantine |
| Quick Prototype | Bootstrap | Chakra UI |
| Mobile-First Web | Tailwind | Chakra UI |
| React Native | NativeWind | React Native Paper |
| Headless/Custom | Radix UI | Headless UI |

---

## Multi-System Projects

Tailwind + Radix (or shadcn/ui which combines both) is valid. Use Tailwind for styling, Radix for behavior.

---

## Exceptions

1. **Migration period** — legacy components allowed with `TODO: Migrate to X` comment
2. **Third-party integrations** — external libraries (e.g., recharts) use their own styles
3. **One-off customizations** — truly unique elements with explanatory comment

---

## Enforcement

- **Phase 3 (Build GREEN):** Use correct design system
- **Phase 4 (Refactor + Review):** Verify consistency — one system, theme tokens, no inline overrides

---

**Rule:** design-system-usage | **Priority:** High
