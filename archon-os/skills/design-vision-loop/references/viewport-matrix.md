# Viewport Matrix

Default capture set for the vision loop. Covers the responsive breakpoints the house style already uses
(`rules/agent/frontend-excellence.md`: mobile <768 / tablet 768–1024 / desktop >1024).

```toon
viewports[3]{name,width,height,why}:
  mobile,375,812,"thumb-zone + overflow — the width most AI UI breaks at"
  tablet,768,1024,"grid reflow boundary; where columns collapse/expand"
  desktop,1440,900,"primary design width; hierarchy + whitespace read here"
```

## Dark mode

Capture the **primary viewport (1440)** a second time with `prefers-color-scheme: dark` emulated. Add a
mobile-dark shot only if the UI has mobile-specific dark surfaces. Skip entirely (and note it) if the design
system declares no dark theme.

## When to trim or extend

- **Single component in isolation** → mobile + desktop is enough; skip tablet unless it has a reflow.
- **Data-dense dashboard / table** → add a `1920` shot; wide layouts hide overflow at 1440.
- **Mobile-only app (RN web preview)** → 375 + 414; drop desktop.
- Keep the set small — each shot is a vision call. Default 3 widths + 1 dark = 4 captures per route.
