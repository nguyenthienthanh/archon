> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Rule: Context Economy

**Priority:** Critical
**Applies To:** Every Claude turn that involves file reads, tool calls, or context loading

---

## Core Principle

**Use the smallest effective context, not the largest available.** Bigger context is not better context — it's slower, more expensive, more error-prone, and may trigger upstream `overloaded_error` from the API.

The right context = exactly enough evidence to make the next decision correctly. More than that is waste.

---

## Why this rule exists

When context grows large (typically >150K tokens of tool results stacked across turns), the upstream API can return:

```
{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}
```

This is not a transient network blip — it's a signal that recent context was excessive. Retrying with the same context fails the same way. The fix is **upstream**: read smaller, locate first, summarize aggressively.

---

## Locate before Read (the cheapest step always wins)

```toon
ladder[5]{step,tool,when}:
  1,"Glob '<pattern>'","Find files by name/path — pure filesystem, near-zero context cost"
  2,"Grep --output_mode files_with_matches","Find which files contain a symbol — paths only, no bodies"
  3,"Grep --output_mode content -n -C 2","Read just matching regions of identified files"
  4,"Read offset:N limit:M","Targeted slice of one file, not the whole thing"
  5,"Read (full file)","Last resort — only if you've already established the file is small AND you need most of it"
```

**Default to step 1-3.** Skipping straight to step 5 is the most common cause of context bloat.

### When a code-graph MCP is available (opt-in)

If the **`codebase-memory`** MCP server is present, it is a *step-0* that beats grep for structural questions. It is **not bundled** — the user adds the entry to their own `.mcp.json` (snippet in `docs/operations/MCP_GUIDE.md § Optional Servers`) and installs the binary themselves; the plugin never runs its installer. Treat its tools as optional and fall back to `Read`/`Grep` when they are absent:

- Prefer `search_graph` / `trace_path` / `get_architecture` over broad `Read`/`Grep` sweeps for "what calls this?", "where does X happen?", "what breaks if I change this?" — a graph query is ~100× cheaper than file-by-file exploration on large host projects.
- **Fall back cleanly when it is NOT enabled** (the common case): use the Glob→Grep→Read ladder above. Never assume the server is present.
- Known caveats to weigh before enabling: broken on Windows, background process may outlive the IDE, and macro-heavy Rust codebases index poorly. Small repos rarely need it (the project snapshot already suffices).

---

## Concrete patterns

### Reading

- **Files >500 lines** → never read full; use `offset` + `limit` after locating with Grep
- **Files >2000 lines** → never read consecutive ranges >300 lines without an explicit reason; chunk
- **Generated/build artifacts** → skip entirely: `dist/`, `build/`, `out/`, `node_modules/`, `.next/`, `target/`, `*.min.*`, `package-lock.json` (>5K lines), `yarn.lock`, `pnpm-lock.yaml`, `*.map`, `coverage/`
- **Lockfiles** → if you need a dependency version, `Grep "<package>" package.json` instead of reading the full lockfile
- **Logs** → tail or grep, never full

### Searching

