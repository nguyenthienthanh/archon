# Aura Frog Skills

**Total Skills:** 42 (9 auto-invoking + 33 reference)
**Format:** [TOON](https://github.com/toon-format/toon) (Token-Optimized)

---

## Auto-Invoke Skills (9)

Skills with `autoInvoke: true` in frontmatter — fire on every message or matching intent. Target budget: ~3,150 tokens.

```toon
auto_invoke[9]{name,priority,trigger,tokens}:
  agent-detector,highest,ALWAYS — every message,~500
  bugfix-quick,medium,Bug fixes / errors / crashes,~400
  test-writer,medium,Test writing / TDD / coverage,~500
  code-reviewer,high,Code review / after implementation,~450
  code-simplifier,medium,Simplify / KISS / complexity,~300
  plan-loader,high,.claude/plans/ exists in cwd,~400 (≤800 hard cap)
  reasoning-trace-recorder,medium,active.task set during T4 execution,~250
  extension-detector,medium,Repeated patterns or 'add a skill/rule for X' signals,~200
  permanent-memory-loader,high,.claude/memory/permanent_memory.md exists,~120 (≤200 hard cap)
```

**Note:** `run-orchestrator` is NOT auto-invoke — it fires when `/run` is typed or intent matches its `when_to_use` string (build feature, complex task, `fasttrack:` prefix). Listing it as auto-invoke would cause it to wastefully fire on every message.

**New in v3.7.0-alpha (hierarchical planning):** `plan-loader` and `reasoning-trace-recorder` are silent on projects without `.claude/plans/` — zero overhead until users opt in via `/archon-os:plan`.

---

## Reference Skills (33)

Loaded on-demand when triggered. (32 in the sections below + `run-orchestrator`, described in the note above.)

### Coverage — Deep Work (3)

Added v3.7.0 to close gaps in hard debugging, monorepo handling, and performance profiling:

| Skill | Purpose |
|-------|---------|
| `deep-debugging` | Scientific-method root-cause analysis for intermittent/flaky/race bugs |
| `monorepo` | pnpm/yarn/npm workspaces + Turborepo/Nx/Lerna — correct package scoping |
| `perf-profiling` | Measure before optimize; Pareto-driven bottleneck targeting |

### Framework Expertise (1)

The 11 per-framework `*-expert` skills were folded into the `framework-expert`
bundle as lazy-loaded reference files under `skills/framework-expert/refs/`
(`react`, `react-native`, `vue`, `angular`, `nextjs`, `nodejs`, `python`,
`laravel`, `go`, `flutter`, `typescript`). Gotchas & decision criteria only —
use Context7 for full docs.

```toon
bundle[1]{name,purpose}:
  framework-expert,Core patterns + lazy detection → Read refs/<framework>.md on demand
```

### Design & UI (6)

```toon
design[6]{name,purpose}:
  design-expert,Component design + design system selection + responsive layout + Figma Code Connect
  stitch-design,Google Stitch AI prompt generation
  frontend-aesthetics,Distinctive typography + dominant/accent color (house-style tuned)
  motion-design,Restrained reduced-motion-safe bundle-aware web motion
  design-tokens,OKLCH single-hue token system (Tailwind v4 @theme / CSS vars)
  design-vision-loop,Screenshot + multimodal critique loop until UI matches design system
```

### Workflow & Infrastructure (5)

`lazy-agent-loader` and `response-analyzer` were folded into
`rules/core/context-economy.md`; `learning-analyzer` was merged into
`self-improve` (its Analyze→Apply loop).

```toon
workflow[5]{name,purpose}:
  project-context-loader,Load project conventions and context
  session-continuation,Workflow state handoff and resume
  self-improve,Analyze learning data (Supabase) then apply learned improvements
  prompt-evaluator,Evaluate prompt patterns and feature usage
  plan-orchestrator,Route 11 plan verbs to backing scripts (v3.7.2+)
```

### Planning & Safety (7)

Hierarchical-planning and safety-gate companions (v3.7.0+):

```toon
planning[7]{name,purpose}:
  plan-validator,Runs all 8 plan-tree invariants on demand (spec §6.7)
  plan-archivist,Compress completed T2 branch into archive summary
  conflict-detector,L1 file-overlap + L2 function-overlap between sibling T4 tasks
  failure-classifier,Classify execution failures F1-F5 (deterministic; no LLM)
  self-healing-orchestrator,Propose patches for F2/F3 failures — user approval required
  preflight-validator,Tier 1 bash linters wrapper (scripts/preflight/run-all.sh)
  mcp-security-auditor,Audit MCP usage from the resolved security dir (mcp-audit.jsonl)
```

### Code Quality (4)

`performance-optimizer`'s layer-specific optimization playbook was folded into
`perf-profiling` (see Coverage above).

```toon
quality[4]{name,purpose}:
  refactor-expert,Safe incremental refactoring
  api-designer,API design principles and conventions
  scalable-thinking,Design for scale while building simple
  migration-helper,Zero-downtime database/code migrations
```

### Dev Tools (2)

`git-workflow` and `git-worktree` were merged into a single `git` skill.

```toon
tools[2]{name,purpose}:
  git,Token-efficient commits (security scan + auto-split) + worktree isolation
  documentation,ADR and Runbook templates
```

### Thinking (1)

`sequential-thinking` was folded into `tree-of-thoughts` as its linear mode.

```toon
thinking[1]{name,purpose}:
  problem-solving,5 techniques for different problem types
```

### Reasoning Techniques (3)

Advanced LLM reasoning from published research. Token-expensive — opt-in via `/run reason: <sc|tot|cove|all>` or auto-enabled in specific phases per their rules.

```toon
reasoning[3]{name,technique,paper,when_fires}:
  self-consistency,"N independent paths + majority vote","Wang et al. 2022","P1 design when trade-off decision (Deep only)"
  tree-of-thoughts,"Branch + evaluate + prune + backtrack","Yao et al. 2023","P1 architecture + P4 refactor planning (Deep only)"
  chain-of-verification,"Draft + plan verifications + verify via tool + revise","Dhuliawala et al. 2023","P4 review (MANDATORY for factual claims)"
```

See governing rules: `rules/workflow/{self-consistency,tree-of-thoughts,chain-of-verification}.md`.

---

## Skill File Structure

```
skills/[skill-name]/
  SKILL.md (required) — Main instructions with YAML frontmatter
  [reference].md (optional) — Additional docs
```

## Invocation

**Skills are NOT slash-typeable.** Every skill carries `user-invocable: false` in frontmatter — they're hidden from the `/` menu by design. This keeps the slash menu reserved for actionable commands.

Skills are still triggered three ways:
1. **AI auto-invoke on intent match** — describe what you want ("evaluate my prompts", "review this code") and Claude picks the matching skill
2. **Explicit prompt mention** — "use the chain-of-verification skill on this report"
3. **Internal invocation** — a `commands/` file or another skill calls into it (e.g., `/af prompts` → `prompt-evaluator` skill)

If a skill needs slash exposure for the user → wrap it in a thin `commands/<name>.md` file that delegates here. See the plugin `CLAUDE.md` "ARCHITECTURE RULE — Commands vs Skills Separation".

---

> **Externalized:** Godot (aura-frog-godot-addon), SEO/GEO (aura-frog-seo-addon)
> **MCP:** JIRA, Figma, Slack, Firebase handled via bundled MCP servers (`.mcp.json`)
