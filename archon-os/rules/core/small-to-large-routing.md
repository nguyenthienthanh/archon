> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Model Routing — Prefer the Session Model, Down-shift Only for Trivial Work

**Priority:** HIGH
**Applies To:** All agent / skill invocations where model selection is configurable

---

## Core Principle

**The session model is the default for all substantive work. Inherit it.** The model the user launched with encodes their intent and budget — match it for design, build, review, test, and planning. The *only* deliberate override is **down-shifting to the cheapest tier** for trivial mechanical work where a wrong answer costs little.

**Never force-upgrade to a named model (e.g. Opus) for "complex" tasks.** If the user wanted more capability they'd already be running it, and hardcoding a model name means a newer/stronger model is silently ignored. There is no fixed top of the ladder — **the session model is the ceiling.**

---

## The Two Tiers

```
cheapest tier (haiku)   →   session model (everything else)
   (trivial work)            (inherit — design, build, review, reason)
```

### Down-shift to the cheapest tier (`haiku`) — only when trivial

- Classification (`agent-detector`, `scanner`)
- File-format / framework detection
- Simple field extraction
- State bookkeeping, git plumbing, formatting / lint fixes
- Any task where a wrong answer costs little and a retry is cheap

### Inherit the session model (default) — for real work

- Code generation, refactors, feature implementation
- Test writing, code review, security review
- Architecture / design / planning (esp. multi-constraint, cross-system)
- Debugging with ambiguous root cause
- Anything where quality matters — the user's session model is the right ceiling

---

## Signals

| Signal | Action |
|--------|--------|
| Task is pure extraction / classification / plumbing | down-shift → `haiku` |
| A down-shifted (`haiku`) step gave vague or contradictory output | restore → session model |
| Reasoning across 3+ files · multi-constraint · ambiguous root cause | keep the session model (never down-shift) |
| Tempted to "use Opus to be safe" | the session model already IS the user's chosen ceiling — don't override |

> There is intentionally **no escalation to a named model.** If the work needs more than the session model offers, that is the user's call (they relaunch with a stronger model) — not a per-agent override the plugin bakes in.

---

## Enforced Defaults in Aura Frog

| Agent / Skill | Model | Why |
|---------------|:-----:|-----|
| `agent-detector` | `haiku` | trivial classification |
| `scanner` | `haiku` | trivial detection |
| `session-continuation`, `git` | `haiku` | mechanical state / git plumbing |
| `security`, `tester`, `devops`, `strategist` | **inherit** | substantive work — match the session |
| `architect`, `frontend`, `mobile`, `lead` | **inherit** | match the session |
| `problem-solving`, `tree-of-thoughts` | **inherit** | reasoning — match the session |

Resolution: per-agent / per-skill frontmatter `model:` field > session model. **Omit `model:` to inherit** — that is the default for any substantive work. Set `model: haiku` *only* as a deliberate cheap floor for trivial work.

---

## Why Prefer the Session Model

- **Future-proof:** new / stronger models flow through automatically — no plugin update needed to "keep up."
- **Respects intent:** the user picked their session model deliberately; overriding it (up *or* down, for non-trivial work) breaks that intent.
- **Cost is the user's lever:** they control cost by choosing the session model; the plugin only saves money on genuinely trivial work.
- **No stale model names:** the plugin stops naming specific models for routing, so it never lags a model release.

---

## Anti-Patterns

- **"Force Opus for complex tasks"** — names a model that goes stale; ignores the user's session choice and any newer model. *This rule exists to remove exactly this.*
- **"Set a fixed model per agent regardless"** — breaks the session model's intent (an Opus-session user's reviewer shouldn't be pinned to Sonnet).
- **"Always `haiku` for speed"** — loses on real work; retries cost more than the saving.
- **"Down-shift after every minor step"** — thrash; only down-shift genuinely trivial work.

---

## Tie-Ins

- `README.md` Per-Agent Model Override section — user-facing explanation
- `rules/core/context-management.md` — model selection is part of context strategy
- `rules/workflow/token-time-awareness.md` — model choice is the biggest cost lever
- `skills/agent-detector/SKILL.md` — implements `haiku`-floor + inherit-default routing
- `rules/core/prompt-caching.md` — smaller models cache same prefix cheaper
