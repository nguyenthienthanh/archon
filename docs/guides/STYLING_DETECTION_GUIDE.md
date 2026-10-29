---
last_aligned_with: v3.7.3
status: needs_review
audience: active-user
---

# Styling Approach Detection Guide

**Last Updated:** 2024-11-26
**Purpose:** Guide agents to detect and use the correct styling approach for each project

---

## 🎯 Overview

**CRITICAL:** Agents must adapt to the project's existing styling approach, not enforce their own preferences.

**Key Principle:** **Project Context > Agent Preference**

---

## 🔍 Detection Process (3 Steps)

### Step 1: Check Project Context

**ALWAYS check `.claude/project-contexts/[project]/project-config.yaml` FIRST**

```yaml
tech_stack:
  styling:
    approach: "nativewind"  # or emotion, stylesheet, styled-components, etc.
    theme_provider: "proj-ui-components"  # or custom, none
    use_theme_colors: true
```

**If `styling.approach` is defined** → Use that approach, proceed to Step 3

**If NOT defined** → Continue to Step 2

---

### Step 2: Detect from Existing Code

**Scan the codebase for styling patterns:**

```bash
# 1. NativeWind Detection
grep -r "className=" src/ --include="*.tsx" --include="*.jsx" | head -5

# Example matches:
# <View className="flex-1 bg-white">
# → NativeWind detected

# 2. Emotion / Styled Components Detection
grep -r "styled\." src/ --include="*.tsx" --include="*.ts" | head -5
grep -r "import styled" src/ --include="*.tsx" --include="*.ts" | head -5

# Example matches:
# const Container = styled.View`...`
# import styled from '@emotion/native'
# → Emotion/styled-components detected

# 3. StyleSheet Detection
grep -r "StyleSheet.create" src/ --include="*.tsx" --include="*.ts" | head -5

# Example matches:
# const styles = StyleSheet.create({...})
# → React Native StyleSheet detected

# 4. Theme Provider Detection
grep -r "useTheme" src/ --include="*.tsx" --include="*.ts" | head -5
grep -r "ThemeProvider" src/ --include="*.tsx" | head -5

# Example matches:
# import { useTheme } from 'proj-ui-components'
# const theme = useTheme()
# → Theme provider detected

# 5. Tailwind (Web) Detection
ls tailwind.config.js postcss.config.js 2>/dev/null

# If files exist → Tailwind CSS (web) detected

# 6. CSS Modules Detection
grep -r "\.module\.css" src/ --include="*.tsx" --include="*.jsx" | head -5

# Example matches:
# import styles from './Component.module.css'
# → CSS Modules detected
```

**Detection Results:**

| Pattern Found | Detected Approach | Confidence |
|---------------|------------------|------------|
| `className=` in `.tsx` + `tailwind.config.js` exists | NativeWind (React Native) | High |
| `className=` in `.tsx` + web project | Tailwind CSS (Web) | High |
| `styled.View` or `styled.Text` | Emotion/Styled Components | High |
| `StyleSheet.create` | React Native StyleSheet | High |
| `import styles from '*.module.css'` | CSS Modules | High |
| `useTheme` from custom lib | Custom Theme Provider | Medium |
| Multiple patterns | Mixed (ask user) | Low |
| No clear pattern | Ask user | N/A |

**If confident (High)** → Use detected approach, proceed to Step 3

**If uncertain (Low/Mixed)** → Continue to Step 3

---

### Step 3: Ask User (If Needed)

**When to ask:**
- No styling config in project-context
- No clear pattern detected in code
- Multiple conflicting patterns found
- Starting a new project

**How to ask:**

