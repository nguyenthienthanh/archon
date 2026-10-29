#!/usr/bin/env bash
# Shared helpers for plan-tree backing scripts (sourced, not executed).
# All functions are pure-bash + standard POSIX utilities (awk, sed, find, grep, mv).

# ---------------------------------------------------------------------------
# plans_dir [explicit_path]
#   Resolve the plans dir. Resolution order (v3.7.3+):
#     1. Explicit positional arg (caller passed it)
#     2. $AF_PLANS_DIR env var
#     3. Default ".claude/plans"
#   An explicit path may be the plans dir itself OR a project root containing
#   .claude/plans (or legacy .aura/plans); both resolve correctly.
#     4. Legacy fallback ".aura/plans" (if it exists and .claude/plans does not)
#   The legacy fallback is removed in v4.0.
# ---------------------------------------------------------------------------
plans_dir() {
    if [ -n "${1:-}" ]; then
        # Accept EITHER a plans dir or a project root. Sibling scripts disagree
        # on what their positional means (new-plan.sh documents `[project-root]`,
        # this family documents `[plans-dir]`), and passing the wrong one used to
        # resolve to a path with no nodes — which the validator then reported as
        # a clean tree. Resolving both shapes removes the footgun instead of
        # relying on every caller remembering which script it is talking to.
        if [ -d "$1/.claude/plans" ]; then
            echo "$1/.claude/plans"
            return 0
        fi
        if [ -d "$1/.aura/plans" ]; then
            echo "$1/.aura/plans"
            return 0
        fi
        echo "$1"
        return 0
    fi
    if [ -n "${AF_PLANS_DIR:-}" ]; then
        echo "${AF_PLANS_DIR}"
        return 0
    fi
    if [ -d ".claude/plans" ]; then
        echo ".claude/plans"
        return 0
    fi
    if [ -d ".aura/plans" ]; then
        # Legacy fallback — warn to stderr but allow.
        echo "⚠ Using legacy .aura/plans — migrate to .claude/plans (removal v4.0)" >&2
        echo ".aura/plans"
        return 0
    fi
    echo ".claude/plans"
}

# ---------------------------------------------------------------------------
# security_dir [explicit_path]
#   Resolve the security dir (home of mcp-audit.jsonl). Shell mirror of
#   hooks/lib/security-dir.cjs — the two MUST agree, since mcp-call-gate.cjs
#   writes the log and dashboard.sh reads it.
#     1. Explicit positional arg (caller passed it)
#     2. $AF_SECURITY_DIR env var
#     3. ".claude/security" if it exists
#     4. ".aura/security" — the current default, and where every install has it
#   Flipping (3) to be the default for fresh projects relocates a security audit
#   trail, so it is a maintainer call, not a mechanical one. See the note in
#   hooks/lib/security-dir.cjs.
# ---------------------------------------------------------------------------
security_dir() {
    if [ -n "${1:-}" ]; then
        echo "$1"
        return 0
    fi
    if [ -n "${AF_SECURITY_DIR:-}" ]; then
        echo "${AF_SECURITY_DIR}"
        return 0
    fi
    if [ -d ".claude/security" ]; then
        echo ".claude/security"
        return 0
    fi
    echo ".aura/security"
}

# ---------------------------------------------------------------------------
# slugify <text>
#   Lower-case, ASCII-only, hyphen-separated. Used in feature/story/task
#   folder names: ${ID}_${slug}/.
# ---------------------------------------------------------------------------
slugify() {
    echo "$1" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' \
        | cut -c1-50
}

# ---------------------------------------------------------------------------
# feature_folder <id> <intent> [parent_feature_id] [parent_intent]
#   Compose the canonical feature folder *segment*. If parent_feature_id is
#   given, the segment is `{PARENT_FOLDER}/subfeatures/{ID}_{slug}` so the
#   caller can drop it under `features/` and land on the nested path. Used by
#   `new-plan.sh` and `expand-node.sh` when a T2 is decomposed into child T2
#   subfeatures rather than directly into T3 stories.
#
#   With no parent → "{ID}_{slug}"   (top-level feature)
#   With parent    → "{PARENT_ID}_{parent_slug}/subfeatures/{ID}_{slug}"
# ---------------------------------------------------------------------------
feature_folder() {
    local id="$1"; local intent="${2:-}"
    local parent_id="${3:-}"; local parent_intent="${4:-}"
    local slug; slug=$(slugify "$intent")
    [ -z "$slug" ] && slug="unnamed"
    if [ -n "$parent_id" ]; then
        local parent_slug; parent_slug=$(slugify "$parent_intent")
        [ -z "$parent_slug" ] && parent_slug="unnamed"
        echo "${parent_id}_${parent_slug}/subfeatures/${id}_${slug}"
    else
        echo "${id}_${slug}"
    fi
}

