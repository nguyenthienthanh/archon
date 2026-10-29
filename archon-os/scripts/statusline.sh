#!/bin/bash

# Bridges legacy AF_* / AURA_FROG_* variables onto their ARCHON_* names (v4 rebrand).
. "$(dirname "${BASH_SOURCE[0]}")/lib/env-compat.sh"

# Archon OS Status Line (v3.8.0-alpha.4+)
# Replaces the conversation banner — always visible, 0 tokens.
# Owns the FULL multi-line status line (dir/git prefix + AF context + cost) so
# plugin upgrades carry the layout. The ~/.claude/statusline-command.sh shim is
# now a thin pass-through (no duplicate dir/git prefix).
#
# Receives JSON on stdin from Claude Code (parse defensively — fields optional):
#   { workspace.current_dir, cwd, model.display_name, version, used_percentage,
#     cost.total_cost_usd, cost.total_lines_added, cost.total_lines_removed,
#     cost.total_duration_ms }
#
# Reads additional state from:
#   .claude/cache/session-start-cache.json    — fallback for agent/phase
#   .claude/logs/runs/<latest>/run-state.json — primary source for mode + step
#
# Format (multi-line):
#   ➜  {dir}  git:({branch}) {✓|✗N} {↑a} {↓b}              🕐 HH:MM
#   archon v{version} │ {mode} {step} │ {agent}
#   {model} │ {ctx}% ctx
#   ⏳ 5h {pct}% ↻{reset} │ 7d {pct}% ↻{reset}             (rate-limit budget)
#   💰 ${cost} │ +{added}/-{removed} │ ⏱ {duration} │ cc {version}     (opt-in)
#
# the Archon content is the v3.7.3+ single line `archon v… │ {mode} {step} │ {agent}
# │ {model} │ {ctx}% ctx`, split on ` │ ` across two lines (avoids single-line
# truncation on narrow terminals). The exact substring is preserved internally
# in $ARCHON_LINE before the split.
#
# Examples:
#   ➜  archon-os  git:(main) ✗3 ↑1              🕐 14:32
#   archon v3.8.0-alpha.4 │ deep P3 │ architect
#   Opus 4.8 │ 12% ctx
#
# Usage line (rate-limit budget) shows rate_limits.{five_hour,seven_day}: % spent
# (red ≥90 / yellow ≥70 / green) + reset time (↻). Subscribers only, after the
# session's first API response — degrades silently otherwise. Disable: ARCHON_STATUSLINE_USAGE=0.
#
# Session-metrics line is OPT-IN: set ARCHON_STATUSLINE_COST=1 AND the cost data
# must be present. Cost was removed from the always-on line in v3.7.4 ("visual
# noise without per-call breakdown"); this re-adds it behind a flag.
#
# Mode tokens: quick / standard / deep / project / bugfix / refactor / test / idle
# Step tokens: P1-P5 for 5-phase flows, S1-S4 for bugfix's 4-step TDD,
#              empty for quick/idle flows.

input=$(cat)

# ----- Helpers ---------------------------------------------------------------

parse_str() {
    echo "$input" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/'
}
parse_num() {
    echo "$input" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*[0-9.]*" | head -1 | sed 's/.*: *//'
}

# Read a string field from a JSON file (top-level only).
file_str() {
    local file="$1"; local key="$2"
    [ -f "$file" ] || return
    grep -o "\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$file" 2>/dev/null \
        | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/'
}
file_num() {
    local file="$1"; local key="$2"
    [ -f "$file" ] || return
    grep -o "\"${key}\"[[:space:]]*:[[:space:]]*[0-9.]*" "$file" 2>/dev/null \
        | head -1 | sed 's/.*: *//'
}

