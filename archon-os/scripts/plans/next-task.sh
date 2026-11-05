#!/usr/bin/env bash

# Bridges legacy AF_* / AURA_FROG_* variables onto their ARCHON_* names (v4 rebrand).
. "$(dirname "${BASH_SOURCE[0]}")/../lib/env-compat.sh"

# Pop the next ready T4 task and mark it active.
#
# Algorithm:
#   1. Read active.json → active.story.
#   2. Collect T4 children with status=planned AND all depends_on satisfied
#      (each dep status ∈ done|active). Pick first. Read from
#      graph-index.json when the project has one and it is fresh; otherwise
#      walk the story's tasks/ and parse frontmatter, which is always correct.
#      (There is no ready_queue — candidates are derived per call either way.)
#   3. Under the dispatch lock: re-check status=planned, save checkpoint, then
#      mutate task: status=active, started_at=now, revision+=1.
#   4. Update active.json: active.task=ID.
#   5. Append history.jsonl {"verb":"next",...}.
#
# Concurrency: the claim-and-write section runs under
# with_lock "${PLANS_DIR}/.dispatch.lock" so two concurrent sessions cannot
# both activate the same task — the loser re-checks the status inside the
# critical section and exits 2.
#
# Usage:
#   next-task.sh [--plans-dir <path>] [--dry-run] [--rebuild]
#
# --rebuild regenerates graph-index.json from the tree before dispatching. Use
# it to opt a project in, or to heal an index the staleness check keeps
# rejecting. ARCHON_GRAPH_INDEX_DISABLED=true turns the index off entirely.
#
# Exit codes:
#   0 success — prints "TASK-NNNNN\t<file_path>"
#   1 could not acquire dispatch lock
#   2 no story active OR no ready task OR lost dispatch race
#   4 validation failed
#   5 bad input

set -euo pipefail

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

PLANS_DIR=""  # resolved below via plans_dir
DRY_RUN=0
REBUILD=0
while [ $# -gt 0 ]; do
    case "$1" in
        --plans-dir) PLANS_DIR="$2"; shift 2 ;;
        --plans-dir=*) PLANS_DIR="${1#--plans-dir=}"; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        --rebuild) REBUILD=1; shift ;;
        *) echo "unknown arg: $1" >&2; exit 5 ;;
    esac
done

PLANS_DIR=$(plans_dir "$PLANS_DIR")

if [ "$REBUILD" = "1" ]; then
    graph_index_rebuild "$PLANS_DIR" || {
        echo "could not rebuild graph index at ${PLANS_DIR}" >&2; exit 4;
    }
    echo "rebuilt ${PLANS_DIR}/graph-index.json" >&2
fi

[ -f "${PLANS_DIR}/active.json" ] || { echo "no active.json — run /archon-os:plan first" >&2; exit 5; }

ACTIVE_STORY=$(read_active_field "$PLANS_DIR" "story" 2>/dev/null || true)
if [ -z "${ACTIVE_STORY:-}" ]; then
    echo "no active story — set one with /archon-os:plan-next on a feature first, or expand a feature into stories" >&2
    exit 2
fi

STORY_FILE=$(resolve_file "$PLANS_DIR" "$ACTIVE_STORY") || {
    echo "active story ${ACTIVE_STORY} not found on disk" >&2; exit 2;
}
STORY_DIR=$(dirname "$STORY_FILE")
TASKS_DIR="${STORY_DIR}/tasks"
[ -d "$TASKS_DIR" ] || { echo "story has no tasks/ — run /archon-os:plan-expand ${ACTIVE_STORY}" >&2; exit 2; }

# Collect candidates: T4, status=planned, all depends_on in {done, active}.
#
# Fast path first: graph-index.json already holds tier/status/parent/depends_on
# for every node, so the same rule can be evaluated without re-parsing the tree.
# graph_index_ready returns non-zero when the index is missing, stale, or
# disabled, and the find-scan below runs instead — the scan is always correct,
# so the index can only ever cost time, never accuracy. `--rebuild` regenerates
# it. Note the scan is the ONLY path on a project that has not opted in.
CANDIDATES=$(graph_index_ready "$PLANS_DIR" "$ACTIVE_STORY" || true)

