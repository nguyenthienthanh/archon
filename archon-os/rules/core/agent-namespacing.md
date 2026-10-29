> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Agent Namespacing (Plugin Agents)

**Priority:** Critical
**Applies To:** Every Agent tool invocation that targets a plugin agent

---

## Core Principle

**Plugin agents are namespaced by the plugin's own `name` field.** When invoking via the Agent tool, the `subagent_type` is `<plugin-name>:<agent-id>`.

The prefix is **derived, not hardcoded**. Read it from `<plugin>/.claude-plugin/plugin.json` (`name` field) at runtime — not the literal string "aura-frog" embedded in skills/rules.

```
✓ subagent_type: ${PLUGIN_PREFIX}:architect       (resolved at dispatch)
✗ subagent_type: archon-os:architect              (hardcoded — breaks on rename/fork)
✗ subagent_type: architect                        (errors: "agent type 'architect' not found")
```

Built-in Claude Code agents (`general-purpose`, `Explore`, `Plan`, `statusline-setup`) are NOT namespaced.

---

## Why derive instead of hardcode

A plugin's name lives in exactly one place: `<plugin>/.claude-plugin/plugin.json`. If a fork renames it (`my-fork`, `aura-frog-internal`, etc.), every hardcoded `archon-os:architect` reference breaks. By looking up the prefix at runtime, the same skills/rules ship across forks unchanged.

Skills, rules, and dispatch tables reference agents by **bare ID** (`architect`, `tester`, `feature-architect`). The orchestrator that actually invokes the Agent tool is the only place the prefix gets applied — and it gets the prefix dynamically.

---

## How to look up the prefix

### Option 1 — Helper script (recommended)

```bash
prefix=$(bash "${CLAUDE_PLUGIN_ROOT}/scripts/get-plugin-prefix.sh")
# subagent_type for architect: "${prefix}:architect"
```

The script reads `plugin.json` and prints the `name` field. Falls back gracefully if `jq` is unavailable.

### Option 2 — Direct read

```bash
prefix=$(jq -r '.name' "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json")
```

### Option 3 — Session-start banner

`hooks/session-start.cjs` emits the prefix in its banner at session start. Look for a line like:
```
🏛 Archon OS v4.0.0-alpha.1 │ plugin-prefix: archon-os
```
The banner is the cheapest path — read once at session start, no per-call lookup.

---

## Authoritative agent IDs (no prefix)

These are the **bare** agent IDs. Apply the runtime prefix from any source above before dispatch.

```toon
plugin_agent_ids[14]{id,role}:
  architect,System design + DB + backend
  frontend,React/Vue/Angular/Next.js
  mobile,React Native/Flutter/Expo
  strategist,ROI + MVP + scope creep + T0/T1
  tester,Jest/Cypress/Playwright + coverage
  security,OWASP + vulnerability + SAST (read-only)
  devops,Docker/K8s/CI-CD
  lead,Workflow coordination
  scanner,Project detection + context
  master-planner,Plan tree owner
  feature-architect,T2 → T3 decomposition
  story-planner,T3 → T4 decomposition
  replanner,F2-F4 mutation proposals
  epic-summarizer,T2 done → permanent_memory
```

Reference patterns under `agents/reference/` use the form `<prefix>:reference:<name>` (e.g., `archon-os:reference:architect-patterns` when the prefix resolves to `archon-os`).

Built-in agents (no prefix, ever):

```toon
builtin_agents[4]{id,role}:
  general-purpose,Generic multi-step research/exec
  Explore,Codebase exploration with summarized return
  Plan,Software architect for implementation plans
  statusline-setup,Configures Claude Code status line
```

---

## When you see "agent type 'X' not found"

1. **Check if X is a plugin agent ID** (any from the table above) — apply the runtime prefix
2. **Check spelling** — agent IDs are kebab-case (`feature-architect`, not `feature_architect` or `featureArchitect`)
3. **Verify the agent file exists** — `ls archon-os/agents/<id>.md`
4. **Verify plugin is loaded** — `/plugin` in Claude Code shows installed plugins; if Aura Frog isn't there, lookup will fail regardless
5. **Verify the prefix lookup succeeded** — `bash scripts/get-plugin-prefix.sh` should return non-empty

---

## Anti-patterns

- **Hardcoding the literal string `archon-os:` in skills/rules/docs** — breaks on rename or fork; always reference the prefix abstractly or via the helper
- **Using a different prefix style** — if a fork is named `my-fork`, the prefix is `my-fork:`, not `myfork:` or `mf:`. Whatever's in `plugin.json#name`, exactly
- **Mixed prefixing** — once you adopt the runtime prefix, use it for ALL plugin agent invocations in the same dispatch
- **Stripping the prefix when documenting** — "the architect agent" is fine in prose; the literal `subagent_type:` value MUST carry the prefix at dispatch
- **Caching the prefix beyond a session** — read once at session start; if `plugin.json` changes mid-session (rare), the new prefix should be picked up next session

---

## Verification before dispatch

When the orchestrator (run-orchestrator, master-planner, lead) is about to invoke Agent:

1. Resolve the prefix (helper script OR session-start banner)
2. Confirm the bare agent ID exists in the table above OR has a corresponding `archon-os/agents/<id>.md`
3. Compose `subagent_type: ${prefix}:${id}` and pass to Agent tool
4. If the prefix is empty (helper failed), fall back to a built-in agent (`general-purpose` or `Explore`) with an inline-loaded prompt

---

## Tie-Ins

- **Script:** `archon-os/scripts/get-plugin-prefix.sh` — single source of truth for the prefix
- **Hook:** `hooks/session-start.cjs` — emits the prefix in the session-start banner so the AI sees it once and reuses
- **Skill:** `run-orchestrator` — execution table uses bare IDs; resolves prefix at dispatch
- **Skill:** `agent-detector` — recommends agents by bare ID in conversation; the AI applies prefix when invoking
- **Agent:** `master-planner` — dispatches to plan-tier agents; ALL get the runtime prefix
- **Rule:** `rules/core/no-assumption.md` — when prefix lookup fails, ask or check; don't guess