# ----- Project root resolution (matches hooks/lib/hook-runtime.cjs#findProjectRoot)
# Claude Code passes the project cwd via the JSON `cwd` field. Prefer that.
# Fallback: walk up from $PWD looking for .claude/ or .git/ marker.
find_project_root() {
    if [ -n "$ARCHON_PROJECT_ROOT" ]; then echo "$ARCHON_PROJECT_ROOT"; return; fi
    local start="${1:-$PWD}"
    local d="$start"
    while [ "$d" != "/" ] && [ -n "$d" ]; do
        if [ -d "$d/.claude" ] || [ -d "$d/.git" ]; then echo "$d"; return; fi
        d=$(dirname "$d")
    done
    echo "$start"
}
# Claude Code sends the project cwd as workspace.current_dir; older payloads use
# a top-level cwd. Prefer current_dir, then cwd, then $PWD. Leaf keys are unique
# so the flat grep parser reaches the nested current_dir without jq.
JSON_CWD=$(parse_str "current_dir")
[ -z "$JSON_CWD" ] && JSON_CWD=$(parse_str "cwd")
[ -z "$JSON_CWD" ] && JSON_CWD="$PWD"
PROJECT_ROOT=$(find_project_root "$JSON_CWD")

# ----- Claude Code inputs ----------------------------------------------------

MODEL=$(parse_str "display_name")
[ -z "$MODEL" ] && MODEL="unknown"

CTX_PCT=$(parse_num "used_percentage")
# Persist usage for hooks/compact-handoff.cjs — hooks never receive
# used_percentage, so the Stop hook reads it here to save a handoff pre-compact.
if [ -n "$CTX_PCT" ] && [ -d "$PROJECT_ROOT/.claude" ]; then
    mkdir -p "$PROJECT_ROOT/.claude/cache" 2>/dev/null \
        && printf '{"used_percentage":%s,"ts":%s}\n' "$CTX_PCT" "$(date +%s)" \
            > "$PROJECT_ROOT/.claude/cache/context-usage.json" 2>/dev/null
fi
[ -z "$CTX_PCT" ] && CTX_PCT="0"
CTX_INT=${CTX_PCT%.*}

# ----- Archon OS version -----------------------------------------------------

ARCHON_VERSION="?"
for pjson in \
    "$HOME/.claude/plugins/marketplaces/archon/archon-os/.claude-plugin/plugin.json" \
    "archon-os/.claude-plugin/plugin.json"; do
    if [ -f "$pjson" ]; then
        v=$(file_str "$pjson" "version")
        [ -n "$v" ] && ARCHON_VERSION="$v" && break
    fi
done

# ----- Run state (mode + step + agent) --------------------------------------

ARCHON_MODE="idle"
ARCHON_STEP=""
ARCHON_AGENT="ready"

