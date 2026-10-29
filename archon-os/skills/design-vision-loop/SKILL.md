---
name: design-vision-loop
description: "Vision feedback loop for UI — render the running UI, screenshot it across viewports + dark mode, run deterministic gates then a multimodal critique against the design system, and iterate until it passes. Use after building or changing a UI component/page, when asked to 'check the UI', make it 'look right', or verify a build matches a design spec / Stitch screen."
when_to_use: "verify UI looks right, screenshot critique, iterate UI against design system, match a design spec / Figma / Stitch screen, responsive + dark-mode check, make it look designed"
user-invocable: false
allowed-tools: Read, Grep, Glob, Bash
---

> **AI-consumed reference.** This skill *verifies* rendered UI; it does not generate taste (that's
> `frontend-aesthetics`) or enforce statically (that's the `design-conformance` hook +
> `theme-consistency` rule). Close the loop: build → **see** → critique → fix.

# Design Vision Loop

Open-loop text guidance is why "correct" UI still looks off — nobody looked at it. This skill adds the
eyes: **render → screenshot → critique → iterate**, the pattern Anthropic endorses for UI agents
(*Building agents with the Claude Agent SDK*: "visual feedback… can be helpful"; computer-use docs:
"after each step, take a screenshot and carefully evaluate… only when you confirm a step was executed
correctly should you move on").

## Precondition

The UI must be renderable: a running dev server URL/route, or a static HTML artifact. If nothing renders
(component with no harness), say so and either spin up a preview or fall back to static review — don't
pretend to have looked.

## The loop (max 3 iterations by default)

```toon
loop[4]{step,action,tools}:
  1,Render + capture,"navigate → resize each viewport → screenshot; emulate dark mode, screenshot again"
  2,Tier-1 deterministic gates,"run the design-conformance check + read console errors — cheap, run FIRST"
  3,Tier-2 vision critique,"read the screenshots, score against references/critique-rubric.md"
  4,Verdict,"PASS → done · defects → fix → re-enter step 1 (until pass or budget hit)"
```

**Two-tier verification is deliberate** (Anthropic ranks rules-based feedback above LLM-as-judge): the
deterministic gate is the strong signal and it's nearly free, so run it before spending a vision call. Only
screenshot-critique what already passes the lint-level gate.

### Step 1 — capture (Playwright MCP)

- `browser_navigate` to the route → for each viewport in `references/viewport-matrix.md`
  (`browser_resize` 375 → 768 → 1440) → `browser_take_screenshot`.
- Dark mode: emulate `prefers-color-scheme: dark` (via `browser_evaluate` / an emulation call) and
  re-screenshot at the primary viewport. If the design system declares no dark mode, skip and note it.
- Save PNGs under `.claude/workflow/vision/<route>-<viewport>[-dark].png`.

### Step 2 — deterministic gates (tier 1)

- Run the `design-conformance` check over the changed files (hardcoded hex/px vs tokens, mixed component
  libraries, missing `prefers-reduced-motion`). Any FAIL → fix before wasting a vision call.
- Read `browser_console_messages` — runtime errors / failed asset loads are defects regardless of looks.

### Step 3 — vision critique (tier 2)

Read the captured screenshots and score against `references/critique-rubric.md`. Conformance target is
`.claude/design/design-system.md` (palette / type scale / spacing / signature). If a Stitch screen PNG or
Figma frame exists, compare at the **layout** level (structure, hierarchy, spacing rhythm) — not pixel-diff.

Output a verdict, not vibes:

```toon
verdict[2]{field,form}:
  status,"PASS | ITERATE"
  defects[]{element,viewport,expected,actual}"
```

### Step 4 — iterate

Fix each defect, re-render, re-capture. Stop at PASS or after the iteration budget (default 3 — raise only
if the user asks). If still failing at budget, report the remaining defects honestly rather than looping.

### Step 5 — teardown (mandatory)

Call `browser_close` as soon as you reach PASS or the iteration cap. **Do not leave the browser open.**
The @playwright/mcp Chrome does not close itself — an unclosed browser survives the task and, if the
session later exits ungracefully, is orphaned and runs for days (the `playwright-reaper` SessionStart hook
is only the backstop for that leak; closing here is what prevents it). Use the browser, then dispose it.

## Output

Write the verdict + screenshot paths + defect log to `.claude/workflow/vision-report-<route>.md` so a
Phase-4 reviewer (or the user) has the visual evidence. Never claim "looks good" without an attached shot.

## Budget & honesty

- Screenshots and vision calls cost tokens; the iteration cap and the tier-1-first ordering keep it bounded.
- If you couldn't render, couldn't reach dark mode, or hit the cap — **say which**. A skipped check reported
  as passed is the failure mode this skill exists to prevent.

**See also:** `references/critique-rubric.md`, `references/viewport-matrix.md`,
`rules/agent/design-system-persistence.md` (conformance target), `skills/frontend-aesthetics/SKILL.md`
(taste), `hooks/design-conformance.cjs` (tier-1 gate), `skills/stitch-design/SKILL.md` (screen PNG targets).