```markdown
**─────────────────────────────────────────────────────────**
🤖 **Agent:** mobile | 📋 **System:** Archon OS v1.10.0 | 🎯 **Phase:** 2 (Design)
**─────────────────────────────────────────────────────────**

🎨 **Styling Approach Selection**

I couldn't detect a clear styling approach for this project.

**I can use any of these methods:**

1. **NativeWind** (Tailwind CSS for React Native)
   - ✅ Fast development with utility classes
   - ✅ Consistent cross-platform styling
   - ✅ Modern, widely adopted

2. **Emotion** (CSS-in-JS with styled-components)
   - ✅ Component-scoped styles
   - ✅ Theme support
   - ✅ Dynamic styling

3. **StyleSheet** (React Native Standard)
   - ✅ Native performance
   - ✅ No additional dependencies
   - ✅ Simple and straightforward

4. **Styled Components** (Popular CSS-in-JS)
   - ✅ Template literals for styling
   - ✅ Theme support
   - ✅ Large ecosystem

5. **Custom UI Library** (e.g., proj-ui-components)
   - ✅ Pre-built components
   - ✅ Consistent design system
   - ✅ Your existing library

**Which would you prefer?**

(I'll remember this choice for the project)
```

**User Response Handling:**

```markdown
User: "Use NativeWind"

Agent:
✅ Got it! Using NativeWind (Tailwind CSS) for this project.

I'll update the project config to remember this:

```yaml
# .claude/project-contexts/[project]/project-config.yaml
tech_stack:
  styling:
    approach: nativewind
```

Let me continue with NativeWind styling...
```

---

## 📋 Styling Approach Specifications

### 1. NativeWind (Tailwind CSS for React Native)

**Detection:**
- `className=` in `.tsx` files
- `tailwind.config.js` exists
- `nativewind` in `package.json`

**Usage:**
```tsx
import { View, Text } from 'react-native';

<View className="flex-1 bg-white p-4 rounded-lg">
  <Text className="text-xl font-bold text-gray-900">Title</Text>
</View>
```

**Config:**
```yaml
tech_stack:
  styling:
    approach: nativewind
    config_file: tailwind.config.js
    use_theme_colors: true
```

**Resources:**
- Skill: `skills/nativewind-component-generator.md`
- Docs: https://www.nativewind.dev

---

### 2. Emotion (CSS-in-JS)

**Detection:**
- `import styled from '@emotion/native'`
- `styled.View` or `styled.Text` in code
- `@emotion/native` in `package.json`

**Usage:**
```tsx
import styled from '@emotion/native';

const Container = styled.View`
  flex: 1;
  background-color: ${props => props.theme.colors.white};
  padding: 16px;
`;

const Title = styled.Text`
  font-size: 24px;
  font-weight: bold;
`;

<Container>
  <Title>Title</Title>
</Container>
```

**Config:**
```yaml
tech_stack:
  styling:
    approach: emotion
    theme_provider: custom
    use_theme_colors: true
```

---

### 3. Styled Components

**Detection:**
- `import styled from 'styled-components/native'`
- `styled-components` in `package.json`

**Usage:**
```tsx
import styled from 'styled-components/native';

const Container = styled.View`
  flex: 1;
  background-color: ${props => props.theme.colors.white};
`;

<Container>
  <Title>Title</Title>
</Container>
```

**Config:**
```yaml
tech_stack:
  styling:
    approach: styled-components
    theme_provider: custom
```

---

### 4. React Native StyleSheet

**Detection:**
- `StyleSheet.create` in code
- No CSS-in-JS libraries in `package.json`

**Usage:**
```tsx
import { StyleSheet, View, Text } from 'react-native';

const Component = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Title</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});
```

**Config:**
```yaml
tech_stack:
  styling:
    approach: stylesheet
    theme_provider: none  # or custom if using useTheme
    use_theme_colors: true
```

---

### 5. Tailwind CSS (Web)

**Detection:**
- `className=` in web components
- `tailwindcss` in `package.json`
- `tailwind.config.js` exists
- Web framework (React, Vue, Next.js)

**Usage:**
```tsx
<div className="flex flex-col bg-white p-4 rounded-lg">
  <h1 className="text-2xl font-bold text-gray-900">Title</h1>
</div>
```

**Config:**
```yaml
tech_stack:
  styling:
    approach: tailwind
    config_file: tailwind.config.js
```

