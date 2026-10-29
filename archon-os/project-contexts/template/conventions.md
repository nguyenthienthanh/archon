# Project Conventions

**Project:** Your Project Name  
**Last Updated:** 2025-11-24

---

## File Naming Conventions

### Components

```
# React/React Native
PascalCase.tsx
Example: UserProfile.tsx, LoginForm.tsx

# Vue
kebab-case.vue
Example: user-profile.vue, login-form.vue

# Test files
ComponentName.test.tsx
Example: UserProfile.test.tsx
```

### Hooks/Composables

```
# React
useCamelCase.ts
Example: useAuth.ts, useForm.ts

# Vue
useCamelCase.ts or camelCase.ts
Example: useUser.ts, useValidation.ts
```

### Utilities

```
camelCase.ts
Example: formatDate.ts, validateEmail.ts
```

### Constants

```
UPPER_SNAKE_CASE.ts
Example: API_ENDPOINTS.ts, CONFIG.ts
```

---

## Directory Structure

### Recommended Structure

```
src/
├── components/           # Reusable components
│   ├── ui/              # UI components (Button, Input, etc.)
│   └── features/        # Feature-specific components
├── features/            # Feature modules
│   └── auth/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       └── types/
├── hooks/               # Global hooks
├── services/            # API services
├── utils/               # Utility functions
├── types/               # TypeScript types
├── constants/           # Constants
├── assets/              # Static assets
└── styles/              # Global styles
```

### Feature-Based Structure (if using)

```
features/
└── user-management/
    ├── components/
    │   ├── UserList.tsx
    │   └── UserForm.tsx
    ├── hooks/
    │   └── useUsers.ts
    ├── services/
    │   └── userService.ts
    ├── types/
    │   └── user.types.ts
    └── index.ts
```

---

## Naming Patterns

### Variables

```typescript
// Boolean: Prefix with is/has/should/can
const isLoading = true
const hasPermission = false
const shouldUpdate = true
const canEdit = false

// Arrays: Plural nouns
const users = []
const items = []

// Functions: Verb + noun
function fetchUser() {}
function handleSubmit() {}
function validateEmail() {}

// Event handlers: handle + Event
const handleClick = () => {}
const handleChange = () => {}
```

### Components

```typescript
// PascalCase for components
export function UserProfile() {}
export const LoginForm = () => {}

// Props interface: ComponentName + Props
interface UserProfileProps {
  userId: string
  onUpdate: () => void
}
```

### Types & Interfaces

```typescript
// PascalCase, descriptive names
interface User {
  id: string
  name: string
}

type UserRole = 'admin' | 'user'

// Enums: PascalCase
enum UserStatus {
  Active = 'ACTIVE',
  Inactive = 'INACTIVE'
}
```

---

## Git Workflow

### Branch Naming

```bash
# Pattern: <type>/<ticket>-<short-description>

# Feature
feature/PROJ-1234-add-user-login

# Bug fix
bugfix/PROJ-5678-fix-logout-crash

# Hotfix
hotfix/PROJ-9012-critical-security-fix

# Refactor
refactor/PROJ-3456-improve-performance

# Chore
chore/PROJ-7890-update-dependencies
```

### Commit Messages

```bash
# Format: <type>(<scope>): <subject>

# Types: feat, fix, refactor, test, docs, style, chore

feat(auth): add social login
fix(ui): resolve button alignment issue
refactor(api): improve error handling
test(user): add unit tests for user service
docs(readme): update installation guide
style(header): fix header spacing
chore(deps): update react to v18
```

### Pull Request Title

```
[PROJ-1234] Type: Brief description

Examples:
[PROJ-1234] Feature: Add user authentication
[PROJ-5678] Fix: Resolve login crash on iOS
[PROJ-9012] Refactor: Improve API error handling
```

---

## Code Style

### TypeScript

```typescript
// Use explicit types
function getUser(id: string): Promise<User> {
  return api.get(`/users/${id}`)
}

// Prefer interfaces for objects
interface User {
  id: string
  name: string
}

// Use type for unions/aliases
type Status = 'pending' | 'success' | 'error'

// Avoid any, use unknown
function process(data: unknown) {
  // Type guard
  if (typeof data === 'string') {
    return data.toUpperCase()
  }
}
```

### Imports

```typescript
// Order: External → Internal → Relative
import { useState } from 'react'
import { api } from '@/services/api'
import { Button } from './Button'

// Use named imports
import { map, filter } from 'lodash'

// Avoid default exports (except components)
export const getUserById = () => {}
```

