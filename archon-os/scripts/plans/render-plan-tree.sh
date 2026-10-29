#!/usr/bin/env bash
# Render the plan tree as an ASCII tree.
#
# Usage: bash archon-os/scripts/plans/render-plan-tree.sh [.claude/plans/ path] [--rebuild]
#
# Renders from graph-index.json when the project has one and it is fresh —
# adjacency is exactly what an index is for, and the alternative is re-parsing
# frontmatter out of every node on every render. Falls back to the filesystem
# walk below whenever the index is absent, stale or disabled; that walk is
# always correct, so the index can cost time but never accuracy.
#
# --rebuild regenerates the index first (also how a project opts in).
# AF_GRAPH_INDEX_DISABLED=true turns the index off entirely.

set -euo pipefail

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/_lib.sh"

REBUILD=0
POSITIONAL=""
for arg in "$@"; do
    case "$arg" in
        --rebuild) REBUILD=1 ;;
        *) POSITIONAL="$arg" ;;
    esac
done

PLANS_DIR=$(plans_dir "$POSITIONAL")

if [ ! -d "${PLANS_DIR}" ]; then
    echo "✗ Plan tree not found at ${PLANS_DIR}"
    exit 1
fi

if [ "$REBUILD" = "1" ]; then
    graph_index_rebuild "$PLANS_DIR" \
        || echo "⚠ could not rebuild graph index — rendering from the filesystem" >&2
fi

LEGEND="Legend: ○ planned  ▶ active  ✓ done  ■ blocked  ❄ frozen  ✗ discarded  ⌂ archived"

# Fast path: render straight from the index.
if graph_index_render "$PLANS_DIR"; then
    echo ""
    echo "$LEGEND"
    exit 0
fi


# Status icon
icon() {
    case "$1" in
        active)   echo "▶" ;;
        done)     echo "✓" ;;
        planned)  echo "○" ;;
        blocked)  echo "■" ;;
        frozen)   echo "❄" ;;
        discarded) echo "✗" ;;
        archived) echo "⌂" ;;
        *)        echo "?" ;;
    esac
}

print_node() {
    local file="$1"; local prefix="$2"
    local id=$(get_field "$file" "id")
    local status=$(get_field "$file" "status")
    local intent=$(get_field "$file" "intent")
    local i=$(icon "${status:-planned}")
    printf '%s%s %s — %s\n' "$prefix" "$i" "$id" "${intent:-(no intent)}"
}

# T0 — Mission. v3.7.3+ layout: mission/mission.md (folder). Pre-v3.7.3: mission.md (flat).
if [ -f "${PLANS_DIR}/mission/mission.md" ]; then
    print_node "${PLANS_DIR}/mission/mission.md" ""
elif [ -f "${PLANS_DIR}/mission.md" ]; then
    print_node "${PLANS_DIR}/mission.md" ""
fi

# T1 — Initiatives. v3.7.3+ layout: initiatives/{ID}_{slug}/initiative.md (folder).
# Pre-v3.7.3 layout: initiatives/{ID}.md (flat). Support both.
# `find` returns directory order, which is whatever the filesystem happens to
# hand back — so the same tree rendered on two machines came out in two
# different orders. Sort, so this path is deterministic and matches the
# index renderer (which orders by id) node for node.
init_files() {
    if [ -d "${PLANS_DIR}/initiatives" ]; then
        {
            # v3.7.3+ folder layout
            find "${PLANS_DIR}/initiatives" -maxdepth 2 -name 'initiative.md' 2>/dev/null
            # legacy flat layout
            find "${PLANS_DIR}/initiatives" -maxdepth 1 -name '*.md' 2>/dev/null
        } | sort
    fi
}

for init in $(init_files); do
    [ -f "$init" ] || continue
    print_node "$init" "├─ "

    # T2 — Features under this initiative (parent match)
    init_id=$(get_field "$init" "id")
    if [ -d "${PLANS_DIR}/features" ]; then
        for feat_dir in "${PLANS_DIR}/features"/*; do
            [ -d "$feat_dir" ] || continue
            feat_file="${feat_dir}/feature.md"
            [ -f "$feat_file" ] || continue
            feat_parent=$(get_field "$feat_file" "parent")
            [ "$feat_parent" = "$init_id" ] || continue

            print_node "$feat_file" "│  ├─ "

            # T3 — Stories
            if [ -d "${feat_dir}/stories" ]; then
                for story_dir in "${feat_dir}/stories"/*; do
                    [ -d "$story_dir" ] || continue
                    story_file="${story_dir}/story.md"
                    [ -f "$story_file" ] || continue
                    print_node "$story_file" "│  │  ├─ "

                    # T4 — Tasks. v3.7.3+: tasks/{ID}_{slug}/task.md. Pre-v3.7.3: tasks/{ID}_{slug}.md.
                    if [ -d "${story_dir}/tasks" ]; then
                        # New folder-per-task layout.
                        for task in $(find "${story_dir}/tasks" -maxdepth 2 -name 'task.md' 2>/dev/null | sort); do
                            print_node "$task" "│  │  │  └─ "
                        done
                        # Legacy flat layout.
                        for task in $(find "${story_dir}/tasks" -maxdepth 1 -name '*.md' -not -name 'task.md' 2>/dev/null | sort); do
                            print_node "$task" "│  │  │  └─ "
                        done
                    fi
                done
            fi
        done
    fi
done

echo ""
echo "$LEGEND"
