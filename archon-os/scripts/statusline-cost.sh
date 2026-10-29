#!/bin/bash
# Aura Frog plugin — canonical cost/usage statusline entrypoint.
#   L1  🐸 model · shortened cwd · git branch(+dirty)
#   L2  5h [bar] % ·reset · 7d % ·reset · ctx %
#   L3  session ≈$  · cycle¹ ≈$ →proj ≈$ · ≈API-equiv·Claude
#
# Design notes:
#  - Session $ is Claude Code's own cost.total_cost_usd (instant, no deps).
#  - 5h/7d come from stdin rate_limits (Pro/Max only, after 1st API response).
#  - Cycle $ is billing-anchored, computed by a DETACHED ccusage refresh
#    (offline, cached) so the render never blocks; the renderer only reads cache.
#  - The 5h capture below is preserved so ~/.claude/limit-reset-notify.sh keeps
#    working (it hardcodes $HOME/.claude/cache/rate-limits.json). Best-effort; exit 0.
#
# Env toggles: AF_BILLING_DAY  AF_PLAN_LABEL  AF_CTX_WINDOW
#              AF_STATUSLINE_USAGE_DISABLED=1 (hide cycle $)  NO_COLOR=1 (plain)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export AF_BILLING_DAY="${AF_BILLING_DAY:-1}"
export AF_PLAN_LABEL="${AF_PLAN_LABEL:-Claude}"

input=$(cat)

# --- Preserve: capture 5h rate-limit state for the limit-reset notifier -------
# ABSOLUTE path on purpose: ~/.claude/limit-reset-notify.sh hardcodes this file.
{
  oneline=$(printf '%s' "$input" | tr '\n' ' ')
  block=$(printf '%s' "$oneline" | grep -o '"five_hour"[[:space:]]*:[[:space:]]*{[^}]*}')
  if [ -n "$block" ]; then
    f5=$(printf '%s' "$block" | grep -o '"used_percentage"[[:space:]]*:[[:space:]]*[0-9.]*' | head -1 | sed 's/.*: *//')
    r5=$(printf '%s' "$block" | grep -o '"resets_at"[[:space:]]*:[[:space:]]*[0-9]*'        | head -1 | sed 's/.*: *//')
    if [ -n "$r5" ]; then
      mkdir -p "$HOME/.claude/cache"
      printf '{"five_hour_pct":%s,"five_hour_reset":%s,"captured_at":%s}\n' \
        "${f5:-0}" "$r5" "$(date +%s)" > "$HOME/.claude/cache/rate-limits.json"
    fi
  fi
} 2>/dev/null

# --- Kick the billing-cycle cost refresher in the background (never blocks) ---
# Detached in a subshell with std streams closed so it never holds the render
# pipe open; portable (no setsid, which macOS lacks). The refresher self-guards
# with a TTL + lock, so firing it every render is cheap.
if [ "${AF_STATUSLINE_USAGE_DISABLED:-0}" != "1" ]; then
  ( bash "$SCRIPT_DIR/statusline-usage-refresh.sh" >/dev/null 2>&1 </dev/null & ) 2>/dev/null
fi

# --- Render -------------------------------------------------------------------
if command -v python3 >/dev/null 2>&1; then
  printf '%s' "$input" | python3 "$SCRIPT_DIR/statusline-render.py" 2>/dev/null && exit 0
fi

# Fallback: minimal one-liner if python3 is unavailable.
model=$(printf '%s' "$input" | grep -o '"display_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
echo "🐸 ${model:-Claude}"
exit 0
