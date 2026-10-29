> Framework reference: Vue. Loaded on demand by the framework-expert bundle.

# Vue Expert — Gotchas & Decisions

Use Context7 for full Vue/Nuxt docs.

## Key Decisions

```toon
decisions[4]{choice,use_when}:
  ref vs reactive,"ref for primitives + single values. reactive for objects. Never destructure reactive — loses reactivity"
  Pinia vs provide/inject,"Pinia for shared app state. provide/inject for component tree scoping"
  Options vs Composition,"Always Composition API with <script setup>. Options only for legacy"
  Composables vs mixins,"Always composables (use* functions). Mixins are deprecated pattern"
```

## Gotchas

- Destructuring `reactive()` object loses reactivity — use `toRefs()` or stick with `ref()`
- `ref()` auto-unwraps in template but NOT in JS — use `.value` in script
- `watch` vs `watchEffect`: watch needs explicit source, watchEffect auto-tracks. Use watch for old/new comparison
- `computed` is readonly — don't assign to it. Use writable computed with get/set if needed
- `<script setup>` auto-exposes to template but NOT to parent `$refs` — use `defineExpose()`
- Props are readonly — never mutate. Emit event to parent instead
- `v-for` + `v-if` on same element: `v-if` has higher priority in Vue 3 (opposite of Vue 2)
- Pinia: use `storeToRefs()` for destructuring store state/getters. Actions don't need it
- `nextTick()` needed after state change to access updated DOM
