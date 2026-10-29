# Permanent Memory Loader — Reference (loaded on demand)

Detail moved out of `SKILL.md` to keep the every-turn auto-load lean. Read this file only when debugging or extending the loader.

## Example output

```
[permanent-memory | trust:file]
Epic FEAT-007 (JWT auth):
  decisions: token storage in httpOnly cookie (DEC-001)
  gotchas: refresh-token rotation requires CSRF re-issue
Epic FEAT-008 (Profile avatars):
  decisions: deferred to S3 over base64 inline
  anti-patterns: never store image bytes in postgres TEXT
```

## Auto-degradation (when budget exceeded)

1. Drop Tentative subsection lines first
2. Trim "Patterns that worked" lines (keep decisions + gotchas)
3. Show Epic IDs only — no subsection lines
4. Skip entirely if file > 8000 tokens (extreme; suggests epic-summarizer cap was bypassed)

## What this skill does NOT do

- Does NOT load the full Epic body — only summary lines
- Does NOT load `.claude/memory/manual_overrides.md` (user-curated; treated separately)
- Does NOT modify memory files (read-only)
- Does NOT make decisions based on memory content (caller decides)
- Does NOT trigger across projects (`.claude/memory/` is per-project)

## Memory staleness

If an Epic section is older than 90 days (parsed from its `**Completed:**` line), the loader prefixes it with `(>90d may be outdated)`. Per spec §29 risk register: "Permanent memory stale wisdom".

## Tie-Ins

- **Spec:** §9.6, §19.2 (permanent_memory.md structure)
- **Producer:** `agents/epic-summarizer.md` — only writer of the content this skill loads
- **Producer (manual):** `.claude/memory/manual_overrides.md` — user-curated; loaded separately by name (not via this skill)
- **Rule:** `rules/core/memory-trust-policy.md` — defines `trust: file` semantics for loaded content
- **Rule:** `rules/workflow/session-reset-policy.md` — defines what's preserved across reset (this content is)
- **Companion auto-invoke skill:** `plan-loader` — both fire silently when their files don't exist
