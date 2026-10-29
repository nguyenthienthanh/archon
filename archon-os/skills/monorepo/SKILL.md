---
name: monorepo
description: "Detect and navigate monorepos correctly. Use when working with repos containing multiple packages (pnpm/yarn/npm workspaces, Turborepo, Nx, Lerna). Ensures commands run in correct package scope, dependencies are routed properly, and cross-package changes are coordinated."
when_to_use: "monorepo, workspace, turborepo, nx, lerna, pnpm workspace, multiple packages, cross-package, packages/ directory, workspace:*"
allowed-tools: Read, Grep, Glob, Bash
paths:
  - "**/pnpm-workspace.yaml"
  - "**/turbo.json"
  - "**/nx.json"
  - "**/lerna.json"
  - "**/go.work"
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Monorepo Handling

Monorepos break many assumptions: which `package.json` is "the" one, where `node_modules` live, which test command runs, what `install` actually does. This skill ensures operations target the correct scope.

---

## Detection

On session start or first file edit, check for these markers:

| File | Tool |
|------|------|
| `pnpm-workspace.yaml` | pnpm workspaces |
| `turbo.json` | Turborepo |
| `nx.json` | Nx |
| `lerna.json` | Lerna |
| `package.json` with `"workspaces": [...]` | npm / yarn workspaces |
| `Cargo.toml` with `[workspace]` | Rust workspaces |
| `go.work` | Go workspaces |
| `pyproject.toml` with Poetry/uv workspace config | Python workspaces |

If detected → monorepo mode ON. Record in workflow state. All subsequent commands must respect package scope.

---

## Key Rules

### 1. Always identify the target package first

Before any `install`, `test`, or `build`:
- Which package is the change in? Full path: `packages/<name>/`
- Run **scoped**, not from root: `pnpm --filter <name> test`

### 2. Cross-package changes = coordinate

If a change touches package A's API used by package B:
- List all consumers: `grep -r "@your-org/package-a" packages/`
- Update all consumers in the same PR
- Run tests across **all** affected packages, not just A

### 3. Dependency placement matters

| Dependency type | Where to install |
|-----------------|------------------|
| Used by 1 package | That package's `package.json` |
| Used by 2+ packages | Shared config package or root `devDependencies` |
| Dev tooling (eslint, prettier, jest) | Root |
| Workspace packages | Listed as `"workspace:*"` in consumer's dependencies |

### 4. Build order respects the dependency graph

Don't assume alphabetical build order. Check the graph:
- **Turborepo:** `turbo.json` pipeline field
- **Nx:** `nx graph` visualises it
- **pnpm:** `pnpm list --recursive --depth=0`

### 5. Tests run scoped — not from root

```bash
# ❌ Wrong — runs all tests, slow, often broken
npm test

# ✓ Right — tests only affected packages
turbo test --filter=[HEAD^1]
nx affected:test
pnpm --filter='...[HEAD^1]' test
```

`[HEAD^1]` computes packages affected since the last commit. CI should use the same.

---

## Common Gotchas

- **node_modules hoisting** — package A may accidentally use package B's transitive dep. When B changes, A breaks. Fix: explicit dependency declaration, don't rely on hoist.
- **TypeScript project references** — changes to package A won't appear in package B until `tsc --build` runs across references. Check `tsconfig.json` → `references`.
- **Jest/Vitest root config** — may not pick up per-package configs. Check that monorepo tooling hands off correctly (Turborepo and Nx usually do; raw pnpm doesn't).
- **CI matrix** — running the full suite on every PR wastes money. Use affected-only detection.
- **Lockfile per workspace vs root** — npm 7+ and pnpm keep a single root lockfile. Don't commit per-package lockfiles.

---

## Integration with Aura Frog Workflow

- **Phase 1 design** — identify all packages touched in the plan
- **Phase 2 tests** — scope to affected packages only
- **Phase 3 build** — run scoped builds, not root
- **Phase 4 review** — check cross-package contracts (API compatibility between versions)

---

## Tie-Ins

- `skills/framework-expert/SKILL.md` — your framework may have monorepo-specific integration
- `skills/test-writer/SKILL.md` — test placement in monorepo (per-package vs shared test dir)
- `rules/core/verification.md` — verify commands ran in the right scope (which tests actually executed?)
- `commands/run.md` — run-orchestrator loads this skill when monorepo markers detected
