---
name: code-map
description: "Reverse-dependency lookup — \"I am about to change this file, what breaks?\" Use when assessing the blast radius of an edit, finding every importer of a module (including the ones that never name it), or checking what the startup code-map digest was derived from. Not for finding text: grep is better at that."
when_to_use: "before editing a widely-imported module, assessing blast radius, finding every importer of a path, checking what the startup digest was derived from"
allowed-tools: Bash, Read
effort: low
user-invocable: false
---

# Code Map — where to look, and what breaks

Two jobs. Grep already wins everything else, so everything else is out of scope.

```toon
jobs[2]{job,why_not_grep}:
  Startup digest: where to grep,"grep needs a starting guess — the digest supplies one, then gets out of the way"
  Reverse-dependency lookup,"structurally impossible for grep: it returns text matches, not a dependency closure"
```

The second one is the reason this exists. `src/deep/c.ts` breaks when
`src/hub.js` changes and **never mentions `hub.js` anywhere in its text**. No
amount of grepping finds that edge.

## Use it

```bash
# "Change this, what breaks?"  — direct importers, then the closure above them
node "$CLAUDE_PLUGIN_ROOT/hooks/code-map-digest.cjs" --rdeps archon-os/hooks/lib/hook-runtime.cjs

# Limit how far up the closure walks (default 10 levels)
node "$CLAUDE_PLUGIN_ROOT/hooks/code-map-digest.cjs" --rdeps src/hub.js --depth 2

# Print the digest the SessionStart hook injects
node "$CLAUDE_PLUGIN_ROOT/hooks/code-map-digest.cjs" --digest

# Regenerate the cache / probe its freshness (exit 3 = stale)
node "$CLAUDE_PLUGIN_ROOT/hooks/code-map-digest.cjs" --rebuild
node "$CLAUDE_PLUGIN_ROOT/hooks/code-map-digest.cjs" --check
```

Lookup is **on demand only**. It never runs at startup — startup gets the
digest, which merely advertises the command.

## What the digest says

Head line (always present) plus four independent tiers, added in priority order
while the character budget allows:

```toon
digest[5]{section,content}:
  head,"file count · LOC · import edges · external specifiers · UNRESOLVED count"
  dirs,"largest source dirs by LOC — the starting guess for a grep"
  hubs,"most-imported files with direct and transitive importer counts (blast radius)"
  entrypoints,"files nothing imports (tests filtered out of this view only)"
  unresolved,"sample of specifiers the extractor could not resolve, with their file"
```

A tier that does not fit is **dropped by name in the text**
(`sections dropped to fit the N-char budget: ...`). Nothing is ever cut
mid-structure, because a half-written list reads as a complete one.

```toon
budget[3]{limit,value}:
  SessionStart hook output cap,"10,000 chars — anything past it is dropped entirely"
  Digest budget,"3,500 chars (AF_CODE_MAP_BUDGET overrides via --budget)"
  Measured on this repo,"1,611 chars at 282 files / 56,720 LOC — 6.2x headroom under the cap"
```

## `code-map.json` — a derived cache, never a source of truth

`<root>/.claude/cache/code-map.json`: one record per source file —
`(mtime, size, loc)` plus resolved `imports`, bare `external` specifiers, and
`unresolved` ones. Built by `hooks/lib/code-map.cjs`. Same contract as
`graph-index.json` (see `skills/plan-orchestrator/SKILL.md`).

```toon
contract[6]{aspect,behaviour}:
  Population,"FROM THE SOURCE — `git ls-files --cached --others --exclude-standard`, else a bounded walk. Never a hand-written list, so a file created a second ago is in it."
  Rebuildable,"Delete code-map.json and it regenerates. Nothing is ever written only here."
  Incremental,"(path, mtime, size) cache: an unmoved file is copied, not re-read. PostToolUse appends the edited path to code-map.dirty; the next reader drains it. Never a full rescan on edit."
  Self-healing,"Readers reject it when a recorded file is missing, its (mtime,size) moved, or a source file exists the map has not heard of — and rebuild. The third check is the one that matters: without it a new file is invisible."
  Authority,"The FILESYSTEM decides what exists. --rdeps stats every importer, ignores the ones that are gone, and prints `STALE: ... no longer on disk` rather than a confident wrong answer."
  Disable,AF_CODE_MAP_DISABLED=true
```

## What it admits it cannot do

This is a lexical extractor (comment-, string- and regex-literal aware), not a
parser. It resolves relative and absolute specifiers against the filesystem and
classifies bare ones as external. It **cannot** resolve `tsconfig` path aliases,
`package.json` `imports` subpaths, or computed/template specifiers.

Every one of those lands in `unresolved` and is **counted in the digest head
line**. That is the whole argument for a derived map over an authored doc:

> A graph can report what it failed to resolve. A doc cannot report what
> someone forgot to update.

So treat the unresolved count as the map's own error bar. If it is large, the
hub and blast-radius numbers are floors, not totals — fall back to grep for the
alias form.

## Do not

```toon
antipatterns[4]{dont,instead}:
  Use it to find text or identifiers,"`git grep` — always current, costs nothing, exact"
  Trust it about whether a file exists,"`ls` / the Read tool — the filesystem is authoritative"
  Record anything only in the map,"It is deleted and rebuilt routinely; put facts in CLAUDE.md, the plan tree or history.jsonl"
  Generate docs from it on a timer,"Explicitly rejected — see .claude/plans/features/FEAT-F.../feature.md"
```
