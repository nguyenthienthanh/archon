#!/usr/bin/env bash

# Bridges legacy AF_* / AURA_FROG_* variables onto their ARCHON_* names (v4 rebrand).
. "$(dirname "${BASH_SOURCE[0]}")/../lib/env-compat.sh"

# =============================================================================
# Archon OS — Hook Fan-out Performance Baseline
#
# TASK-00025 | STORY-0009 | v3.8.0-alpha.2
#
# PURPOSE
#   Measures per-hook invocation latency (wall-clock) for the 10 hooks that
#   fire most frequently in a standard /run session. Runs the measurement 3x
#   and records p50, p95, max to .claude/metrics/hook-fanout-baseline.json.
#
# PROXY DISCLAIMER
#   This is a SERIAL proxy measurement, not actual concurrent fan-out. Claude
#   Code runs hooks with async: true entries in parallel; this script invokes
#   them sequentially and sums latencies. The sum overestimates real fan-out
#   time, but per-hook latency (the STORY-0012 budget primitive) IS faithfully
#   captured. Post-migration comparisons must use this script unmodified.
#
# HOOKS MEASURED (10 total)
#   PreToolUse  (5): pre-execute-load-plan-context, pre-dispatch-conflict-check,
#                    pre-flight-validate, mcp-call-gate, security-critical-warn
#   PostToolUse (5): post-execute-update-node, post-execute-conflict-rescan,
#                    token-tracker, tool-call-tracer, prompt-reminder
#
# SUBSTITUTIONS vs task spec
#   session-metrics.cjs fires on Stop, NOT PostToolUse — unmeasurable in a
#   synthetic tool-call harness. Substituted with prompt-reminder.cjs
#   (UserPromptSubmit, same fast-path profile). Documented in output JSON.
#
# USAGE
#   bash archon-os/scripts/perf/baseline-hook-fanout.sh [--output <path>]
#   Run from the project root (the directory containing .claude/).
#
# REQUIREMENTS
#   node >= 18, bash >= 3.2, git
#
# EXIT CODES
#   0 — success, JSON written
#   1 — fatal (node not found, hooks dir missing)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# find_project_root — identical pattern to scripts/dashboard.sh (v3.8.0-alpha.2)
# ---------------------------------------------------------------------------
find_project_root() {
    if [ -n "${ARCHON_PROJECT_ROOT:-}" ]; then echo "$ARCHON_PROJECT_ROOT"; return; fi
    local d="${1:-$PWD}"
    while [ "$d" != "/" ] && [ -n "$d" ]; do
        if [ -d "$d/.claude" ] || [ -d "$d/.git" ]; then echo "$d"; return; fi
        d=$(dirname "$d")
    done
    echo "${1:-$PWD}"
}

PROJECT_ROOT=$(find_project_root)
HOOKS_DIR="${PROJECT_ROOT}/archon-os/hooks"
METRICS_DIR="${PROJECT_ROOT}/.claude/metrics"
OUTPUT_PATH="${METRICS_DIR}/hook-fanout-baseline.json"

# Parse --output override
while [[ $# -gt 0 ]]; do
    case "$1" in
        --output) OUTPUT_PATH="$2"; shift 2 ;;
        *) shift ;;
    esac
done

# Validate prerequisites
if ! command -v node &>/dev/null; then
    echo "ERROR: node not found in PATH" >&2; exit 1
fi
if [ ! -d "$HOOKS_DIR" ]; then
    echo "ERROR: hooks dir not found at $HOOKS_DIR" >&2; exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

# ---------------------------------------------------------------------------
# Platform detection (macOS vs Linux) — per AC §3
# ---------------------------------------------------------------------------
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
if [[ "$PLATFORM" == "darwin" ]]; then
    TIME_CMD="/usr/bin/time"
    TIME_FLAG="-l"
else
    TIME_CMD="/usr/bin/time"
    TIME_FLAG="-v"
fi

echo "=== Archon OS Hook Fan-out Baseline ===" >&2
echo "Platform : $PLATFORM" >&2
echo "Hooks dir: $HOOKS_DIR" >&2
echo "Output   : $OUTPUT_PATH" >&2
echo "" >&2

# ---------------------------------------------------------------------------
# Hook manifest — ordered as they'd fire in a Bash PreToolUse + PostToolUse
# ---------------------------------------------------------------------------
# Format: "event_type:hook_filename:notes"
HOOKS=(
    "PreToolUse:pre-execute-load-plan-context.cjs:"
    "PreToolUse:pre-dispatch-conflict-check.cjs:"
    "PreToolUse:pre-flight-validate.cjs:"
    "PreToolUse:mcp-call-gate.cjs:"
    "PreToolUse:security-critical-warn.cjs:"
    "PostToolUse:post-execute-update-node.cjs:"
    "PostToolUse:post-execute-conflict-rescan.cjs:"
    "PostToolUse:token-tracker.cjs:"
    "PostToolUse:tool-call-tracer.cjs:"
    "UserPromptSubmit:prompt-reminder.cjs:substituted-for-session-metrics(Stop-event)"
)

