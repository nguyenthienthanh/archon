> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# API Design Rules

**Category:** Code Quality
**Priority:** High
**Applies To:** architect agent, all API development

---

## Where to Find Detail

Full design guidance lives in the **api-designer skill**: `skills/api-designer/SKILL.md`.
This rule is the short enforcement checklist; the skill carries examples.

---

## Hard Requirements

```toon
must[7]{requirement}:
  RESTful resource naming — plural nouns, no verbs in endpoints
  Consistent response envelope — { data, meta } on success, { error } on failure
  Proper status codes — 200/201/204/400/401/403/404/409/422/429/500
  Pagination on lists — offset or cursor, always with meta
  Versioning from day 1 — URL path /api/v1/...
  Documented error codes — every error has a stable code
  OpenAPI spec checked into repo
```

---

## Naming

```toon
naming[4]{element,convention,example}:
  Endpoints,Plural nouns,/users /orders
  Query params,snake_case,?page_size=20
  Request body,camelCase,{ "firstName": "John" }
  Response body,camelCase,{ "createdAt": "..." }
```

---

## Anti-Patterns (Blockers in Review)

- Verbs in paths: `/getAllUsers`, `/createUser`
- Inconsistent response shapes across endpoints
- Missing pagination on list endpoints
- Exposing internal DB IDs in public payloads
- No versioning strategy

---

## When Reviewing an API

Load `api-designer` skill for full checklists, status-code guidance, and request/response examples.
