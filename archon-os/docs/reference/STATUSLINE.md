# Statusline (cost/usage)

Aura Frog ships an optional custom Claude Code statusline that renders a
three-line status: who/where you are, how much of your rate-limit budgets and
context window are spent, and what the session and billing cycle cost so far.

It is version-controlled in the plugin under `scripts/` and installed into
`~/.claude/` on demand via `/af statusline install`.

## The three-line layout

| Line | Name | Contents |
| --- | --- | --- |
| **L1** | identity | `🐸 model` · shortened cwd · git branch (`*` when the tree is dirty) |
| **L2** | budgets | `5h` limit (bar + % + reset clock) · `7d` limit (% + reset) · `ctx` context % + tokens |
| **L3** | money | `session ≈$` · `🔥 ≈$/hr` burn rate · `cycle¹ ≈$ →proj ≈$` · `≈API-equiv·<plan>` |

Notes on each line:

- **L1** — The cwd is shortened to `~/…/parent/dir` when deep. The git segment
  is green when clean, yellow with a trailing `*` when dirty. Both degrade to
  nothing when unavailable.
- **L2** — `5h` / `7d` come from Claude Code's `rate_limits` on stdin (Pro/Max
  plans, populated only after the first API response). The reset field shows the
  absolute clock time it resets (`8:00PM`, or `Tue 8PM` when days out), not a
  countdown. `ctx` is derived from the transcript's most recent `usage` block
  against the auto-detected context window (200k, or 1M once clearly past 200k).
- **L3** — `session $` is Claude Code's own `cost.total_cost_usd` (instant, no
  dependencies). Burn rate appears once the session is past ~1 minute. `cycle $`
  is the billing-cycle total computed in the background (see below); `→proj` is
  the linear projection to cycle end. A trailing `⟳` means the cached cycle
  figure is over an hour old. `≈API-equiv` flags that these are
  API-equivalent dollar values for the named plan, not an invoice.

Everything is best-effort: any field whose data is absent is simply omitted, and
the renderer never blocks or errors the statusline.

## Environment toggles

All are optional. Set them in `settings.json` under `.env` (Claude Code applies
settings env to the statusline command) or in the shell environment.

| Variable | Default | Effect |
| --- | --- | --- |
| `AF_BILLING_DAY` | `1` | Day of month the billing cycle anchors on (1–28). Drives cycle window + projection. |
| `AF_PLAN_LABEL` | `Claude` | Label shown in the `≈API-equiv·<plan>` tag. |
| `AF_CTX_WINDOW` | auto | Force a fixed context-window denominator (e.g. `200000`). Otherwise auto: 200k, or 1M past 200k. |
| `AF_STATUSLINE_USAGE_DISABLED` | `0` | `1` hides the cycle `$` and skips the background ccusage refresh entirely. |
| `NO_COLOR` | unset | Any value renders plain text with no ANSI color (`AF_STATUSLINE_NOCOLOR` also works). |

## Background cost-refresh model

The renderer never runs `ccusage` itself — that would block the statusline. Each
render instead kicks a detached background refresher
(`statusline-usage-refresh.sh`) and only reads its cache.

- Runs `ccusage daily --json --mode calculate --offline` over the current
  billing window `[anchor day … today]`. **Offline**: cached LiteLLM pricing, no
  network, no API key.
- Runner preference: `bunx ccusage`, falling back to `npx -y ccusage`. If neither
  is present it exits quietly.
- Writes `~/.claude/cache/usage-cycle.json` atomically (temp file + `mv`).
- Self-guarded: a TTL (`AF_USAGE_TTL`, default 900s) skips work when the cache is
  fresh for the current cycle, and a `mkdir` lock ensures single-flight, so
  firing it on every render is cheap.

## Rate-limit capture (feeds limit-reset-notify)

Before rendering, the entrypoint (`statusline-cost.sh`) extracts the `5h`
rate-limit percentage and reset epoch from stdin and writes them to
`~/.claude/cache/rate-limits.json` (absolute path, on purpose). The
`limit-reset-notify` skill / `~/.claude/limit-reset-notify.sh` hardcodes and
depends on that file to know when the 5-hour window resets. This capture happens
regardless of `AF_STATUSLINE_USAGE_DISABLED`.

## The `/af statusline` command

Install, update, and inspect via the plugin's installer
(`scripts/statusline-install.sh`):

| Command | Action |
| --- | --- |
| `/af statusline install [--billing-day N] [--plan LABEL] [--style cost\|af]` | Copies the 3 scripts into `~/.claude/`, backs up `settings.json` to a timestamped `.bak`, and wires `.statusLine` to run them. `--style cost` (default) points at `statusline-cost.sh`; `--style af` points at the plugin's classic `statusline.sh`. `--billing-day` / `--plan` set `.env.AF_BILLING_DAY` / `.env.AF_PLAN_LABEL`. |
| `/af statusline update` | Re-copies only the 3 script files into `~/.claude/` (the "pull latest render" path). Does **not** touch `settings.json`, preserving your wiring, billing day, and plan label. |
| `/af statusline status` | Prints the active `.statusLine.command`, resolved `AF_BILLING_DAY` / `AF_PLAN_LABEL`, whether the usage / rate-limit caches exist (and cache age), and availability of `python3` / `bunx` / `npx`. |

Every `settings.json` edit is backed up first and applied via `python3` for safe
JSON — never `sed`. The operations are idempotent and fail-safe.

## Files

| File | Role |
| --- | --- |
| `scripts/statusline-render.py` | Canonical Python renderer (stdlib only). Reads stdin JSON, prints the 3 lines. |
| `scripts/statusline-usage-refresh.sh` | Detached, lock-guarded ccusage billing-cycle cost refresher. |
| `scripts/statusline-cost.sh` | Entrypoint: captures rate-limits, kicks the refresher, renders. Always exits 0. |
| `scripts/statusline-install.sh` | Installer / updater / status inspector. |
