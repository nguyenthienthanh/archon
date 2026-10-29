#!/usr/bin/env bash
# Validate plan tree integrity per spec §6.7 — enforces all 8 invariants.
#
# Usage: bash archon-os/scripts/plans/validate-plan-tree.sh [.claude/plans/ path] [--rebuild]
#
# On graph-index.json: this script deliberately does NOT read it. It is the
# validator — the one caller that must see the tree exactly as it is on disk. A
# validator that trusts a cache can report a green tree that is actually broken,
# which is worse than having no validator at all. Instead it PRODUCES the index:
# it already parses every node, so with --rebuild it writes a fresh
# graph-index.json once the invariants pass, and that is how a stale index the
# other scripts keep rejecting gets healed. A failing tree never rebuilds the
# index — indexing a tree we just declared invalid would hand the readers a fast
# path through broken data.
#
# Exit codes:
#   0 — all invariants pass
#   1 — one or more invariants violated (details printed)
#   2 — plan tree not found

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
    exit 2
fi

VIOLATIONS=0
report() {
    echo "✗ INVARIANT $1: $2"
    VIOLATIONS=$((VIOLATIONS + 1))
}

# Helper — extract a frontmatter scalar field

# Helper — extract a frontmatter list field (e.g., children: [A, B, C])
get_list() {
    local file="$1"
    local field="$2"
    awk -v f="$field" '
        /^---$/ { c++; next }
        c == 1 && $1 == f":" {
            sub(/^[^:]*: */, "")
            gsub(/[\[\]]/, "")
            gsub(/, */, "\n")
            print
            exit
        }
    ' "$file" 2>/dev/null
}

# Collect all node files
# Array (not a whitespace-split string) so node paths containing spaces survive.
# Which files are nodes is defined in ONE place conceptually, and
# hooks/lib/vault-index.cjs#listNodeFiles already had it right: skip archive/
# AND checkpoints/, and skip README.md / INDEX.md. This scan did not, which
# made every checkpoint a phantom node.
#
# A checkpoint snapshots a node's body, so it carries that node's `id:`. A node
# with two checkpoints therefore produced three files claiming one id, with
# three different `status` and `revision` values, and `file_for_id` returned
# whichever `find` yielded first. resolve-node.sh returned the SNAPSHOT before
# the live node, so a mutating caller that resolved then wrote would have
# written into history and left the real node untouched — silently.
mapfile -t ALL_NODES < <(find "${PLANS_DIR}" -name '*.md' \
    -not -path '*/archive/*' -not -path '*/checkpoints/*' \
    -not -name 'README.md' -not -name 'INDEX.md' 2>/dev/null)
