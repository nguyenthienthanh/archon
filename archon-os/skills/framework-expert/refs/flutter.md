> Framework reference: Flutter. Loaded on demand by the framework-expert bundle.

# Flutter Expert — Gotchas & Decisions

Use Context7 for full Flutter/Dart docs.

## Key Decisions

```toon
decisions[4]{choice,use_when}:
  Riverpod vs BLoC,"Riverpod: simpler apps + compile-safe. BLoC: complex event-driven + team conventions"
  StatelessWidget vs StatefulWidget,"Stateless default. Stateful only for local mutable state (animations/controllers)"
  go_router vs Navigator,"go_router for declarative deep linking. Navigator for simple stack-based"
  Feature-first vs Layer-first,"Feature-first: lib/features/auth/{data|domain|presentation}"
```

## Gotchas

- Always `const` constructors for immutable widgets — huge rebuild savings
- `BuildContext` used after async gap → widget may be unmounted. Check `mounted` first
- `ListView.builder` not `ListView(children:[...])` for long lists — avoids building all items
- `sealed class` for Result pattern (Success/Failure) — exhaustive switch
- Riverpod: `ref.watch` in build, `ref.read` in callbacks. Never `ref.watch` in callbacks
- BLoC: never emit state after `close()` — check `isClosed` in async operations
- Platform channels: always handle `MissingPluginException` for web/desktop
- `TextEditingController` and `AnimationController` MUST be disposed in `dispose()`
- `MediaQuery.of(context)` causes rebuilds — use `MediaQuery.sizeOf(context)` for just size
