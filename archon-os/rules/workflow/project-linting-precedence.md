> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Project Linting Precedence

**Priority:** CRITICAL
**Applies:** All code generation and review

---

## Core Rule

**Project's ESLint/Prettier config MERGES with Archon OS rules.** Conflicts: project wins. No conflict: Archon OS applies.

---

## Merge Strategy

```toon
merge_strategy[3]{layer,behavior,example}:
  1,Project config overrides,"Semicolons: project says no → no semicolons"
  2,Archon OS fills gaps,"Error handling: project silent → use Archon OS"
  3,Combined result,"Follow project style + Archon OS best practices"
```

---

## Config Detection

```toon
config_files[4]{tool,files}:
  ESLint,".eslintrc.{js,cjs,json,yaml,yml} or eslint.config.js (flat)"
  TSLint (legacy),"tslint.json, tslint.yaml"
  Prettier,".prettierrc, .prettierrc.{js,json,yaml}, prettier.config.js, package.json (prettier key)"
  TypeScript,"tsconfig.json, tsconfig.build.json, tsconfig.node.json"
```

---

## Merge Examples

| Topic | Project Config | Archon OS Rule | Result |
|-------|---------------|----------------|--------|
| Semicolons | `semi: false` | Use semicolons | No semicolons (project) |
| Error handling | (silent) | Typed errors | Typed errors (Archon OS) |
| Import order | Custom order | Standard order | Custom order (project) |
| TDD | (silent) | RED-GREEN-REFACTOR | TDD applies (Archon OS) |

---

## Before Writing Code

1. Check for config: `ls -la .eslintrc* eslint.config.* .prettierrc* tsconfig.json 2>/dev/null`
2. Parse and merge: project rules override conflicts, Archon OS fills gaps
3. Apply merged ruleset

---

## No Project Config

When no linting config exists: Archon OS rules apply fully. Follow `code-quality.md`, `naming-conventions.md`.

---

## Verification

```bash
npm run lint    # or yarn lint / npx eslint .
npx prettier --check .
```

---

## Related Rules

`code-quality.md`, `naming-conventions.md`, `modern-javascript.md` (all lower priority), `priority-hierarchy.md`

---

**Last Updated:** 2025-12-10
