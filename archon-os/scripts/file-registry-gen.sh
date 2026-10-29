#!/bin/bash
# File Registry Generator
# Identifies key files in a project and outputs a YAML registry
# Version: 1.0.0
#
# Usage: ./file-registry-gen.sh [project-root] [output-file] [max-files]
# Output: YAML file listing key files with roles and relationships

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="${1:-.}"
OUTPUT_FILE="${2:-}"
MAX_FILES="${3:-50}"

# Directories to skip
SKIP_DIRS="node_modules|.git|dist|build|.cache|.next|.nuxt|vendor|__pycache__|.venv|venv|coverage|.turbo|.expo|android/app/build|ios/Pods|.dart_tool"

# Classify file role based on path and name
classify_role() {
    local filepath="$1"
    local filename=$(basename "$filepath")
    local dirname=$(dirname "$filepath")

    # Entry points
    case "$filename" in
        main.ts|main.tsx|main.js|main.py|main.go|main.dart)
            echo "entry-point" ; return ;;
        index.ts|index.tsx|index.js)
            if [[ "$dirname" == "." ]] || [[ "$dirname" == "./src" ]] || [[ "$dirname" == "src" ]]; then
                echo "entry-point" ; return
            fi ;;
        App.tsx|App.ts|App.js|App.vue)
            echo "app-root" ; return ;;
        app.ts|app.js|server.ts|server.js)
            echo "server-entry" ; return ;;
    esac

    # Layouts
    case "$filepath" in
        *layout.tsx|*layout.ts|*layout.js|*_layout.dart)
            echo "layout" ; return ;;
    esac

    # Configs
    case "$filename" in
        package.json|composer.json|go.mod|Cargo.toml|pubspec.yaml|pyproject.toml|project.godot)
            echo "package-config" ; return ;;
        tsconfig.json|tsconfig.*.json)
            echo "typescript-config" ; return ;;
        vite.config.*|next.config.*|nuxt.config.*|webpack.config.*|angular.json)
            echo "build-config" ; return ;;
        vitest.config.*|jest.config.*|cypress.config.*|playwright.config.*)
            echo "test-config" ; return ;;
        tailwind.config.*|postcss.config.*)
            echo "style-config" ; return ;;
        .eslintrc*|eslint.config.*|.prettierrc*|biome.json)
            echo "lint-config" ; return ;;
        Dockerfile|docker-compose.yml|docker-compose.yaml)
            echo "docker-config" ; return ;;
        .env.example|.envrc.template|.env.local.example)
            echo "env-template" ; return ;;
    esac

    # By directory
    case "$filepath" in
        *middleware*|*Middleware*)
            echo "middleware" ; return ;;
        *route*|*router*|*Route*)
            echo "routing" ; return ;;
        *model*|*Model*|*entity*|*Entity*)
            echo "data-model" ; return ;;
        *schema*|*Schema*)
            echo "schema" ; return ;;
        *migration*|*Migration*)
            echo "migration" ; return ;;
        *service*|*Service*)
            echo "service" ; return ;;
        *controller*|*Controller*)
            echo "controller" ; return ;;
        *hook*|*Hook*|*use[A-Z]*)
            echo "hook" ; return ;;
        *store*|*Store*|*slice*|*Slice*)
            echo "state-management" ; return ;;
        *context*|*Context*|*provider*|*Provider*)
            echo "context-provider" ; return ;;
        *util*|*helper*|*lib/*)
            echo "utility" ; return ;;
        *test*|*spec*|*__test__*)
            echo "test" ; return ;;
        *type*|*Type*|*interface*|*Interface*)
            echo "type-definition" ; return ;;
    esac

    echo "source"
}

# Find entry point files
find_entry_points() {
    local dir="$1"

    # Common entry points
    for pattern in \
        "src/main.ts" "src/main.tsx" "src/main.js" "src/index.ts" "src/index.tsx" "src/index.js" \
        "src/App.tsx" "src/App.ts" "src/App.js" "src/App.vue" \
        "src/app/layout.tsx" "src/app/page.tsx" "app/layout.tsx" "app/page.tsx" \
        "src/app.ts" "src/app.js" "src/server.ts" "src/server.js" \
        "app/Http/Kernel.php" "routes/web.php" "routes/api.php" \
        "cmd/main.go" "main.go" \
        "lib/main.dart" \
        "manage.py" "app.py" "main.py" \
        "src/main.rs" ; do
        [ -f "$dir/$pattern" ] && echo "$pattern"
    done
}

# Find config files
find_config_files() {
    local dir="$1"

    for pattern in \
        "package.json" "tsconfig.json" "composer.json" "go.mod" "Cargo.toml" "pubspec.yaml" "pyproject.toml" "project.godot" \
        "vite.config.ts" "vite.config.js" "next.config.js" "next.config.mjs" "next.config.ts" \
        "vitest.config.ts" "jest.config.ts" "jest.config.js" \
        "tailwind.config.js" "tailwind.config.ts" \
        "eslint.config.js" ".eslintrc.js" ".eslintrc.json" \
        "Dockerfile" "docker-compose.yml" \
        ".env.example" ".envrc.template" ; do
        [ -f "$dir/$pattern" ] && echo "$pattern"
    done
}

# Find hub files (imported by many other files)
find_hub_files() {
    local dir="$1"
    local ext_pattern="$2"  # e.g., "ts|tsx|js|jsx"

    # Find all import/require targets and count occurrences
    # This is approximate but fast
    find "$dir" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.vue" -o -name "*.py" -o -name "*.go" -o -name "*.php" -o -name "*.dart" -o -name "*.rs" \) \
        ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/vendor/*" \
        -exec grep -l "export\|module\.exports\|def \|func \|class \|pub fn" {} \; 2>/dev/null | \
    while read -r file; do
        local rel_path="${file#$dir/}"
        local rel_path="${rel_path#./}"
        local import_count=0

        # Count how many files import this file (by checking basename without extension)
        local base_no_ext=$(basename "$file" | sed 's/\.[^.]*$//')
        local base_dir=$(dirname "$rel_path")

        # Quick grep for files that reference this module
        import_count=$(grep -rl "$base_no_ext" "$dir" \
            --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
            --include="*.vue" --include="*.py" --include="*.go" --include="*.php" \
            --include="*.dart" --include="*.rs" \
            2>/dev/null | grep -v "node_modules\|\.git\|dist\|build" | wc -l | tr -d ' ')

        # Only output files imported by 3+ others
        if [ "$import_count" -ge 3 ]; then
            echo "$import_count $rel_path"
        fi
    done | sort -rn | head -20
}

# Get first line of file description (from comment or docstring)
get_file_description() {
    local filepath="$1"

    # Try to get description from first comment block
    local ext="${filepath##*.}"

    case "$ext" in
        ts|tsx|js|jsx|go|rs|java|dart)
            # Look for // or /* comment at top
            head -10 "$filepath" 2>/dev/null | grep -m1 '^\s*[/*]' | sed 's|^\s*[/*/ ]*||' | sed 's|\*/||' | cut -c1-100
            ;;
        py)
            # Look for docstring or # comment
            head -5 "$filepath" 2>/dev/null | grep -m1 '^\s*[#"]' | sed 's|^\s*[#" ]*||' | sed 's|"""||g' | cut -c1-100
            ;;
        php)
            head -10 "$filepath" 2>/dev/null | grep -m1 '^\s*[/*]' | sed 's|^\s*[/*/ ]*||' | cut -c1-100
            ;;
        md)
            head -3 "$filepath" 2>/dev/null | grep -m1 '^#' | sed 's|^#* *||' | cut -c1-100
            ;;
        *)
            echo ""
            ;;
    esac
}

