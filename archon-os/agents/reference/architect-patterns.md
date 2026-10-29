# Architect Agent - Reference Patterns

**Source:** `agents/architect.md`
**Load:** On-demand when deep architecture expertise needed

---

## Architectural Patterns

```toon
patterns[6]{pattern,when_to_use,avoid_when}:
  Monolith,Small team + simple domain + MVP,High scale + independent deploy needed
  Microservices,Large team + complex domain + independent scaling,Small team + simple app
  Serverless,Event-driven + variable load + cost optimization,Consistent load + cold start matters
  Event Sourcing,Audit trail + temporal queries + complex domain,Simple CRUD + no history needed
  CQRS,Read/write asymmetry + complex queries,Simple CRUD + small scale
  Hexagonal,Clean boundaries + testability + long-lived systems,Quick prototype + throwaway code
```

### API Design

```toon
api_patterns[5]{aspect,guideline}:
  Versioning,URL path (/v1/) or header (Accept-Version)
  Naming,Plural nouns (/users) + kebab-case for multi-word
  Response,Consistent envelope {data success error pagination}
  Errors,HTTP status + error code + message + details
  Auth,JWT for stateless + OAuth2 for third-party
```

---

## Database Patterns

```toon
schema_principles[6]{principle,description}:
  Normalization,3NF for transactional + denormalize for reads
  Primary Keys,UUID for distributed + auto-increment for single DB
  Foreign Keys,Always define + cascade rules explicit
  Indexes,Query patterns first + composite for multi-column
  Naming,snake_case + singular table names + _id suffix for FKs
  Timestamps,created_at/updated_at on all tables + soft delete
```

```toon
optimization[8]{issue,solution}:
  N+1 queries,Eager loading (include/with/preload)
  Missing index,Add index on WHERE/JOIN/ORDER columns
  Full table scan,Use indexed columns in WHERE
  Large result sets,Pagination (cursor > offset)
  Slow JOINs,Denormalize hot paths + materialized views
  Lock contention,Optimistic locking + transaction scope
  Connection exhaustion,Connection pooling + query timeout
  Memory issues,Streaming for large datasets
```

```toon
migration_rules[5]{rule,reason}:
  One change per migration,Easy rollback + clear history
  Reversible migrations,Down migration for every up
  No data loss,Backup before destructive changes
  Zero-downtime,Add before remove + feature flags
  Test migrations,Run on staging with production data copy
```

---

## Framework Layering

```toon
layers[4]{framework,controller,service,data,validation}:
  Node.js (Express/NestJS),Controllers,Services,Repositories,Zod DTOs + Middleware
  Python (Django/FastAPI),Views/Routes,Services,Models (ORM),Pydantic schemas + Middleware
  Laravel (PHP),Controllers + Form Requests,Services,Eloquent Models + Scopes,Resources + Middleware
  Go (Gin/Echo/Fiber),Handlers,Services,Repositories,Models/DTOs + Middleware
```

---

## Security Patterns

```toon
security[8]{area,implementation}:
  Authentication,JWT with refresh tokens + secure cookie storage
  Authorization,RBAC or ABAC + permission middleware
  Input Validation,Whitelist validation + parameterized queries
  Rate Limiting,Per-IP + per-user + endpoint-specific limits
  CORS,Explicit origin whitelist + credentials handling
  Secrets,Environment variables + secrets manager
  Logging,Sanitize PII + audit trail + security events
  Headers,HSTS + CSP + X-Frame-Options + X-Content-Type-Options
```

---

## Caching Strategies

```toon
caching[5]{strategy,use_case,invalidation}:
  Cache-Aside,General purpose + read-heavy,TTL + explicit invalidation
  Write-Through,Consistency critical,Automatic on write
  Write-Behind,Write-heavy + eventual consistency OK,Async queue
  Read-Through,Transparent caching,TTL + background refresh
  CDN,Static assets + API responses,Purge on deploy
```

---

## Decision Framework

### Database Selection

```toon
db_selection[6]{type,use_when,examples}:
  PostgreSQL,Complex queries + ACID + JSON support,Most applications
  MySQL,Simple queries + high read throughput,WordPress + legacy
  MongoDB,Flexible schema + document-oriented,Prototypes + content
  Redis,Caching + sessions + real-time,Cache layer + pub/sub
  Elasticsearch,Full-text search + analytics,Search + logging
  DynamoDB,Serverless + key-value + scale,AWS-native + high scale
```

### When to Split Services

Split when: different scaling needs, different team ownership, different deploy cycles, clear domain boundary, isolated failure required. Keep together when: shared transactions needed, simple domain, small team, frequent cross-service calls.

---

## Output Format

Architecture decisions use ADR format: Context (problem) -> Decision (approach) -> Rationale (reasons) -> Consequences (positive + negative trade-offs) -> Alternatives Considered (rejected + why).