NODE_COUNT=${#ALL_NODES[@]}

if [ "${NODE_COUNT}" -eq 0 ]; then
    # Never exit 0 here. Every plan mutation gates on this script, and a real
    # plans dir always holds at least mission/mission.md (new-plan.sh creates
    # it). Zero nodes therefore means the path is wrong, not that the tree is
    # clean — and a gate that reports green on a wrong path silently disables
    # all 8 invariants. Fail loud instead.
    echo "✗ No plan nodes found under '${PLANS_DIR}' — refusing to report a valid tree." >&2
    echo "  A plans dir always contains mission/mission.md. Check the path:" >&2
    echo "    validate-plan-tree.sh [PLANS_DIR]   (the plans dir itself, NOT the project root)" >&2
    echo "  Run new-plan.sh first if the tree has not been initialized." >&2
    exit 1
fi

echo "Validating ${NODE_COUNT} plan nodes (8 invariants)..."

# Build ID → file map
TMP_MAP=$(mktemp)
TMP_CLAIMED=$(mktemp)
trap 'rm -f "$TMP_MAP" "$TMP_CLAIMED"' EXIT

for f in "${ALL_NODES[@]}"; do
    id=$(get_field "$f" "id")
    if [ -n "$id" ]; then
        echo "$id $f" >> "$TMP_MAP"
    fi
done

file_for_id() {
    awk -v id="$1" '$1 == id { $1 = ""; sub(/^ */, ""); print; exit }' "$TMP_MAP"
}

id_exists() {
    grep -qm1 "^$1 " "$TMP_MAP"
}

# ------------------------------------------------------------------
# INVARIANT 1: Every non-T0 node has existing parent
#
# Pattern nodes (node_type: pattern, a KG-promoted learned leaf) carry NO
# `tier` field, so they never match the T0 skip below and are ENFORCED here:
# a pattern must name an existing parent (a Feature/T2 or the mission root)
# exactly like a real T-node. This is the single place a pattern's parent
# linkage is checked, since INVARIANT 3 exempts patterns from the
# children[]-membership orphan test (see there).
# ------------------------------------------------------------------
for f in "${ALL_NODES[@]}"; do
    id=$(get_field "$f" "id")
    tier=$(get_field "$f" "tier")
    parent=$(get_field "$f" "parent")
    [ -z "$id" ] && continue
    [ "$tier" = "0" ] && continue
    if [ -z "$parent" ]; then
        report 1 "node ${id} missing 'parent' field"
        continue
    fi
    if ! id_exists "$parent"; then
        report 1 "node ${id} parent '${parent}' does not exist"
    fi
done

# ------------------------------------------------------------------
# INVARIANT 2: Parent's children[] references only existing children
# ------------------------------------------------------------------
for f in "${ALL_NODES[@]}"; do
    id=$(get_field "$f" "id")
    children=$(get_list "$f" "children")
    [ -z "$children" ] && continue
    while IFS= read -r child_id; do
        [ -z "$child_id" ] && continue
        child_id=$(echo "$child_id" | tr -d ' "'"'"'')
        [ -z "$child_id" ] && continue
        if ! id_exists "$child_id"; then
            report 2 "node ${id} children includes '${child_id}' which does not exist"
        fi
    done <<< "$children"
done

# ------------------------------------------------------------------
# INVARIANT 3: No orphan nodes
# ------------------------------------------------------------------
for f in "${ALL_NODES[@]}"; do
    children=$(get_list "$f" "children")
    while IFS= read -r child_id; do
        [ -z "$child_id" ] && continue
        child_id=$(echo "$child_id" | tr -d ' "'"'"'')
        [ -z "$child_id" ] && continue
        echo "$child_id" >> "$TMP_CLAIMED"
    done <<< "$children"
done

for f in "${ALL_NODES[@]}"; do
    id=$(get_field "$f" "id")
    tier=$(get_field "$f" "tier")
    [ -z "$id" ] && continue
    [ "$tier" = "0" ] && continue
    # Pattern nodes (node_type: pattern) are inert side-leaves: they are
    # DELIBERATELY not listed in any parent's children[], so the tiered
    # scheduler (next-task, expand) never picks them up. Their parent linkage
    # is still hard-enforced by INVARIANT 1 (they carry a required `parent`),
    # so only the children[]-membership orphan test is exempted here — keyed
    # STRICTLY on node_type=pattern so a genuinely orphaned T-node (which has a
    # tier and no node_type) can never claim this exemption.
    if [ "$(get_field "$f" "node_type")" = "pattern" ]; then continue; fi
    if ! grep -qx "$id" "$TMP_CLAIMED" 2>/dev/null; then
        # Verify via parent's children too
        parent=$(get_field "$f" "parent")
        if [ -n "$parent" ]; then
            parent_file=$(file_for_id "$parent")
            if [ -n "$parent_file" ]; then
                pc=$(get_list "$parent_file" "children" | tr -d ' "'"'"'')
                if echo "$pc" | grep -qx "$id"; then
                    continue
                fi
            fi
        fi
        report 3 "node ${id} is orphan — not in any parent's children"
    fi
done

# ------------------------------------------------------------------
# INVARIANT 4: Status in allowed set
# ------------------------------------------------------------------
ALLOWED_STATUS="planned active done blocked discarded frozen archived"
for f in "${ALL_NODES[@]}"; do
    status=$(get_field "$f" "status")
    [ -z "$status" ] && continue
    # Pattern nodes (node_type: pattern) additionally allow `learned` — the
    # durable resting state of a KG-promoted pattern. The allowance is granted
    # ONLY when node_type=pattern, so a real T-node can never use `learned` to
    # slip past the status check.
    allowed="$ALLOWED_STATUS"
    if [ "$(get_field "$f" "node_type")" = "pattern" ]; then
        allowed="$ALLOWED_STATUS learned"
    fi
    if ! echo "${allowed}" | grep -wq "$status"; then
        id=$(get_field "$f" "id")
        report 4 "node ${id} has invalid status '${status}'"
    fi
done

# ------------------------------------------------------------------
# INVARIANT 5: revision is non-negative integer
# ------------------------------------------------------------------
for f in "${ALL_NODES[@]}"; do
    rev=$(get_field "$f" "revision")
    [ -z "$rev" ] && continue
    if ! echo "$rev" | grep -qE '^[0-9]+$'; then
        id=$(get_field "$f" "id")
        report 5 "node ${id} revision '${rev}' is not a non-negative integer"
    fi
done

# ------------------------------------------------------------------
# INVARIANT 6: T3 acceptance test_ref exists when status >= active
#
# EXEMPT for pattern nodes: only T3 (tier==3) is checked. Pattern nodes carry
# no `tier` (and no test_ref — a learned pattern is a note, not a testable
# task), so they fall through the `tier == 3` guard untouched. No node_type
# special-case is needed; the tier gate already excludes them.
# ------------------------------------------------------------------
for f in "${ALL_NODES[@]}"; do
    tier=$(get_field "$f" "tier")
    [ "$tier" = "3" ] || continue
    status=$(get_field "$f" "status")
    [ "$status" = "active" ] || [ "$status" = "done" ] || continue
    test_refs=$(grep -E '^\s*test_ref:' "$f" 2>/dev/null | sed 's/.*test_ref: *//' | tr -d '"' || true)
    if [ -z "$test_refs" ]; then
        id=$(get_field "$f" "id")
        report 6 "T3 ${id} status=${status} but no test_ref in acceptance"
        continue
    fi
    while IFS= read -r ref; do
        [ -z "$ref" ] && continue
        file_part="${ref%%::*}"
        if [ ! -f "$file_part" ]; then
            id=$(get_field "$f" "id")
            report 6 "T3 ${id} test_ref '${file_part}' does not exist"
        fi
    done <<< "$test_refs"
done

# ------------------------------------------------------------------
# INVARIANT 7: depends_on forms a DAG (no cycles) at EVERY tier — full DFS.
# Collect every id→dep edge, then detect a cycle of ANY length (the old
# check only caught self-loops and 2-cycles; A→B→C→A validated clean).
#
# Tiers 1-4 all contribute edges. Scoping this to tier==4 was a defect: a
# depends_on cycle between two T2 features is just as unschedulable as one
# between tasks, and it validated clean.
#
# EXEMPT for pattern nodes: they carry no `tier` and no `depends_on` (a learned
# leaf has no dependencies), so the numeric tier test excludes them and they
# cannot appear in a cycle. No node_type special-case is needed.
# ------------------------------------------------------------------
EDGES=""
for f in "${ALL_NODES[@]}"; do
    tier=$(get_field "$f" "tier")
    # Any tier contributes edges, not just T4. A depends_on cycle between two
    # T2 features (or T3 stories) is just as unschedulable as one between
    # tasks, and the old `= "4"` gate let it validate clean. Pattern nodes
    # carry no `tier`, so the numeric test still excludes them.
    case "$tier" in 1|2|3|4) ;; *) continue ;; esac
    id=$(get_field "$f" "id")
    deps=$(get_list "$f" "depends_on")
    [ -z "$deps" ] && continue
    while IFS= read -r dep; do
        dep=$(echo "$dep" | tr -d ' "'"'"'')
        [ -z "$dep" ] && continue
        EDGES="${EDGES}${id} ${dep}"$'\n'
    done <<< "$deps"