if [ -z "$CANDIDATES" ]; then
    # v3.7.3+: tasks live in folders — `tasks/{ID}_{slug}/task.md`. Pre-v3.7.3
    # layout was flat — `tasks/{ID}_{slug}.md`. Support both for transition.
    #
    # Sorted: unsorted `find` returns directory order, so WHICH ready task got
    # dispatched depended on the filesystem — two machines with the same tree
    # could pick different tasks. The index path orders by id; this one now
    # does too, so the fast and fallback paths dispatch the same task.
    TASK_CANDIDATES=$(find "$TASKS_DIR" -maxdepth 2 -name 'task.md' 2>/dev/null | sort)
    TASK_CANDIDATES="${TASK_CANDIDATES}
$(find "$TASKS_DIR" -maxdepth 1 -name '*.md' -not -name 'task.md' 2>/dev/null | sort)"
    for f in $TASK_CANDIDATES; do
        [ -f "$f" ] || continue
        tier=$(get_field "$f" "tier")
        [ "$tier" = "4" ] || continue
        status=$(get_field "$f" "status")
        [ "$status" = "planned" ] || continue
        id=$(get_field "$f" "id")
        [ -z "$id" ] && continue

        deps=$(get_list "$f" "depends_on" | tr -d ' "'"'"'' | grep -v '^$' || true)
        ready=1
        while IFS= read -r dep; do
            [ -z "$dep" ] && continue
            dep_file=$(resolve_file "$PLANS_DIR" "$dep" 2>/dev/null || true)
            [ -z "$dep_file" ] && { ready=0; break; }
            dep_status=$(get_field "$dep_file" "status")
            case "$dep_status" in
                done|active) ;;
                *) ready=0; break ;;
            esac
        done <<< "$deps"
        [ "$ready" = "1" ] && CANDIDATES="${CANDIDATES}${id}	${f}
"
    done
fi

if [ -z "$CANDIDATES" ]; then
    echo "no ready T4 under ${ACTIVE_STORY} — all tasks done or blocked by deps" >&2
    exit 2
fi

PICK_LINE=$(printf '%s' "$CANDIDATES" | head -1)
PICK_ID=$(echo "$PICK_LINE" | awk -F'\t' '{print $1}')
PICK_FILE=$(echo "$PICK_LINE" | awk -F'\t' '{print $2}')

if [ "$DRY_RUN" = "1" ]; then
    echo "DRY RUN — would dispatch ${PICK_ID} (${PICK_FILE})"
    exit 0
fi

# Claim-and-write critical section. Runs under with_lock (below) so two
# concurrent sessions cannot both dispatch the same task: the candidate scan
# above is unlocked, so the status is re-checked here before mutating.
claim_and_dispatch() {
    local status
    status=$(get_field "$PICK_FILE" "status")
    if [ "$status" != "planned" ]; then
        echo "lost dispatch race — ${PICK_ID} is no longer planned (status=${status})" >&2
        return 2
    fi

    # Save checkpoint, mutate, validate.
    local violations_before ckpt now new_rev
    violations_before=$(tree_violation_count "$PLANS_DIR")
    ckpt=$(save_checkpoint "$PLANS_DIR" "$PICK_ID" "$PICK_FILE")
    now=$(now_utc)
    set_field "$PICK_FILE" "status" "active"
    set_field "$PICK_FILE" "started_at" "$now"
    new_rev=$(bump_revision "$PICK_FILE")

    # Detect regression. Roll back the task file if violations increased. active.task
    # is set ONLY after the check passes (below), so a rollback never leaves
    # active.json pointing at a task that was just reverted to `planned`.
    if ! require_no_regression "$PLANS_DIR" "$violations_before"; then
        if [ -s "$ckpt" ]; then
            local body
            body=$(grep -oE '"node_state_before_b64":[[:space:]]*"[^"]*"' "$ckpt" | sed 's/.*"\([^"]*\)"$/\1/')
            echo "$body" | base64 -d > "$PICK_FILE"
        fi
        echo "restored ${PICK_ID}" >&2
        return 4
    fi

    set_active_field "$PLANS_DIR" "task" "$PICK_ID"

    local event="{\"ts\":\"${now}\",\"verb\":\"next\",\"target\":\"${PICK_ID}\",\"story\":\"${ACTIVE_STORY}\",\"checkpoint\":\"${ckpt}\",\"revision\":${new_rev}}"
    append_history "$PLANS_DIR" "$event"

    printf '%s\t%s\n' "$PICK_ID" "$PICK_FILE"
    return 0
}

with_lock "${PLANS_DIR}/.dispatch.lock" claim_and_dispatch || exit $?
