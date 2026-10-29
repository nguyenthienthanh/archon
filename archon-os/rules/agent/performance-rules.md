> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Performance Rules

**Category:** Code Quality
**Priority:** High
**Enforcement:** Code Review + Performance Testing

---

## Core Principle

**Measure before optimizing. Set budgets, enforce them, and lazy-load everything non-critical.**

---

## Targets

```toon
web_targets[5]{metric,target}:
  First Contentful Paint,<1.5s
  Largest Contentful Paint,<2.5s
  Time to Interactive,<5s
  Cumulative Layout Shift,<0.1
  First Input Delay,<100ms
```

```toon
mobile_targets[5]{metric,target}:
  App Launch,<2s
  Screen Navigation,<300ms
  List Scrolling,60fps (16.67ms/frame)
  Animation,60fps
  Memory,<200MB baseline
```

---

## Key Optimizations

### Memoization & Lazy Loading

```typescript
// Memoize expensive components
const Heavy = React.memo(({ data }) => <div>{/* render */}</div>)

// Memoize calculations
const sorted = useMemo(() => data.sort((a, b) => a.value - b.value), [data])

// Code splitting
const HeavyComponent = lazy(() => import('./HeavyComponent'))
```

### List Virtualization (>100 items)

```typescript
<FlatList
  data={items}
  renderItem={renderItem}
  initialNumToRender={10}
  maxToRenderPerBatch={10}
  windowSize={5}
  removeClippedSubviews={true}
/>
```

### API Optimization

- Batch requests: `fetchUsers([id1, id2, id3])` not sequential awaits
- Cache with staleTime/cacheTime (TanStack Query)
- Paginate: never fetch all records at once

### Images

- Specify width/height (prevents CLS)
- Use responsive srcSet
- WebP format, 80-85% quality, SVG for icons
- Lazy load below-fold images

### Bundle Size

- Named imports for tree shaking
- Budget: maxAssetSize 300KB, maxEntrypointSize 500KB
- Analyze with webpack-bundle-analyzer

---

## Memory Management

Always cleanup: unsubscribe, clearInterval, abort controllers in useEffect return.

---

## Database

- Eager load to prevent N+1 queries
- Index frequently queried columns

---

## Checklist

- [ ] Lighthouse > 90
- [ ] No render > 16ms
- [ ] Bundle within budget
- [ ] No memory leaks
- [ ] API response < 200ms

---

**Applied in:** Phase 4 (Refactor + Review)
