# Aura Frog Templates

Document templates used by workflows and commands to generate standardized output.

---

## Templates Index

| Template | Purpose |
|----------|---------|
| `requirements.md` | Feature requirements analysis (Phase 1 output) |
| `tech-spec-toon.md` | Technical specification in TOON format |
| `lld.md` | Low-level design document |
| `test-plan-toon.md` | Test plan in TOON format |
| `test-cases.md` | Test case documentation |
| `implementation-summary.md` | Implementation summary (Phase 5 output) |
| `deployment-guide.md` | Deployment instructions |
| `refactor-analysis.md` | Refactoring analysis document |
| `refactor-plan.md` | Refactoring execution plan |
| `pull_request_template.md` | PR description template |
| `confluence-page.md` | Confluence page export format |
| `project-claude.md` | Project CLAUDE.md template |
| `ccpm-config.yaml.template` | CCPM configuration template |
| `session-context.toon.template` | Session context snapshot |
| `workflow-state.toon` | Workflow state persistence format |

---

## Usage

Templates are automatically used by workflow phases and commands. You can also reference them directly:

- **Phase 1** uses `requirements.md` and `tech-spec-toon.md`
- **Phase 2** uses `test-plan-toon.md` and `test-cases.md`
- **Phase 5** uses `implementation-summary.md`
- **`document` command** uses various templates based on document type
- **`refactor` command** uses `refactor-analysis.md` and `refactor-plan.md`
