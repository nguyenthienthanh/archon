> Framework reference: React Native. Loaded on demand by the framework-expert bundle.

# React Native Expert — Gotchas & Decisions

Use Context7 for React Native/Expo docs.

## Key Decisions

```toon
decisions[4]{choice,use_when}:
  FlatList vs FlashList,"FlashList (@shopify/flash-list) for large lists — 5-10x faster. FlatList for simple short lists"
  Storage hierarchy,"AsyncStorage: non-sensitive KV. SecureStore: tokens/secrets. MMKV: high-perf sync access"
  Expo vs bare RN,"Expo: most projects (EAS Build handles native). Bare: custom native modules required"
  NativeWind vs StyleSheet,"NativeWind for Tailwind familiarity. StyleSheet for performance-critical views"
```

## Gotchas

- FlatList: always set `keyExtractor`, `getItemLayout` (fixed height), `maxToRenderPerBatch`, `windowSize`
- `ScrollView` inside `FlatList` or vice versa — causes layout issues. Use `SectionList` or nested FlatList with `horizontal`
- `Platform.select({ ios: X, android: Y, default: Z })` — always include `default` for web
- `Animated.Value` persists across renders — create in `useRef` not `useState`
- `useWindowDimensions()` over `Dimensions.get()` — the hook updates on rotation
- Expo: `npx expo install` for compatible package versions — `npm install` may get incompatible versions
- `react-native-safe-area-context` > `SafeAreaView` from react-native (more reliable on Android)
- Deep linking: configure both `app.json` scheme AND native URL schemes for universal links
- `console.log` in production kills performance — use `__DEV__` guard or babel plugin to strip
