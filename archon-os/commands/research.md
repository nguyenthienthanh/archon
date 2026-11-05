# /archon-os:research

**Plan-only research.** Interview until the requirement is clear, research what the code and docs can answer, write a plan, have it verified, publish it. **Writes no code** — a hook enforces it.

**Category:** Planning
**Scope:** Project-local (writes only to `.claude/research/<slug>/`)

---

## Usage

```
/archon-os:research <topic>        # start a session (or continue the open one for this topic)
/archon-os:research status         # checklist state + open questions of the active session
/archon-os:research done           # end early: run steps 4–6 now on whatever the brief has (open items → G7)
/archon-os:research resume <slug>  # reopen a closed session to revise its plan
```

Use it when the outcome you want is **a decision and a plan**, not a change. When the plan is approved, implementation goes through `/archon-os:plan` (tree) and `/run` (TDD) — never from inside this command.

---

## Protocol — follow in order

### 0. Open the session

1. Derive `<slug>` (kebab-case, ≤40 chars, from the topic). The project root is `git rev-parse --show-toplevel` (fallback: cwd).
2. Write the write-guard marker **through Bash** (`$CLAUDE_CODE_SESSION_ID` is only visible to Bash) and snapshot the tree:

   ```bash
   ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; D="$ROOT/.claude/research/<slug>"
   mkdir -p "$D"
   [ -n "$CLAUDE_CODE_SESSION_ID" ] || { echo "ABORT: CLAUDE_CODE_SESSION_ID empty — write-guard cannot bind to this session"; exit 1; }
   printf '{"session_id":"%s","slug":"%s","expires_at":"%s"}\n' \
     "$CLAUDE_CODE_SESSION_ID" "<slug>" "$(date -u -v+6H +%FT%TZ 2>/dev/null || date -u -d '+6 hours' +%FT%TZ)" \
     > "$ROOT/.claude/research/.active"
   git -C "$ROOT" status --porcelain --untracked-files=all > "$D/git-before.txt" 2>/dev/null || true
   ```

   **If the script prints ABORT, stop and tell the user** — the guard would fail open and "plan-only" would be a promise, not a control. From here on `hooks/research-write-guard.cjs` blocks Write/Edit/MultiEdit/NotebookEdit outside `.claude/research/` — and the marker file itself — **for this session and its subagents only** (subagent tool calls carry the parent session id). It finds the marker by walking up from the tool's cwd.
3. Seed `brief.md` with the topic verbatim and the empty checklist below. Seed `meta.json`: `{slug, started_at, rounds: 0, agents: {}, artifact: null, verdict: null}`.

### 1. Clarify — loop until the checklist is clean AND the user confirms

```toon
checklist[7]{id,item,clean_when}:
  G1,Goal + who it is for,"one sentence each, user's words"
  G2,Scope and non-goals,"at least one explicit non-goal"
  G3,Constraints,"stack / budget / time / compliance stated or explicitly 'none'"
  G4,Done criteria,"testable — someone else could check them"
  G5,Dependencies + touched subsystems,"from code-scout evidence, not from the user's memory"
  G6,Risks / failure modes,"top risks named with a mitigation or an accepted 'live with it'"
  G7,Open questions,"zero — or each one recorded as 'decide later' by the user"
```

Each round:

1. **Gap analysis (subagent).** Dispatch the gap-analyst with `brief.md` → it returns, per checklist item, `clean | gap: <what is missing>`, plus **up to 4 next questions, each with 2–4 options and a recommended option**, and which gaps a scout should settle instead of the user.
2. **Scouts first, user second.** Anything the repo or public docs can answer goes to a scout (table below). **Never ask the user what the code can tell you.**
3. **Ask (main thread only — subagents cannot reach the user).** One `AskUserQuestion` call, ≤4 questions, options from the analyst. Questions must stand alone (the dialog hides earlier text).
4. **Record.** Append answers + scout findings to `brief.md` with the date; update the checklist; `meta.json.rounds += 1`.

**There is no round cap.** Exit the loop only when the analyst reports all seven items clean; then show the user the brief (≤25 lines) and ask for explicit confirmation. A "no" or a correction is another round. Override phrases (`just plan it`, `đủ rồi`) end the loop early — record the still-open items under G7 as `decide later (user)`.

### 2. Research

Dispatch scouts for anything the plan needs that the interview did not settle (prior art, library limits, current code shape). Findings go into `brief.md` under `## Evidence` with a source (file:line or URL) per claim. No source → it is a hypothesis and must be labelled as one.

### 3. Write the plan

Dispatch the plan-writer with `brief.md` only (not the conversation). It **returns the plan as its final message**; the main thread writes it to `.claude/research/<slug>/plan.md`. No subagent in this command needs a write tool — tell each one in its prompt that it must not write files or run mutating Bash. Shape:

```
# <Title>
Status · Date · Owner · Slug
## Decision summary          (≤5 lines: what we will do and why)
## Requirements              (G1–G4, from the brief)
## Options considered        (2–3, trade-offs, why the chosen one wins)
## Chosen design             (components, data, interfaces — to the level a /run Phase 1 can start from)
## Plan                      (ordered steps / stories, each with done criteria)
## Risks                     (G6)
## Open / decide later       (G7)
## Evidence                  (sources)
```

