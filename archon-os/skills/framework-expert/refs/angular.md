> Framework reference: Angular. Loaded on demand by the framework-expert bundle.

# Angular Expert — Gotchas & Decisions

Use Context7 for full Angular docs.

## Key Decisions

```toon
decisions[4]{choice,use_when}:
  Signals vs Observables,"Signals for sync UI state. Observables for async streams/HTTP. Bridge with toSignal()/toObservable()"
  NgRx vs Signals,"NgRx for complex shared state with effects. Signals for component/simple app state"
  Standalone vs Module,"Always standalone (Angular 17+). Modules only for legacy"
  OnPush vs Default,"Always OnPush. Requires immutable patterns"
```

## Gotchas

- `@for` requires `track` — use `track item.id` not `trackBy` function
- `takeUntilDestroyed(this.destroyRef)` must be called in injection context (constructor or field init)
- `toSignal()` returns `Signal<T | undefined>` — handle the undefined
- `NonNullableFormBuilder` for typed forms — plain `FormBuilder` loses types
- `@defer (on viewport)` needs `@placeholder` block or nothing renders
- Functional guards/interceptors: use `inject()` not constructor DI
