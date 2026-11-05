> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Simplicity Over Complexity (Reuse First + YAGNI + KISS + DRY)

**Priority:** Critical — **HARD rule.** Applies to every agent, every phase, every language.
A violation is a review finding with a fix, not a style note.

---

## Rule 0 — Reuse before you write (the one most often broken)

**If a function that does the job already exists, call it. Do not write your own.**
Custom code is the last rung of the ladder, not the first.

```toon
reuse_ladder[5]{rung,look_in,example}:
  1,"Language / runtime standard library","path.relative, fs.mkdtempSync, Array.prototype.flatMap, structuredClone, URL, Intl, crypto.randomUUID, Python itertools/pathlib"
  2,"Platform / framework API already in use","React hooks, Next.js router, Express middleware, git plumbing (git status --porcelain), shell coreutils (sort -u, comm, jq)"
  3,"Code already in THIS repo","hooks/lib/* helpers (safe-stdin, hook-runtime, plans-dir), existing utils/ — grep before writing"
  4,"Dependency already in package.json / lockfile","lodash, date-fns, zod, … — if it is installed, use it instead of re-implementing"
  5,"New dependency","Only with a stated reason, maintained + small + license OK, and the user's approval (installing needs one). Otherwise write it."
```

**Before writing any non-trivial helper (parsing, date math, path handling, retry, debounce,
deep-merge, validation, deep-equal, arg parsing, escaping, diffing), you MUST:**

1. Name the rung you checked and what you searched for (`grep -rn`, the stdlib docs, `package.json`).
2. If a match exists → use it. Wrap it only when you need to adapt the signature in one place.
3. If nothing fits → write the smallest version that covers **today's** callers, and say in the
   PR/summary why the existing option did not fit (one line: "`path.relative` returns `..` paths
   for siblings; we need a boolean").

```toon
reuse_violations[6]{written_by_hand,use_instead}:
  "manual string split on '/' for paths","path.join / path.resolve / path.relative"
  "hand-rolled deep clone via JSON round-trip","structuredClone"
  "custom ISO date formatter","Date#toISOString / Intl.DateTimeFormat / installed date lib"
  "regex HTML/shell escaping","the framework's escaper / shell-quote lib already present / execFile args array"
  "own retry/backoff loop when the SDK has one","the SDK's retry option"
  "re-implementing a helper that exists in hooks/lib or utils/","import it"
```

**Security-sensitive code is never custom when a vetted primitive exists:** crypto, hashing,
random tokens, auth, JWT, HTML sanitising, SQL parameterisation, path-traversal checks. Use the
platform primitive (`crypto`, parameterised queries, `realpath`) — a home-made version is a
security finding.

---

## Core principles

```toon
principles[4]{principle,rule}:
  Reuse first,"Rule 0 above: stdlib → platform → repo → installed dep → new dep → custom."
  YAGNI,"Only implement what the current requirement needs. No speculative features, params, or config."
  KISS,"Choose the simplest solution that is correct. Fewer moving parts beats cleverness."
  DRY,"Wait for the Rule of Three (3 real occurrences) before abstracting."
```

## Decision flow

```
Does something already do this? (stdlib → platform → repo → installed dep)
├── YES → Use it. Stop.
└── NO → Is it in the current requirements?
    ├── NO → Don't build it (YAGNI)
    └── YES → Is there a simpler approach?
        ├── YES → Use the simpler one (KISS)
        └── NO → Duplicated 3+ times?
            ├── NO → Keep the duplicate
            └── YES → Abstract it
```

## Development best practices (all HARD)

```toon
practices[10]{practice,rule}:
  Smallest diff,"Change only what the task needs. No drive-by refactors, renames or reformatting in the same change."
  Delete over add,"Removing code is preferred to adding a flag around it. Dead code goes — with proof of 0 references."
  One source of truth,"A constant, list or message lives in one place and is imported. No copies kept in sync by hand."
  Explicit over clever,"Readable names, early returns, no nested ternaries, no metaprogramming for simple tasks."
  Small units,"A function does one thing. Size/nesting limits live in skills/code-simplifier (Targets) — split only when it helps reading."
  Fail loudly,"Validate at boundaries; throw/return a clear error. Never swallow errors silently (fail-open must be deliberate and commented)."
  No premature optimisation,"Measure first. Optimise only a measured hot path."
  Pure where possible,"Keep logic pure and side effects at the edges — it makes tests cheap."
  Tests prove behaviour,"Test both ends (allow + block, empty + one). A test that cannot fail is not a test."
  Comments say why,"Code says what; a comment explains a non-obvious why. No commented-out code."
```

## Anti-patterns

```toon
anti_patterns[8]{pattern,fix}:
  Re-implemented library function,"Rule 0 — call the existing one"
  Speculative features,"Only add when a requirement asks for it"
  Premature abstraction,"Wait for the 3rd occurrence"
  Excessive config,"Only configure what actually varies"
  Future-proof params,"Only params a current caller passes"
  Unnecessary layers,"Direct implementation for simple CRUD — no service/repository/factory for one call site"
  Over-generic code,"Specific named functions"
  New dependency for a one-liner,"Use the stdlib; a dep is a supply-chain and upgrade cost"
```

## Abstract vs keep duplicated

**Safe to abstract:** pure utilities, business rules, API clients, design tokens.
**Keep duplicated:** similar UI components (diverge by context), similar validations (domain-specific), similar tests (must be independent).

## Warning signs

- "Let me write a quick helper for…" → Rule 0: search first
- "We might need this later" → YAGNI
- "This is more flexible" → flexibility without a use case is complexity
- More configuration than code → over-configurable
- Many parameters or type switches → abstraction too broad

## Enforcement

- **Phase 1 / design:** list the existing functions and libraries the design reuses.
- **Phase 4 / review (`skills/code-reviewer`):** every hand-written helper that duplicates a stdlib,
  repo, or installed-dependency function is a finding, with the replacement call as the fix.
- **`skills/code-simplifier`** applies the same ladder when simplifying.

Three similar lines of code is better than a premature abstraction — and one library call is better than thirty lines of your own.
