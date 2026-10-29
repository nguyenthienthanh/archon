---
name: migration-helper
description: "Guide safe database and code migrations with zero-downtime strategies."
autoInvoke: false
priority: medium
triggers:
  - "database migration"
  - "code migration"
  - "zero-downtime"
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Skill: Migration Helper

Safe database and code migrations with zero-downtime strategies.

---

## Safety Rules

1. Always backup before migration
2. Test on staging first
3. Make migrations reversible
4. Deploy in small batches
5. Monitor during migration

---

## Related Rules

- `rules/core/simplicity-over-complexity.md` — smallest migration that closes the gap; no "while we're here" schema expansions
- `rules/core/verification.md` — verify each migration step before advancing
- `rules/workflow/immutable-workflow.md` — migrations are append-only records
- `rules/workflow/dual-llm-review.md` — destructive migrations (DROP COLUMN/TABLE) trigger dual-LLM review

---

## Schema Changes

| Change | Safe Approach |
|--------|---------------|
| Add column | Add nullable → backfill → NOT NULL |
| Remove column | Stop using → deploy → drop |
| Rename column | Add new → copy → deploy → drop old |
| Add index | CREATE INDEX CONCURRENTLY |
| Change type | Add new col → migrate → drop old |

### Zero-Downtime (6 phases)

Add nullable → dual-write → backfill → switch reads → remove old writes → drop old column.

---

## Migration Script Pattern

```typescript
export async function up(db: Database) {
  await db.query(`ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active'`);
  // Backfill in batches of 1000
  // Add NOT NULL constraint
}
export async function down(db: Database) {
  await db.query(`ALTER TABLE users DROP COLUMN status`);
}
```

---

## Code Migration

- **Feature flags:** Behind flag → gradually increase % → remove flag + old code
- **Strangler Fig:** New impl alongside old → route traffic gradually → remove old

---

## Checklist

**Before:** Backup, tested on staging, rollback plan, monitoring alerts.
**During:** Batch processing, monitor performance, verify integrity.
**After:** Validation queries, smoke tests, monitor 24-48h, document.

---

## Rollback Strategies

| Strategy | When |
|----------|------|
| Script rollback | Reversible data changes |
| Backup restore | Major failure |
| Feature flag off | Code changes |
| Traffic reroute | Service migration |

---
