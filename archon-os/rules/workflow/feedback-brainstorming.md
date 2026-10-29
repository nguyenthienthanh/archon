> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Feedback Brainstorming

**Priority:** HIGH
**Applies:** All feedback scenarios (reject, modify, suggestions)

---

## Core Rule

**When user provides feedback, brainstorm before implementing.** Analyze feedback, consider alternatives, present options, then implement agreed approach.

---

## Skip Brainstorming (Force Mode)

Force phrases: "must do", "work like that", "just do it", "do exactly", "no discussion", "I insist"

---

## Flow

1. **Acknowledge:** "I hear your feedback: [summary]"
2. **Analyze:** Consider trade-offs and alternatives
3. **Present Options:** User's suggestion (A) vs alternative (B) vs hybrid (C) — each with pros/cons
4. **Ask:** "Which approach? Or 'must do A' to skip discussion next time."
5. **Implement** agreed approach

---

## Depth by Decision Type

```toon
brainstorm_depth[3]{type,level,examples}:
  Complex,Full brainstorming,"Architecture / state management / DB schema / API design / breaking changes"
  Simple,Light brainstorming,"Naming / formatting / small refactors / docs / test additions"
  Obvious/Forced,Skip,"Bug fixes with clear solution / force phrases / syntax errors / typos"
```

---

## Behavior

- Consider user's perspective, think about trade-offs, offer alternatives
- Respect force mode, keep it concise
- Never argue (discuss), never block progress, never brainstorm trivial changes

---

## Integration

At approval gates: `reject: [feedback]` → brainstorm before redo. `modify: [changes]` → light brainstorm.

Force shortcut: `reject: must do [feedback]` or `modify: just do [changes]` → skip brainstorm.

---

**Last Updated:** 2025-12-01
