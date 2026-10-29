# 📚 Documents Directory

**Purpose:** Stores generated documentation from `document` command

**Location:** `.claude/logs/documents/`

---

## 📁 Structure

```
.claude/logs/documents/
├── features/          # Feature documentation
│   ├── user-authentication.md
│   └── dark-mode.md
├── api/               # API documentation
│   ├── auth-api.md
│   └── user-api.md
├── components/        # Component documentation
│   ├── user-profile.md
│   └── button.md
├── specs/             # Technical specifications
│   ├── dark-mode-spec.md
│   └── api-refactor-spec.md
├── refactors/         # Refactoring documentation
│   └── {component}-analysis.md
└── guides/            # User guides
    ├── authentication-guide.md
    └── deployment-guide.md
```

---

## 📝 Document Types

### 1. Feature Documentation
```bash
document feature "User Authentication"
# Output: .claude/logs/documents/features/user-authentication.md
```

**Contains:**
- Feature overview
- Architecture diagram
- File structure
- API reference
- Usage examples
- Testing info
- Deployment notes

### 2. API Documentation
```bash
document api "src/api/authApi.ts"
# Output: .claude/logs/documents/api/auth-api.md
```

**Contains:**
- Endpoint list
- Request/response types
- Error codes
- Usage examples
- Configuration
- Test mocks

### 3. Component Documentation
```bash
document component "src/components/UserProfile.tsx"
# Output: .claude/logs/documents/components/user-profile.md
```

**Contains:**
- Props interface
- Usage examples
- Component structure
- State management
- Styling
- Accessibility
- Platform notes

### 4. Technical Specifications
```bash
document spec "Add dark mode support"
# Output: .claude/logs/documents/specs/dark-mode-spec.md
```

**Contains:**
- Requirements
- Technical approach
- Implementation plan
- Dependencies
- Testing strategy
- Success criteria

### 5. User Guides
```bash
document guide "How to use authentication"
# Output: .claude/logs/documents/guides/authentication-guide.md
```

**Contains:**
- Step-by-step instructions
- Screenshots
- Common issues
- Best practices
- FAQ

---

## 🎯 Format Options

### Markdown (Default)
```bash
document feature "Auth"
# Standard markdown format
```

### Confluence
```bash
document feature "Auth" --format=confluence
# Ready to paste into Confluence
```

### HTML
```bash
document feature "Auth" --format=html
# Web-ready HTML
```

### PDF
```bash
document feature "Auth" --format=pdf
# Print-ready PDF
```

---

## 🔍 Organization

### By Type
- **features/** - Business features
- **api/** - Backend services
- **components/** - UI components
- **specs/** - Technical specifications
- **guides/** - User documentation

### Naming Convention
- Lowercase with hyphens
- Descriptive names
- Example: `user-profile-component.md`

---

## 💡 Use Cases

### 1. Document Existing Code
```bash
document component "src/components/Button.tsx"
# Creates comprehensive component docs
```

### 2. Create Spec Before Implementation
```bash
document spec "Implement notifications"
# Plan before coding
```

### 3. Generate API Docs
```bash
document api "src/api/"
# Document all API endpoints
```

### 4. Create User Guides
```bash
document guide "Getting started"
# Help users understand features
```

---

## 🔗 Integration

### With Confluence
```bash
document feature "Auth" --format=confluence
# Copy output and paste into Confluence
```

### With Workflow
```bash
# Phase 5 (Finalize) automatically generates docs
workflow:start "Add feature"
# Creates documentation in this folder
```

### With Planning
```bash
planning "Add feature"
# Plan references can be converted to specs
document spec [plan-id]
```

---

## ✅ Best Practices

1. **Descriptive names** - Use clear, searchable names
2. **Keep updated** - Regenerate when code changes
3. **Link related docs** - Reference other documents
4. **Include examples** - Show real usage
5. **Format for audience** - Use appropriate format

---

**Note:** Documents are generated artifacts. They can be regenerated anytime using the `document` command.

