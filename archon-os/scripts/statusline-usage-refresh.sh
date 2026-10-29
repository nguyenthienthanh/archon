#!/bin/bash
# Background refresher for the billing-cycle usage cost shown in the statusline.
# Runs ccusage OFFLINE (cached LiteLLM pricing, no network, no API key) over the
# current billing window [anchor day .. today] and caches .totals.totalCost.
#
# Detached + lock-guarded so the statusline render never blocks on it.
#   Billing anchor day : AF_BILLING_DAY (default 1)
#   Refresh interval   : AF_USAGE_TTL seconds (default 900)
#   Disable            : AF_STATUSLINE_USAGE_DISABLED=1
set -u

[ "${AF_STATUSLINE_USAGE_DISABLED:-0}" = "1" ] && exit 0

CACHE_DIR="$HOME/.claude/cache"
CACHE="$CACHE_DIR/usage-cycle.json"
LOCK="$CACHE_DIR/usage-cycle.lock"
BILLING_DAY="${AF_BILLING_DAY:-1}"
TTL="${AF_USAGE_TTL:-900}"
mkdir -p "$CACHE_DIR" 2>/dev/null

# Billing-cycle start (YYYYMMDD): this month's anchor if today >= anchor, else last month's.
read -r CYCLE_START DAYS_TOTAL DAYS_ELAPSED < <(python3 - "$BILLING_DAY" <<'PY'
import sys
from datetime import date
bd=int(sys.argv[1])
t=date.today()
def addm(y,m): return (y+1,1) if m==12 else (y,m+1)
if t.day>=bd:
    s=date(t.year,t.month,min(bd,28)); ny,nm=addm(t.year,t.month)
else:
    py,pm=(t.year-1,12) if t.month==1 else (t.year,t.month-1)
    s=date(py,pm,min(bd,28)); ny,nm=t.year,t.month
e=date(ny,nm,min(bd,28))
print(s.strftime("%Y%m%d"), (e-s).days, (t-s).days+1)
PY
)
[ -n "${CYCLE_START:-}" ] || exit 0
TODAY="$(date +%Y%m%d)"

# Fresh enough for THIS cycle? skip.
if [ -f "$CACHE" ]; then
  prev_start=$(grep -o '"cycle_start"[^,]*' "$CACHE" 2>/dev/null | grep -o '[0-9]\{8\}')
  prev_at=$(grep -o '"computed_at"[^,}]*' "$CACHE" 2>/dev/null | grep -o '[0-9]\{6,\}')
  now=$(date +%s)
  if [ "${prev_start:-}" = "$CYCLE_START" ] && [ -n "${prev_at:-}" ] \
     && [ $(( now - prev_at )) -lt "$TTL" ]; then
    exit 0
  fi
fi

# Single-flight: bail if another refresh holds the lock (dir = atomic).
if ! mkdir "$LOCK" 2>/dev/null; then exit 0; fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

# Pick a runner: prefer bun (fast, caches package), fall back to npx.
RUNNER=""
if command -v bunx >/dev/null 2>&1; then RUNNER="bunx ccusage"
elif command -v npx >/dev/null 2>&1; then RUNNER="npx -y ccusage"
else exit 0; fi

json=$($RUNNER daily --json --mode calculate --offline \
        --since "$CYCLE_START" --until "$TODAY" 2>/dev/null)
[ -n "$json" ] || exit 0

cost=$(printf '%s' "$json" | jq -r '.totals.totalCost // empty' 2>/dev/null)
[ -n "$cost" ] || exit 0

tmp="$CACHE.tmp.$$"
printf '{"cycle_cost":%s,"cycle_start":"%s","days_total":%s,"days_elapsed":%s,"computed_at":%s}\n' \
  "$cost" "$CYCLE_START" "${DAYS_TOTAL:-30}" "${DAYS_ELAPSED:-1}" "$(date +%s)" > "$tmp" \
  && mv -f "$tmp" "$CACHE"
