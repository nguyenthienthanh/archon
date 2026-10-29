# Agent Detector — Reference (loaded on demand)

Detail moved out of `SKILL.md` to keep the every-message auto-load lean. Read this file only when debugging routing or extending detection.

## Project complexity level (v3.7.2+)

Emitted when `rules/workflow/run-plan-bridge.md` triggers sum to weight ≥ 3 AND `.claude/plans/active.json` is absent. `run-orchestrator` Step 0 owns the user prompt (`plan` / `deep` / `details`) and the scratch-file handoff. Otherwise Quick/Standard/Deep classification is unchanged.

## Model selection rationale

**Prefer the session model — inherit it.** The model the user launched with is the signal of their intent and budget; use it for all substantive work (Standard / Deep / architecture / planning / build / review). Do NOT force-upgrade to a named model (e.g. Opus) for "complex" — if the user wanted more capability they'd run it, and naming a model means a newer/stronger one is ignored.

The only deliberate override is **down-shifting to `haiku`** for trivial mechanical work (classification, detection, state bookkeeping) where a wrong answer costs little. See `rules/core/small-to-large-routing.md`.

## Detection signal weights

1. **Task content** (highest): analyze task keywords — a backend repo may still get frontend tasks. Score ≥50 overrides repo detection.
2. **Explicit tech** (+60): user mentions react-native/flutter/angular/vue/react/next/node/python/go/laravel → matching agent.
3. **Intent** (+50): action keywords implement/fix/test/design/database/security/deploy → agent.
4. **Project context** (+40): package files/configs; use cached detection when valid (<24h).
5. **File patterns** (+20): recent file naming: *.vue→frontend, *.go→architect, etc.

## Cache

`.claude/cache/agent-detection-cache.json` — reuse within a workflow (phase >1). Invalidate on new workflow, phase 1, or user override.