# ---------------------------------------------------------------------------
# find_feature_path <plans_dir> <feature_id>
#   Locate a feature folder under `<plans_dir>/features/`. Walks both
#   `features/{ID}_*` (top-level) AND `features/*/subfeatures/{ID}_*` (nested
#   under a parent feature). Prints the absolute folder path on success.
#   Empty + exit 1 if not found. Exit 2 on multiple matches (caller decides).
# ---------------------------------------------------------------------------
find_feature_path() {
    local plans_dir="$1"; local fid="$2"
    [ -z "$plans_dir" ] || [ -z "$fid" ] && return 1
    local features_root="${plans_dir}/features"
    [ -d "$features_root" ] || return 1
    # maxdepth 4 covers `features/<top>/subfeatures/<child>/`. Restrict to
    # directories whose name matches `{ID}_*`.
    local matches
    matches=$(find "$features_root" -maxdepth 4 -type d -name "${fid}_*" 2>/dev/null)
    [ -z "$matches" ] && return 1
    local count; count=$(printf '%s\n' "$matches" | grep -c .)
    printf '%s\n' "$matches"
    if [ "$count" -gt 1 ]; then return 2; fi
    return 0
}

# ---------------------------------------------------------------------------
# now_utc
#   Current time as ISO-8601 UTC.
# ---------------------------------------------------------------------------
now_utc() {
    date -u +%Y-%m-%dT%H:%M:%SZ
}

# ---------------------------------------------------------------------------
# get_field <file> <field>
#   Extract scalar frontmatter field (between first --- pair).
# ---------------------------------------------------------------------------
get_field() {
    local file="$1"; local field="$2"
    awk -v f="$field" '
        /^---$/ { c++; next }
        c == 1 && $1 == f":" {
            sub(/^[^:]*: */, ""); sub(/^["'"'"']/, ""); sub(/["'"'"']$/, "")
            print; exit
        }
    ' "$file" 2>/dev/null
}

# ---------------------------------------------------------------------------
# get_list <file> <field>
#   Extract inline-list frontmatter field (e.g. children: [A, B]).
# ---------------------------------------------------------------------------
get_list() {
    local file="$1"; local field="$2"
    awk -v f="$field" '
        /^---$/ { c++; next }
        c == 1 && $1 == f":" {
            sub(/^[^:]*: */, "")
            gsub(/[\[\]]/, "")
            gsub(/, */, "\n")
            print; exit
        }
    ' "$file" 2>/dev/null
}

# ---------------------------------------------------------------------------
# set_field <file> <field> <value>
#   Update an existing frontmatter scalar in-place (atomic). Adds if missing.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# graph_index_update <node_file>
#   Refresh one node's entry in <plans_dir>/graph-index.json after a mutation.
#
#   The index is OPT-IN: it is only maintained once a project has run a
#   --rebuild, so a project that never opted in pays a handful of `[ -f ]`
#   tests here and nothing else — no node spawn, no behaviour change. That is
#   also why the plans dir is discovered by walking UP for the index file
#   rather than being passed in: set_field's callers only ever hand it a path.
#
#   Best-effort throughout. A mutation must never fail because a cache could
#   not be updated, and a stale index is caught by the readers' staleness check.
#   Disable: AF_GRAPH_INDEX_DISABLED=true
# ---------------------------------------------------------------------------
_AF_VAULT_INDEX_CJS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../hooks/lib" 2>/dev/null && pwd)/vault-index.cjs"

