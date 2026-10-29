> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Design-System Persistence — one durable source of truth

**Priority:** High
**Applies To:** All UI/design work (frontend, design-expert, design-tokens, stitch-design, design-vision-loop)

---

## Core Principle

**A project's design system is a durable file, not a per-session re-decision.** The first time
a palette / type scale / component-library choice is made, persist it to
`.claude/design/design-system.md` in the **host project** (not the plugin). Every later UI task
**reads that file first** and conforms to it — no re-picking hexes, no swapping the type system,
no introducing a second component library.

> Design-tokens generate the system; this rule makes it *stick* across sessions. Without a persisted
> SoT, `design-tokens` re-derives fresh tokens each session and components drift. With it, the file is
> the contract that `theme-consistency` and `design-conformance` enforce against.

---

## The file — `.claude/design/design-system.md`

Repo-local, human- and AI-readable, plain markdown (portable, infra-free — mirrors the `[[wikilink]]`
memory-vault philosophy and Google Stitch's `design.md` / superdesign's `.superdesign/design-system.md`).

Required sections:

```toon
schema[8]{section,content}:
  Brand,"--brand-hue (OKLCH) + 4–6 named hex values with role names"
  Type,"≥2 type roles (display/body/mono) + the scale jumps (e.g. 14→20→40)"
  Spacing,"the spacing scale in use (4px base or project's own)"
  Library,"the ONE chosen component library (MUI/antd/tailwind+shadcn/nativewind/…)"
  Motion,"motion policy — durations, easing, reduced-motion stance"
  Signature,"the one distinctive/'signature' element that makes this product not-generic"
  DoDont,"project-specific do/don't (banned patterns, required patterns)"
  Source,"provenance — generated | figma:<file> | stitch:<project> | hand-authored"
```

---

## Producers (write / update the file)

```toon
producers[4]{who,when}:
  design-tokens skill,"after generating the OKLCH token system → write Brand + Type + Spacing"
  frontend-aesthetics v2,"Pass-1 design plan → write Signature + DoDont if absent"
  stitch-design skill,"import Stitch design.md / extract-design-md → merge into the file"
  figma sync,"get_figma_data variables → map into Brand/Type (never hand-copy hexes)"
}
```

Write discipline (per KERNEL "write after verify"): create `.claude/design/` if absent; **merge, don't
clobber** — update changed sections, preserve hand-authored notes. Record provenance in `Source`.

## Consumers (read the file FIRST)

```toon
consumers[4]{who,how}:
  frontend agent,"read before any UI task; conform components to Brand/Type/Spacing/Library"
  design-expert skill,"check the file before recommending a library — honor the existing choice"
  design-vision-loop skill,"load as the critique rubric's conformance target"
  design-conformance hook,"parse Brand named-hex list to whitelist allowed colors"
}
```

---

## Discipline

- **No file yet + a design decision is being made** → create it as a side effect (don't ask permission
  for a routine artifact; announce it).
- **File exists** → it wins over ad-hoc choices. To change the system, edit the file *and* say what
  changed and why (same bar as `frontend-aesthetics` self-critique).
- **Never** duplicate the token values into scattered component files — reference tokens (`theme-consistency`).

**See also:** `skills/design-tokens/SKILL.md` (generator), `rules/agent/theme-consistency.md` (enforces
token usage), `rules/agent/design-system-usage.md` (one library), `skills/design-vision-loop/SKILL.md` (verifier).
