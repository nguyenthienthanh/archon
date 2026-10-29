---
last_aligned_with: v3.7.3
status: needs_review
audience: active-user
---

# Design System Guide

**Last Updated:** 2025-12-04

This guide helps AI agents and developers build applications using popular design systems. It covers detection, selection, and implementation best practices.

---

## Table of Contents

1. [Supported Design Systems](#supported-design-systems)
2. [Auto-Detection](#auto-detection)
3. [Selection Guide](#selection-guide)
4. [Implementation Workflow](#implementation-workflow)
5. [Configuration Examples](#configuration-examples)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Supported Design Systems

| Design System | Platform | Best For | Skill File |
|--------------|----------|----------|------------|
| **Material UI (MUI)** | React, Next.js | Google ecosystem, enterprise | `material-ui.md` |
| **Ant Design** | React, Vue | Enterprise, data-heavy apps | `ant-design.md` |
| **Tailwind CSS** | All frameworks | Custom designs, flexibility | `tailwind-css.md` |
| **shadcn/ui** | React, Next.js | Modern apps, customization | `shadcn-ui.md` |
| **Chakra UI** | React, Next.js | Rapid development, accessibility | `chakra-ui.md` |
| **NativeWind** | React Native, Expo | Mobile apps with Tailwind | `nativewind.md` |
| **Bootstrap** | All frameworks | Quick prototypes, familiar | `bootstrap.md` |
| **Mantine** | React, Next.js | Full-featured, dark mode | `mantine.md` |
| **Radix UI** | React | Headless, maximum control | `radix-ui.md` |
| **Headless UI** | React, Vue | Tailwind integration, headless | `headless-ui.md` |

---

## Auto-Detection

### Detection Priority

1. **Package.json dependencies** (most reliable)
2. **Configuration files**
3. **Import patterns in existing code**
4. **User specification**

### Package.json Signatures

```javascript
// Detection rules
const detectDesignSystem = (dependencies) => {
  if (dependencies['@mui/material']) return 'material-ui';
  if (dependencies['antd']) return 'ant-design';
  if (dependencies['@chakra-ui/react']) return 'chakra-ui';
  if (dependencies['@mantine/core']) return 'mantine';
  if (dependencies['nativewind']) return 'nativewind';
  if (dependencies['bootstrap'] || dependencies['react-bootstrap']) return 'bootstrap';
  if (dependencies['@radix-ui/react-dialog']) return 'radix-ui';
  if (dependencies['@headlessui/react']) return 'headless-ui';
  if (dependencies['tailwindcss']) {
    // Check for shadcn/ui
    if (fs.existsSync('components.json')) return 'shadcn-ui';
    return 'tailwind-css';
  }
  return 'unknown';
};
```

### Config File Detection

| Config File | Design System |
|------------|---------------|
| `tailwind.config.js` | Tailwind CSS |
| `components.json` | shadcn/ui |
| `nativewind.config.js` | NativeWind |
| `emotion.d.ts` | MUI or Chakra (with Emotion) |

---

## Selection Guide

### By Project Type

```
Enterprise Dashboard
├── First Choice: Ant Design
│   └── Rich tables, forms, data visualization
├── Alternative: Material UI
│   └── Google ecosystem, material design
└── Budget Option: Mantine
    └── Full-featured, less learning curve

Modern SaaS Application
├── First Choice: shadcn/ui + Tailwind
│   └── Maximum flexibility, copy-paste components
├── Alternative: Chakra UI
│   └── Great DX, accessible by default
└── Budget Option: Mantine
    └── Batteries included

Marketing Website
├── First Choice: Tailwind CSS
│   └── Full design freedom
├── Alternative: Bootstrap
│   └── Quick, well-documented
└── With React: shadcn/ui
    └── Beautiful defaults

Mobile Application (React Native)
├── First Choice: NativeWind
│   └── Tailwind for mobile
├── Alternative: React Native Paper
│   └── Material Design for mobile
└── Cross-platform: Tamagui
    └── Web + mobile unified

Headless / Custom Design
├── First Choice: Radix UI + Tailwind
│   └── Accessible primitives, custom styling
└── Alternative: Headless UI
    └── Tailwind Labs, simpler API
```

### By Team Experience

| Team Background | Recommended |
|-----------------|-------------|
| Bootstrap experience | Bootstrap 5, then Tailwind |
| Material Design fans | Material UI |
| Tailwind comfortable | shadcn/ui or Headless UI |
| Accessibility focus | Chakra UI or Radix UI |
| Enterprise/Java teams | Ant Design |
| Mobile-first thinking | NativeWind |

### By Feature Requirements

| Need | Best Choice |
|------|-------------|
| Complex data tables | Ant Design (ProTable) |
| Form handling | Mantine or Ant Design |
| Animations | Framer Motion + Tailwind |
| Charts | Ant Design Charts or Recharts |
| Dark mode | Mantine or Chakra UI |
| i18n support | Ant Design or MUI |
| SSR/Next.js | shadcn/ui or MUI |
| Minimal bundle | Tailwind + Headless UI |

---

## Implementation Workflow

### Step 1: Detect Design System

```bash
# Check package.json
cat package.json | grep -E "@mui|antd|tailwindcss|chakra|mantine|nativewind|bootstrap|radix|headless"

# Check for config files
ls -la | grep -E "tailwind|components.json|nativewind"

# Check imports in existing code
grep -r "from '@mui" src/
grep -r "from 'antd" src/
grep -r "from '@chakra" src/
```

### Step 2: Load Skill

```markdown
If detected 'material-ui':
  → Load skills/design-system-library/material-ui.md

If detected 'ant-design':
  → Load skills/design-system-library/ant-design.md

If detected 'tailwind-css':
  → Load skills/design-system-library/tailwind-css.md

[Continue for each design system...]
```

### Step 3: Follow Patterns

Each skill file contains:
- Installation instructions
- Theme configuration
- Component patterns
- Best practices
- Common imports

### Step 4: Generate Code

Use the loaded skill's patterns for consistent code generation.

---

## Configuration Examples

### Tailwind CSS + shadcn/ui

```javascript
// tailwind.config.js
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

### Material UI Theme

```typescript
// theme.ts
import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' },
  },
  typography: {
    fontFamily: '"Inter", sans-serif',
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
    },
  },
});
```

### Chakra UI Theme

```typescript
// theme.ts
import { extendTheme } from '@chakra-ui/react';

export const theme = extendTheme({
  colors: {
    brand: {
      50: '#e6f6ff',
      500: '#0080e6',
      900: '#001a1a',
    },
  },
  fonts: {
    heading: `'Inter', sans-serif`,
    body: `'Inter', sans-serif`,
  },
});
```

### NativeWind Config

```javascript
// tailwind.config.js
module.exports = {
  content: ['./app/**/*.{js,tsx}', './components/**/*.{js,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
      },
    },
  },
};
```

---

## Best Practices

### General

1. **One design system per project** - Don't mix MUI with Ant Design
2. **Use theme tokens** - Never hardcode colors, spacing, or sizes
3. **Follow the system's patterns** - Use their components, not native HTML
4. **Keep it consistent** - Same button style everywhere
5. **Responsive from the start** - Use the system's responsive utilities

### Tailwind-Specific

```tsx
// DO: Use utility classes
<button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg">

