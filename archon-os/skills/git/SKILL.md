---
name: git
description: "Token-efficient git operations with security scanning and auto-split commits, plus auto-creating git worktrees to isolate workflow changes — merge on success, discard on failure."
autoInvoke: false
priority: high
model: haiku
triggers:
  - "commit"
  - "push"
  - "create PR"
  - "workflow:start"
  - "worktree"
  - "isolated branch"
allowed-tools: Bash, Read, Write
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Git

Token-efficient git operations (commit/PR flow) plus worktree isolation for workflows.

---

## Commit workflow (security scan + auto-split)

Token-efficient git: 2-4 tool calls max.

### 1. Stage + Security Scan

Stage files, check diff stats, scan for secrets (`api_key|token|password|secret|credential`).
**If secrets found: STOP. Show matches. Block commit.**

### 2. Split Decision

**Split** if: mixed types (feat+fix), FILES >10 unrelated, multiple scopes (frontend+backend).
**Single** if: same type/scope, FILES ≤3 + LINES ≤50, logically related.

### 3. Commit Message

Format: `type(scope): description` (<72 chars, present tense, imperative)
Types: feat, fix, docs, chore, refactor, test, perf

### 4. Confirm → Commit → Push

**NEVER auto-commit or auto-push** (per `rules/workflow/git-workflow.md`):

1. Show `git diff --stat` + the proposed commit message
2. Wait for explicit user confirmation before `git commit`
3. After commit, ask before `git push` separately — push only if user requests

No exceptions.

### PR Workflow

1. `git fetch origin main` + log commits since main + diff stats
2. `gh pr create --title "type(scope): description" --body "## Summary\n- bullets\n\n## Test Plan\n- steps"`

### Output

```
staged: 3 files (+45/-12 lines) | security: passed | commit: a3f8d92 feat(auth): add token refresh
```

---

## Worktree isolation

Auto-create git worktree when starting a workflow. All changes on isolated branch. Discard on failure -- zero damage to main.

### When to Use

- **Auto:** `/run` when `AF_WORKTREE=true`
- **Manual:** User says "use a worktree"
- **Skip:** Quick fixes, config changes, single-file edits

### Lifecycle

```toon
worktree_lifecycle[5]{event,action}:
  run:start,"git worktree add .worktrees/[id] -b af/[id]"
  Phase 1 approved,All edits in worktree directory
  Phase 5 complete,"Offer: merge / create PR / keep branch / discard"
  run:cancel,"git worktree remove .worktrees/[id]"
  run failed,Discard worktree — main untouched
```

### Configuration

```bash
export AF_WORKTREE=true
export AF_WORKTREE_DIR=".worktrees"  # default
```

Add `.worktrees/` to `.gitignore`.

### Safety

```toon
safety[4]{rule,reason}:
  Never force-delete with uncommitted changes,User may lose work
  Always offer merge/PR/keep/discard,User decides
  Auto-discard only on explicit cancel/failure,Don't assume
  Checkpoint commits before discarding,Last chance to recover
```

Works with `phase-checkpoint.cjs` -- checkpoints are commits on worktree branch, main never affected until explicit merge.

---
