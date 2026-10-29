#!/bin/bash
# Aura Frog plugin — statusline installer / updater.
#
# Copies the plugin's canonical statusline scripts into ~/.claude/ and wires
# settings.json to run them. Idempotent and fail-safe: every settings.json edit
# is backed up first and applied via python3 (never sed) for safe JSON.
#
# Subcommands:
#   install [--billing-day N] [--plan LABEL] [--style cost|af]
#   update
#   status
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"
SCRIPTS=(statusline-render.py statusline-usage-refresh.sh statusline-cost.sh)

usage() {
  cat <<'EOF'
Aura Frog statusline installer

Usage:
  statusline-install.sh install [--billing-day N] [--plan LABEL] [--style cost|af]
      Copy the 3 statusline scripts into ~/.claude/ and wire settings.json.
      --style cost (default): point statusLine at ~/.claude/statusline-cost.sh
      --style af           : point statusLine at the plugin's classic scripts/statusline.sh
      --billing-day N      : set settings.json .env.AF_BILLING_DAY
      --plan LABEL         : set settings.json .env.AF_PLAN_LABEL

  statusline-install.sh update
      Re-copy ONLY the 3 script files into ~/.claude/ (overwrite). Does NOT touch
      settings.json — preserves your wiring, billing day, and plan label.

  statusline-install.sh status
      Show the active statusLine command, resolved AF_BILLING_DAY / AF_PLAN_LABEL,
      cache freshness, and availability of python3 / bunx / npx.
EOF
}

copy_scripts() {
  mkdir -p "$CLAUDE_DIR"
  for f in "${SCRIPTS[@]}"; do
    cp -f "$SCRIPT_DIR/$f" "$CLAUDE_DIR/$f"
  done
  chmod +x "$CLAUDE_DIR/statusline-cost.sh" "$CLAUDE_DIR/statusline-usage-refresh.sh" 2>/dev/null || true
}

backup_settings() {
  # Prints the backup path (empty if there was nothing to back up).
  if [ -f "$SETTINGS" ]; then
    local bak="$SETTINGS.$(date +%Y%m%d-%H%M%S).bak"
    cp -f "$SETTINGS" "$bak"
    printf '%s' "$bak"
  fi
}

cmd_install() {
  local billing_day="" plan="" style="cost"
  while [ $# -gt 0 ]; do
    case "$1" in
      --billing-day) billing_day="${2:-}"; shift 2 ;;
      --plan)        plan="${2:-}"; shift 2 ;;
      --style)       style="${2:-cost}"; shift 2 ;;
      *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
    esac
  done
  case "$style" in cost|af) ;; *) echo "Invalid --style: $style (cost|af)" >&2; exit 2 ;; esac

  copy_scripts

  local bak
  bak="$(backup_settings)"

  # statusLine command target depends on style.
  local sl_cmd
  if [ "$style" = "af" ]; then
    # Point at the plugin's classic statusline (left untouched by this installer).
    sl_cmd="bash $SCRIPT_DIR/statusline.sh"
  else
    sl_cmd="bash \$HOME/.claude/statusline-cost.sh"
  fi

  SETTINGS="$SETTINGS" SL_CMD="$sl_cmd" BILLING_DAY="$billing_day" PLAN="$plan" python3 - <<'PY'
import json, os
path = os.environ["SETTINGS"]
sl_cmd = os.environ["SL_CMD"]
billing_day = os.environ.get("BILLING_DAY", "")
plan = os.environ.get("PLAN", "")

data = {}
if os.path.isfile(path):
    try:
        with open(path) as f:
            data = json.load(f)
    except Exception:
        data = {}
if not isinstance(data, dict):
    data = {}

data["statusLine"] = {
    "type": "command",
    "command": sl_cmd,
    "padding": 1,
    "refreshInterval": 30,
}

