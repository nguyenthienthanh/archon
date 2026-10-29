> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Prompt Caching — Place Cache Breakpoints Intentionally

**Priority:** HIGH
**Applies To:** Any long-running workflow where the same prompt prefix is reused across turns

---

## Core Principle

**Anthropic's prompt-caching lets you reuse stable prompt prefixes at ~10% of the normal token cost. Place `cache_control` breakpoints at the boundary between stable context and per-turn variable content.**

Reference: [Anthropic docs — prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)

---

## What to Cache

Stable content that persists across many turns:

| Content | Why cache |
|---------|-----------|
| Plugin CLAUDE.md (Aura Frog OS context) | ~3K tokens, loaded every session |
| Rule tier loaded per phase (core + agent) | ~5K tokens, stable per phase |
| Skill SKILL.md content (once invoked) | ~500–2K tokens per skill |
| Project context files (repo-map, conventions, examples) | ~3–8K tokens, changes rarely |
| Agent definition body | ~1K tokens, stable during phase |

## What NOT to Cache

Per-turn variable content:

- User's current message
- Current tool results
- Current phase-deliverable drafts
- Anything written this turn

---

## Cache Breakpoint Placement

Claude Code's cache uses `cache_control: { type: "ephemeral" }` markers. The 4 breakpoint budget should be spent on:

| Breakpoint | What comes before | Hit rate |
|-----------|-------------------|----------|
| **1. System + CLAUDE.md** | Aura Frog OS context + project CLAUDE.md | Very high (every turn) |
| **2. Rule tier** | Core rules + active agent rules | High (per phase) |
| **3. Phase deliverables so far** | Approved P1/P2 content as read-only | Medium (grows per phase) |
| **4. Active skill content** | Current skill's SKILL.md body | Medium (per skill) |

---

## Practical Behaviors

### Plugin-Level

- `archon-os/CLAUDE.md` is a cache-friendly stable header
- Each rule file is a stable unit — edits invalidate that file's cache
- Agent files are stable during their active phase

### Skill-Level

- When a skill is invoked, its full SKILL.md content enters context as a single message → cacheable
- Supporting files (reference.md) should be separate messages → independently cacheable

### Project-Level

- `.claude/project-contexts/<name>/*.md` — cache once per session, reuse across turns
- Changes to these files (e.g., after `/project refresh`) invalidate cache

---

## TTL Awareness

Anthropic cache has a 5-minute TTL (ephemeral). In practice:

- **Active workflow** (user engaged, turns every 30s–2min) → hit rate high
- **Resumed after break** (gap > 5 min) → cache miss, re-price prefix at full cost
- **After `/compact`** → cache invalidated by the compact operation

**Implication:** Long gaps cost more. For deep tasks with big breaks, prefer `/run handoff` + resume rather than leaving a session idle.

---

## Invalidation

Any token change *before* a breakpoint invalidates it AND everything after. Rules to avoid shooting the cache:

1. Don't edit CLAUDE.md mid-session (cache miss on breakpoint 1)
2. Don't regenerate project context mid-session (cache miss on breakpoints 1–3)
3. Edits to the *current* skill's SKILL.md miss breakpoint 4 only — fine
4. Edits to rule files mid-session — if that rule is in the active tier, misses breakpoint 2

---

## Cost Impact

Typical Deep workflow without caching: ~62K tokens
Typical Deep workflow with caching: ~35–40K tokens (cache hits on breakpoints 1–3 after turn 1)
**Savings: ~35–40% for long workflows**

For short Quick tasks (1–2 turns), caching adds negligible value — the prefix doesn't get reused enough to amortize.

---

## Anti-Patterns

- **Mid-session config changes** — edit `.claude/settings.json` or CLAUDE.md only between sessions
- **Over-fragmenting the context** — combining too many cached chunks wastes breakpoints
- **Caching dynamic content** — current deliverable drafts change per turn; don't try to cache them
- **Forgetting TTL** — long gaps = cache miss = full cost; plan handoffs

---

## Tie-Ins

- `rules/core/context-management.md` — 3-tier compression is complementary to caching
- `rules/workflow/token-time-awareness.md` — caching feeds into budget math
- `skills/run-orchestrator/SKILL.md` — long-running workflows benefit most
- `rules/core/small-to-large-routing.md` — smaller models cache the same prefix cheaper
