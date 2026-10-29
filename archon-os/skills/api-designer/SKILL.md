---
name: api-designer
description: "Designs RESTful APIs with endpoint naming, versioning strategies (URL path, header-based), pagination (offset and cursor), error response schemas, and OpenAPI conventions. Use when the user asks about REST API design, creating endpoints, URL structure, API versioning, status codes, Swagger, or OpenAPI specs."
autoInvoke: false
priority: medium
triggers:
  - "API design"
  - "REST API"
  - "endpoint design"
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Skill: API Designer

Design consistent, RESTful APIs with versioning, documentation, and error handling.

---

## RESTful Conventions

| Method | Endpoint | Purpose | Response |
|--------|----------|---------|----------|
| GET | /users | List | 200 + array |
| GET | /users/:id | Get one | 200 / 404 |
| POST | /users | Create | 201 + created |
| PUT | /users/:id | Replace | 200 / 404 |
| PATCH | /users/:id | Update | 200 / 404 |
| DELETE | /users/:id | Delete | 204 / 404 |

Nested: `GET /users/:userId/orders`

---

## Naming

- Resources: plural nouns (`/users`, `/orders`)
- Query params: snake_case (`page_size`)
- Request/Response bodies: camelCase

**Versioning:** URL path `/api/v1/...` (recommended).

---

## Response Format

**Success:** `{ "data": {...}, "meta": {...} }`
**List:** Add `meta: { page, pageSize, total, totalPages }`
**Error:** `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": {...} } }`

---

## Status Codes

| Code | When |
|------|------|
| 200 | Successful GET/PUT/PATCH |
| 201 | Successful POST |
| 204 | Successful DELETE |
| 400/422 | Invalid input / validation |
| 401/403 | No auth / no permission |
| 404/409 | Not found / conflict |
| 429 | Rate limited |
| 500 | Unexpected error |

---

## Pagination

**Offset:** `?page=2&page_size=20` (simple, slow on large sets)
**Cursor:** `?cursor=abc&limit=20` (consistent, fast, no page jump)

---

## Filtering & Sorting

```
GET /users?status=active&sort=created_at:desc&q=john&page=1&page_size=20
```

---

## Design Workflow

1. Define resources and relationships → 2. Choose versioning strategy → 3. Define endpoints with RESTful naming → 4. Specify response/error schemas → 5. Add pagination, filtering, sorting → 6. Document with OpenAPI → 7. Add rate limiting headers

## Checklist

RESTful naming, consistent response format, proper status codes, pagination for lists, error codes, versioning, OpenAPI docs, rate limiting headers.

---

## Related Rules

- `rules/agent/api-design-rules.md` — enforcement checklist (short form of this skill)
- `rules/core/simplicity-over-complexity.md` — favor flat resources over nested hierarchies, reject premature GraphQL when REST fits, no speculative "future-proofing" fields
- `rules/agent/structured-data-schema.md` — consistent schema across endpoints
- `rules/agent/error-handling-standard.md` — uniform error envelope

---