### 4. Verify (never the writer)

Run `skills/independent-verifier` against `plan.md` + `brief.md`: does every requirement in the brief map to a plan step, does every claim in Evidence have a source, is anything in the plan not asked for. The verifier may only **lower** confidence; any `UNSUPPORTED` item goes back to the plan-writer (fresh agent if > 5 min since it finished — see lifecycle below) or to the user as a question. Record the verdict in `meta.json`.

### 5. Publish

- `plan.md` on disk is the **source of truth**.
- If a claude-artifacts publish tool is available (`mcp__claude-artifacts__publish_*`): read its `guide` (pages) once per session, render `plan.md` as a private page, publish, and store `{slug, version}` in `meta.json.artifact`. On revision, republish with that `base_version` — never create a second artifact for the same slug. Give the user the link.
- No artifacts tool → say so; the local file is the deliverable.

### 6. Close (after publish, or on `done`)

1. **Diff against the snapshot**, not against a clean tree (the tree may have been dirty before):
   ```bash
   ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; D="$ROOT/.claude/research/<slug>"   # shell state does not persist between Bash calls
   git -C "$ROOT" status --porcelain --untracked-files=all | diff "$D/git-before.txt" - | grep '^>'
   ```
   Every new line must be a path under `.claude/research/`. Anything else is a **violation**: list it and tell the user; do not revert silently. Limit: paths ignored by `.gitignore` are invisible to this check — the guard is the control for those.
2. Delete `.claude/research/.active` (Bash `rm` — file tools are blocked from it by design).
3. Close every agent this session still holds (`TaskStop` any still running); clear `meta.json.agents`.
4. **Offer** (never auto-run): *"Seed the plan tree from this plan? → writes `.claude/cache/pending-plan-bootstrap.json` and runs `/archon-os:plan`."* Only on an explicit yes.

### `status`

Read the active marker + `brief.md` + `meta.json`; print the checklist (clean/gap per item), rounds so far, open questions, verifier verdict, artifact link. Read-only.

### `resume <slug>`

`.claude/research/<slug>/` must exist. Re-run step 0.2 for that slug (fresh marker + snapshot), append a `## Revision <date>` section to `brief.md` with what the user wants changed, then continue from step 1. Spawn every agent fresh — the old ones are long past the cache window. Republish to the **same** artifact (`meta.json.artifact.base_version`).

---

## Agents and models

The model column is the per-call `model` alias passed to the Agent tool. Reasons are stated because the default subagent model is cheaper, and a heavier model must earn its place.

```toon
roles[6]{role,subagent_type,model,reason}:
  interviewer,(main thread),session,"Only the main thread can call AskUserQuestion"
  gap-analyst,archon-os:strategist (read-only),opus,"The deep-thinking step: finds what is missing or contradictory; cheap models agree too easily"
  code-scout,Explore,haiku,"Locating code and reading excerpts"
  doc-scout,web-fetch (WebFetch only),sonnet,"Fetch + summarise external docs / prior art"
  plan-writer,archon-os:architect,opus,"Final document a human decides on; returns text, main thread writes the file"
  verifier,skills/independent-verifier,haiku k=3,"Fresh context, not the writer; agreement-based confidence"
```

Run scouts in parallel (one message, several Agent calls) when their questions are independent. Do not use Workflow unless the user opted into it.

### Lifecycle — pause, resume, close

Same policy as `skills/run-orchestrator/SKILL.md` § *Subagent lifecycle — pause, resume, close* (subagent prompt cache lives 5 minutes; `SendMessage` resumes a finished subagent, `TaskStop` ends one):

```toon
lifecycle[3]{agent,between_rounds,closed_when}:
  gap-analyst,"Resume via SendMessage with only the new answers IF its last turn ended < 5 min ago; otherwise spawn fresh — brief.md carries everything it needs","Checklist clean + user confirmed"
  scouts,"Never resumed — one question, one scout","On return"
  plan-writer,"Resume for verifier fixes < 5 min; otherwise fresh from brief.md + verdict","Verifier passes"
```

Store agent ids in `meta.json.agents` so `status` and `resume` can find them.

---

## Hard rules

- **No code, tests, configs or docs outside `.claude/research/`.** The guard blocks file tools; Bash writes are not blocked by it, so do not use Bash to write either (the only Bash writes are steps 0.2 and 6.2) — step 6.1 will expose it.
- **Don't guess.** A gap is closed by the user's answer or by a sourced scout finding, never by the analyst's assumption.
- **Builder ≠ verifier.** The plan-writer never grades its own plan.

## Related

- Guard: `hooks/research-write-guard.cjs` (disable: `AF_RESEARCH_GUARD_DISABLED=1`)
- Questions discipline: `rules/core/no-assumption.md`, `rules/workflow/requirement-challenger.md`
- Next step after approval: `/archon-os:plan`, then `/run`