graph_index_update() {
    [ "${AF_GRAPH_INDEX_DISABLED:-}" = "true" ] && return 0
    local file="$1"
    [ -n "$file" ] && [ -f "$file" ] || return 0
    case "$file" in *.md) ;; *) return 0 ;; esac

    local dir depth=0
    dir=$(cd "$(dirname "$file")" 2>/dev/null && pwd) || return 0
    while [ -n "$dir" ] && [ "$dir" != "/" ] && [ "$depth" -lt 8 ]; do
        if [ -f "${dir}/graph-index.json" ]; then
            [ -f "$_AF_VAULT_INDEX_CJS" ] || return 0
            command -v node >/dev/null 2>&1 || return 0
            node "$_AF_VAULT_INDEX_CJS" --plans-dir "$dir" --update "$file" >/dev/null 2>&1 || true
            return 0
        fi
        dir=$(dirname "$dir")
        depth=$((depth + 1))
    done
    return 0
}

# ---------------------------------------------------------------------------
# graph_index_rebuild <plans_dir>
#   Full rescan → graph-index.json (atomic). This is how a project opts in, and
#   how a stale index self-heals. Returns non-zero if it could not be written.
# ---------------------------------------------------------------------------
graph_index_rebuild() {
    local plans="$1"
    [ "${AF_GRAPH_INDEX_DISABLED:-}" = "true" ] && return 1
    [ -f "$_AF_VAULT_INDEX_CJS" ] || return 1
    command -v node >/dev/null 2>&1 || return 1
    node "$_AF_VAULT_INDEX_CJS" --plans-dir "$plans" --rebuild >/dev/null 2>&1
}

# ---------------------------------------------------------------------------
# graph_index_ready <plans_dir> <story_id>
#   Print "ID<TAB>abs_path" for each dispatchable T4 under <story_id>, straight
#   from the index. Returns non-zero when the index is absent or stale — the
#   caller then runs its own scan, which is always correct, just slower.
# ---------------------------------------------------------------------------
graph_index_ready() {
    local plans="$1"; local story="$2"
    [ "${AF_GRAPH_INDEX_DISABLED:-}" = "true" ] && return 1
    [ -f "${plans}/graph-index.json" ] || return 1
    [ -f "$_AF_VAULT_INDEX_CJS" ] || return 1
    command -v node >/dev/null 2>&1 || return 1
    local out
    out=$(node "$_AF_VAULT_INDEX_CJS" --plans-dir "$plans" --ready "$story" 2>/dev/null) || return 1
    # Re-anchor the relative paths the index stores onto this plans dir.
    printf '%s' "$out" | awk -F'\t' -v p="$plans" 'NF==2 && $1 != "" { print $1 "\t" p "/" $2 }'
}

# ---------------------------------------------------------------------------
# graph_index_render <plans_dir>
#   Print the ASCII tree straight from the index. Returns non-zero (printing
#   nothing) when the index is absent, stale, empty or disabled, so the caller
#   can fall back to its own filesystem walk.
# ---------------------------------------------------------------------------
graph_index_render() {
    local plans="$1"
    [ "${AF_GRAPH_INDEX_DISABLED:-}" = "true" ] && return 1
    [ -f "${plans}/graph-index.json" ] || return 1
    [ -f "$_AF_VAULT_INDEX_CJS" ] || return 1
    command -v node >/dev/null 2>&1 || return 1
    node "$_AF_VAULT_INDEX_CJS" --plans-dir "$plans" --render 2>/dev/null
}

set_field() {
    local file="$1"; local field="$2"; local value="$3"
    local tmp="${file}.tmp.$$"
    awk -v f="$field" -v v="$value" '
        BEGIN { in_fm=0; replaced=0 }
        /^---$/ {
            if (in_fm == 0) { in_fm=1; print; next }
            if (in_fm == 1) {
                if (!replaced) print f ": " v
                in_fm=2; print; next
            }
        }
        in_fm == 1 && $1 == f":" {
            print f ": " v
            replaced=1
            next
        }
        { print }
    ' "$file" > "$tmp"
    mv "$tmp" "$file"
    graph_index_update "$file"
}

# ---------------------------------------------------------------------------
# atomic_write <target_file> <content>
#   Write content to a tmp file then rename. Prevents partial writes.
# ---------------------------------------------------------------------------
atomic_write() {
    local target="$1"; local content="$2"
    local tmp="${target}.tmp.$$"
    printf '%s' "$content" > "$tmp"
    mv "$tmp" "$target"
}

