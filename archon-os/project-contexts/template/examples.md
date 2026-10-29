# Project Examples

**Project:** Your Project Name  
**Purpose:** Provide concrete examples for Aura Frog to use in workflows

---

## Ticket Format

### JIRA Ticket Examples

```markdown
## Feature Ticket

**ID:** PROJ-1234
**Title:** Implement User Authentication
**Type:** Story
**Priority:** High

**Description:**
As a user, I want to log in with email and password
so that I can access my account securely.

**Acceptance Criteria:**
- Login form with email and password fields
- Validate email format
- Show error message for invalid credentials
- Redirect to dashboard on successful login
- Remember me checkbox
- Forgot password link

**Labels:** authentication, security, phase-1
**Components:** Auth Module
```

```markdown
## Bug Ticket

**ID:** PROJ-5678
**Title:** Fix Login Button Not Responding
**Type:** Bug
**Priority:** High

**Description:**
Login button becomes unresponsive after multiple failed login attempts.

**Steps to Reproduce:**
1. Enter invalid credentials
2. Click login button 3 times
3. Button stops responding

**Expected:** Button should remain clickable
**Actual:** Button disabled permanently

**Labels:** bug, ui, critical
**Components:** Auth Module
```

---

## Common Features

### Feature 1: User Authentication

**Scope:**
- Login with email/password
- Social login (Google, Facebook)
- JWT token management
- Remember me functionality
- Forgot password flow
- Email verification

**Tech Stack:**
- Frontend: React + React Hook Form
- Backend API: POST /api/auth/login
- State: Redux Toolkit
- Validation: Yup

**Components:**
```
features/auth/
├── components/
│   ├── LoginForm.tsx
│   ├── SocialLoginButtons.tsx
│   └── ForgotPasswordModal.tsx
├── hooks/
│   └── useAuth.ts
├── services/
│   └── authService.ts
└── types/
    └── auth.types.ts
```

---

### Feature 2: Dashboard

**Scope:**
- Overview cards (stats)
- Recent activity list
- Quick actions menu
- Responsive layout

**Tech Stack:**
- Components: Card, Table, Chart
- Data fetching: React Query
- Charts: Recharts

**Components:**
```
features/dashboard/
├── components/
│   ├── StatsCard.tsx
│   ├── ActivityList.tsx
│   └── QuickActions.tsx
├── hooks/
│   └── useDashboard.ts
└── services/
    └── dashboardService.ts
```

---

### Feature 3: User Management

**Scope:**
- User list with pagination
- User details view
- Create/Edit user
- Delete user with confirmation
- Search and filters

**Tech Stack:**
- Table: TanStack Table
- Forms: React Hook Form
- Validation: Yup
- API: REST

**Components:**
```
features/users/
├── components/
│   ├── UserList.tsx
│   ├── UserForm.tsx
│   └── UserFilters.tsx
├── hooks/
│   └── useUsers.ts
└── services/
    └── userService.ts
```

---

## API Patterns

### REST API Examples

```typescript
// GET /api/users
{
  "success": true,
  "data": [
    {
      "id": "user_123",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "admin"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}

// POST /api/users
Request:
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "role": "user"
}

Response:
{
  "success": true,
  "data": {
    "id": "user_456",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "role": "user"
  }
}

// Error Response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is already in use",
    "fields": {
      "email": "Email must be unique"
    }
  }
}
```

---

## Component Patterns

### Form Component Example

```typescript
// features/users/components/UserForm.tsx
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

const schema = yup.object({
  name: yup.string().required('Name is required'),
  email: yup.string().email().required('Email is required'),
  role: yup.string().oneOf(['admin', 'user']).required()
})

export function UserForm({ user, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: user
  })
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      {errors.name && <span>{errors.name.message}</span>}
      
      <input {...register('email')} type="email" />
      {errors.email && <span>{errors.email.message}</span>}
      
      <select {...register('role')}>
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>
      
      <button type="submit">Save</button>
    </form>
  )
}
```

### List Component Example

```typescript
// features/users/components/UserList.tsx
import { useUsers } from '../hooks/useUsers'

export function UserList() {
  const { data, loading, error } = useUsers()
  
  if (loading) return <Loading />
  if (error) return <Error message={error.message} />
  
  return (
    <div>
      <h1>Users</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map(user => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td>
                <button onClick={() => editUser(user.id)}>Edit</button>
                <button onClick={() => deleteUser(user.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## Test Patterns

### Unit Test Example

```typescript
// features/users/components/UserForm.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { UserForm } from './UserForm'

describe('UserForm', () => {
  it('should show validation error for invalid email', async () => {
    const handleSubmit = jest.fn()
    render(<UserForm onSubmit={handleSubmit} />)
    
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'invalid-email' }
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    
    expect(await screen.findByText('Email must be valid')).toBeInTheDocument()
    expect(handleSubmit).not.toHaveBeenCalled()
  })
  
  it('should submit form with valid data', async () => {
    const handleSubmit = jest.fn()
    render(<UserForm onSubmit={handleSubmit} />)
    
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'John Doe' }
    })
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'john@example.com' }
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    
    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
        role: 'user'
      })
    })
  })
})
```

### Integration Test Example

```typescript
// features/users/UserManagement.e2e.test.tsx
import { test, expect } from '@playwright/test'

test.describe('User Management', () => {
  test('should create new user', async ({ page }) => {
    await page.goto('/users')
    await page.click('button:has-text("Add User")')
    
    await page.fill('[name="name"]', 'John Doe')
    await page.fill('[name="email"]', 'john@example.com')
    await page.selectOption('[name="role"]', 'user')
    
    await page.click('button:has-text("Save")')
    
    await expect(page.locator('text=User created successfully')).toBeVisible()
    await expect(page.locator('text=John Doe')).toBeVisible()
  })
})
```

---

## State Management Patterns

### Redux Toolkit Example

```typescript
// features/users/store/userSlice.ts
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

export const fetchUsers = createAsyncThunk(
  'users/fetchUsers',
  async () => {
    const response = await api.get('/users')
    return response.data
  }
)

const userSlice = createSlice({
  name: 'users',
  initialState: {
    users: [],
    loading: false,
    error: null
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false
        state.users = action.payload
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message
      })
  }
})

export default userSlice.reducer
```

---

## Project-Specific Examples

### [Add Your Custom Examples Here]

**Example: Multi-step Form**
```typescript
// Step 1: Personal Info
// Step 2: Address
// Step 3: Payment
// Step 4: Review
```

**Example: Real-time Chat**
```typescript
// WebSocket connection
// Message sending
// Online status
// Typing indicators
```

---

## Reference Implementations

### Successful Features

1. **User Authentication** - PROJ-1234
   - Implementation: `features/auth/`
   - Tests: 95% coverage
   - Best practices: Token refresh, secure storage

2. **Dashboard Analytics** - PROJ-2345
   - Implementation: `features/dashboard/`
   - Tests: 88% coverage
   - Best practices: Lazy loading, memoization

3. **File Upload** - PROJ-3456
   - Implementation: `features/upload/`
   - Tests: 92% coverage
   - Best practices: Chunked upload, progress tracking

---

**Use these examples as reference for new features!**