---

### 6. CSS Modules (Web)

**Detection:**
- `import styles from '*.module.css'`
- `.module.css` files in project

**Usage:**
```tsx
import styles from './Component.module.css';

<div className={styles.container}>
  <h1 className={styles.title}>Title</h1>
</div>
```

**Config:**
```yaml
tech_stack:
  styling:
    approach: css-modules
```

---

### 7. Custom UI Library

**Detection:**
- Custom component imports (e.g., `proj-ui-components`)
- Project-specific component library

**Usage:**
```tsx
import { Container, Typography, Button } from 'proj-ui-components';

<Container flex={1} padding={4}>
  <Typography variant="h1">Title</Typography>
  <Button onPress={() => {}}>Submit</Button>
</Container>
```

**Config:**
```yaml
tech_stack:
  styling:
    approach: custom
    theme_provider: proj-ui-components
    library: "proj-ui-components"
```

---

## 🤖 Agent Behavior

### Mobile React Native Agent

**ALWAYS follow this sequence:**

```typescript
// 1. Load project context
const projectConfig = loadProjectContext();

// 2. Check styling config
if (projectConfig.tech_stack?.styling?.approach) {
  // Use specified approach
  const stylingApproach = projectConfig.tech_stack.styling.approach;
  useStylingApproach(stylingApproach);
}
// 3. Else detect from code
else {
  const detected = detectStylingFromCode();

  if (detected.confidence === 'high') {
    // Use detected approach
    useStylingApproach(detected.approach);
  } else {
    // Ask user
    const userChoice = askUserForStylingApproach();
    updateProjectConfig(userChoice);
    useStylingApproach(userChoice);
  }
}
```

**Example Messages:**

**Scenario 1: Config specifies Emotion**
```markdown
**─────────────────────────────────────────────────────────**
🤖 **Agent:** mobile | 📋 **System:** Archon OS v1.10.0 | 🎯 **Phase:** 2 (Design)
**─────────────────────────────────────────────────────────**

✅ Detected styling approach: **Emotion** (from project config)

I'll use Emotion styled-components for all styling:

```tsx
import styled from '@emotion/native';

const Container = styled.View`...`;
```
```

**Scenario 2: Detected NativeWind from code**
```markdown
**─────────────────────────────────────────────────────────**
🤖 **Agent:** mobile | 📋 **System:** Archon OS v1.10.0 | 🎯 **Phase:** 2 (Design)
**─────────────────────────────────────────────────────────**

✅ Detected styling approach: **NativeWind** (from existing code)

I found multiple uses of `className=` with Tailwind utilities.

I'll use NativeWind for all new components:

```tsx
<View className="flex-1 bg-white p-4">
  <Text className="text-xl font-bold">Title</Text>
</View>
```
```

**Scenario 3: No clear approach, asking user**
```markdown
**─────────────────────────────────────────────────────────**
🤖 **Agent:** mobile | 📋 **System:** Archon OS v1.10.0 | 🎯 **Phase:** 2 (Design)
**─────────────────────────────────────────────────────────**

⚠️ No styling approach specified in project config.
⚠️ Couldn't detect clear pattern from existing code.

🎨 **Which styling approach should I use?**

1. NativeWind (Tailwind CSS)
2. Emotion (styled-components)
3. StyleSheet (RN standard)
4. Styled Components
5. Custom library

Please choose (1-5):
```

---

## 🎯 Universal Rules

**Regardless of styling approach:**

### ❌ NEVER Do This:

```tsx
// ❌ Hardcoded colors
<View style={{ backgroundColor: '#FF5733' }} />
<View className="bg-[#FF5733]" />

// ❌ Hardcoded spacing
<View style={{ padding: 16 }} />  // If theme has spacing scale

// ❌ Mixing approaches inconsistently
<View className="flex-1" style={{ backgroundColor: 'red' }} />  // Pick one!
```

### ✅ ALWAYS Do This:

```tsx
// ✅ Use theme colors
<View style={{ backgroundColor: theme.colors.primary }} />
<View className="bg-primary-500" />

// ✅ Use theme spacing (if defined)
<View style={{ padding: theme.spacing.md }} />
<View className="p-4" />

// ✅ Be consistent within file/component
// If using NativeWind, use NativeWind everywhere
// If using StyleSheet, use StyleSheet everywhere
```

---

## 📚 Agent Training

### For Mobile React Native Agent:

**I am a NativeWind EXPERT, but I ADAPT to project needs.**

**My workflow:**
1. **Check project config** → Use specified approach
2. **Detect from code** → Use detected approach
3. **Ask user** → Use their choice
4. **NEVER enforce NativeWind** if project uses something else

**Example Internal Dialogue:**

```
User: "Add a UserProfile component"

Me (Agent):
1. Load project context... ✓
2. Check styling.approach... = "emotion"
3. Decision: Use Emotion (project config says so)
4. Generate component with Emotion styled-components

[Generate code with Emotion, NOT NativeWind]
```

---

## 🎓 Quick Reference

### Detection Priority

```
1. Project Config (project-config.yaml)
   ↓ (if not found)
2. Code Pattern Detection (grep, file analysis)
   ↓ (if uncertain)
3. Ask User
   ↓ (after response)
4. Update Project Config
   ↓
5. Use Selected Approach
```

### Detection Commands

```bash
# Quick detection script
# Check project config
cat .claude/project-contexts/*/project-config.yaml | grep "styling:"

# Detect NativeWind
grep -r "className=" src/ --include="*.tsx" | wc -l

# Detect Emotion/Styled
grep -r "styled\." src/ --include="*.tsx" | wc -l

# Detect StyleSheet
grep -r "StyleSheet.create" src/ --include="*.tsx" | wc -l

# Check package.json
cat package.json | grep -E "(nativewind|emotion|styled-components)"
```

---

## ✅ Success Criteria

**Styling detection succeeds when:**

- ✅ Agent uses project's existing styling approach
- ✅ NO mixing of approaches within same component
- ✅ Agent asks user if truly uncertain
- ✅ Project config is updated with user choice
- ✅ Future components use same approach consistently
- ✅ Theme colors are used (no hardcoded colors)

---

## 📖 Related Documentation

- **Design System Library:** `skills/design-system-library/` → Full design system patterns
- **Design System Guide:** `docs/DESIGN_SYSTEM_GUIDE.md` → Selection and implementation
- **Design System Rule:** `rules/agent/design-system-usage.md` → Enforcement rules
- **Agent Guide:** `agents/mobile.md` → "Styling Conventions"
- **UI Expert Agent:** `agents/frontend.md` → Design system detection
- **NativeWind Skill:** `skills/nativewind-component-generator.md`
- **Project Config:** `.claude/project-contexts/template/project-config.yaml`
- **Conventions:** `.claude/project-contexts/template/conventions.md`

### Supported Design Systems (Full Docs)

| System | Skill File |
|--------|------------|
| Material UI | `skills/design-system-library/material-ui.md` |
| Ant Design | `skills/design-system-library/ant-design.md` |
| Tailwind CSS | `skills/design-system-library/tailwind-css.md` |
| shadcn/ui | `skills/design-system-library/shadcn-ui.md` |
| Chakra UI | `skills/design-system-library/chakra-ui.md` |
| NativeWind | `skills/design-system-library/nativewind.md` |
| Bootstrap | `skills/design-system-library/bootstrap.md` |
| Mantine | `skills/design-system-library/mantine.md` |
| Radix UI | `skills/design-system-library/radix-ui.md` |
| Headless UI | `skills/design-system-library/headless-ui.md` |

---

**Last Updated:** 2025-12-04
**Status:** Active Standard

## See Also

- [Design System Guide](DESIGN_SYSTEM_GUIDE.md) — UI library selection and implementation
- [Project Cache](../operations/PROJECT_CACHE.md) — How detection results are cached
