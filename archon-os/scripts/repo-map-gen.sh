#!/bin/bash
# Repo Map Generator
# Generates annotated directory tree with purpose descriptions
# Version: 1.0.0
#
# Usage: ./repo-map-gen.sh [project-root] [output-file] [max-depth]
# Output: Markdown file with annotated directory structure

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="${1:-.}"
OUTPUT_FILE="${2:-}"
MAX_DEPTH="${3:-3}"

# Directories to always skip
SKIP_DIRS="node_modules|.git|dist|build|.cache|.next|.nuxt|.output|vendor|__pycache__|.venv|venv|.idea|.vscode|coverage|.turbo|.vercel|.expo|android/app/build|ios/Pods|.dart_tool|.gradle"

# Infer directory purpose from contents
infer_purpose() {
    local dir="$1"
    local dirname=$(basename "$dir")
    local purpose=""

    # Check for README first
    if [ -f "$dir/README.md" ]; then
        purpose=$(head -5 "$dir/README.md" | grep -v '^#' | grep -v '^$' | head -1 | sed 's/^[[:space:]]*//' | cut -c1-80)
        if [ -n "$purpose" ]; then
            echo "$purpose"
            return
        fi
    fi

    # Infer from directory name (common patterns)
    case "$dirname" in
        # Source directories
        src|lib|app) echo "Main source code" ;;
        components) echo "Reusable UI components" ;;
        pages|views|screens) echo "Route-based page/screen components" ;;
        layouts|layout) echo "Page layout components" ;;
        hooks) echo "Custom hooks" ;;
        utils|helpers|lib) echo "Utility functions" ;;
        services) echo "External service integrations & API clients" ;;
        api|routes) echo "API route handlers" ;;
        middleware) echo "Request/response middleware" ;;
        models|entities) echo "Data models & database entities" ;;
        schemas) echo "Validation & data schemas" ;;
        types) echo "Type definitions" ;;
        interfaces) echo "Interface definitions" ;;
        config|configs|configuration) echo "Configuration files" ;;
        constants) echo "Constant values & enums" ;;
        assets|static|public) echo "Static assets (images, fonts, etc.)" ;;
        styles|css) echo "Stylesheets" ;;
        store|stores|state) echo "State management" ;;
        context|contexts|providers) echo "Context providers" ;;
        features|modules) echo "Feature-based modules" ;;

        # Testing
        test|tests|__tests__|spec|specs) echo "Test files" ;;
        e2e|cypress|playwright) echo "End-to-end tests" ;;
        fixtures|mocks|__mocks__) echo "Test fixtures & mocks" ;;

        # Build & config
        scripts) echo "Build & utility scripts" ;;
        tools) echo "Development tools" ;;
        docker) echo "Docker configuration" ;;
        ci|.github|.circleci) echo "CI/CD configuration" ;;
        deploy|deployment) echo "Deployment configuration" ;;

        # Documentation
        docs|documentation) echo "Documentation" ;;
        examples) echo "Example code & usage" ;;

        # Backend specific
        controllers) echo "Request controllers" ;;
        repositories) echo "Data access layer" ;;
        migrations) echo "Database migrations" ;;
        seeders|seeds) echo "Database seeders" ;;
        validators) echo "Input validators" ;;
        transformers|serializers) echo "Data transformers" ;;
        jobs|workers|queues) echo "Background jobs & workers" ;;
        events|listeners) echo "Event handlers" ;;
        notifications) echo "Notification handlers" ;;
        policies) echo "Authorization policies" ;;
        guards) echo "Route/auth guards" ;;

        # Mobile
        ios) echo "iOS native code" ;;
        android) echo "Android native code" ;;
        platforms) echo "Platform-specific code" ;;

        # Plugin/extension specific
        agents) echo "Agent definitions" ;;
        commands) echo "Command definitions" ;;
        rules) echo "Rule definitions" ;;
        skills) echo "Skill definitions" ;;
        templates) echo "Document templates" ;;
        hooks) echo "Lifecycle hooks" ;;
        plans) echo "Plan storage" ;;
        logs) echo "Execution logs" ;;

        # Default: try to infer from file types inside
        *)
            if [ -d "$dir" ]; then
                local file_count=$(find "$dir" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')
                if [ "$file_count" -gt 0 ]; then
                    # Sample file extensions
                    local exts=$(find "$dir" -maxdepth 1 -type f -name "*.*" 2>/dev/null | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -3 | awk '{print $2}' | tr '\n' ',' | sed 's/,$//')
                    if [ -n "$exts" ]; then
                        echo "Contains: $exts files"
                    fi
                fi
            fi
            ;;
    esac
}

