> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Diagram Requirements Rule

**Category:** Documentation
**Priority:** Medium

---

## When Required

```toon
required_triggers[6]{scenario,diagram_type,location}:
  New feature with 3+ components,Sequence/Flowchart,docs/ or inline
  API design with 3+ endpoints,Sequence diagram,API docs
  State management changes,State diagram,Tech spec
  Multi-step workflow,Flowchart,Feature docs
  Agent collaboration (2+ agents),Swimlane/Sequence,Phase 2 deliverable
  Database schema changes,ER diagram,Migration docs
```

## When Recommended

```toon
recommended_triggers[4]{scenario,diagram_type,benefit}:
  Bug fix with complex flow,Flowchart,Root cause clarity
  Refactoring,Before/After comparison,Impact visibility
  Integration with external API,Sequence diagram,API contract clarity
  Performance optimization,Timeline/Gantt,Bottleneck identification
```

---

## Diagram Types

| Type | Use For |
|------|---------|
| Sequence | Interactions between components, API calls, agent handoffs |
| Flowchart | Decision trees, process flows, conditional logic |
| State | Lifecycle states, status transitions |
| ER | Database schemas, data models |
| Graph | System architecture, component relationships |

All diagrams use Mermaid format.

---

## Phase Requirements

```toon
phase_diagrams[4]{phase,requirement}:
  Phase 2 (Test RED),MUST: Architecture diagram + main user flow sequence
  Phase 3 (Build GREEN),SHOULD: Component hierarchy + state flow (if stateful)
  Phase 4 (Refactor + Review),SHOULD: Test coverage flowchart + integration test sequence
  Phase 5 (Finalize),MUST: Update any diagrams changed during implementation
```

---

## Quality Standards

- Clear title, all components labeled, flow direction with arrows
- Max 15-20 nodes per diagram
- No unclear abbreviations without legend
- No placeholder text

---

## Location

```toon
location_rules[4]{scope,location}:
  Feature-specific,docs/features/[feature]/ inline
  Architecture-level,docs/architecture/ dedicated file
  API documentation,docs/api/ inline
  Workflow/Process,docs/architecture/WORKFLOW_DIAGRAMS.md
```

---
