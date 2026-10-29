# Styling Detection — AI Reference

**Format:** TOON | **Human version:** `docs/guides/STYLING_DETECTION_GUIDE.md` (repo root)

**CRITICAL:** Adapt to project's existing styling approach. Project Context > Agent Preference.

---

## Detection Steps

```toon
detection[3]{step,action,source}:
  1,Check project-config.yaml,`.claude/project-contexts/[project]/project-config.yaml` → tech_stack.styling.approach
  2,Scan codebase patterns,grep for className= (NativeWind) | styled. (Emotion) | StyleSheet.create (RN) | @apply (Tailwind)
  3,Apply detected approach,Use ONLY the detected approach — never mix or override
```

## Framework Detection Patterns

```toon
patterns[8]{indicator,framework,confidence}:
  className= in .tsx/.jsx,NativeWind or Tailwind,High
  styled. or import styled,Emotion / styled-components,High
  StyleSheet.create,React Native StyleSheet,High
  @apply in CSS,Tailwind CSS,High
  tailwind.config,Tailwind CSS,Definitive
  nativewind in package.json,NativeWind,Definitive
  .module.css imports,CSS Modules,High
  sx= prop usage,MUI/Chakra,High
```

## Rules

```toon
rules[4]{rule,detail}:
  Never mix approaches,If project uses NativeWind — use className= everywhere
  Check config first,project-config.yaml is authoritative
  Verify before generating,Scan 3-5 existing components to confirm detected pattern
  Respect theme providers,Use project's theme system — never hardcode colors/spacing
```
