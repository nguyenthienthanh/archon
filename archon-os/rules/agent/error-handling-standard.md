> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Error Handling Standard

**Category:** Code Quality
**Priority:** Critical
**Applies To:** All code

---

## Core Principle

**Handle errors at the right level with typed error classes, user-friendly messages, and structured logging. Never swallow errors silently.**

---

## Error Class Hierarchy

```typescript
class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

class ValidationError extends AppError {
  constructor(message: string, public fields?: Record<string, string>) {
    super(message, 'VALIDATION_ERROR', 400)
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(`${resource}${id ? ` with id ${id}` : ''} not found`, 'NOT_FOUND', 404)
  }
}
// Also: UnauthorizedError(401), ForbiddenError(403), ConflictError(409)
```

---

## Error Codes

```toon
error_codes[8]{code,http,when}:
  VALIDATION_ERROR,400,Invalid input data
  UNAUTHORIZED,401,Missing/invalid auth
  FORBIDDEN,403,Authenticated but not authorized
  NOT_FOUND,404,Resource doesn't exist
  CONFLICT,409,Duplicate or state conflict
  RATE_LIMITED,429,Too many requests
  INTERNAL_ERROR,500,Unexpected server error
  SERVICE_UNAVAILABLE,503,Dependency failure
```

---

## Response Format

```json
// Success error response
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "fields": { "email": "Required" } } }

// Production internal error (hide details)
{ "error": { "code": "INTERNAL_ERROR", "message": "An unexpected error occurred" } }
```

---

## User-Friendly Messages

```toon
user_messages[5]{code,technical,user_facing}:
  VALIDATION_ERROR,Field X failed regex,Please enter a valid X
  NOT_FOUND,Entity not found,This item doesn't exist
  UNAUTHORIZED,JWT expired,Please log in again
  RATE_LIMITED,429 Too Many Requests,Please wait before trying again
  INTERNAL_ERROR,NullPointerException,Something went wrong. Please try again
```

---

## Key Patterns

- **API handler:** Log all errors with context (code, stack, path, requestId). Send operational errors to client, hide programming error details.
- **Service layer:** Throw typed errors (NotFoundError, ValidationError). Validate before processing.
- **Frontend:** Transform API errors, handle specific codes (401 → redirect to login). Use Error Boundaries for React.
- **Logging:** See `rules/agent/logging-standards.md`. Include code, message, stack, requestId. Never log passwords/tokens.

---

## Anti-Patterns

- `catch (e) { /* nothing */ }` — silent failure
- `throw 'Something went wrong'` — throw Error objects
- `res.status(500).json({ error: error.stack })` — leaking internals
- `riskyOperation()` without await — lost async errors

---
