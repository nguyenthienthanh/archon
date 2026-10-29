> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Correct File Extensions - JSX/TSX for Components

**Priority:** Medium
**Applies To:** All JavaScript/TypeScript files

---

## Core Principle

**If file contains JSX/components → `.jsx` or `.tsx`**
**If file has no JSX → `.js` or `.ts`**

---

## Quick Reference

```toon
extensions[4]{content,extension}:
  "React component with JSX",.tsx
  "Hook returning JSX",.tsx
  "Utility functions (no JSX)",.ts
  "Constants/types (no JSX)",.ts
```

---

## What NOT to Do

### JSX in Wrong Extension

```typescript
// ❌ BAD - File: Button.ts (contains JSX!)
export const Button = () => {
  return <button>Click me</button>;
};
// TypeScript will error - JSX not allowed in .ts
```

### Non-JSX in Wrong Extension

```typescript
// ❌ BAD - File: utils.tsx (no JSX!)
export const formatDate = (date: Date): string => {
  return date.toISOString();
};
// Misleading - suggests JSX but has none
```

---

## What TO Do

### Component Files → `.tsx`

```typescript
// ✅ GOOD - File: Button.tsx
export const Button = () => {
  return <button>Click me</button>;
};
```

### Utility Files → `.ts`

```typescript
// ✅ GOOD - File: utils.ts
export const formatDate = (date: Date): string => {
  return date.toISOString();
};
```

### Hooks with JSX → `.tsx`

```typescript
// ✅ GOOD - File: useUserLogic.tsx (if hook returns JSX)
export const useUserLogic = () => {
  const UserBadge = () => <div>Badge</div>;
  return { UserBadge };
};
```

### Hooks without JSX → `.ts`

```typescript
// ✅ GOOD - File: useUser.ts (no JSX)
export const useUser = () => {
  const [user, setUser] = useState(null);
  return { user, setUser };
};
```

---

## File Naming Guide

```toon
file_types[6]{type,extension,example}:
  Component,.tsx,Button.tsx
  Page/Screen,.tsx,HomeScreen.tsx
  Hook (no JSX),.ts,useAuth.ts
  Hook (with JSX),.tsx,useModal.tsx
  Utility,.ts,utils.ts
  Types,.ts,types.ts
```

---

## Code Review Checklist

- [ ] Components use `.tsx` or `.jsx`
- [ ] Utilities use `.ts` or `.js`
- [ ] No JSX in `.ts` files
- [ ] No empty `.tsx` files (no JSX)
- [ ] Hook extensions match content

---

