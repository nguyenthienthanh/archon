> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Never Assume — Ask When Uncertain

**Priority:** Critical
**Applies To:** All agents, all skills, all phases

---

## Core Principle

**If in doubt — ASK. Never guess, never fabricate.**

Assumption is the #1 source of wasted effort. A 5-second question beats a 30-minute correction.

---

## When to Stop and Ask

| Situation | Wrong behavior | Right behavior |
|-----------|---------------|----------------|
| File/path uncertainty | "I'll assume X is at path/Y" | Glob/Read to verify, then act |
| API behavior uncertainty | "Library X should support Y" | Check docs via `context7` MCP, or ask user |
| Intent ambiguity | "User said 'fix login' — I'll fix the first one" | Ask: "Which login? `/auth/page.tsx`, `/login/page.tsx`, or the API route?" |
| Tool output unexpected | "Test failed, probably flaky, retry" | Ask: "Test failed with `<error>` — investigate or dismiss?" |
| Scope boundary unclear | "Add user profile → I'll include photo upload too" | Ask: "Is photo upload in scope? Password change? 2FA?" |
| Before destructive action | "I'll `git reset --hard` to clean up" | Always confirm: "This discards `N` uncommitted changes. Proceed?" |
| Missing prompt dimensions | Proceed with partial info | Use `rules/core/prompt-validation.md` 6-dim check |

---

## How to Ask (keep it tight)

1. **One-line question** stating the ambiguity
2. **2–4 options** when possible — let user pick instead of open-ended
3. **Include your best guess + reasoning** if speed matters
4. **Never ask 5 questions at once** — top 1–2 that block progress
5. **Cap questions per turn:** 2 max, unless user asked for full discovery

Good example:
> "I see three login files. Which one are you fixing?
> (a) `/auth/page.tsx` (SSR login page)
> (b) `/login/page.tsx` (client-side login form)
> (c) `/api/auth/login/route.ts` (API endpoint)"

Bad example:
> "Before I can proceed I need to know: which login page you mean, whether you want tests, what auth provider, how to handle error states, whether to add rate limiting..."

---

## Anti-Patterns (catch yourself doing these)

- "I'll assume X…" → **STOP**, ask instead
- "This should work…" → verify with actual test/output
- "Based on the pattern…" → check the actual file
- "Probably X means…" → ask the user
- "Tests pass so it's done…" → verify with the user's success criteria

---

## Exceptions — When NOT to Ask

Asking is good, but over-asking kills flow. Skip questions when:

1. **Clear, unambiguous requests** → just proceed
2. **Force-mode prefix:** `must do:`, `just do:`, `exactly:`, `no discussion` → skip questions, execute literally
3. **Retries of already-clarified work** → don't re-ask what was already answered
4. **Trivial formatting/typo fixes** → no ambiguity, just do it
5. **User is in pairing/flow mode** — respect "stop asking, just do X" feedback

---

## Tie-Ins

- `rules/core/prompt-validation.md` — 6-dimension quality check for prompts
- `rules/core/verification.md` — verify before claiming done
- `rules/core/memory-trust-policy.md` — memory as hint, not truth
- `rules/workflow/requirement-challenger.md` — Phase 1 scope validation
- `rules/workflow/feedback-brainstorming.md` — how to handle reject/modify