# Count files in directory (non-recursive)
count_files() {
    local dir="$1"
    find "$dir" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' '
}

# Count subdirectories
count_subdirs() {
    local dir="$1"
    find "$dir" -maxdepth 1 -type d 2>/dev/null | tail -n +2 | wc -l | tr -d ' '
}

# Generate tree with annotations
generate_tree() {
    local dir="$1"
    local prefix="$2"
    local depth="$3"

    if [ "$depth" -gt "$MAX_DEPTH" ]; then
        return
    fi

    # Get sorted list of subdirectories (excluding skipped)
    local subdirs=()
    while IFS= read -r subdir; do
        [ -z "$subdir" ] && continue
        local base=$(basename "$subdir")
        # Skip hidden dirs (except .github, .claude-plugin) and skip dirs
        if [[ "$base" == .* ]] && [[ "$base" != ".github" ]] && [[ "$base" != ".claude-plugin" ]]; then
            continue
        fi
        if echo "$base" | grep -qE "^($SKIP_DIRS)$"; then
            continue
        fi
        subdirs+=("$subdir")
    done < <(find "$dir" -maxdepth 1 -type d 2>/dev/null | tail -n +2 | sort)

    local total=${#subdirs[@]}
    local i=0

    for subdir in "${subdirs[@]}"; do
        i=$((i + 1))
        local base=$(basename "$subdir")
        local purpose=$(infer_purpose "$subdir")
        local connector="├──"
        local next_prefix="${prefix}│   "

        if [ "$i" -eq "$total" ]; then
            connector="└──"
            next_prefix="${prefix}    "
        fi

        local file_count=$(count_files "$subdir")
        local subdir_count=$(count_subdirs "$subdir")

        # Format: directory name + purpose annotation
        local annotation=""
        if [ -n "$purpose" ]; then
            annotation="  # $purpose"
        fi

        # Add file/dir counts for leaf or large directories
        local counts=""
        if [ "$subdir_count" -eq 0 ] && [ "$file_count" -gt 0 ]; then
            counts=" ($file_count files)"
        elif [ "$depth" -eq "$MAX_DEPTH" ] && [ "$subdir_count" -gt 0 ]; then
            counts=" ($subdir_count dirs, $file_count files)"
        fi

        echo "${prefix}${connector} ${base}/${counts}${annotation}"

        # Recurse into subdirectories
        generate_tree "$subdir" "$next_prefix" $((depth + 1))
    done
}

# Detect key root files
detect_root_files() {
    local dir="$1"
    local key_files=""

    # Config files
    [ -f "$dir/package.json" ] && key_files+="package.json "
    [ -f "$dir/tsconfig.json" ] && key_files+="tsconfig.json "
    [ -f "$dir/composer.json" ] && key_files+="composer.json "
    [ -f "$dir/go.mod" ] && key_files+="go.mod "
    [ -f "$dir/pyproject.toml" ] && key_files+="pyproject.toml "
    [ -f "$dir/Cargo.toml" ] && key_files+="Cargo.toml "
    [ -f "$dir/pubspec.yaml" ] && key_files+="pubspec.yaml "
    [ -f "$dir/project.godot" ] && key_files+="project.godot "

    # Build configs
    [ -f "$dir/vite.config.ts" ] && key_files+="vite.config.ts "
    [ -f "$dir/vite.config.js" ] && key_files+="vite.config.js "
    [ -f "$dir/next.config.js" ] && key_files+="next.config.js "
    [ -f "$dir/next.config.mjs" ] && key_files+="next.config.mjs "
    [ -f "$dir/next.config.ts" ] && key_files+="next.config.ts "
    [ -f "$dir/webpack.config.js" ] && key_files+="webpack.config.js "
    [ -f "$dir/tailwind.config.js" ] && key_files+="tailwind.config.js "
    [ -f "$dir/tailwind.config.ts" ] && key_files+="tailwind.config.ts "

    # Test configs
    [ -f "$dir/vitest.config.ts" ] && key_files+="vitest.config.ts "
    [ -f "$dir/jest.config.ts" ] && key_files+="jest.config.ts "
    [ -f "$dir/jest.config.js" ] && key_files+="jest.config.js "
    [ -f "$dir/cypress.config.ts" ] && key_files+="cypress.config.ts "
    [ -f "$dir/playwright.config.ts" ] && key_files+="playwright.config.ts "

    # Linting
    [ -f "$dir/.eslintrc.js" ] && key_files+=".eslintrc.js "
    [ -f "$dir/.eslintrc.json" ] && key_files+=".eslintrc.json "
    [ -f "$dir/eslint.config.js" ] && key_files+="eslint.config.js "
    [ -f "$dir/.prettierrc" ] && key_files+=".prettierrc "
    [ -f "$dir/biome.json" ] && key_files+="biome.json "

    # CI/CD
    [ -f "$dir/Dockerfile" ] && key_files+="Dockerfile "
    [ -f "$dir/docker-compose.yml" ] && key_files+="docker-compose.yml "
    [ -f "$dir/Makefile" ] && key_files+="Makefile "

    # Env
    [ -f "$dir/.env.example" ] && key_files+=".env.example "
    [ -f "$dir/.envrc.template" ] && key_files+=".envrc.template "

    echo "$key_files"
}

# Generate the repo map
generate_repo_map() {
    local project_name=$(basename "$(cd "$PROJECT_ROOT" && pwd)")

    cat << HEADER
# Repo Map — $project_name

> Auto-generated by repo-map-gen.sh on $(date +%Y-%m-%d)
> Depth: $MAX_DEPTH levels | Skipped: node_modules, .git, dist, build, vendor, etc.

## Root Config Files

HEADER

    # List key root files
    cd "$PROJECT_ROOT"
    local root_files=$(detect_root_files ".")
    if [ -n "$root_files" ]; then
        for f in $root_files; do
            echo "- \`$f\`"
        done
    else
        echo "_No standard config files detected._"
    fi

    echo ""
    echo "## Directory Structure"
    echo ""
    echo '```'
    echo "$project_name/"

    generate_tree "." "" 0

    echo '```'

    echo ""
    echo "---"
    echo ""
    echo "_Regenerate: \`bash scripts/repo-map-gen.sh\`_"
}

# Main
main() {
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        echo "Repo Map Generator v1.0.0"
        echo ""
        echo "Usage: $0 [project-root] [output-file] [max-depth]"
        echo ""
        echo "Generates annotated directory tree in Markdown format."
        echo "Default depth: 3, skips node_modules/.git/dist/build/vendor."
        exit 0
    fi

    echo -e "${CYAN}Repo Map Generator v1.0.0${NC}"
    echo "========================="
    echo ""
    echo -e "Project: ${GREEN}$(basename "$(cd "$PROJECT_ROOT" && pwd)")${NC}"
    echo -e "Depth:   ${YELLOW}$MAX_DEPTH${NC}"

    if [ -n "$OUTPUT_FILE" ]; then
        echo -e "Output:  ${YELLOW}$OUTPUT_FILE${NC}"
        echo ""
        generate_repo_map > "$OUTPUT_FILE"
        local lines=$(wc -l < "$OUTPUT_FILE" | tr -d ' ')
        echo -e "${GREEN}Done!${NC} Generated $OUTPUT_FILE ($lines lines)"
    else
        echo ""
        generate_repo_map
    fi
}

main "$@"
