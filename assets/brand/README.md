# Archon OS — brand assets

**The `.svg` files are the sources. Every `.png` here is derived.** Edit an SVG,
run `./build.sh`, commit both. A PNG touched by hand is a second source of truth
for the brand, and the next person to run the build will silently revert it.

```bash
./build.sh      # regenerates every PNG from the SVG sources
```

| File | What it is |
|---|---|
| `icon.svg` | The owl mark. Flat, 1.2 KB, legible at 16px. |
| `wordmark.svg` | `ARCHON OS` in custom monoline geometric letterforms, drawn as paths. |
| `mascot.svg` | The owl watching a plan tree in a terminal — README and CONTRIBUTING. |
| `banner-light.svg` / `banner-dark.svg` | README hero, 1280×400. |
| `og-image.svg` | Open Graph / social card, 1200×630. |
| `brand.json` | Palette, rationale, type. The single source of truth for the identity. |

## Why an owl

An **archon** was an Athenian magistrate. The owl is Athena's, and it is the one
that watches. The plugin's dispatch model now has a literal **observer** role
(`rules/workflow/three-role-dispatch.md`), so the mark is the watcher rather
than a decoration.

It replaces the Aura Frog frog, retired with the name at v4.0.0. The frog was a
good mark; it just stopped pointing at anything once the product was no longer
called Aura Frog.

## Rules

- **Flat only.** No gradients, no glow, no neon — per `~/.claude/rules/ux-12yo-friendly.md`.
- **Amber is reserved.** `#E8A317` marks the thing that renders a verdict: the
  owl's beak, the underline. It is not a decoration colour.
- **The ear tufts are lighter than the head, not darker.** A darker tuft reads as
  depth on a light page and disappears entirely on a dark one.
- **The wordmark is drawn, not set.** A wordmark that depends on the viewer
  having Futura installed renders differently for every viewer.
- **`archon-os/README.md` uses absolute raw URLs**, not relative paths: `assets/`
  is not in `package.json#files`, so a relative path renders broken on npmjs.com.

## Palette

| Token | Hex | Use |
|---|---|---|
| jade | `#0E7C5A` | primary |
| jade bright | `#17A47A` | highlight, ear tufts |
| jade dark | `#0B6048` | shadow on light only |
| ink | `#0A2A22` | type on light |
| paper | `#F7F8F7` | light ground |
| paper dark | `#0B0F0E` | dark ground |
| ink on dark | `#F2F6F4` | type on dark |
| muted on dark | `#43C195` | supporting type on dark |
| **amber** | `#E8A317` | **verdict only** |

## Requirements

`build.sh` rasterises through headless Google Chrome. No npm install, no native
dependency — consistent with the plugin's own constraint. ImageMagick's built-in
SVG renderer was tried first and dropped: it silently ignores `<g>` transforms
and gradients, so it rendered the wordmark as a blank image.