# Get exports from a file
get_exports() {
    local filepath="$1"
    local ext="${filepath##*.}"

    # NOTE: portable sed -E only — the previous `grep -oP` (PCRE lookbehind)
    # is GNU-only; macOS BSD grep exits 2 on -P, and the suppressed stderr in
    # a non-final pipeline stage made the exports column silently empty.
    case "$ext" in
        ts|tsx|js|jsx)
            sed -nE 's/.*export (default |const |function |class |type |interface |enum )([A-Za-z0-9_]+).*/\2/p' "$filepath" 2>/dev/null | head -5 | tr '\n' ',' | sed 's/,$//'
            ;;
        py)
            sed -nE 's/^(def|class) ([A-Za-z0-9_]+).*/\2/p' "$filepath" 2>/dev/null | head -5 | tr '\n' ',' | sed 's/,$//'
            ;;
        go)
            sed -nE 's/^(func|type) ([A-Za-z0-9_]+).*/\2/p' "$filepath" 2>/dev/null | head -5 | tr '\n' ',' | sed 's/,$//'
            ;;
        *)
            echo ""
            ;;
    esac
}

# Generate YAML registry
generate_registry() {
    local project_name=$(basename "$(cd "$PROJECT_ROOT" && pwd)")

    cat << HEADER
# File Registry — $project_name
# Auto-generated by file-registry-gen.sh on $(date +%Y-%m-%d)
# Key files: entry points, configs, hub files (imported by 3+ files)
# Max files: $MAX_FILES

HEADER

    cd "$PROJECT_ROOT"

    local file_count=0

    # Section 1: Entry Points
    echo "entry_points:"
    local entries=$(find_entry_points ".")
    if [ -n "$entries" ]; then
        while IFS= read -r filepath; do
            [ -z "$filepath" ] && continue
            local desc=$(get_file_description "$filepath")
            local exports=$(get_exports "$filepath")
            echo "  - path: \"$filepath\""
            echo "    role: \"$(classify_role "$filepath")\""
            [ -n "$desc" ] && echo "    description: \"$desc\""
            [ -n "$exports" ] && echo "    exports: [$exports]"
            echo ""
            file_count=$((file_count + 1))
        done <<< "$entries"
    else
        echo "  # No standard entry points detected"
        echo ""
    fi

    # Section 2: Config Files
    echo "config_files:"
    local configs=$(find_config_files ".")
    if [ -n "$configs" ]; then
        while IFS= read -r filepath; do
            [ -z "$filepath" ] && continue
            echo "  - path: \"$filepath\""
            echo "    role: \"$(classify_role "$filepath")\""
            echo ""
            file_count=$((file_count + 1))
        done <<< "$configs"
    else
        echo "  # No standard config files detected"
        echo ""
    fi

    # Section 3: Hub Files (most imported)
    echo "hub_files:"
    echo "  # Files imported by 3+ other files (high-impact files)"
    local hubs=$(find_hub_files "." 2>/dev/null)
    if [ -n "$hubs" ]; then
        while IFS= read -r line; do
            [ -z "$line" ] && continue
            local count=$(echo "$line" | awk '{print $1}')
            local filepath=$(echo "$line" | awk '{print $2}')
            local desc=$(get_file_description "$filepath")
            local exports=$(get_exports "$filepath")
            local role=$(classify_role "$filepath")

            echo "  - path: \"$filepath\""
            echo "    role: \"$role\""
            echo "    imported_by_count: $count"
            [ -n "$desc" ] && echo "    description: \"$desc\""
            [ -n "$exports" ] && echo "    exports: [$exports]"
            echo ""

            file_count=$((file_count + 1))
            [ "$file_count" -ge "$MAX_FILES" ] && break
        done <<< "$hubs"
    else
        echo "  # No hub files detected (or project too small)"
        echo ""
    fi

    echo "# Total key files: $file_count"
    echo "# Regenerate: bash scripts/file-registry-gen.sh"
}

# Main
main() {
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        echo "File Registry Generator v1.0.0"
        echo ""
        echo "Usage: $0 [project-root] [output-file] [max-files]"
        echo ""
        echo "Identifies key files (entry points, configs, hub files)"
        echo "and outputs a YAML registry with roles and relationships."
        echo ""
        echo "Default max files: 50"
        exit 0
    fi

    echo -e "${CYAN}File Registry Generator v1.0.0${NC}"
    echo "==============================="
    echo ""
    echo -e "Project:   ${GREEN}$(basename "$(cd "$PROJECT_ROOT" && pwd)")${NC}"
    echo -e "Max files: ${YELLOW}$MAX_FILES${NC}"

    if [ -n "$OUTPUT_FILE" ]; then
        echo -e "Output:    ${YELLOW}$OUTPUT_FILE${NC}"
        echo ""
        echo -e "${YELLOW}Scanning for key files...${NC}"
        generate_registry > "$OUTPUT_FILE"
        local lines=$(wc -l < "$OUTPUT_FILE" | tr -d ' ')
        echo -e "${GREEN}Done!${NC} Generated $OUTPUT_FILE ($lines lines)"
    else
        echo ""
        generate_registry
    fi
}

main "$@"