# Prefer the most recently-modified run-state.json with status=in_progress.
# Fall back to session-start cache.
RUNS_DIR="$PROJECT_ROOT/.claude/logs/runs"
if [ -d "$RUNS_DIR" ]; then
    LATEST_RUN=""
    while IFS= read -r f; do
        [ -f "$f" ] || continue
        status=$(file_str "$f" "status")
        if [ "$status" = "in_progress" ]; then
            LATEST_RUN="$f"
            break
        fi
    done < <(ls -1t "$RUNS_DIR"/*/run-state.json 2>/dev/null || true)

    if [ -n "$LATEST_RUN" ]; then
        flow=$(file_str "$LATEST_RUN" "flow")
        complexity=$(file_str "$LATEST_RUN" "complexity")
        phase=$(file_num "$LATEST_RUN" "current_phase")
        step_name=$(file_str "$LATEST_RUN" "current_step")
        active_agent=$(file_str "$LATEST_RUN" "active_agent")

        # Mode: prefer flow (specific), fall back to complexity (general).
        case "$flow" in
            feature-standard)            ARCHON_MODE="standard" ;;
            feature-deep)                ARCHON_MODE="deep" ;;
            bugfix)                      ARCHON_MODE="bugfix" ;;
            refactor)                    ARCHON_MODE="refactor" ;;
            test)                        ARCHON_MODE="test" ;;
            security|review|deploy|quality) ARCHON_MODE="$flow" ;;
            direct)                      ARCHON_MODE="quick" ;;
            *)
                case "$complexity" in
                    Quick)    ARCHON_MODE="quick" ;;
                    Standard) ARCHON_MODE="standard" ;;
                    Deep)     ARCHON_MODE="deep" ;;
                    Project)  ARCHON_MODE="project" ;;
                    *)        ARCHON_MODE="run" ;;
                esac
                ;;
        esac

        # Step: P1-P5 for phase-based flows, S1-S4 for step-based bugfix.
        if [ -n "$phase" ] && [ "$phase" != "0" ]; then
            ARCHON_STEP="P${phase%.*}"
        elif [ -n "$step_name" ]; then
            case "$step_name" in
                investigate)   ARCHON_STEP="S1" ;;
                test-red|red)  ARCHON_STEP="S2" ;;
                fix-green|green) ARCHON_STEP="S3" ;;
                verify)        ARCHON_STEP="S4" ;;
                *)             ARCHON_STEP="${step_name:0:8}" ;;
            esac
        fi

        # Agent: prefer active_agent, fall back to last entry in agents[].
        if [ -n "$active_agent" ]; then
            ARCHON_AGENT="$active_agent"
        else
            last_agent=$(grep -oE '"agents"[[:space:]]*:[[:space:]]*\[[^]]*\]' "$LATEST_RUN" 2>/dev/null \
                | grep -oE '"[a-z-]+"' | tail -1 | tr -d '"')
            [ -n "$last_agent" ] && ARCHON_AGENT="$last_agent"
        fi
    fi
fi

# Legacy fallback: session-start cache (pre-v3.7.4 surface).
if [ "$ARCHON_AGENT" = "ready" ] && [ -f "$PROJECT_ROOT/.claude/cache/session-start-cache.json" ]; then
    cache_agent=$(file_str "$PROJECT_ROOT/.claude/cache/session-start-cache.json" "agent")
    [ -n "$cache_agent" ] && ARCHON_AGENT="$cache_agent"
fi

# ----- Per-step model stack (v3.7.4 follow-up) ------------------------------
# When a Task tool dispatches a subagent with a different model, the
# task-track-model.cjs hook pushes a JSONL entry to the stack file. While the
# stack is non-empty, render the per-step variant: ▶ {phase} {step_model}
# ⏱{duration} │ session: {session_model}. When empty, render the unchanged
# mode/step/agent line.
#
# Disable: rename or chmod -x the hooks at archon-os/hooks/task-{track,clear}-model.cjs.

# v4 renamed the runtime dir .aura-frog/ -> .archon/. A project that was mid-run
# when the plugin upgraded still has its pushed stack under the old name, so read
# whichever one actually holds state (hooks/lib/runtime-dir.cjs does the same).
STACK_FILE=".archon/runtime/model-stack.jsonl"
[ -s "$STACK_FILE" ] || [ ! -s ".aura-frog/runtime/model-stack.jsonl" ] || \
    STACK_FILE=".aura-frog/runtime/model-stack.jsonl"

# Format an elapsed-seconds count as Ns / MmSs / HhMMm per spec.
fmt_duration() {
    local secs="$1"
    [ -z "$secs" ] || [ "$secs" -lt 0 ] 2>/dev/null && secs=0
    if [ "$secs" -lt 60 ]; then
        printf '%ds' "$secs"
    elif [ "$secs" -lt 3600 ]; then
        printf '%dm%02ds' "$((secs / 60))" "$((secs % 60))"
    else
        printf '%dh%02dm' "$((secs / 3600))" "$(((secs % 3600) / 60))"
    fi
}

# Try the per-step render. Wrapped in a subshell with stderr swallowed so a
# corrupted last line, missing jq, or any other surprise falls through to
# the idle render — per the corruption-resilience invariant.
render_active() {
    [ -s "$STACK_FILE" ] || return 1
    command -v jq >/dev/null 2>&1 || return 1

    local top phase step_model step_effort started_iso started_epoch now_epoch elapsed dur
    top=$(tail -n 1 "$STACK_FILE" 2>/dev/null) || return 1
    [ -z "$top" ] && return 1

    phase=$(printf '%s' "$top" | jq -r '.phase // empty' 2>/dev/null) || return 1
    step_model=$(printf '%s' "$top" | jq -r '.model_display // empty' 2>/dev/null) || return 1
    step_effort=$(printf '%s' "$top" | jq -r '.effort // empty' 2>/dev/null) || return 1
    started_iso=$(printf '%s' "$top" | jq -r '.started_at // empty' 2>/dev/null) || return 1
    [ -z "$phase" ] || [ -z "$step_model" ] && return 1
    # Append the reasoning effort when the step declared one: "Sonnet 4.5 · high".
    [ -n "$step_effort" ] && step_model="${step_model} · ${step_effort}"

    # Compute duration. Hooks emit `new Date().toISOString()` which is always
    # UTC with trailing Z. Linux date -d "$iso" handles the Z. macOS BSD
    # date -j -f ignores Z and interprets the value as LOCAL time, so we
    # force TZ=UTC for the parse. Strip a trailing Z or +HH:MM offset before
    # passing to BSD date (it doesn't understand them).
    started_epoch=$(date -d "$started_iso" +%s 2>/dev/null \
        || TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%S" "${started_iso%%[+.Z]*}" +%s 2>/dev/null \
        || echo "")
    if [ -n "$started_epoch" ]; then
        now_epoch=$(date +%s)
        elapsed=$((now_epoch - started_epoch))
        dur=" ⏱$(fmt_duration "$elapsed")"
    else
        dur=""
    fi

    echo "archon v${ARCHON_VERSION} │ ▶ ${phase} │ ${step_model}${dur} │ session: ${MODEL} │ ${CTX_INT}% ctx"
    return 0
}

# ----- Compose multi-line output ---------------------------------------------

# --- Line 1: dir + git:(branch) + tree state + ahead/behind + clock ----------
# Git calls are guarded by an is-inside-work-tree probe so a non-git cwd skips
# them entirely (keeps the common case fast). All git failures degrade silently
# (detached HEAD → empty branch; no upstream → no ahead/behind).
DIR_NAME=$(basename "$JSON_CWD" 2>/dev/null)
[ -z "$DIR_NAME" ] && DIR_NAME="$JSON_CWD"
GIT_PART=""
GIT_STATUS=""
if git -C "$JSON_CWD" --no-optional-locks rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    branch=$(git -C "$JSON_CWD" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null)
    [ -n "$branch" ] && GIT_PART=" git:(${branch})"

    # Working-tree state: ✓ clean / ✗N with N = changed-file count.
    dirty=$(git -C "$JSON_CWD" --no-optional-locks status --porcelain 2>/dev/null)
    if [ -n "$dirty" ]; then
        n=$(printf '%s\n' "$dirty" | grep -c .)
        GIT_STATUS=" ✗${n}"
    else
        GIT_STATUS=" ✓"
    fi

    # Ahead/behind upstream — rev-list --left-right --count emits "<behind>\t<ahead>".
    ab=$(git -C "$JSON_CWD" --no-optional-locks rev-list --left-right --count '@{upstream}...HEAD' 2>/dev/null)
    if [ -n "$ab" ]; then
        behind=$(printf '%s' "$ab" | awk '{print $1}')
        ahead=$(printf '%s' "$ab" | awk '{print $2}')
        [ -n "$ahead" ]  && [ "$ahead" != "0" ]  && GIT_STATUS="${GIT_STATUS} ↑${ahead}"
        [ -n "$behind" ] && [ "$behind" != "0" ] && GIT_STATUS="${GIT_STATUS} ↓${behind}"
    fi
fi
NOW=$(date +%H:%M 2>/dev/null)
printf "\033[1;32m➜\033[0m  \033[0;36m%s\033[0m\033[1;34m%s\033[0m\033[0;33m%s\033[0m  \033[2;37m🕐 %s\033[0m\n" \
    "$DIR_NAME" "$GIT_PART" "$GIT_STATUS" "$NOW"

# --- Lines 2-3: AF context, built as the single v3.7.3+ line then split on ` │ `
# (first 3 fields → line 2 = version/mode-step/agent; rest → line 3 = model/ctx).
# Keeping the full line in $ARCHON_LINE preserves the exact substring contract.
ARCHON_LINE=$(render_active 2>/dev/null)
if [ -z "$ARCHON_LINE" ]; then
    MODE_STEP="$ARCHON_MODE"
    [ -n "$ARCHON_STEP" ] && MODE_STEP="$ARCHON_MODE $ARCHON_STEP"
    ARCHON_LINE="archon v${ARCHON_VERSION} │ ${MODE_STEP} │ ${ARCHON_AGENT} │ ${MODEL} │ ${CTX_INT}% ctx"
fi
printf '%s\n' "$ARCHON_LINE" | awk -F ' │ ' '{
  l1=""; l2="";
  for (i = 1; i <= NF; i++) {
    if (i <= 3) { l1 = l1 (i > 1 ? " │ " : "") $i }
    else        { l2 = l2 (i > 4 ? " │ " : "") $i }
  }
  print l1;
  if (l2 != "") print l2;
}'

# --- Usage line: rate-limit budget spent + reset times -----------------------
# rate_limits.{five_hour,seven_day}.{used_percentage(0-100),resets_at(epoch s)}.
# Present only for Claude.ai subscribers after the first API response of the
# session → degrades silently when absent. Disable with ARCHON_STATUSLINE_USAGE=0.
if [ "${ARCHON_STATUSLINE_USAGE:-1}" = "1" ]; then
    # Read a nested rate_limits field — jq if present, else grep the one-lined JSON.
    rl_field() {  # $1=five_hour|seven_day  $2=used_percentage|resets_at
        if command -v jq >/dev/null 2>&1; then
            printf '%s' "$input" | jq -r ".rate_limits.$1.$2 // empty" 2>/dev/null
        else
            printf '%s' "$input" | tr '\n' ' ' \
                | grep -o "\"$1\"[[:space:]]*:[[:space:]]*{[^}]*}" \
                | grep -o "\"$2\"[[:space:]]*:[[:space:]]*[0-9.]*" | head -1 | sed 's/.*: *//'
        fi
    }
    # epoch → local time (GNU `date -d @epoch` | BSD `date -r epoch`).
    fmt_epoch() { [ -n "$1" ] || return; date -r "$1" +"$2" 2>/dev/null || date -d "@$1" +"$2" 2>/dev/null; }
    # color a percentage by severity: ≥90 red · ≥70 yellow · else green.
    pct_col() {
        local p="${1%.*}"
        if   [ "${p:-0}" -ge 90 ] 2>/dev/null; then printf '\033[1;31m%s%%\033[0m' "$1"
        elif [ "${p:-0}" -ge 70 ] 2>/dev/null; then printf '\033[0;33m%s%%\033[0m' "$1"
        else printf '\033[0;32m%s%%\033[0m' "$1"; fi
    }

    five_pct=$(rl_field five_hour used_percentage)
    five_rst=$(rl_field five_hour resets_at)
    week_pct=$(rl_field seven_day used_percentage)
    week_rst=$(rl_field seven_day resets_at)

    usage=""
    if [ -n "$five_pct" ]; then
        r=$(fmt_epoch "$five_rst" '%H:%M')
        usage="5h $(pct_col "$five_pct")${r:+ ↻$r}"
    fi
    if [ -n "$week_pct" ]; then
        r=$(fmt_epoch "$week_rst" '%a %H:%M')
        usage="${usage:+$usage │ }7d $(pct_col "$week_pct")${r:+ ↻$r}"
    fi
    [ -n "$usage" ] && printf "⏳ %b\n" "$usage"
