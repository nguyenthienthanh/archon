# Skill: Design System Implementation

**Category:** Design Expert
**Used By:** frontend, mobile, web-reactjs, web-vuejs, web-nextjs

---

## Overview

Building consistent, scalable design systems with reusable components and design tokens.

---

## Design Tokens

```typescript
// tokens/colors.ts
export const colors = {
  primary: { 50: '#e3f2fd', 500: '#2196f3', 600: '#1e88e5', 900: '#0d47a1' },
  gray: { 50: '#fafafa', 200: '#eeeeee', 500: '#9e9e9e', 900: '#212121' },
  success: '#4caf50', warning: '#ff9800', error: '#f44336', info: '#2196f3'
}

// tokens/spacing.ts
export const spacing = {
  xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px'
}

// tokens/typography.ts
export const typography = {
  fontFamily: { sans: "'Inter', system-ui, sans-serif", mono: "'Fira Code', monospace" },
  fontSize: { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem' },
  fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 }
}

// tokens/shadows.ts
export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.05)',
  md: '0 4px 6px rgba(0,0,0,0.1)',
  lg: '0 10px 15px rgba(0,0,0,0.1)'
}
```

---

## Component Structure

```
components/
├── atoms/          # Button, Input, Text, Icon
├── molecules/      # FormField, Card, SearchBar
├── organisms/      # Header, Footer, DataTable
└── templates/      # DashboardLayout, AuthLayout
```

---

## Button Component Example

```typescript
// Button.tsx
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: ReactNode
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', isLoading, leftIcon, children }: ButtonProps) {
  return (
    <button className={`btn btn--${variant} btn--${size}`} disabled={isLoading}>
      {isLoading && <Spinner />}
      {leftIcon && <span className="btn__icon">{leftIcon}</span>}
      <span className="btn__text">{children}</span>
    </button>
  )
}
```

---

## React Native Button

```typescript
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native'

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary'
  isLoading?: boolean
}

export function Button({ title, onPress, variant = 'primary', isLoading }: ButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], isLoading && styles.disabled]}
      onPress={onPress}
      disabled={isLoading}
    >
      {isLoading ? <ActivityIndicator color="white" /> : (
        <Text style={styles[`text_${variant}`]}>{title}</Text>
      )}
    </TouchableOpacity>
  )
}
```

---

## Theme Provider

```typescript
// providers/ThemeProvider.tsx
import { createContext, useContext, useState, ReactNode } from 'react'

type Theme = 'light' | 'dark'

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light')

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
```

---

## Best Practices

### Do's ✅
- Use design tokens for consistency
- Document all components
- Write Storybook stories
- Implement proper TypeScript types
- Follow atomic design principles
- Support dark mode
- Ensure accessibility

### Don'ts ❌
- Hardcode colors/spacing
- Create one-off components
- Skip documentation
- Ignore accessibility
- Make components too specific
- Forget responsive design

---

