> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Dependency Management Rules

**Category:** Code Quality
**Priority:** High
**Applies To:** All projects

---

## Core Principle

**Evaluate necessity, security, and size before adding any dependency. Keep lock files committed and dependencies current.**

---

## Version Pinning

| Symbol | Meaning | Risk | Use When |
|--------|---------|------|----------|
| None | Exact `1.2.3` | None | Critical deps |
| `~` | Patch `1.2.x` | Low | Less stable libs |
| `^` | Minor `1.x.x` | Medium | Stable libs (default) |

---

## Lock Files

Always commit lock files. Use frozen installs in CI:

```bash
npm ci                          # npm
yarn --frozen-lockfile           # yarn
pnpm install --frozen-lockfile   # pnpm
```

---

## Before Adding a Dependency

```toon
eval_criteria[5]{check,pass_criteria}:
  Necessity,Can't be done in <50 LOC without it
  Maintenance,Last commit <6 months + >1000 stars (core deps)
  Bundle size,Justified for use case (check bundlephobia)
  Security,npm audit clean
  License,MIT / Apache / BSD
```

Place in correct category: `dependencies` (shipped) vs `devDependencies` (build/test only).

---

## Update Strategy

```toon
update_schedule[4]{type,frequency,approach}:
  Security,Immediate,Patch ASAP
  Patch,Weekly,Auto-merge OK
  Minor,Monthly,Test first
  Major,Quarterly,Plan migration
```

Update one major at a time. Run tests after each. Commit separately.

---

## Maintenance Commands

```bash
npm outdated          # Check outdated
npm audit             # Check vulnerabilities
npx depcheck          # Find unused deps
npm dedupe            # Remove duplicates
```

---

## Anti-Patterns

```toon
anti_patterns[5]{pattern,solution}:
  * version ranges,Use semver (^ or ~)
  No lock file,Commit lock file
  Unused deps,Remove with depcheck
  Import entire library,"import pick from 'lodash/pick' not import _ from 'lodash'"
  Skip testing after update,Always run tests
```

---