// DON'T: Mix with inline styles
<button className="bg-blue-600" style={{ padding: '16px' }}>

// DO: Use @apply for repeated patterns
@layer components {
  .btn-primary { @apply bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg; }
}
```

### Component Library-Specific

```tsx
// DO: Use the library's components
import { Button } from '@mui/material';
<Button variant="contained">Click me</Button>

// DON'T: Create custom when library provides
const MyButton = styled.button`...`;  // BAD when MUI has Button
```

### Theming

```tsx
// DO: Access theme values
const theme = useTheme();
<Box sx={{ color: theme.palette.primary.main }}>

// DON'T: Hardcode values
<Box sx={{ color: '#1976d2' }}>
```

---

## Troubleshooting

### Common Issues

#### Issue: Components don't match existing styles

**Solution:** Check if there's a custom theme. Look for:
- `theme.ts` or `theme.js`
- CSS variables in `globals.css`
- `ThemeProvider` configuration

#### Issue: Dark mode not working

**Solution:** Verify dark mode configuration:
- Tailwind: Check `darkMode: 'class'` in config
- MUI: Ensure `ThemeProvider` with dark theme
- Chakra: Use `ColorModeProvider`

#### Issue: Styles not applying

**Solution:** Check CSS import order:
```tsx
// Correct order
import '@/styles/globals.css';  // Base styles first
import '@mantine/core/styles.css';  // Library styles
```

#### Issue: SSR hydration errors

**Solution:** For Next.js App Router:
- MUI: Use `@mui/material-nextjs`
- Ant Design: Use `@ant-design/nextjs-registry`
- Mantine: Follow SSR guide

### When to Ask User

If detection is ambiguous, ask:

```markdown
I detected multiple potential design systems:
- tailwindcss (in package.json)
- @radix-ui/react-dialog (in package.json)

Which should I use as the primary?
1. Tailwind CSS with custom components
2. Radix UI primitives with Tailwind styling
3. shadcn/ui (Radix + Tailwind combined)
```

---

## Related Resources

- **Skills:** `skills/design-system-library/`
- **Rules:** `rules/agent/design-system-usage.md`, `rules/agent/theme-consistency.md`
- **Agent:** `agents/frontend.md`
- **Detection:** `docs/STYLING_DETECTION_GUIDE.md`

---

## Changelog

### v1.0.0 (2025-12-04)
- Initial release
- Support for 10 design systems
- Auto-detection logic
- Selection guide
- Configuration examples

---

**Maintained by:** Archon OS Team

## See Also

- [Styling Detection Guide](STYLING_DETECTION_GUIDE.md) — How agents auto-detect CSS frameworks
- `skills/design-system-library/` — Design system selection skill