done
if [ -n "$EDGES" ]; then
    CYCLE=$(printf '%s' "$EDGES" | python3 -c '
import sys
adj = {}
for line in sys.stdin:
    parts = line.split()
    if len(parts) < 2:
        continue
    adj.setdefault(parts[0], []).append(parts[1])
WHITE, GRAY, BLACK = 0, 1, 2
color = {}
def dfs(u, stack):
    color[u] = GRAY
    stack.append(u)
    for v in adj.get(u, []):
        if color.get(v, WHITE) == GRAY:
            i = stack.index(v)
            print(" -> ".join(stack[i:] + [v]))
            return True
        if color.get(v, WHITE) == WHITE and dfs(v, stack):
            return True
    stack.pop()
    color[u] = BLACK
    return False
for n in list(adj):
    if color.get(n, WHITE) == WHITE and dfs(n, []):
        break
' 2>/dev/null || true)
    if [ -n "$CYCLE" ]; then
        report 7 "depends_on cycle detected: ${CYCLE}"
    fi
fi

# ------------------------------------------------------------------
# INVARIANT 8: frozen status must have freeze_reason
# ------------------------------------------------------------------
for f in "${ALL_NODES[@]}"; do
    status=$(get_field "$f" "status")
    if [ "$status" = "frozen" ]; then
        if ! grep -q "^freeze_reason:" "$f" 2>/dev/null; then
            id=$(get_field "$f" "id")
            report 8 "node ${id} is 'frozen' but missing freeze_reason"
        fi
    fi
done

# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------
if [ "${VIOLATIONS}" -gt 0 ]; then
    echo ""
    echo "✗ ${VIOLATIONS} invariant violation(s) — plan tree is invalid"
    if [ "$REBUILD" = "1" ]; then
        echo "  graph-index.json NOT rebuilt — fix the tree first"
    fi
    exit 1
fi

echo "✓ Plan tree valid (all 8 invariants pass)"

if [ "$REBUILD" = "1" ]; then
    if graph_index_rebuild "$PLANS_DIR"; then
        echo "✓ graph-index.json rebuilt from the validated tree"
    else
        echo "⚠ could not rebuild graph-index.json (node missing, or index disabled)" >&2
    fi
fi

exit 0
