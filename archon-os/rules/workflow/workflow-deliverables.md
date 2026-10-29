> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Workflow Deliverables Rule

**Priority:** CRITICAL
**Type:** Rule (Mandatory)

---

## Core Rule

**Every phase MUST produce required deliverables before proceeding.**

---

## TOON Format

Use TOON for AI-readable documents (TECH_SPEC.md, TEST_PLAN.md). Use Markdown for human-readable (REQUIREMENTS.md, TECH_SPEC_CONFLUENCE.md). ~40% token savings.

Syntax: `files[3]{path,action,purpose}:` for tabular data. See [TOON format](https://github.com/toon-format/toon).

---

## Phase Deliverables

```toon
deliverables[14]{phase,document,required,key_content}:
  1,REQUIREMENTS.md,YES,User stories + acceptance criteria + scope
  1,TECH_SPEC.md,YES,AI-readable: architecture + files + APIs + risks
  1,TECH_SPEC_CONFLUENCE.md,YES,Human-readable: full Confluence format
  1,DESIGN_DECISIONS.md,YES,Decision records — tiered Y-statement/ADR/MADR/RFC
  1,LLD.md,If design-heavy,Low-level design — data/API/errors/ops
  1,UI_BREAKDOWN.md,If UI,Components + props + accessibility
  2,TEST_PLAN.md,YES,Test scenarios + coverage targets
  2,Test files,YES,Failing tests (TDD RED)
  3,Implementation,YES,Passing tests (TDD GREEN)
  4,Refactored code,YES,Tests still passing
  4,CODE_REVIEW.md,YES,Security + performance + best practices
  5,QA_REPORT.md,YES,Test results + coverage
  5,IMPLEMENTATION_SUMMARY.md,YES,Changes + deployment
  5,CHANGELOG.md update,YES,Entry under current version
```

**CRITICAL:** AI reads `TECH_SPEC.md`, NOT `TECH_SPEC_CONFLUENCE.md`.

---

## Workflow Folder Structure

```
.claude/logs/runs/{run-id}/
├── REQUIREMENTS.md
├── TECH_SPEC.md              # AI reads this
├── TECH_SPEC_CONFLUENCE.md   # Human-readable
├── DESIGN_DECISIONS.md       # Decision records (tiered)
├── LLD.md                    # Low-level design (if design-heavy)
├── UI_BREAKDOWN.md           # If UI
├── TEST_PLAN.md
├── CODE_REVIEW.md
├── QA_REPORT.md
├── IMPLEMENTATION_SUMMARY.md
├── DEPLOYMENT_GUIDE.md       # If deployment
├── CHANGELOG_ENTRY.md
└── run-state.json
```

---

## Scaffolding (MANDATORY)

Deliverable files are auto-created by the orchestrator at phase entry, NOT silently expected to appear. The scaffolder lives at:

```
archon-os/scripts/workflow/scaffold-phase-deliverables.sh <run-id> <phase|all>
```

- **Idempotent.** Never overwrites — safe to call on phase re-entry, resume, modify, reject.
- **Copies from `archon-os/templates/`** when a matching template exists; falls back to a minimal skeleton (frontmatter + section headers + TODO markers) otherwise.
- Called by `run-orchestrator` Step 0.5 (Phase 1) and on every phase transition.

If you find a run dir with `run-state.json` but no `*.md` files, the run was started before this scaffolder existed (pre-v3.7.1) — run `bash archon-os/scripts/workflow/scaffold-phase-deliverables.sh <run-id> all` to backfill.

## Enforcement

Before phase transition: verify all required deliverables exist AND have non-template content. Missing or template-byte-identical deliverable = cannot proceed.

At workflow end: verify all documents exist before closing.

## On Modify / Reject

**CRITICAL:** When a phase is modified or rejected, deliverable files MUST be re-saved:

1. **Re-write** the updated deliverable `.md` files to the workflow log directory
2. **Log** the modification/rejection in `run-state.json` with timestamp, reason, and changes list
3. **Append** to `execution.log`: `[timestamp] Phase N modified/rejected: <reason>`
4. **Verify** updated files exist before showing the new approval gate

Do NOT just update in-memory state — the files on disk must reflect the latest version.

---

## Missing Deliverable Recovery

- **Create retroactively:** Generate from current implementation
- **Note omission:** Document skip reason (e.g., "Backend-only, no UI")

---

## Automated Check

```bash
[ -f "REQUIREMENTS.md" ] && echo "✅ Phase 1" || echo "❌ Phase 1"
[ -f "TECH_SPEC.md" ] && echo "✅ AI Spec" || echo "❌ AI Spec"
[ -f "TEST_PLAN.md" ] && echo "✅ Phase 2" || echo "❌ Phase 2"
[ -f "CODE_REVIEW.md" ] && echo "✅ Phase 4" || echo "❌ Phase 4"
[ -f "QA_REPORT.md" ] && echo "✅ Phase 5" || echo "❌ Phase 5"
```

---

## Related Rules

```toon
related[4]{rule,connection}:
  approval-gates.md,Deliverables checked at gates
  workflow-navigation.md,Phase tracking
  next-step-guidance.md,Remind about deliverables
  tdd-workflow.md,Test file deliverables
```

---

**Last Updated:** 2025-12-10
