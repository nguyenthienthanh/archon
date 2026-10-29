---
name: scalable-thinking
description: "Design for scale while keeping implementation simple (KISS)."
autoInvoke: false
priority: high
triggers:
  - "architecture"
  - "API design"
  - "data modeling"
  - "database schema"
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Skill: Scalable Thinking

**Principle:** Think Scalable, Build Simple.

| Aspect | Scalable Thinking (WHAT) | KISS (HOW) |
|--------|--------------------------|------------|
| Data Model | Normalized, indexed | Simple queries |
| API | Versioned, RESTful | Standard CRUD |
| Code Structure | Feature-based | Flat hierarchy |
| Config | Centralized | Single file |

---

## Where to Apply

### Data Models
Separate related data into proper tables (not JSON strings). Enables querying, indexing, partitioning.

### APIs
RESTful resource paths with versioning: `/api/v1/users/:userId/processes`. Cacheable, evolvable.

### Database
Normalized tables with foreign keys and indexes. Not JSON blobs that can't be filtered.

### File Structure
Feature-based: `src/features/{feature}/{hooks,components,api}/` + `src/shared/`.

---

## Scalable Patterns

- **Pagination:** Cursor-based `?limit=20&cursor=abc` with `{ nextCursor, hasMore }`
- **Centralized config:** Single config object with env-based values
- **Structured errors:** `AppError` with code + statusCode

---

## Anti-Patterns

| Anti-Pattern | Instead |
|--------------|---------|
| Build for hypothetical 1M users | Simple monolith first |
| Pre-optimize with Redis | In-memory cache, add Redis when measured |
| Abstract for 1 use case | Direct impl, abstract at 2-3 examples |
| Microservices from day 1 | Monolith, split when team/features grow |

---

## Checklist

**Before designing:** Can model support 10x? Can I query needed data? Natural partition keys? API versioned? Pagination for lists?

**During:** Standard patterns? Simplest solution? Junior dev understandable? No abstractions until 3+ examples?

---

## When to Scale Up

Add complexity when: DB queries > 2s, API p95 > 500ms, error rate > 1%, 10x growth in 3 months, team > 5. Until then: keep simple, measure everything.

---