fi

# --- Line 4: session metrics — OPT-IN. Cost was pulled from the always-on line
# in v3.7.4 ("visual noise without per-call breakdown"); re-add behind a flag.
# Only renders when ARCHON_STATUSLINE_COST=1 AND at least one field is present.
if [ "$ARCHON_STATUSLINE_COST" = "1" ]; then
    cc_ver=$(parse_str "version")
    cost=$(parse_num "total_cost_usd")
    added=$(parse_num "total_lines_added")
    removed=$(parse_num "total_lines_removed")
    dur_ms=$(parse_num "total_duration_ms")

    parts=""
    [ -n "$cost" ] && parts="💰 $(printf '$%.2f' "$cost" 2>/dev/null || printf '$%s' "$cost")"
    if [ -n "$added" ] || [ -n "$removed" ]; then
        parts="${parts:+$parts │ }\033[0;32m+${added:-0}\033[0m/\033[0;31m-${removed:-0}\033[0m"
    fi
    if [ -n "$dur_ms" ]; then
        ms=${dur_ms%.*}
        secs=$((ms / 1000))
        if   [ "$secs" -ge 3600 ]; then human="$((secs / 3600))h $(((secs % 3600) / 60))m"
        elif [ "$secs" -ge 60 ];   then human="$((secs / 60))m $((secs % 60))s"
        else human="${secs}s"; fi
        parts="${parts:+$parts │ }⏱ ${human}"
    fi
    [ -n "$cc_ver" ] && parts="${parts:+$parts │ }cc ${cc_ver}"

    [ -n "$parts" ] && printf "\033[2;37m%b\033[0m\n" "$parts"
fi

exit 0