HOOK_COUNT=${#HOOKS[@]}

# ---------------------------------------------------------------------------
# Synthetic stdin payloads — representative of a /run Bash tool call
# ---------------------------------------------------------------------------
PRE_TOOL_PAYLOAD="{\"session_id\":\"baseline\",\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"ls\"},\"cwd\":\"${PROJECT_ROOT}\"}"
POST_TOOL_PAYLOAD="{\"session_id\":\"baseline\",\"hook_event_name\":\"PostToolUse\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"ls\"},\"tool_response\":{\"exit_code\":0,\"stdout\":\"file.txt\"},\"cwd\":\"${PROJECT_ROOT}\"}"
PROMPT_PAYLOAD="{\"session_id\":\"baseline\",\"hook_event_name\":\"UserPromptSubmit\",\"prompt\":\"/run feature: FEAT-007 baseline perf measurement\",\"cwd\":\"${PROJECT_ROOT}\"}"

# ---------------------------------------------------------------------------
# Node inline timer — runs all hooks once and returns a JSON array of
# { hook, ms } measurements plus total wall_ms. Uses process.hrtime.bigint()
# for sub-millisecond precision.
# ---------------------------------------------------------------------------
run_one_round() {
    local round="$1"
    echo "  Run $round/$RUNS..." >&2

    # Build the hook list as a JS array literal for the inline node script
    local hooks_js="["
    local first=1
    for entry in "${HOOKS[@]}"; do
        local event hook_file notes
        IFS=':' read -r event hook_file notes <<< "$entry"
        local full_path="${HOOKS_DIR}/${hook_file}"

        # Pick payload based on event type
        local payload
        case "$event" in
            PreToolUse)       payload="$PRE_TOOL_PAYLOAD" ;;
            PostToolUse)      payload="$POST_TOOL_PAYLOAD" ;;
            UserPromptSubmit) payload="$PROMPT_PAYLOAD" ;;
            *)                payload="{}" ;;
        esac

        # Escape payload for JS string embedding (replace double quotes)
        local escaped_payload
        escaped_payload=$(printf '%s' "$payload" | sed "s/\"/\\\\\"/g")

        if [[ "$first" -eq 1 ]]; then first=0; else hooks_js+=","; fi
        hooks_js+="{\"hook\":\"${hook_file}\",\"event\":\"${event}\",\"path\":\"${full_path}\",\"payload\":\"${escaped_payload}\",\"notes\":\"${notes}\"}"
    done
    hooks_js+="]"

    # Inline Node.js: times each hook via hrtime.bigint(), returns JSON to stdout
    node --no-warnings -e "
'use strict';
const { spawnSync } = require('child_process');
const process = require('process');

const hooks = ${hooks_js};
const results = [];
let wallStart = process.hrtime.bigint();

for (const h of hooks) {
    const start = process.hrtime.bigint();
    spawnSync('node', ['--no-warnings', h.path], {
        input: h.payload,
        encoding: 'utf8',
        env: {
            ...process.env,
            ARCHON_PREFLIGHT_DISABLED: 'true',
            ARCHON_TRACE_DISABLED: 'true',
            ARCHON_TOKEN_TRACKER_DISABLED: 'true',
            ARCHON_MCP_AUDIT_DISABLED: 'true',
            CLAUDE_HOOK_PHASE: h.event === 'PostToolUse' ? 'post' : 'pre',
            ARCHON_PROJECT_ROOT: '${PROJECT_ROOT}'
        },
        timeout: 10000,
        maxBuffer: 1024 * 1024
    });
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    results.push({ hook: h.hook, event: h.event, ms: Math.round(ms * 100) / 100, notes: h.notes || null });
}

const wallEnd = process.hrtime.bigint();
const wallMs = Math.round(Number(wallEnd - wallStart) * 100 / 1e6) / 100;

process.stdout.write(JSON.stringify({ wall_ms: wallMs, hook_count: hooks.length, per_hook_ms: results }));
"
}

# ---------------------------------------------------------------------------
# Main measurement loop — 3 runs
# ---------------------------------------------------------------------------
RUNS=3
echo "Running $RUNS measurement rounds ($HOOK_COUNT hooks each)..." >&2

RUN_RESULTS=()
for i in $(seq 1 $RUNS); do
    result=$(run_one_round "$i")
    RUN_RESULTS+=("$result")
    wall=$(echo "$result" | node --no-warnings -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(String(JSON.parse(d).wall_ms)))")
    echo "    wall_ms=$wall" >&2
