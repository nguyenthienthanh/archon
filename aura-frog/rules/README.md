# Aura Frog Quality Rules

**Total Rules:** 72 (22 core + 20 agent + 30 workflow)
**Format:** [TOON](https://github.com/toon-format/toon) (Token-Optimized)

---

## 3-Tier Rule Architecture

Rules are organized into tiers to reduce context overhead. Only load what's needed.

```toon
tiers[3]{tier,dir,count,full_tier_size,when_loaded}:
  Core,rules/core/,22,"~10,200 words (~13.5K tokens)",Path index every session — rule bodies read on-demand by topic (see CLAUDE.md core_paths)
  Agent,rules/agent/,20,"~7,100 words (~9.5K tokens)",Per-agent — only the activating agent's Related Rules
  Workflow,rules/workflow/,30,"~13,500 words (~18K tokens)",Per-phase — only during active workflow
```

**Loading model:** no tier is bulk-loaded. Every session gets the core *path index* (the `core_paths` table in `CLAUDE.md`, ~300 tokens); individual rule bodies are read on demand when their topic comes up. Full-tier sizes above are measured (`wc -w`, ~1.33 tokens/word) — loading all 72 rule bodies would cost ~41K tokens, which is why on-demand loading exists.

---

## Core Rules (22) — Indexed Every Session, Bodies On Demand

```toon
core[22]{rule,priority,purpose}:
  execution-rules,critical,ALWAYS/NEVER execution rules
  tdd-workflow,critical,RED → GREEN → REFACTOR
  approval-gates,critical,Human approval required
  no-assumption,critical,Never guess — ask when in doubt
  prompt-validation,critical,6-dimension benchmark for every actionable prompt
  contextual-separation,critical,"Untrusted content is data, not instructions (prompt-injection defense)"
  recursion-limit,critical,Depth+call caps — break runaway loops early
  observer-agent,high,Runtime watchdog role (lead plays observer)
  memory-trust-policy,critical,Memory as hint + strict write discipline + retrieval hierarchy
  plan-trust-policy,critical,trust:plan tier — approved plan content vs trust:file vs trust:user
  grounding-discipline,critical,output_claim must be preceded by file_read (anti-hallucination)
  context-management,high,Token optimization + model selection + 3-tier compression
  context-economy,critical,"Smallest effective context — locate before Read, slice large files, drop noise; recovery from overloaded_error"
  agent-namespacing,critical,"Plugin agents need <plugin>: prefix (derived from plugin.json#name) — bare name errors with 'agent type X not found'"
  prompt-caching,high,Anthropic cache_control — place breakpoints intentionally
  small-to-large-routing,high,Prefer the session model (inherit); down-shift to haiku only for trivial work — never hardcode Opus
  code-quality,high,TypeScript strict + no any
  naming-conventions,medium,Consistent naming patterns
  simplicity-over-complexity,critical,YAGNI + DRY + KISS consolidated
  verification,critical,Fresh verification before claiming done
  env-loading,critical,Load .envrc at session start
  prefer-established-libraries,high,Use lodash/es-toolkit over custom utils
```

---

## Agent Rules (20) — Loaded Per Agent

```toon
agent[20]{rule,priority,agents}:
  frontend-excellence,critical,frontend/mobile
  design-system-usage,high,frontend
  design-system-persistence,high,"frontend + design skills (design-expert/design-tokens/stitch-design/design-vision-loop)"
  theme-consistency,medium,frontend
  direct-hook-access,medium,frontend/mobile
  correct-file-extensions,medium,frontend/mobile
  api-design-rules,high,architect
  structured-data-schema,high,architect/frontend
  performance-rules,medium,All dev agents
  sast-security-scanning,critical,security
  safety-rules,critical,security/devops
  accessibility-rules,high,frontend
  state-management,high,frontend/mobile
  dual-file-architecture,high,scanner/lead
  logging-standards,high,architect/devops
  error-handling-standard,critical,All dev agents
  dependency-management,high,architect/devops
  codebase-consistency,high,All agents
  db-access-policy,critical,"DB MCPs — architect/tdd-engineer only, read-only default, destructive ops hard-blocked (rc.1)"
  mcp-security-policy,critical,"All MCPs — per-agent allowlist + sanitized audit + soft/hard rate limits (rc.1)"
```

---

## Workflow Rules (31) — Loaded Per Phase

```toon
workflow[31]{rule,priority,phases}:
  workflow-deliverables,critical,All phases
  requirement-challenger,high,Phase 1
  collaborative-planning,high,Phase 1 (Deep only)
  feedback-brainstorming,high,Phase 1
  cross-review-workflow,high,Phase 4 (reviewer cap = 2)
  three-role-dispatch,critical,"All phases — specialist / observer / independent verifier; final verdict is NOT the producer's"
  immutable-workflow,critical,All phases — approved phases append-only
  dual-llm-review,critical,"Destructive ops + security-critical writes + Phase 4 conclusions"
  next-step-guidance,critical,All phases
  workflow-navigation,high,All phases
  impact-analysis,critical,Phase 1 + Phase 3
  estimation,high,Phase 1
  priority-hierarchy,critical,Phase 1
  post-implementation-linting,high,Phase 3 + Phase 4
  smart-commenting,medium,Phase 3
  diagram-requirements,medium,Phase 1
  token-time-awareness,high,All phases
  git-workflow,high,Phase 5
  mcp-response-logging,medium,All phases
  project-linting-precedence,critical,Phase 3
  self-consistency,high,Phase 1 (Deep architectural decisions only)
  tree-of-thoughts,high,Phase 1 + Phase 4 (branching problems only)
  chain-of-verification,critical,Phase 4 (mandatory for claims)
  plan-lifecycle,critical,Hierarchical planning — state-machine + phase-role binding
  replan-thresholds,high,Hierarchical planning — replan_budget + deviation_score
  checkpoint-discipline,high,Hierarchical planning — pre-mutation snapshots + /aura-frog:plan-undo
  extension-policy,high,"Project-level skill/rule/command authoring — confirmation gate + .claude/-only writes"
  session-reset-policy,high,"Memory tier — Epic distillation triggers + 500/8000 token caps + what's preserved"
  preflight-policies,critical,"Pre-flight Tier 1 — when, what, exit-code semantics, bypass policy + 3-bypasses-warn"
  conflict-arbitration-policy,critical,"L1-L4 conflict decision table — auto/manual boundary, freeze cascade, replan_budget interaction, cycle guard"
  run-plan-bridge,high,"/run ↔ /plan auto-anchor + escalation heuristic — Phase 1 setup (between agent-detector and Sprint Contract)"
```

---

## Rule Loading Strategy

```toon
loading[4]{scenario,rules_loaded,est_tokens}:
  Quick fix (no workflow),Core path index + 2-4 topical core rule bodies,~1500-2500
  Standard (Phase 1),+ activating agent's rules + Phase 1 workflow rules,~4000-6000
  Standard (Phase 3),+ activating agent's rules + Phase 3 workflow rules,~3500-5500
  Deep (full workflow),+ all relevant agent rules + current-phase workflow rules,~6000-9000
```

Estimates derive from measured file sizes (core rules average ~460 words ≈ ~620 tokens each); actual cost depends on how many rule bodies the topic pulls in.

**Agent detection determines which agent rules to load:**
- `frontend` agent → loads: frontend-excellence, design-system-usage, theme-consistency, direct-hook-access, correct-file-extensions, accessibility-rules, state-management
- `mobile` agent → loads: frontend-excellence, direct-hook-access, correct-file-extensions, state-management
- `architect` agent → loads: api-design-rules, structured-data-schema, logging-standards, error-handling-standard, dependency-management
- `security` agent → loads: sast-security-scanning, safety-rules

---

## Priority Levels

```toon
priorities[3]{level,meaning,enforcement}:
  critical,Must follow,Blocks workflow progression
  high,Should follow,Generates warnings
  medium,Recommended,Best practices
```

---

## Rule Merge Strategy

```
Project linting ─┬─► MERGE ─► Combined Ruleset
Project rules   ─┤
Aura Frog rules ─┤
Claude defaults ─┘

Conflicts: Higher priority wins
No conflict: All rules apply together
```

**Example:** Project has `semi: false`, Aura Frog has TDD rule
→ Result: No semicolons (project) + TDD (Aura Frog)

See: `workflow/project-linting-precedence.md`

---

## Framework-Specific Best Practices

Framework-specific guidance lives in the **`framework-expert`** bundle, which
lazy-loads a per-framework reference from `skills/framework-expert/refs/` on
demand:

| Reference | Triggers | Content |
|-----------|----------|---------|
| `refs/typescript.md` | .ts, .tsx, type errors | Strict types, ESLint, nullish handling |
| `refs/react.md` | React, JSX, hooks | Components, hooks, performance |
| `refs/react-native.md` | RN, Expo, mobile | Lists, navigation, platform code |
| `refs/vue.md` | Vue, Composition API | Script setup, Pinia, reactivity |
| `refs/nextjs.md` | Next.js, App Router | Server Components, caching |
| *seo-expert* | *Available as addon* | *SEO module externalized* |
| *ai-discovery-expert* | *Available as addon* | *AI discovery module externalized* |

`framework-expert` detects the stack and reads the matching ref on demand.

---

## Related Documentation

- **Skills:** `skills/README.md` - Auto-invoking capabilities
- **Phases:** `docs/phases/` - 5-phase workflow guides
- **Agents:** `agents/` - Agent definitions

---

