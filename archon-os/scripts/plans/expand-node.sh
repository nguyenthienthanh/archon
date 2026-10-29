#!/usr/bin/env bash
# Decompose a plan node one tier down (T1→T2, T2→T3, T3→T4).
# Mints child IDs via .counters.json + updates parent's children[] + appends history.
# Actual agent dispatch (feature-architect / story-planner) happens in the calling
# command — this script handles the deterministic file ops only.
#
# Usage:
#   expand-node.sh <NODE_ID> [--dry-run] [--plans-dir <path>]
#
# Exit codes:
#   0  success
#   2  node not found
#   3  invalid tier (T0 / T4 can't expand)
#   4  validation failed after mutation (changes rolled back)
#   5  bad input

set -euo pipefail

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

DRY_RUN=0
PLANS_DIR=""  # resolved below via plans_dir
NODE_INPUT=""

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=1; shift ;;
        --plans-dir) PLANS_DIR="$2"; shift 2 ;;
        --plans-dir=*) PLANS_DIR="${1#--plans-dir=}"; shift ;;
        -*) echo "unknown flag: $1" >&2; exit 5 ;;
        *) NODE_INPUT="$1"; shift ;;
    esac
done

PLANS_DIR=$(plans_dir "$PLANS_DIR")

[ -n "$NODE_INPUT" ] || { echo "usage: expand-node.sh <NODE_ID> [--dry-run]" >&2; exit 5; }

NODE_ID=$(resolve_id "$PLANS_DIR" "$NODE_INPUT") || {
    rc=$?
    [ "$rc" = "1" ] && echo "ambiguous: $NODE_INPUT — refine" >&2 && exit 5
    echo "node not found: $NODE_INPUT" >&2
    exit 2
}
NODE_FILE=$(resolve_file "$PLANS_DIR" "$NODE_INPUT")
TIER=$(get_field "$NODE_FILE" "tier")

case "$TIER" in
    0) echo "T0 (Mission) is bootstrap-only — use /archon-os:plan" >&2; exit 3 ;;
    1) CHILD_TIER=2; CHILD_KIND=FEAT; AGENT=feature-architect ;;
    2) CHILD_TIER=3; CHILD_KIND=STORY; AGENT=story-planner ;;
    3) CHILD_TIER=4; CHILD_KIND=TASK; AGENT=story-planner ;;
    4) echo "T4 (Task) is a leaf — nothing to decompose" >&2; exit 3 ;;
    *) echo "node ${NODE_ID} has invalid tier '${TIER}'" >&2; exit 3 ;;
esac

# v3.7.3+: stories and tasks always live in the PARENT NODE'S folder, wherever
# that parent lives in the tree. A subfeature at
#   features/FEAT-001_parent/subfeatures/FEAT-B_child/feature.md
# gets its stories at
#   features/FEAT-001_parent/subfeatures/FEAT-B_child/stories/<ID>_<slug>/story.md
# Compute the concrete child path so the agent prompt is unambiguous instead of
# emitting a literal `features/.../stories/` template that the agent has to guess.
NODE_DIR=$(dirname "$NODE_FILE")
# NODE_DIR relative to PLANS_DIR for nicer output
PLANS_DIR_ABS=$(cd "$PLANS_DIR" && pwd)
NODE_DIR_ABS=$(cd "$NODE_DIR" && pwd)
NODE_DIR_REL="${NODE_DIR_ABS#"$PLANS_DIR_ABS"/}"

case "$CHILD_TIER" in
    2)
        # T1 → T2: features always land top-level under features/. Optionally a
        # T2 → T2 subfeature decomposition (caller passes --as-subfeature, future
        # work); for now T1 expansion mints top-level features.
        CHILD_PATH_TEMPLATE='features/${ID}_${slug}/feature.md'
        ;;
    3)
        # T2 → T3: stories nest inside whichever folder the feature.md actually
        # lives in (top-level OR subfeature path).
        CHILD_PATH_TEMPLATE="${NODE_DIR_REL}/stories/\${ID}_\${slug}/story.md"
        ;;
    4)
        # T3 → T4: tasks nest inside the story folder, wherever it lives.
        CHILD_PATH_TEMPLATE="${NODE_DIR_REL}/tasks/\${ID}_\${slug}/task.md"
        ;;
esac

if [ "$DRY_RUN" = "1" ]; then
    cat <<EOF
DRY RUN — would:
  • Save checkpoint of ${NODE_ID}
  • Dispatch ${AGENT} to propose children at tier T${CHILD_TIER}
  • Mint ${CHILD_KIND}-N IDs via .counters.json
  • Write child files at:
      ${CHILD_PATH_TEMPLATE}
    where \${slug} is slugify(intent). For ticket-attached features,
    \${ID} may be a JIRA-/LIN- prefix instead of FEAT-N.
  • Update ${NODE_ID}.children[]
  • Bump ${NODE_ID}.revision
  • Append history.jsonl event=expand
  • Run validate-plan-tree.sh; on failure, restore from checkpoint
EOF
    exit 0
fi

CKPT=$(save_checkpoint "$PLANS_DIR" "$NODE_ID" "$NODE_FILE")

# The expansion contract: this script PREPARES the structure (checkpoint, agent dispatch
# slot, history breadcrumb). The CALLING command file is responsible for invoking the
# agent and writing child files using mint_child_id below. This split keeps shell + agent
# concerns separate.

NOW=$(now_utc)
EVENT="{\"ts\":\"${NOW}\",\"verb\":\"expand\",\"target\":\"${NODE_ID}\",\"child_tier\":${CHILD_TIER},\"agent\":\"${AGENT}\",\"checkpoint\":\"${CKPT}\",\"child_path\":\"${CHILD_PATH_TEMPLATE}\"}"
append_history "$PLANS_DIR" "$EVENT"

cat <<EOF
expand prepared:
  node:       ${NODE_ID}  (T${TIER} → T${CHILD_TIER})
  agent:      ${AGENT}
  checkpoint: ${CKPT}
  child_path: ${CHILD_PATH_TEMPLATE}
  next:       agent dispatches and writes child node files at the concrete path
              shown above. Counter via 'next_counter ${CHILD_KIND}'.
              Slug via 'slugify <intent>'. For T2 with ticket attached
              (JIRA-/LIN-/...), use ticket ID as prefix instead of FEAT-N.
EOF