# ---------------------------------------------------------------------------
# read_active_field <plans_dir> <field>
#   Read active.<field> from active.json (mission|initiative|feature|story|task).
# ---------------------------------------------------------------------------
read_active_field() {
    local plans="$1"; local field="$2"
    local file="${plans}/active.json"
    [ -f "$file" ] || return 1
    local val
    val=$(grep -oE "\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]+\"" "$file" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
    [ "$val" = "null" ] && return 1
    [ -z "$val" ] && return 1
    echo "$val"
}

# ---------------------------------------------------------------------------
# set_active_field <plans_dir> <field> <value>
#   Mutate active.<field>. Falsy value (- or "" or null) sets JSON null.
#   Uses python if available for safety; falls back to two-step sed.
# ---------------------------------------------------------------------------
set_active_field() {
    local plans="$1"; local field="$2"; local value="$3"
    local file="${plans}/active.json"
    [ -f "$file" ] || return 1
    local tmp="${file}.tmp.$$"
    local now; now=$(now_utc)

    if command -v python3 >/dev/null 2>&1; then
        python3 - "$file" "$field" "$value" "$now" "$tmp" <<'PYEOF'
import json, sys
src, field, value, now, dst = sys.argv[1:6]
with open(src) as fh:
    data = json.load(fh)
data.setdefault("active", {})
if value in ("", "null", "-"):
    data["active"][field] = None
else:
    data["active"][field] = value
data["updated_at"] = now
with open(dst, "w") as fh:
    json.dump(data, fh, indent=2)
PYEOF
        mv "$tmp" "$file"
        return 0
    fi

    # Pure-sed fallback. Two passes: replace string value, then null value.
    # Escape sed-replacement metacharacters (\, &, and the # delimiter) in the
    # value so a value containing them can't corrupt active.json structurally.
    local replacement sed_val
    sed_val=$(printf '%s' "$value" | sed 's/[\\&#]/\\&/g')
    if [ -z "$value" ] || [ "$value" = "null" ] || [ "$value" = "-" ]; then
        replacement="\"${field}\": null"
    else
        replacement="\"${field}\": \"${sed_val}\""
    fi
    sed -E "s#\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"#${replacement}#" "$file" | \
        sed -E "s#\"${field}\"[[:space:]]*:[[:space:]]*null#${replacement}#" | \
        sed -E "s#\"updated_at\"[[:space:]]*:[[:space:]]*\"[^\"]+\"#\"updated_at\": \"${now}\"#" \
        > "$tmp"
    mv "$tmp" "$file"
}

# ---------------------------------------------------------------------------
# append_history <plans_dir> <event_json>
#   Append a single JSON line to history.jsonl. Caller passes the full record.
# ---------------------------------------------------------------------------
append_history() {
    local plans="$1"; local event="$2"
    local file="${plans}/history.jsonl"
    touch "$file"
    printf '%s\n' "$event" >> "$file"
}

# ---------------------------------------------------------------------------
# save_checkpoint <plans_dir> <node_id> <node_file>
#   Snapshot a node's pre-mutation state. v3.7.3+ co-locates the checkpoint
#   inside the node's own folder: <node_folder>/checkpoints/<ISO8601>.json
#   Falls back to global plans/checkpoints/{ID}_legacy/{ISO}.json for nodes
#   whose file path is unknown (rare — only when called with a path under
#   archive/ which is read-only anyway).
#   Returns the checkpoint path on stdout.
# ---------------------------------------------------------------------------
save_checkpoint() {
    local plans="$1"; local node_id="$2"; local node_file="$3"
    local ts; ts=$(now_utc)
    local safe_ts; safe_ts=$(echo "$ts" | tr ':' '-')
    local ckpt_dir
    if [ -n "$node_file" ] && [ -f "$node_file" ]; then
        # Co-locate inside the node's own folder.
        ckpt_dir="$(dirname "$node_file")/checkpoints"
    else
        # Fallback (legacy / orphan checkpoints).
        ckpt_dir="${plans}/checkpoints/${node_id}_legacy"
    fi
    mkdir -p "$ckpt_dir"
    local ckpt="${ckpt_dir}/${safe_ts}.json"
    local git_sha=""
    if command -v git >/dev/null 2>&1 && git rev-parse HEAD >/dev/null 2>&1; then
        git_sha=$(git rev-parse HEAD)
    fi
    local body_b64=""
    if [ -f "$node_file" ]; then
        body_b64=$(base64 < "$node_file" | tr -d '\n')
    fi
    cat > "$ckpt" <<EOF
{
  "schema_version": 1,
  "node_id": "${node_id}",
  "node_file": "${node_file}",
  "saved_at": "${ts}",
  "git_sha": "${git_sha}",
  "node_state_before_b64": "${body_b64}"
}
EOF
    echo "$ckpt"
}

# ---------------------------------------------------------------------------
# validate_tree <plans_dir>
#   Run validate-plan-tree.sh — returns its exit code.
# ---------------------------------------------------------------------------
validate_tree() {
    local plans="$1"
    local script_dir; script_dir=$(dirname "${BASH_SOURCE[0]}")
    bash "${script_dir}/validate-plan-tree.sh" "$plans"
}

# ---------------------------------------------------------------------------
# tree_violation_count <plans_dir>
#   Count current invariant violations (exit-1 lines from validator). Returns 0
#   if tree is valid, N if N violations. Used by mutators to detect REGRESSIONS
#   rather than pre-existing damage: only roll back if (after > before).
# ---------------------------------------------------------------------------
tree_violation_count() {
    local plans="$1"
    local script_dir; script_dir=$(dirname "${BASH_SOURCE[0]}")
    bash "${script_dir}/validate-plan-tree.sh" "$plans" 2>/dev/null | grep -c '^✗ INVARIANT' || true
}

# ---------------------------------------------------------------------------
# require_no_regression <plans_dir> <before_count>
#   Compare current violation count vs baseline. Echo "regression" + return 1
#   if increased. Otherwise return 0.
# ---------------------------------------------------------------------------
require_no_regression() {
    local plans="$1"; local before="$2"
    local after; after=$(tree_violation_count "$plans")
    if [ "$after" -gt "$before" ]; then
        echo "validation REGRESSED: ${before} → ${after} violations" >&2
        return 1
    fi
    return 0
}

# ---------------------------------------------------------------------------
# _stat_mtime <path>
#   Portable mtime-in-epoch-seconds (BSD/macOS `stat -f`, GNU `stat -c`).
#   Echoes 0 if the path is gone. Internal helper for with_lock stale detection.
# ---------------------------------------------------------------------------
_stat_mtime() {
    stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0
}

# ---------------------------------------------------------------------------
# _re_escape <string>
#   Backslash-escape ERE metacharacters so a value (e.g. a RUN_ID that may
#   contain `.`, `+`, …) can be matched literally inside grep -E / awk regexes.
#   Prevents a run id from matching or replacing the wrong `## Runs` row.
# ---------------------------------------------------------------------------
_re_escape() {
    printf '%s' "$1" | sed 's/[][\.^$*+?(){}|]/\\&/g'
}

# ---------------------------------------------------------------------------
# _json_escape <string>
#   Escape a string for embedding inside a JSON double-quoted value (produces
#   the inner content, WITHOUT the surrounding quotes). Handles backslash,
#   double-quote, and control characters via python3; falls back to sed
#   (backslash FIRST, then quote) when python3 is unavailable. Prevents a
#   note/value containing '\' or '"' from corrupting history.jsonl.
# ---------------------------------------------------------------------------
_json_escape() {
    printf '%s' "$1" | python3 -c 'import json,sys; sys.stdout.write(json.dumps(sys.stdin.read())[1:-1])' 2>/dev/null \
        || printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# ---------------------------------------------------------------------------
# with_lock <lock_path> <cmd> [args...]
#   Portable mutual exclusion around a critical section. Runs <cmd args...>
#   while holding the lock, releases it, and propagates stdout + exit code.
#
#   Two backends, in preference order:
#     1. flock(1) — kernel-managed. The lock lives on an fd and the kernel
#        releases it when the fd closes, INCLUDING on crash. No staleness
#        heuristic exists, so there is no window in which a live holder's lock
#        can be stolen. Present on Linux (and CI); NOT stock on macOS.
#     2. _with_lock_mkdir — the portable mkdir spinlock fallback (see below).
#
#   Why this matters: any age-based stale-break can mistake a live-but-off-CPU
#   holder for a crashed one, admit a second writer into the critical section,
#   and mint DUPLICATE counter IDs (the P0-4 bug). flock removes that class of
#   race outright; the mkdir fallback merely narrows it (liveness gating).
#
#   Tunables: AF_LOCK_TIMEOUT_SEC (default 10) — the max spin budget.
#             AF_LOCK_STALE_SEC   (default max(timeout,60)) — age after which a
#             lock with NO live holder recorded is force-broken.
#
#   Stale-break is liveness-gated, NOT age-only. A holder writes its PID into
#   the lock dir; a waiter breaks the lock only when that PID is dead (crash) or,
#   for the tiny mkdir→pid-write window with no PID yet, after AF_LOCK_STALE_SEC.
#   Age-only breaking (the previous behaviour) let a waiter steal the lock from a
#   live-but-CPU-starved holder under heavy parallel load, admitting two writers
#   into the critical section and minting DUPLICATE counter IDs — the P0-4 bug
#   this guards against, which resurfaced as a flaky test under oversubscribed CI.
#
#   Shared single implementation: reused by counter minting (next_counter) and
#   transactional plan-tree writes (STORY-0023 link-run) — do not fork it.
# ---------------------------------------------------------------------------
with_lock() {
    local lock="$1"; shift
    local timeout="${AF_LOCK_TIMEOUT_SEC:-10}"

    # Backend 1: flock(1). Guard the fd open with a subshell probe first — a
    # failed `exec` redirection is fatal to a non-interactive shell.
    # The lock token is a separate `.flock` FILE, deliberately not the `$lock`
    # path itself: the mkdir backend needs `$lock` to be a directory, so a stray
    # lock FILE left by a flock host (Linux) would otherwise wedge mkdir forever
    # on a shared checkout (macOS). The 0-byte file is never deleted — unlinking
    # a flock token is itself racy.
    if command -v flock >/dev/null 2>&1; then
        local lf="${lock}.flock"
        if ( : >> "$lf" ) 2>/dev/null; then
            exec 9>>"$lf"
            if flock -x -w "$timeout" 9 2>/dev/null; then
                "$@"
                local rc=$?
                exec 9>&-          # close fd → kernel releases the lock
                return "$rc"
            fi
            exec 9>&-
            echo "with_lock: timed out acquiring $lf" >&2
            return 1
        fi
    fi

    # Backend 2: portable mkdir spinlock.
    _with_lock_mkdir "$lock" "$@"
}

# ---------------------------------------------------------------------------
# _with_lock_mkdir <lock_dir> <cmd> [args...]
#   mkdir-based spinlock fallback for hosts without flock(1) (e.g. stock macOS).
#   Stale-break is liveness-gated: the holder records its PID in the lock dir and
#   a waiter breaks the lock only once that PID is dead, or — for the sub-ms
#   mkdir→pid-write window where no PID exists yet — after AF_LOCK_STALE_SEC
#   (default max(timeout,60)). Never age-breaks a lock whose holder is alive.
# ---------------------------------------------------------------------------
_with_lock_mkdir() {
    local lock="$1"; shift
    local timeout="${AF_LOCK_TIMEOUT_SEC:-10}"
    local stale="${AF_LOCK_STALE_SEC:-$(( timeout > 60 ? timeout : 60 ))}"
    local waited=0
    local max_spins=$(( timeout * 20 ))   # 20 spins/sec at 0.05s each
    while ! mkdir "$lock" 2>/dev/null; do
        if [ -d "$lock" ]; then
            local holder; holder=$(cat "$lock/pid" 2>/dev/null)
            if [ -n "$holder" ]; then
                # A live holder — even one starved off-CPU for a long time — must
                # NEVER have its lock stolen. Only break it once the PID is dead.
                if ! kill -0 "$holder" 2>/dev/null; then
                    rm -rf "$lock" 2>/dev/null
                    continue
                fi
            else
                # No PID recorded: either the sub-millisecond window between
                # mkdir and the pid write, or a holder that died before writing.
                # Break only after a generous staleness age (never at ~0s).
                local age=$(( $(date +%s) - $(_stat_mtime "$lock") ))
                if [ "$age" -ge "$stale" ]; then
                    rm -rf "$lock" 2>/dev/null
                    continue
                fi
            fi
        fi
        sleep 0.05
        waited=$(( waited + 1 ))
        if [ "$waited" -ge "$max_spins" ]; then
            echo "with_lock: timed out acquiring $lock" >&2
            return 1
        fi
    done
    # Record the real holder PID for liveness checks. BASHPID is the true PID of
    # this (sub)shell on bash 4+ (CI); $$ is the fallback on bash 3.2 (macOS),
    # where it is the parent — still safe (kill -0 stays true → never steals).
    printf '%s\n' "${BASHPID:-$$}" > "$lock/pid" 2>/dev/null || true
    "$@"
    local rc=$?
    rm -rf "$lock" 2>/dev/null
    return "$rc"
}

# ---------------------------------------------------------------------------
# next_counter <plans_dir> <kind>
#   Atomically increment .counters.json counter for INIT|FEAT|STORY|TASK|CONFLICT|DEC.
#   Returns the NEW counter value on stdout. Concurrency-safe: the whole
#   read-modify-write runs under with_lock() with a mktemp write (no in-place
#   clobber). Returns non-zero if the counter key is absent (rather than
#   silently minting "1" forever).
# ---------------------------------------------------------------------------
_next_counter_locked() {
    local plans="$1"; local kind="$2"
    local file="${plans}/.counters.json"
    local current
    current=$(grep -oE "\"${kind}\"[[:space:]]*:[[:space:]]*[0-9]+" "$file" | head -1 | grep -oE '[0-9]+$')
    if [ -z "$current" ]; then
        echo "next_counter: counter key '${kind}' not found in ${file}" >&2
        return 1
    fi
    local next=$((current + 1))
    local now; now=$(now_utc)
    local tmp; tmp=$(mktemp "${file}.XXXXXX") || return 1
    if sed -E "s|\"${kind}\"[[:space:]]*:[[:space:]]*[0-9]+|\"${kind}\": ${next}|" "$file" | \
        sed -E "s|\"updated_at\"[[:space:]]*:[[:space:]]*\"[^\"]+\"|\"updated_at\": \"${now}\"|" \
        > "$tmp"; then
        mv "$tmp" "$file"
        echo "$next"
    else
        rm -f "$tmp" 2>/dev/null
        return 1
    fi
}

next_counter() {
    local plans="$1"; local kind="$2"
    local file="${plans}/.counters.json"
    [ -f "$file" ] || { echo "no .counters.json" >&2; return 1; }
    with_lock "${file}.lock" _next_counter_locked "$plans" "$kind"
}

# ---------------------------------------------------------------------------
# bump_revision <node_file>
#   Increment the `revision` field by 1 (or set to 1 if missing).
# ---------------------------------------------------------------------------
bump_revision() {
    local file="$1"
    local rev; rev=$(get_field "$file" "revision")
    local next
    if [ -z "$rev" ] || ! echo "$rev" | grep -qE '^[0-9]+$'; then
        next=1
    else
        next=$((rev + 1))
    fi
    if grep -qE '^revision:' "$file"; then
        set_field "$file" "revision" "$next"
    else
        # Insert after last frontmatter line — append before second ---
        local tmp="${file}.tmp.$$"
        awk -v r="$next" '
            BEGIN { c=0; added=0 }
            /^---$/ { c++ }
            c==2 && !added && $0=="---" { print "revision: " r; added=1 }
            { print }
        ' "$file" > "$tmp"
        mv "$tmp" "$file"
    fi
    echo "$next"
}

# ---------------------------------------------------------------------------
# resolve_id <plans_dir> <input>
#   Wrap resolve-node.sh — returns node ID on stdout, or empty + exit 1/2.
# ---------------------------------------------------------------------------
resolve_id() {
    local plans="$1"; local input="$2"
    local script_dir; script_dir=$(dirname "${BASH_SOURCE[0]}")
    local result rc
    result=$(bash "${script_dir}/resolve-node.sh" "$input" "$plans" 2>/dev/null) || rc=$?
    rc="${rc:-0}"
    [ "$rc" = "0" ] || return $rc
    echo "$result" | head -1 | awk -F'\t' '{print $1}'
}

# ---------------------------------------------------------------------------
# resolve_file <plans_dir> <input>
#   Same as resolve_id but returns file path.
# ---------------------------------------------------------------------------
resolve_file() {
    local plans="$1"; local input="$2"
    local script_dir; script_dir=$(dirname "${BASH_SOURCE[0]}")
    local result rc
    result=$(bash "${script_dir}/resolve-node.sh" "$input" "$plans" 2>/dev/null) || rc=$?
    rc="${rc:-0}"
    [ "$rc" = "0" ] || return $rc
    echo "$result" | head -1 | awk -F'\t' '{print $2}'
}
