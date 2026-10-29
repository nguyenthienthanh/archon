# Mobile Agent - Reference Patterns

**Source:** `agents/mobile.md`
**Load:** On-demand when deep mobile expertise needed

---

## Performance Targets (Non-Negotiable)

```toon
performance_gates[5]{metric,target,tool}:
  Cold Start,<2s to first content,Flipper/Systrace
  Frame Rate,60fps constant (16.67ms/frame),Perf Monitor
  JS Thread,No blocking operations,Flipper
  Memory,<200MB active usage,Xcode/Android Studio
  Touch Response,<100ms visual feedback,Manual testing
```

**FAIL the build if animations drop below 60fps.**

---

## Mobile UX Requirements

### Touch Targets (Non-Negotiable)

```toon
touch_targets[4]{element,minimum_size,spacing}:
  Primary buttons,48x48dp,8dp between
  Secondary buttons,44x44dp,8dp between
  List items,48dp height,No spacing needed
  Icons/links,44x44dp touch area,Even if icon is 24px
```

### Thumb Zones (One-Handed Use)

```toon
thumb_zones[3]{zone,position,use_for}:
  Easy (green),Bottom 40%,Primary actions + FAB + navigation
  Medium (yellow),Middle 40%,Content + secondary actions
  Hard (red),Top 20%,Rarely used + close + overflow menus
```

**Primary CTA at bottom of screen within thumb reach.**

---

## Platform Conventions

```toon
ios_patterns[6]{element,pattern}:
  Navigation,Large titles + back text + swipe-to-go-back
  Tab bar,Bottom (max 5) + labels always visible
  Buttons,System blue #007AFF + SF Symbols
  Modals,Sheet from bottom + swipe down to dismiss
  Destructive actions,Red text + confirmation sheet
  Haptics,UIImpactFeedbackGenerator on significant actions
```

```toon
android_patterns[6]{element,pattern}:
  Navigation,Top app bar + NavigationDrawer or BottomNav
  FAB,Bottom right + primary action + ripple
  Buttons,Filled/Outlined/Text + Material You colors
  Modals,Full-screen or bottom sheet + scrim
  Snackbars,Bottom + action button + auto-dismiss (4s)
  Haptics,HapticFeedbackConstants on key interactions
```

---

## Implementation Patterns

**Lists:** Use FlashList for large lists with `estimatedItemSize`. Memoize `renderItem` with `useCallback`. Never use `ScrollView` with `.map()` for lists.

**Navigation:** Type-safe with `RootStackParamList` typing on `useNavigation`.

**Animations:** Use Reanimated (`useSharedValue`, `withSpring`, `useAnimatedStyle`). Use Gesture Handler for gestures. 60fps required.

**Loading states:** Skeleton screens matching content layout. Pull-to-refresh for lists. Haptic feedback on significant actions.

---

## Supported Frameworks

```toon
frameworks[2]{framework,key_tech,skill}:
  React Native,"Expo, NativeWind, React Navigation",skills/framework-expert/refs/react-native.md
  Flutter,"Dart, BLoC/Riverpod, Material/Cupertino",skills/framework-expert/refs/flutter.md
```

---

## Core Competencies

```toon
competencies[10]{area,technologies}:
  Cross-Platform,"React Native, Flutter, Expo"
  Navigation,"React Navigation (typed), go_router"
  State,"Zustand, Redux Toolkit, BLoC, Riverpod"
  Styling,"NativeWind, StyleSheet, Flutter themes"
  Native Modules,"Turbo Modules, Platform Channels"
  Testing,"Jest, Detox, Flutter test, Maestro"
  Performance,"Hermes, Impeller, FlashList, profiling"
  Storage,"MMKV (fast), SecureStore (sensitive), AsyncStorage"
  Notifications,"Firebase Cloud Messaging, APNS"
  Deep Linking,"Universal/App Links, Expo Linking"
```

---

## Quality Checklist (Every PR)

Touch targets >=48dp primary/>=44dp secondary. Primary actions in bottom 40%. 60fps verified. Skeleton loaders match content. Error states have retry. Haptic feedback on key interactions. Tested on both iOS and Android. Swipe gestures work (back, dismiss, refresh).
