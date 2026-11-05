<!-- GENERATED FILE — do not edit.
     Source: README.md at the repository root.
     Regenerate: bash scripts/gen-plugin-readme.sh
     Repo-relative links are rewritten to absolute URLs because this file renders on
     npm and in the Claude Code plugin browser, where relative paths do not resolve. -->

<div align="center">

<img alt="Archon OS — a planning-first LLM operating system for software engineering" src="https://raw.githubusercontent.com/nguyenthienthanh/archon/main/assets/brand/banner-light.png" width="860">

# Archon OS

### Claude Code, with a plan it doesn't forget.

A plugin for **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** that asks the
questions first, writes a failing test second, and never lets the agent that wrote the code be
the one that approves it.

[![npm](https://img.shields.io/npm/v/archon-os/alpha?label=npm%40alpha)](https://www.npmjs.com/package/archon-os)
[![Version](https://img.shields.io/github/v/release/nguyenthienthanh/archon?include_prereleases&label=release)](https://github.com/nguyenthienthanh/archon/blob/main/docs/reference/CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/nguyenthienthanh/archon/blob/main/LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)](https://docs.anthropic.com/en/docs/claude-code)
[![Portable](https://img.shields.io/badge/portable-~87%25_markdown-brightgreen)](https://github.com/nguyenthienthanh/archon/blob/main/docs/PORTABILITY.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/nguyenthienthanh/archon/blob/main/CONTRIBUTING.md)

**[Install](#install-in-30-seconds)** · **[Your first five minutes](#your-first-five-minutes)** · **[What it gives you](#what-it-gives-you)** · **[Docs](https://github.com/nguyenthienthanh/archon/blob/main/docs/README.md)**

</div>

---

## The problem

You type a prompt. Claude writes 500 lines. You read them and realise it solved a different
problem. You say "no, I meant—" and it rewrites everything from scratch.

Then you close the terminal, and tomorrow it has forgotten the whole conversation.

You are the project manager, the QA lead, and the architect — while trying to code.

## What Archon OS does about it

**It asks before it builds.** On anything non-trivial, you get the trade-offs and the file list
*first*, and you approve or redirect before a line is written.

**It writes the test before the code.** Not as a style preference — a failing test is the only
statement of "done" that can't be talked out of.

**It doesn't grade its own homework.** The agent that reviews is never the agent that built.
That one rule is why the output is shippable instead of merely self-consistent.

**It remembers.** Plans live on disk, not in the context window. Close the terminal, run
`/compact`, reboot the machine — the plan is still there tomorrow.

---

## Install in 30 seconds

You need [Claude Code](https://docs.anthropic.com/en/docs/claude-code), **Node 18+**, and git.

```bash
/plugin marketplace add nguyenthienthanh/archon
/plugin install archon-os@archon
/archon status
```

That last line should print the roster:

```
Archon OS v4.0.0-alpha.3 — Ready
  Agents:   15 loaded
  Skills:   45 available (10 auto-invoke, 35 on-demand)
  Rules:    73 loaded (22 core + 20 agent + 31 workflow)
  Hooks:    53 registered
  MCP:      context7, playwright, vitest, firebase, figma, slack
```

**One more thing, once per project:**

```bash
/project init
```

This reads your codebase and writes down what it found — framework, conventions, patterns,
architecture. Takes under a minute, and every session afterwards starts already knowing where
things are.

<details>
<summary><b>Install didn't work?</b></summary>

| What you see | Usually means | Try |
|---|---|---|
| `/plugin install` fails | Stale marketplace cache | `/plugin marketplace refresh` |
| Nothing happens on edits | Hooks aren't wired into `.claude/settings.json` | `/archon setup integrations` |
| `archon: command not found` | The CLI isn't on your `PATH` | `/archon setup cli` |
| It picks the wrong specialist | It hasn't read your project yet | `/project init` |

Longer version: [GET_STARTED.md](https://github.com/nguyenthienthanh/archon/blob/main/docs/getting-started/GET_STARTED.md) ·
[TROUBLESHOOTING.md](https://github.com/nguyenthienthanh/archon/blob/main/docs/operations/TROUBLESHOOTING.md)

</details>

<details>
<summary><b>Upgrading from Aura Frog (v3)?</b></summary>

v4 renamed the project. **Upgrade and keep working** — every old name still functions, nothing
on disk moves, and no `.envrc` approval is revoked. The one-page account of what changed and
when the old names go away: [MIGRATION_V4.md](https://github.com/nguyenthienthanh/archon/blob/main/docs/operations/MIGRATION_V4.md).

</details>

<details>
<summary><b>Other ways to get it (npm, other AI tools)</b></summary>

The payload is on npm as [`archon-os`](https://www.npmjs.com/package/archon-os), under the
`alpha` tag. The marketplace above is still the normal route; npm exists so a team marketplace
can pull from the registry (`"source": {"source": "npm", "package": "archon-os"}`), and so you
can read what ships before installing it: `npm pack archon-os@alpha`.

About **87% of Archon OS is markdown**, not code, so most of it moves to other tools. Copy
`archon-os/skills/*` into Codex / Gemini CLI / OpenCode and the skills work. Hooks, agent
dispatch, and the bundled MCP servers are Claude Code only.
[Portability guide →](https://github.com/nguyenthienthanh/archon/blob/main/docs/PORTABILITY.md)

</details>

---

## Your first five minutes

There are really only two commands. Both take plain English.

### `/run` — do a thing

```bash
/run fix the login button not disabling on submit
```

Archon OS sizes the job itself. A typo is a direct edit. A bug gets
investigate → failing test → minimal fix → verify. A feature gets the full five phases with two
approval gates. You never pick. [How it decides →](https://github.com/nguyenthienthanh/archon/blob/main/docs/reference/ROUTING.md)

Here is what a real feature run looks like:

```
You: /run add user authentication

  Phase 1 — Understand + Design
     JWT or session cookies? Here's the trade-off for your stack.
     3 endpoints, 2 new files, 1 migration. Approve?

You: approve

  Phase 2 — Test RED        5 tests written. All failing. Good.
  Phase 3 — Build GREEN     5/5 passing. Approve?

You: approve

  Phase 4 — Review          Reviewed by a different agent. 2 findings, both fixed.
  Phase 5 — Finalize        Docs updated. Plan synced. Done.
```

Mid-run you can just type words — no slash needed: `approve`, `reject <why>`,
`modify <change>`, `status`, `progress`, `handoff`, `rollback`, `stop`.

### `/archon-os:plan` — keep track of a big thing

For work that won't fit in one sitting. It breaks a goal down into
Mission → Initiative → Feature → Story → Task, writes the tree to `.claude/plans/`, and hands
you one task at a time.

```bash
/archon-os:plan            # no arguments: it interviews you
/archon-os:plan next       # what should I do now?
/archon-os:plan status     # where are we?
```

With a plan active, bare verbs work too: type `next`, or `expand FEAT-A`.

**The two halves connect.** `/run feature: FEAT-A <task>` ties a run to a plan node, and when
the run finishes its results land back in the tree. You can walk away for a week and pick up
where you stopped.

**Next:** [First workflow tutorial](https://github.com/nguyenthienthanh/archon/blob/main/docs/getting-started/FIRST_WORKFLOW_TUTORIAL.md) (15 min,
hands-on) or a [full transcript of a real run](https://github.com/nguyenthienthanh/archon/blob/main/docs/getting-started/WALKTHROUGH.md) if you'd
rather read than type.

---

## What it gives you

Eight things, each one switchable with a single environment variable — so you can take them one
at a time rather than all at once.

| | What it stops happening |
|---|---|
| **Plans that outlive the session** | Closing the terminal loses your plan. Now it's a folder tree on disk that survives `/compact`, a reboot, and next week. |
| **A record of why** | "Where did that number come from?" Every claim an agent makes is linked to the file read it came from. Ungrounded claims get flagged, not printed. |
| **Memory that compounds** | Week three re-litigating a week-one decision. Finished features distil into a permanent memo that future sessions load in ~120 tokens. |
| **Bad output caught before disk** | A generated path like `rm -rf $UNSET_VAR` landing in a script. Seven linters run on every write. |
| **Parallel work that doesn't collide** | Two tasks silently overwriting each other's file. File- and function-level overlap is detected, and descendants freeze until it's resolved. |
| **Failures that diagnose themselves** | Reading a stack trace from scratch. Local failures come with a proposed patch — **proposed**, never auto-applied. |
| **External tools on a leash** | An agent calling an MCP server it had no business calling. Per-agent allowlists, rate limits, and an audit log. |
| **A reviewer who isn't the author** | Code that passes only its own tests. Phase 4's reviewer is structurally not Phase 3's builder. |

[The 8 Pillars in full →](https://github.com/nguyenthienthanh/archon/blob/main/docs/reference/PILLARS.md) · [Why each one exists →](https://github.com/nguyenthienthanh/archon/blob/main/docs/reference/BENEFITS.md)

---

## Everyday commands

| Command | What you'd say out loud |
|---|---|
| `/run <task>` | "Do this." Feature, bug, refactor, test, review, deploy — it detects which. |
| `/archon-os:plan <verb>` | "Keep track of this bigger thing." `expand` · `next` · `status` · `replan` · `promote` · `archive` · `undo` · `freeze` · `thaw` · `conflicts` |
| `/check` | "Is anything wrong?" `security` · `perf` · `complexity` · `debt` · `coverage` · `deps` |
| `/design` | "Draw it before we build it." `api` · `db` · `doc` |
| `/project` | "Learn my codebase." `init` · `status` · `refresh` · `env` · `sync` |
| `/archon` | "How are you doing?" `status` · `agents` · `metrics` · `learn` · `setup` |
| `/help` | "What can you do?" `/help <command>` also works. |

[All 25 commands, every flag →](https://github.com/nguyenthienthanh/archon/blob/main/archon-os/commands/README.md)

---

## Is this for you?

**Worth it if** you ship multi-week features, you've been burned by an agent confidently
describing code it never read, you have parallel work that can collide, or you lean on MCP
integrations and want them audited.

**Probably not if** you mostly do single-file edits and quick prototypes — the structure won't
pay for itself. (`/run task: <thing>` skips straight past it when you want.) Also note that
planning and design phases want Sonnet or Opus; Haiku-only budgets lose some of the value.

We keep an unflattering list of what doesn't work yet, what's still queued, and what we got
wrong and corrected: [maturity report →](https://github.com/nguyenthienthanh/archon/blob/main/docs/reference/MATURITY.md). There's also an
[honest comparison](https://github.com/nguyenthienthanh/archon/blob/main/docs/reference/COMPARISON.md) with other Claude Code plugins — they
optimise for different things, and all of them coexist fine.

---

## Where to go next

| You want to… | Read |
|---|---|
| Get it working, properly | [GET_STARTED.md](https://github.com/nguyenthienthanh/archon/blob/main/docs/getting-started/GET_STARTED.md) |
| Follow a tutorial | [FIRST_WORKFLOW_TUTORIAL.md](https://github.com/nguyenthienthanh/archon/blob/main/docs/getting-started/FIRST_WORKFLOW_TUTORIAL.md) |
| See a real run end to end | [WALKTHROUGH.md](https://github.com/nguyenthienthanh/archon/blob/main/docs/getting-started/WALKTHROUGH.md) |
| Understand the design | [os-architecture.md](https://github.com/nguyenthienthanh/archon/blob/main/docs/architecture/os-architecture.md) |
| Know what it costs in tokens | [TOKEN_BUDGET.md](https://github.com/nguyenthienthanh/archon/blob/main/docs/getting-started/TOKEN_BUDGET.md) |
| Fix something | [TROUBLESHOOTING.md](https://github.com/nguyenthienthanh/archon/blob/main/docs/operations/TROUBLESHOOTING.md) |
| Upgrade from v3 | [MIGRATION_V4.md](https://github.com/nguyenthienthanh/archon/blob/main/docs/operations/MIGRATION_V4.md) |
| Hack on Archon OS itself | [CONTRIBUTING.md](https://github.com/nguyenthienthanh/archon/blob/main/CONTRIBUTING.md) · [contributor docs](https://github.com/nguyenthienthanh/archon/blob/main/docs/contributing/README.md) |
| Read everything | [docs/README.md](https://github.com/nguyenthienthanh/archon/blob/main/docs/README.md) |

---

## Contributing

New MCP integrations, agents, skills and bug fixes are all welcome.
[CONTRIBUTING.md](https://github.com/nguyenthienthanh/archon/blob/main/CONTRIBUTING.md) covers the setup, the test suite, and what review looks
like; the [contributor docs](https://github.com/nguyenthienthanh/archon/blob/main/docs/contributing/README.md) cover how the internals fit together.

Godot and SEO/GEO modules ship as separate add-ons.

## License

MIT — see [LICENSE](https://github.com/nguyenthienthanh/archon/blob/main/LICENSE).

---

<div align="center">

<img alt="The Archon OS owl watching a plan tree" src="https://raw.githubusercontent.com/nguyenthienthanh/archon/main/assets/brand/mascot.svg" width="520">

### Your AI writes the code. Archon OS runs the shop.

**[Install](#install-in-30-seconds)** · **[Tutorial](https://github.com/nguyenthienthanh/archon/blob/main/docs/getting-started/FIRST_WORKFLOW_TUTORIAL.md)** · **[Report an issue](https://github.com/nguyenthienthanh/archon/issues)**

*Built by [@nguyenthienthanh](https://github.com/nguyenthienthanh) · [Changelog](https://github.com/nguyenthienthanh/archon/blob/main/docs/reference/CHANGELOG.md)*

</div>
