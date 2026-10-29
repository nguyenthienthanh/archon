> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Git Workflow Rules

**Category:** Version Control
**Priority:** High

---

## Branch Naming

Pattern: `<type>/<ticket>-<short-description>`

```toon
types[5]{prefix,use}:
  feature/,New features
  bugfix/,Bug fixes
  hotfix/,Urgent production fixes
  refactor/,Code refactoring
  chore/,Maintenance tasks
```

Rules: Include ticket number, lowercase, hyphens (not underscores), no special characters.

---

## Commit & Push Confirmation (CRITICAL)

**NEVER auto-commit or auto-push.** Sequence:

1. Show `git diff --stat`
2. Show proposed commit message
3. Ask for explicit confirmation
4. Wait for user confirmation before `git commit`
5. After commit, ask before `git push` separately

No exceptions.

---

## Commit Messages

Format: `<type>(<scope>): <subject>` + body + footer

```toon
commit_types[7]{type,use}:
  feat,New feature
  fix,Bug fix
  refactor,Code refactoring
  test,Adding tests
  docs,Documentation
  style,Formatting
  chore,Maintenance
```

---

## Pull Request Guidelines

Title: `[TICKET] Type: Brief description`

PR body: Summary, Type of Change, Testing checklist, Screenshots (if UI), Code quality checklist.

---

## Protected Branches

`main`/`master` and `develop`: No direct pushes, requires PR + approval, all tests must pass, no force push.

---

## Merge Strategy

- **Squash and Merge** (preferred): Clean history, one commit per PR
- **Merge Commit**: Feature branches with meaningful commits
- **Rebase**: Personal feature branches

---

## Code Review

Assign reviewers by component/platform (Frontend Lead, Backend Lead, Mobile Lead, QA Lead, Design Lead).

Configure actual reviewers in `.claude/project-contexts/[your-project]/team.md`.

---

## Forbidden Actions

Never: force push to main/develop, commit to protected branches, merge without approval, skip CI/CD, commit secrets, use `--no-verify`.

---

**Applied in:** Phase 3 (Build GREEN), Phase 4 (Refactor + Review), Phase 5 (Finalize)
