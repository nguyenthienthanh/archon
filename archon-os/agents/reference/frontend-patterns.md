# Frontend Agent - Reference Patterns

**Source:** `agents/frontend.md`
**Load:** On-demand when deep frontend/UI expertise needed

---

## Framework Patterns

```toon
react_patterns[6]{pattern,implementation}:
  Components,Functional with TypeScript + explicit prop types
  State,useState for local + useReducer for complex + context sparingly
  Effects,Cleanup functions + correct dependencies + avoid overuse
  Memoization,useMemo/useCallback only when needed (measure first)
  Error Handling,Error boundaries + try-catch in async
  Data Fetching,TanStack Query or SWR + loading/error states
```

```toon
vue_patterns[6]{pattern,implementation}:
  Components,Script setup + TypeScript + defineProps/defineEmits
  Reactivity,ref for primitives + reactive for objects
  Composables,use* naming + return reactive refs
  State,Pinia with typed stores
  Watchers,watchEffect for side effects + watch for specific deps
  Async,Suspense + async components + error handling
```

```toon
angular_patterns[6]{pattern,implementation}:
  Components,Standalone + signals for state
  Services,Injectable with providedIn root
  State,Signals or NgRx for complex apps
  Forms,Reactive forms with typed FormBuilder
  HTTP,Typed HTTP client + interceptors
  Change Detection,OnPush + async pipe + signals
```

```toon
nextjs_patterns[6]{pattern,implementation}:
  Components,Server Components default + 'use client' when needed
  Data Fetching,fetch in Server Components + revalidate
  Routing,App Router + layouts + loading/error states
  Forms,Server Actions + useFormState/useFormStatus
  Caching,Time-based + on-demand revalidation
  Metadata,generateMetadata for dynamic SEO
```

---

## Design System Integration

```toon
design_systems[10]{system,detection,approach}:
  Material UI (MUI),@mui/material in deps,sx prop + theme customization
  Ant Design,antd in deps,ConfigProvider + token customization
  Tailwind CSS,tailwind.config.*,Utility classes + custom components
  shadcn/ui,components.json,Copy-paste + customize
  Chakra UI,@chakra-ui/react,Theme tokens + style props
  NativeWind,nativewind in deps,Tailwind for React Native
  Bootstrap,bootstrap in deps,Utility classes + components
  Mantine,@mantine/core,Theme + components
  Radix UI,@radix-ui/*,Unstyled primitives + custom styling
  Headless UI,@headlessui/react,Unstyled + Tailwind styling
```

---

## Component Architecture

```toon
composition[5]{pattern,when_to_use,example}:
  Compound Components,Related components sharing state,Tabs + TabList + Tab + TabPanel
  Render Props,Dynamic rendering logic,<List renderItem={(item) => ...}>
  Slots/Children,Flexible content injection,<Card header={...} footer={...}>
  HOC,Cross-cutting concerns (legacy),withAuth(Component)
  Hooks,Reusable logic extraction,useForm() usePagination()
```

### Props Design Principles

Minimal API (expose only what's needed). Consistent naming (onClick/onChange/onSubmit). Sensible defaults. Explicit TypeScript types. Prefer children over complex config objects.

---

## Accessibility (WCAG 2.1)

```toon
accessibility[8]{category,requirements}:
  Perceivable,Alt text + color contrast (4.5:1) + captions
  Operable,Keyboard navigation + focus visible + no traps
  Understandable,Clear labels + error messages + consistent nav
  Robust,Valid HTML + ARIA when needed + screen reader testing
  Forms,Labels + error association + field descriptions
  Images,Alt text + decorative images aria-hidden
  Focus,Visible focus indicator + logical tab order
  Motion,Reduced motion support + no auto-play
```

---

## Responsive Design

```toon
breakpoints[5]{name,size,target}:
  sm,640px,Mobile landscape
  md,768px,Tablets
  lg,1024px,Small laptops
  xl,1280px,Desktops
  2xl,1536px,Large screens
```

Mobile-first approach: base styles for mobile, progressive enhancement via media queries.

---

## Performance

```toon
performance[8]{technique,implementation}:
  Code Splitting,Dynamic imports + React.lazy + route-based
  Image Optimization,next/image or responsive images + WebP + lazy
  Bundle Size,Tree shaking + analyze with webpack-bundle-analyzer
  Render Optimization,React.memo + useMemo + virtualization
  CSS,Critical CSS inline + async non-critical
  Fonts,font-display: swap + preload + subset
  Third-Party,Defer non-critical + facade pattern
  Core Web Vitals,LCP <2.5s + INP <200ms + CLS <0.1
```

---

## State Management

```toon
state_choice[5]{approach,when_to_use}:
  Local State (useState),Component-specific + simple
  Context,Theme/auth/i18n + infrequent updates
  Zustand,Medium apps + simple API + no boilerplate
  Redux Toolkit,Large apps + complex state + time-travel debugging
  TanStack Query,Server state + caching + sync
```

---

## Animation

```toon
animations[4]{type,library,use_case}:
  CSS Transitions,Native CSS,Simple hover/focus states
  CSS Animations,Native CSS,Looping animations + keyframes
  Framer Motion,framer-motion,Complex React animations
  React Spring,@react-spring/web,Physics-based animations
```