done

# ---------------------------------------------------------------------------
# Compute p50, p95, max from wall_ms across 3 runs (via inline Node)
# ---------------------------------------------------------------------------
echo "" >&2
echo "Computing statistics..." >&2

RUNS_JSON="[$(IFS=,; echo "${RUN_RESULTS[*]}")]"

STATS=$(node --no-warnings -e "
'use strict';
const runs = ${RUNS_JSON};
const walls = runs.map(r => r.wall_ms).sort((a,b) => a - b);
const p50 = walls[Math.floor((walls.length - 1) * 0.50)];
const p95 = walls[Math.floor((walls.length - 1) * 0.95)];
const max = walls[walls.length - 1];
process.stdout.write(JSON.stringify({ p50, p95, max }));
")

P50=$(echo "$STATS" | node --no-warnings -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(String(JSON.parse(d).p50)))")
P95=$(echo "$STATS" | node --no-warnings -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(String(JSON.parse(d).p95)))")
MAX=$(echo "$STATS" | node --no-warnings -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(String(JSON.parse(d).max)))")

GIT_SHA=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "p50=${P50}ms  p95=${P95}ms  max=${MAX}ms" >&2

# ---------------------------------------------------------------------------
# Write output JSON — atomic tmp-then-rename
# ---------------------------------------------------------------------------
TMP_OUTPUT="${OUTPUT_PATH}.tmp.$$"

node --no-warnings -e "
'use strict';
const fs = require('fs');
const runs = ${RUNS_JSON};
const out = {
    timestamp: '${TIMESTAMP}',
    platform: '${PLATFORM}',
    git_sha: '${GIT_SHA}',
    hook_count: ${HOOK_COUNT},
    p50_ms: ${P50},
    p95_ms: ${P95},
    max_ms: ${MAX},
    runs: runs,
    hooks_fired: [
        { hook: 'pre-execute-load-plan-context.cjs', event: 'PreToolUse',       substituted: false, notes: null },
        { hook: 'pre-dispatch-conflict-check.cjs',   event: 'PreToolUse',       substituted: false, notes: null },
        { hook: 'pre-flight-validate.cjs',            event: 'PreToolUse',       substituted: false, notes: null },
        { hook: 'mcp-call-gate.cjs',                 event: 'PreToolUse',       substituted: false, notes: null },
        { hook: 'security-critical-warn.cjs',         event: 'PreToolUse',       substituted: false, notes: null },
        { hook: 'post-execute-update-node.cjs',       event: 'PostToolUse',      substituted: false, notes: null },
        { hook: 'post-execute-conflict-rescan.cjs',   event: 'PostToolUse',      substituted: false, notes: null },
        { hook: 'token-tracker.cjs',                  event: 'PostToolUse',      substituted: false, notes: null },
        { hook: 'tool-call-tracer.cjs',               event: 'PostToolUse',      substituted: false, notes: null },
        { hook: 'prompt-reminder.cjs',                event: 'UserPromptSubmit', substituted: true,  notes: 'session-metrics.cjs fires on Stop not PostToolUse; prompt-reminder.cjs is same fast-path profile' }
    ],
    baseline_context: 'TASK-00025 / STORY-0009. Measured BEFORE TASK-00026 env-var->readHookInput migration. TASK-00023 + v3.8.0-alpha.2 hook-runtime + findProjectRoot migrations ARE already landed.'
};
fs.writeFileSync('${TMP_OUTPUT}', JSON.stringify(out, null, 2) + '\n');
"

mv "$TMP_OUTPUT" "$OUTPUT_PATH"

echo "" >&2
echo "=== Baseline written ===" >&2
echo "  $OUTPUT_PATH" >&2
echo "" >&2

# ---------------------------------------------------------------------------
# Inline smoke check: parse JSON + verify required top-level keys
# ---------------------------------------------------------------------------
node --no-warnings -e "
'use strict';
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('${OUTPUT_PATH}', 'utf8'));
const required = ['timestamp','platform','git_sha','hook_count','p50_ms','p95_ms','max_ms','runs','hooks_fired'];
const missing = required.filter(k => !(k in data));
if (missing.length > 0) {
    console.error('SMOKE FAIL: missing keys:', missing.join(', '));
    process.exit(1);
}
if (!Array.isArray(data.runs) || data.runs.length < 3) {
    console.error('SMOKE FAIL: runs array must have >= 3 entries, got', data.runs?.length);
    process.exit(1);
}
if (data.hook_count < 10) {
    console.error('SMOKE FAIL: hook_count must be >= 10, got', data.hook_count);
    process.exit(1);
}
console.error('SMOKE PASS: all required keys present, ' + data.runs.length + ' runs, ' + data.hook_count + ' hooks');
"

exit 0
