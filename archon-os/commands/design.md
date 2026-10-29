# Design Commands

Design APIs, databases, and documentation before coding.

**Category:** Design
**Scope:** Session

---

## /design api <spec>

Design API endpoints with OpenAPI spec generation. Detects REST vs GraphQL from project. Generates endpoint definitions, request/response schemas, error handling patterns, versioning strategy, and OpenAPI 3.0 YAML.

**Usage:** `/design api "User management CRUD with roles"`, `/design api --graphql`

---

## /design db <spec>

Design database schema with ERD and migration scripts. Generates entity definitions, relationships, indexes, constraints, and migration files for the detected ORM (Prisma/TypeORM/Eloquent/SQLAlchemy/GORM).

**Usage:** `/design db "E-commerce: users, products, orders, payments"`

---

## /design doc <spec>

Generate documentation: feature specs, API docs, component docs, architecture docs. Produces structured markdown with sections appropriate to the doc type.

**Usage:** `/design doc "User authentication feature"`, `/design doc --type api`

---

## Related

- **Skills:** `api-designer`, `documentation`
- **Agents:** `architect` (API + DB design), `lead` (documentation)