- **Unknown scope** → start with `Grep --output_mode files_with_matches` (paths only); narrow with `glob:` filter
- **Known scope** → `Grep --output_mode content` with `-C 2` (small context window) and an explicit `glob:` or `path:`
- **Multi-line patterns** → `multiline: true` only when actually needed (it's slower)

### Re-reading

- **Don't re-Read a file unchanged in this session.** Read tool already errors on this; respect it.
- **If you edited a file, trust the diff** — Edit's success means the file is at the new state. Don't Read it back to "verify" unless something downstream failed.

### Tool results

- **Heredocs / pastes** → never paste user-readable content into a tool call beyond what's needed
- **Verbose stderr** → drop unless it contains the error you're debugging
- **JSON dumps** → query specific fields with `jq` rather than dumping full payloads
- **Diffs** → `git diff --stat` first; only `git diff` (no flags) if a hunk-level review is the actual goal

### Delegation (the largest savings)

- **Open-ended exploration** ("what does this codebase do?", "find all the auth-related files") → spawn `Agent` with `subagent_type: Explore`. It does the noisy work in its own context window and returns a summarized result.
- **Codebase-wide refactors** → spawn `general-purpose` agent with a tight prompt; receive only the verdict + delta, not the intermediate noise
- **Repeated reads of the same area** → if you'll touch this area >5 times, ask a subagent to summarize once

> `Explore` and `general-purpose` are Claude Code **built-in** subagent types — they exist in every project and stay **unprefixed**. Only this plugin's own 15 agents need the `${PLUGIN_PREFIX}:` namespace (see `rules/core/agent-namespacing.md`).

---

## Lazy agent loading

Agent definitions are heavy (~3K tokens each; the full set is ~48K). **Do not preload them.** Load an agent's summary from the index first; pull its full `agents/<id>.md` body only once that agent is actually activated. This is the "Locate before Read" ladder applied to agents — the index row is the cheap locate step, the full definition is the last-resort Read.

```toon
agent_load[3]{score,level,action}:
  ">= 80",PRIMARY,"Load full definition (agents/<id>.md)"
  50-79,SECONDARY,"Summary only from the agent index"
  "< 50",OPTIONAL,"Don't load"
```

- Score candidate agents by keyword match against the agent index (the same 15-agent table `agent-detector` uses); load only PRIMARY.
- **Cache loaded agents for the session** — track `loaded_agents[]: mobile,tester`; don't re-Read a definition already in context. Force reload only on explicit `reload agent <id>`.
- Savings scale: initial load ~48K → ~1.2K (97%); a single activated agent ~2.7K (94%); each additional agent adds ~1.5K, not another 48K.

`agent-detector` applies this automatically — score by index keywords, load PRIMARY agents only. When dispatching manually, follow the same discipline.

---

## Large-response offloading (write-to-file, summarize-in)

When a tool or MCP call would return a large payload, **write the full result to a temp file and load only a summary into context.** The bulk lives on disk where you can re-query it with `grep`/`jq`; context holds just the distilled answer.

```toon
offload[5]{scenario,threshold,action}:
  Command output,>100 lines,"Save to temp + summarize"
  API / MCP response,>5KB,"Save JSON + extract key fields"
  File-search results,>50 files,"Save list + show top 10"
  Test output,>50 lines,"Save full + summarize pass/fail"
  Build output,>100 lines,"Save full + show errors only"
```

Temp root: `/tmp/aura-frog/` (`responses/`, `summaries/`, `session/`). Patterns:

```bash
# Large command output — save full, load only the verdict lines
npm test > /tmp/aura-frog/responses/test-$(date +%s).txt 2>&1
grep -E "(PASS|FAIL|Tests:|Suites:)" /tmp/aura-frog/responses/test-*.txt | tail -10

# Large API/MCP JSON — save full, load only queried fields
curl url > /tmp/aura-frog/responses/api-$(date +%s).json
jq '{total: .data | length, first_3: .data[:3] | map(.name)}' /tmp/aura-frog/responses/api-*.json
```

Savings are typically 87-96% (a 500-line test log ~2K → ~100 tokens). **Cleanup:** `find /tmp/aura-frog -mtime +1 -delete`. This is the tool-result counterpart to "Locate before Read": save the haystack to disk, pull only the needle into context.

---

## What to do on `overloaded_error`

The error is upstream-driven by total token volume. **Do not retry immediately with the same context.**

```toon
recovery[6]{step,action}:
  1,"Stop and assess — what was just read/pasted that bloated context?"
  2,"Identify the largest tool result in the recent turns (look for full-file Reads / large Bash outputs)"
  3,"Summarize what you actually need from that result in 1-2 sentences"
  4,"Drop pending plans that depend on retaining the full result"
  5,"If the work needs the bulk content — delegate to a subagent (Explore / general-purpose) which has its own fresh context"
  6,"Resume with the smaller, distilled context"
```

After recovery: look back at what triggered the bloat and apply the patterns above going forward in the session.

---

## Anti-patterns (each is a context bomb)

- **"Let me read the whole file to understand"** — read the section the failure points at; expand only if root cause isn't there
- **`cat path/to/file`** in Bash when Read tool would let you offset/limit
- **`find . -type f`** with no filter — use Glob with a pattern
- **`grep -r` without a pattern filter** — use Grep tool with `glob:` or `type:` to scope
- **Re-reading after every edit** — Edit is transactional; trust it
- **Reading lockfiles, dist artifacts, generated code, snapshots** — they're noise; the source of truth is upstream
- **Pasting `git log` output of 200 commits** when `git log --oneline -20` is enough
- **Loading every test file** to understand "what tests exist" — `Glob '**/*.test.*'` returns paths; pick the one you need
- **Asking the user "should I read more?"** instead of being decisive about what minimum is needed

---

## Token budget per session class

```toon
budget_per_class[3]{class,target_tool_results_total,hard_limit}:
  Quick (single edit / question),"<10K","<25K"
  Standard (/run feature/bugfix),"<60K","<120K"
  Deep (cross-cutting / planning),"<150K","<200K"
```

If you're approaching the hard limit and you have NOT yet started writing code, you've over-read — stop reading and start delegating.

---

## Tie-Ins

- **Rule:** `rules/core/context-management.md` — prior, broader rule about model selection / 3-tier compression; this rule is its hands-on counterpart for tool-call discipline
- **Rule:** `rules/core/no-assumption.md` — when you're tempted to "read more to be safe", ask first instead
- **Rule:** `rules/core/verification.md` — verify with the smallest evidence that supports the claim
- **Skill:** `plan-loader` — already enforces ≤800 always-loaded tokens; this rule generalizes the principle to all tool calls
- **Skill:** `permanent-memory-loader` — already auto-degrades when budget tight; same principle
- **Section above:** [Lazy agent loading](#lazy-agent-loading) — load agent context only when activated, not preemptively (folded in from the former `lazy-agent-loader` skill)
- **Section above:** [Large-response offloading](#large-response-offloading-write-to-file-summarize-in) — write big tool/MCP payloads to a temp file, load only a summary (folded in from the former `response-analyzer` skill)
- **Skill:** `code-simplifier` (KISS) — same energy: do the smallest correct thing
- **Agent tool:** `Explore` subagent — the right tool for "I need to understand a large area" without bloating main context
- **Spec:** §26 (token budget) — defines always-loaded limits; this rule keeps tool-result accumulation under those limits