### Comments

```typescript
// Use JSDoc for public APIs
/**
 * Fetches user by ID
 * @param id - User ID
 * @returns User object
 */
export async function getUserById(id: string): Promise<User> {
  return api.get(`/users/${id}`)
}

// Inline comments for complex logic
// Calculate total with tax and discount
const total = (price + tax) * (1 - discount)

// Avoid obvious comments
// ❌ Bad: Increment counter
counter++

// ✅ Good: Reset counter after threshold to prevent overflow
if (counter > MAX_VALUE) counter = 0
```

---

## Testing Conventions

### Test File Structure

```typescript
// ComponentName.test.tsx
import { render, screen } from '@testing-library/react'
import { UserProfile } from './UserProfile'

describe('UserProfile', () => {
  it('renders user name', () => {
    render(<UserProfile user={mockUser} />)
    expect(screen.getByText('John Doe')).toBeInTheDocument()
  })
  
  it('calls onEdit when edit button is clicked', () => {
    const handleEdit = jest.fn()
    render(<UserProfile user={mockUser} onEdit={handleEdit} />)
    
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    
    expect(handleEdit).toHaveBeenCalledWith(mockUser.id)
  })
})
```

### Test Naming

```typescript
// Pattern: should [expected behavior] when [condition]
it('should show error message when email is invalid', () => {})
it('should disable submit button when form is submitting', () => {})
it('should call onSuccess callback when form submits successfully', () => {})
```

---

## Styling Conventions

### For React Native Projects: NativeWind (Recommended)

**NativeWind** brings Tailwind CSS utility-first styling to React Native.

```typescript
// ✅ Preferred: NativeWind utility classes
import { View, Text, TouchableOpacity } from 'react-native'

export const UserCard = () => (
  <View className="bg-white rounded-xl shadow-lg p-6 mb-4">
    <Text className="text-xl font-bold text-gray-900">John Doe</Text>
    <Text className="text-sm text-gray-500 mt-1">john@example.com</Text>

    <TouchableOpacity className="bg-blue-500 px-6 py-3 rounded-lg mt-4">
      <Text className="text-white font-semibold text-center">
        View Profile
      </Text>
    </TouchableOpacity>
  </View>
)

// Responsive design
const isTablet = useDeviceType().isTablet
<View className={`p-4 ${isTablet ? 'flex-row' : 'flex-col'}`}>
  {/* Content */}
</View>
```

**Setup Tailwind Config:**

```javascript
// tailwind.config.js
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          500: '#0ea5e9',
        },
        secondary: {
          500: '#8b5cf6',
        },
      },
    },
  },
}
```

**Benefits:**
- Faster development with utility classes
- Consistent styling across iOS, Android, Web
- No need for StyleSheet.create
- Built-in responsive design
- Theme integration

**Reference:** See `skills/framework-expert/refs/react-native.md` for mobile patterns

### For Web Projects: Standard CSS/Tailwind

```typescript
// Use Tailwind classes or CSS modules
<div className="bg-white rounded-lg shadow-md p-6">
  <h1 className="text-2xl font-bold">Title</h1>
</div>
```

---

## Project-Specific Conventions

### [Add Your Custom Conventions Here]

**Example: Multi-Region Support (if applicable)**

```typescript
// File structure for regional features
features/
└── payment/
    ├── us/
    │   └── PaymentForm.tsx
    ├── eu/
    │   └── PaymentForm.tsx
    └── shared/
        └── PaymentButton.tsx
```

**Example: Device-Specific Components (if applicable)**

```typescript
// Mobile: phone and tablet variants
components/
└── UserProfile/
    ├── UserProfile.phone.tsx
    ├── UserProfile.tablet.tsx
    └── UserProfile.tsx  # Delegates to phone/tablet
```

---

## Linting & Formatting

### ESLint Rules

```json
{
  "rules": {
    "no-console": "warn",
    "no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "react-hooks/exhaustive-deps": "warn"
  }
}
```

### Prettier Config

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80
}
```

---

## Additional Notes

- Follow KISS principle - keep it simple
- Write self-documenting code
- Prefer composition over inheritance
- Test behavior, not implementation
- Keep functions small and focused
- Use meaningful variable names
- Avoid premature optimization

---

**Questions? Check the team.md file for contacts.**

