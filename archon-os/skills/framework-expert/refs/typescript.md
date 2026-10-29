> Framework reference: TypeScript. Loaded on demand by the framework-expert bundle.

# TypeScript Expert — Gotchas & Decisions

Use Context7 for TypeScript docs.

## Strict Config (Always Enable)

```json
{ "strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true }
```

## Nullish Patterns

```toon
nullish[5]{bad,good,why}:
  "if (x)",if (x != null),"Empty string/0 are falsy but valid"
  "x || default","x ?? default","?? only catches null/undefined not falsy"
  "x!.prop",Type narrowing or optional chain,"! asserts non-null — hides bugs"
  "as Type",Type guard function,"as bypasses type checker"
  "any","unknown + narrowing","any disables ALL checking"
```

## Type Guards

```typescript
// User-defined type guard
function isUser(x: unknown): x is User {
  return typeof x === 'object' && x !== null && 'id' in x;
}

// Discriminated union (preferred for variants)
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
```

## Gotchas

- `Object.keys()` returns `string[]` not `(keyof T)[]` — by design. Use `for...in` with type assertion if needed
- `enum` generates runtime code — prefer `as const` objects or union types
- Generic defaults: `function f<T = string>()` — T is inferred from usage, default only if no inference possible
- `satisfies` for type checking without widening: `const x = { a: 1 } satisfies Record<string, number>`
- `readonly` arrays: `ReadonlyArray<T>` or `readonly T[]` — prevents push/pop/splice
- Index signatures `[key: string]: T` make ALL properties optional — use `noUncheckedIndexedAccess`
