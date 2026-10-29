> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Impact Analysis Rule

**Priority:** CRITICAL
**Type:** Rule (Mandatory)

---

## Core Rule

**Before modifying existing code, analyze all usages to prevent breaking changes.**

---

## When Required

```toon
applies[2]{action,required}:
  "Refactor/rename/change signature/modify API/update props/change types/delete/move/change exports",YES
  "Add new features/write new files/documentation changes",NO
```

---

## Process

1. **Identify** what's changing (file, function, change type)
2. **Search** all usages: `grep -r "name" --include="*.ts"` or `rg "name" --type ts`
3. **Document** affected files with impact level
4. **Update** all usages before completing

### Impact Levels

```toon
impact[3]{level,description,action}:
  BREAKING,Compile/runtime errors,Must fix before merge
  WARNING,Unexpected behavior possible,Should fix before merge
  SAFE,No functional impact,Proceed
```

---

## Integration with Workflow

- **refactor command:** Impact analysis auto-included in Phase 1 + Phase 4
- **bugfix command:** Included in Phase 1 + Phase 4
- **Manual changes:** Search before modifying, update all usages, run tests

---

## Related Rules

```toon
related[4]{rule,connection}:
  tdd-workflow.md,Tests catch breaking changes
  cross-review-workflow.md,Reviewers verify impact
  safety-rules.md,Prevent destructive changes
  approval-gates.md,Changes require approval
```

---

**Last Updated:** 2025-12-08