if billing_day or plan:
    env = data.get("env")
    if not isinstance(env, dict):
        env = {}
    if billing_day:
        env["AF_BILLING_DAY"] = str(billing_day)
    if plan:
        env["AF_PLAN_LABEL"] = str(plan)
    data["env"] = env

os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY

  echo "Aura Frog statusline installed (style=$style)."
  echo "  Scripts copied to $CLAUDE_DIR/:"
  for f in "${SCRIPTS[@]}"; do echo "    - $f"; done
  echo "  statusLine.command -> $sl_cmd"
  [ -n "$billing_day" ] && echo "  env.AF_BILLING_DAY -> $billing_day"
  [ -n "$plan" ] && echo "  env.AF_PLAN_LABEL  -> $plan"
  if [ -n "$bak" ]; then
    echo "  settings.json backup: $bak"
  else
    echo "  settings.json: created (no prior file to back up)"
  fi
}

cmd_update() {
  copy_scripts
  echo "Aura Frog statusline scripts refreshed in $CLAUDE_DIR/ (settings.json untouched):"
  for f in "${SCRIPTS[@]}"; do
    if [ -f "$CLAUDE_DIR/$f" ]; then
      local mt
      mt=$(date -r "$CLAUDE_DIR/$f" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo '?')
      echo "    - $f  ($mt)"
    fi
  done
}

cmd_status() {
  echo "Aura Frog statusline status"
  echo

  if [ -f "$SETTINGS" ]; then
    SETTINGS="$SETTINGS" python3 - <<'PY'
import json, os
path = os.environ["SETTINGS"]
try:
    with open(path) as f:
        data = json.load(f)
except Exception:
    data = {}
sl = (data.get("statusLine") or {}) if isinstance(data, dict) else {}
env = (data.get("env") or {}) if isinstance(data, dict) else {}
cmd = sl.get("command", "(none)")
bd = env.get("AF_BILLING_DAY") or os.environ.get("AF_BILLING_DAY") or "1 (default)"
pl = env.get("AF_PLAN_LABEL") or os.environ.get("AF_PLAN_LABEL") or "Claude (default)"
print(f"  statusLine.command : {cmd}")
print(f"  AF_BILLING_DAY     : {bd}")
print(f"  AF_PLAN_LABEL      : {pl}")
PY
  else
    echo "  settings.json      : not found ($SETTINGS)"
    echo "  AF_BILLING_DAY     : ${AF_BILLING_DAY:-1 (default)}"
    echo "  AF_PLAN_LABEL      : ${AF_PLAN_LABEL:-Claude (default)}"
  fi

  local cyc="$CLAUDE_DIR/cache/usage-cycle.json"
  if [ -f "$cyc" ]; then
    local now mt age
    now=$(date +%s)
    mt=$(date -r "$cyc" +%s 2>/dev/null || echo "$now")
    age=$(( now - mt ))
    echo "  usage-cycle.json   : present (${age}s old)"
  else
    echo "  usage-cycle.json   : absent (cycle \$ not yet computed)"
  fi

  local rl="$CLAUDE_DIR/cache/rate-limits.json"
  if [ -f "$rl" ]; then
    echo "  rate-limits.json   : present"
  else
    echo "  rate-limits.json   : absent"
  fi

  local p3 bx nx
  p3=$(command -v python3 >/dev/null 2>&1 && echo yes || echo no)
  bx=$(command -v bunx   >/dev/null 2>&1 && echo yes || echo no)
  nx=$(command -v npx    >/dev/null 2>&1 && echo yes || echo no)
  echo "  python3 available  : $p3"
  echo "  bunx available     : $bx"
  echo "  npx available      : $nx"
}

main() {
  local sub="${1:-}"
  case "$sub" in
    install) shift; cmd_install "$@" ;;
    update)  shift; cmd_update ;;
    status)  shift; cmd_status ;;
    ""|-h|--help|help) usage ;;
    *) echo "Unknown subcommand: $sub" >&2; usage; exit 2 ;;
  esac
}

main "$@"
