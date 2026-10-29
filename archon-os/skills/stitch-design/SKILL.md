---
name: stitch-design
description: Generate UI designs using Google Stitch AI with optimized prompts
autoInvoke: false
priority: medium
triggers:
  - "stitch"
  - "AI design"
  - "generate UI"
  - "design with AI"
  - "stitch design"
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Skill: Google Stitch Design

Generate UI designs using Google Stitch AI (https://stitch.withgoogle.com), powered by Gemini.

```toon
stitch_info[1]{engine,limits,quota}:
  Gemini (Flash draft / Pro final),"static layouts only — no hover/animation/state; not pixel-perfect",~350 gen/month free (MCP shares this)
```

**Two integration paths** — prefer MCP when configured, fall back to manual paste otherwise:

```toon
paths[2]{path,when,how}:
  MCP (automated),"stitch server enabled in .mcp.json + STITCH_API_KEY set","call tools directly — no copy-paste"
  Manual (fallback),"no Stitch MCP / no auth / hit quota","generate prompt → user pastes into stitch.withgoogle.com → ingest export"
```

---

## Path A — Stitch MCP (automated)

The `stitch` MCP is a **remote http server that is opt-in and NOT bundled** — it is absent from `.mcp.json`
(a `"disabled": true` flag does nothing; Claude Code ignores it and starts the server anyway, so keeping a
server off means leaving it out). Add the entry to your project's own `.mcp.json` — snippet in
`docs/operations/MCP_GUIDE.md § Optional Servers` — and set `STITCH_API_KEY` (create a key in
Stitch → Settings) to unlock direct generation. API-key auth is
preferred over OAuth (OAuth tokens expire hourly and need manual refresh in the client).

> ⚠️ **Verify on first connect.** The endpoint (`https://stitch.googleapis.com/mcp`), header name, and exact
> tool names below came from mid-2026 research that could not be fully adversarially verified. **Before
> trusting them, list the server's tools** (ask the agent to "list Stitch projects" or inspect the tool
> schema) and reconcile against https://stitch.withgoogle.com/docs/mcp/setup. If names differ, use the
> real ones — do not fabricate. If the server is unreachable, drop to Path B.

### MCP workflow

```toon
mcp_workflow[6]{step,action,tool}:
  1,Read design SoT,".claude/design/design-system.md (if present) → seed the prompt"
  2,Generate screens,"generate_screen_from_text (modelId GEMINI_3_FLASH for drafts)"
  3,Iterate,"edit_screens / generate_variants on selected screen IDs"
  4,Seed design system,"create_design_system / apply_design_system (foundational tokens)"
  5,Pull outputs,"fetch screen HTML + download screenshot PNG per screen"
  6,Persist + handoff,"merge design.md → .claude/design/design-system.md; save PNGs as vision-loop targets"
```

- **Model choice:** draft with `GEMINI_3_FLASH` (cheap, iterate fast); switch to the Pro model only for the
  final pass. Every generation counts against the ~350/month free quota — **log how many you spend** and
  don't burn quota on drafts you'll discard.
- **Design-system tools** (`create_design_system`, `update_design_system`, `list_design_systems`,
  `apply_design_system`) are the agent-driven path to build/maintain a Stitch design system that stays
  consistent across screens — mirror it into `.claude/design/design-system.md` (see
  `rules/agent/design-system-persistence.md`).
- **Screenshots are load-bearing:** save each screen's PNG — they become the reference target for the
  `design-vision-loop` skill when Claude implements the real (interactive) UI.

### Stitch's limits shape the handoff

Stitch outputs **static layouts** — no hover states, animation, form validation, or state management, and
pixel-perfect accuracy is not guaranteed. So Stitch owns *layout + look*; the frontend agent owns
*behavior, interactivity, motion, a11y*. Specify those separately — don't expect them from Stitch.

---

## Path B — Manual (fallback)

Use when the MCP is unavailable. Unchanged copy-paste flow:

```toon
workflow[5]{step,action,output}:
  1,Gather requirements,Requirements doc
  2,Generate prompt,Optimized Stitch prompt
  3,Create review doc,.claude/workflow/stitch-design-review-*.md
  4,Guide user,Instructions + link
  5,Process export,Component code
```

1. **Gather requirements** — app type (dashboard/landing/mobile/ecommerce/forms), audience, theme, key features, brand.
2. **Generate prompt** — load template from `references/prompt-templates.md` for the app type; fill in.
3. **Create review doc** — `.claude/workflow/stitch-design-review-{project-name}.md` with specs + checklists.
4. **Guide user** — copy-paste-ready prompt, link to Stitch, export guidance (Figma paste vs HTML/CSS).
5. **Process export** — review HTML/CSS, extract tokens → `.claude/design/design-system.md`, generate components per conventions.

---

## Design Types

```toon
design_types[5]{type,use_case,template}:
  dashboard,Admin panels; analytics,references/prompt-templates.md#dashboard
  landing,Marketing; product pages,references/prompt-templates.md#landing
  mobile,iOS/Android screens,references/prompt-templates.md#mobile
  ecommerce,Product; cart; checkout,references/prompt-templates.md#ecommerce
  forms,Multi-step wizards,references/prompt-templates.md#forms
```

---

## Related Files

- `references/prompt-templates.md` - Optimized prompts by type (used by both paths)
- `references/design-checklist.md` - Detailed review checklist
- `references/export-guide.md` - Export from Stitch (manual path)

**See also:** `rules/agent/design-system-persistence.md` (persist Stitch output), `skills/design-vision-loop/SKILL.md`
(verify the implemented UI against Stitch screen PNGs). Google also ships open-source `stitch-skills`
(`google-labs-code/stitch-skills`) — optional deeper workflow, install per its README; not bundled here.

---
