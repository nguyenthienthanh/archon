#!/bin/bash
# Architecture Analyzer
# Generates architecture overview from codebase analysis
# Version: 1.0.0
#
# Usage: ./architecture-gen.sh [project-root] [output-file]
# Output: Markdown file with architecture analysis

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="${1:-.}"
OUTPUT_FILE="${2:-}"

# Detect architecture type
detect_architecture() {
    local dir="$1"
    cd "$dir"

    # Monorepo
    if [ -f "lerna.json" ] || [ -f "pnpm-workspace.yaml" ] || [ -f "nx.json" ] || [ -f "turbo.json" ]; then
        echo "monorepo"
        return
    fi

    # Check for packages/apps directories
    if [ -d "packages" ] || [ -d "apps" ]; then
        echo "monorepo"
        return
    fi

    # Microservices
    if [ -d "services" ] && [ $(find "services" -maxdepth 1 -type d | wc -l) -gt 3 ]; then
        echo "microservices"
        return
    fi

    # Plugin/Extension
    if [ -f ".claude-plugin/plugin.json" ] || [ -f ".claude-plugin/marketplace.json" ] || [ -f "plugin.json" ] || [ -f "manifest.json" ]; then
        echo "plugin"
        return
    fi
    # Check for nested plugin structure (e.g., archon-os/.claude-plugin/)
    if find . -maxdepth 2 -name "plugin.json" -path "*/.claude-plugin/*" 2>/dev/null | head -1 | grep -q .; then
        echo "plugin"
        return
    fi

    # Full-stack (has both frontend and backend)
    local has_frontend=false
    local has_backend=false
    [ -d "src/components" ] || [ -d "src/pages" ] || [ -d "src/app" ] || [ -d "components" ] || [ -d "pages" ] && has_frontend=true
    [ -d "src/api" ] || [ -d "api" ] || [ -d "server" ] || [ -d "backend" ] || [ -f "routes/api.php" ] && has_backend=true

    if $has_frontend && $has_backend; then
        echo "fullstack"
        return
    fi

    # MVC
    if [ -d "app/Http/Controllers" ] || ([ -d "controllers" ] && [ -d "models" ] && [ -d "views" ]); then
        echo "mvc"
        return
    fi

    # SPA frontend
    if $has_frontend; then
        echo "spa"
        return
    fi

    # API backend
    if $has_backend || [ -d "src/routes" ] || [ -d "src/controllers" ]; then
        echo "api"
        return
    fi

    echo "standard"
}

# Detect key dependencies and their purposes
detect_key_dependencies() {
    local dir="$1"
    cd "$dir"

    if [ -f "package.json" ]; then
        echo "## Key Dependencies (from package.json)"
        echo ""
        echo "| Package | Purpose |"
        echo "|---------|---------|"

        # Map common packages to purposes
        # Portable grep -E (grep -P is GNU-only; silently empty on macOS).
        local deps=$(grep -oE '"[^"]+"[[:space:]]*:[[:space:]]*"[^"]+"' package.json 2>/dev/null | head -30)

        while IFS= read -r line; do
            local pkg=$(echo "$line" | grep -oE '"[^"]+"' | head -1 | tr -d '"')
            [ -z "$pkg" ] && continue

            local purpose=""
            case "$pkg" in
                react) purpose="UI framework" ;;
                react-dom) purpose="React DOM rendering" ;;
                react-native) purpose="Mobile framework" ;;
                next) purpose="React meta-framework (SSR/SSG)" ;;
                vue) purpose="UI framework" ;;
                nuxt) purpose="Vue meta-framework" ;;
                angular*) purpose="UI framework" ;;
                express) purpose="HTTP server" ;;
                fastify) purpose="HTTP server" ;;
                @nestjs*) purpose="Backend framework" ;;
                typescript) purpose="Type system" ;;
                tailwindcss) purpose="Utility-first CSS" ;;
                prisma|@prisma*) purpose="Database ORM" ;;
                drizzle*) purpose="Database ORM" ;;
                mongoose) purpose="MongoDB ODM" ;;
                sequelize) purpose="SQL ORM" ;;
                typeorm) purpose="SQL ORM" ;;
                axios) purpose="HTTP client" ;;
                @tanstack/react-query|react-query) purpose="Server state management" ;;
                zustand) purpose="Client state management" ;;
                redux|@reduxjs*) purpose="State management" ;;
                mobx*) purpose="State management" ;;
                pinia) purpose="State management (Vue)" ;;
                zod) purpose="Schema validation" ;;
                joi) purpose="Schema validation" ;;
                vitest) purpose="Unit testing" ;;
                jest) purpose="Unit testing" ;;
                cypress) purpose="E2E testing" ;;
                @playwright*) purpose="E2E testing" ;;
                eslint) purpose="Linting" ;;
                prettier) purpose="Code formatting" ;;
                husky) purpose="Git hooks" ;;
                @auth*|next-auth|passport) purpose="Authentication" ;;
                stripe) purpose="Payment processing" ;;
                socket.io*) purpose="WebSocket communication" ;;
                graphql|@apollo*) purpose="GraphQL" ;;
                trpc|@trpc*) purpose="Type-safe API" ;;
                i18next|react-i18next) purpose="Internationalization" ;;
                framer-motion) purpose="Animations" ;;
                @sentry*) purpose="Error tracking" ;;
                winston|pino) purpose="Logging" ;;
                bull|bullmq) purpose="Job queue" ;;
                ioredis|redis) purpose="Redis client" ;;
                sharp) purpose="Image processing" ;;
                dotenv) purpose="Environment variables" ;;
                *) continue ;;
            esac

            [ -n "$purpose" ] && echo "| \`$pkg\` | $purpose |"
        done <<< "$deps"
        echo ""
    fi

    if [ -f "composer.json" ]; then
        echo "## Key Dependencies (from composer.json)"
        echo ""
        echo "| Package | Purpose |"
        echo "|---------|---------|"

        # Portable grep -E (grep -P is GNU-only; silently empty on macOS).
        local deps=$(grep -oE '"[^/]+/[^"]+"[[:space:]]*:[[:space:]]*"[^"]+"' composer.json 2>/dev/null | head -20)
        while IFS= read -r line; do
            local pkg=$(echo "$line" | grep -oE '"[^"]+"' | head -1 | tr -d '"')
            [ -z "$pkg" ] && continue
            local purpose=""
            case "$pkg" in
                laravel/framework) purpose="PHP framework" ;;
                laravel/sanctum) purpose="API authentication" ;;
                laravel/horizon) purpose="Queue monitoring" ;;
                spatie/*) purpose="Laravel utilities" ;;
                *) continue ;;
            esac
            [ -n "$purpose" ] && echo "| \`$pkg\` | $purpose |"
        done <<< "$deps"
        echo ""
    fi

    if [ -f "go.mod" ]; then
        echo "## Key Dependencies (from go.mod)"
        echo ""
        echo "| Module | Purpose |"
        echo "|--------|---------|"
        grep -E '^\t' go.mod 2>/dev/null | head -15 | while read -r line; do
            local mod=$(echo "$line" | awk '{print $1}')
            local purpose=""
            case "$mod" in
                *gin-gonic*) purpose="HTTP framework" ;;
                *echo*) purpose="HTTP framework" ;;
                *fiber*) purpose="HTTP framework" ;;
                *gorm*) purpose="ORM" ;;
                *sqlx*) purpose="SQL toolkit" ;;
                *jwt*) purpose="JWT auth" ;;
                *viper*) purpose="Configuration" ;;
                *cobra*) purpose="CLI framework" ;;
                *zap*|*logrus*) purpose="Logging" ;;
                *testify*) purpose="Testing" ;;
                *) continue ;;
            esac
            [ -n "$purpose" ] && echo "| \`$mod\` | $purpose |"
        done
        echo ""
    fi

    if [ -f "requirements.txt" ] || [ -f "pyproject.toml" ]; then
        echo "## Key Dependencies (Python)"
        echo ""
        echo "| Package | Purpose |"
        echo "|---------|---------|"
        local deps_file="requirements.txt"
        [ -f "pyproject.toml" ] && deps_file="pyproject.toml"
        grep -oE '^[A-Za-z0-9_][A-Za-z0-9_-]+' "$deps_file" 2>/dev/null | head -15 | while read -r pkg; do
            local purpose=""
            case "$pkg" in
                django) purpose="Web framework" ;;
                fastapi) purpose="API framework" ;;
                flask) purpose="Web microframework" ;;
                sqlalchemy) purpose="ORM" ;;
                celery) purpose="Task queue" ;;
                pytest) purpose="Testing" ;;
                pydantic) purpose="Data validation" ;;
                *) continue ;;
            esac
            [ -n "$purpose" ] && echo "| \`$pkg\` | $purpose |"
        done
        echo ""
    fi
}

# Detect design patterns in use
detect_patterns() {
    local dir="$1"
    cd "$dir"

    echo "## Design Patterns Detected"
    echo ""

    local patterns=""

    # Repository pattern
    if find . -path "*/repositories/*" -o -path "*/repository/*" -o -name "*Repository.*" 2>/dev/null | grep -q .; then
        patterns+="- **Repository Pattern** — Data access abstracted behind repository interfaces\n"
    fi

    # Service layer
    if find . -path "*/services/*" -o -path "*/service/*" -o -name "*Service.*" 2>/dev/null | grep -q .; then
        patterns+="- **Service Layer** — Business logic encapsulated in service classes\n"
    fi

    # Controller pattern
    if find . -path "*/controllers/*" -o -path "*/controller/*" -o -name "*Controller.*" 2>/dev/null | grep -q .; then
        patterns+="- **Controller Pattern** — Request handling separated into controllers\n"
    fi

    # Provider/Context pattern
    if grep -rl "createContext\|Provider\|useContext" --include="*.ts" --include="*.tsx" --include="*.jsx" . 2>/dev/null | head -1 | grep -q .; then
        patterns+="- **Provider/Context** — React context for dependency injection\n"
    fi

    # Custom hooks
    if find . -name "use*.ts" -o -name "use*.tsx" -o -name "use*.js" 2>/dev/null | grep -v node_modules | head -1 | grep -q .; then
        patterns+="- **Custom Hooks** — Reusable logic extracted into hooks\n"
    fi

    # Middleware
    if find . -path "*/middleware/*" -o -name "*middleware*" 2>/dev/null | grep -v node_modules | head -1 | grep -q .; then
        patterns+="- **Middleware** — Request/response pipeline middleware\n"
    fi

    # Event-driven
    if find . -path "*/events/*" -o -path "*/listeners/*" -o -name "*Event.*" 2>/dev/null | head -1 | grep -q .; then
        patterns+="- **Event-Driven** — Event emitters and listeners for decoupling\n"
    fi

    # Factory
    if grep -rl "Factory\|factory" --include="*.ts" --include="*.js" --include="*.py" --include="*.go" --include="*.php" . 2>/dev/null | grep -v node_modules | head -1 | grep -q .; then
        patterns+="- **Factory** — Object creation through factory methods\n"
    fi

    # Singleton
    if grep -rl "getInstance\|singleton" --include="*.ts" --include="*.js" . 2>/dev/null | grep -v node_modules | head -1 | grep -q .; then
        patterns+="- **Singleton** — Single instance pattern for shared resources\n"
    fi

    # Observer (pub/sub)
    if grep -rl "subscribe\|emit\|on(" --include="*.ts" --include="*.js" . 2>/dev/null | grep -v node_modules | head -1 | grep -q .; then
        patterns+="- **Observer/PubSub** — Event subscription pattern\n"
    fi

    if [ -n "$patterns" ]; then
        echo -e "$patterns"
    else
        echo "_No common design patterns auto-detected. Claude will analyze during init._"
        echo ""
    fi
}

# Detect module boundaries
detect_modules() {
    local dir="$1"
    cd "$dir"

    echo "## Module Map"
    echo ""

    # Feature-based modules
    if [ -d "src/features" ] || [ -d "src/modules" ] || [ -d "features" ] || [ -d "modules" ]; then
        local mod_dir=""
        [ -d "src/features" ] && mod_dir="src/features"
        [ -d "src/modules" ] && mod_dir="src/modules"
        [ -d "features" ] && mod_dir="features"
        [ -d "modules" ] && mod_dir="modules"

        echo "**Organization:** Feature-based modules"
        echo ""
        echo "| Module | Files | Purpose |"
        echo "|--------|-------|---------|"

        find "$mod_dir" -maxdepth 1 -type d | tail -n +2 | sort | while read -r mod; do
            local name=$(basename "$mod")
            local fcount=$(find "$mod" -type f 2>/dev/null | wc -l | tr -d ' ')
            echo "| \`$name\` | $fcount | _auto-detect during init_ |"
        done
        echo ""
        return
    fi

    # Layer-based (MVC, etc.)
    local layers=""
    [ -d "src/components" ] && layers+="components "
    [ -d "src/pages" ] || [ -d "src/app" ] && layers+="pages/routes "
    [ -d "src/hooks" ] && layers+="hooks "
    [ -d "src/services" ] && layers+="services "
    [ -d "src/utils" ] || [ -d "src/lib" ] && layers+="utils/lib "
    [ -d "src/store" ] || [ -d "src/stores" ] && layers+="store "
    [ -d "src/types" ] && layers+="types "
    [ -d "src/api" ] && layers+="api "
    [ -d "app/Http/Controllers" ] && layers+="controllers "
    [ -d "app/Models" ] && layers+="models "
    [ -d "app/Services" ] && layers+="services "

    if [ -n "$layers" ]; then
        echo "**Organization:** Layer-based"
        echo ""
        echo "Detected layers: \`$layers\`"
        echo ""
        echo "_Claude will analyze layer relationships and data flow during init._"
        echo ""
    else
        echo "_Module structure will be analyzed by Claude during init._"
        echo ""
    fi
}

# Detect data flow pattern
detect_data_flow() {
    local dir="$1"
    cd "$dir"

    echo "## Data Flow"
    echo ""

    # REST API flow
    if find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" 2>/dev/null | \
        xargs grep -l "fetch\|axios\|useSWR\|useQuery\|trpc" 2>/dev/null | grep -v node_modules | head -1 | grep -q .; then

        local api_style=""
        grep -rl "trpc\|@trpc" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | head -1 | grep -q . && api_style="tRPC (type-safe)"
        grep -rl "useQuery\|useMutation" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | head -1 | grep -q . && api_style="${api_style:+$api_style + }React Query"
        grep -rl "useSWR" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | head -1 | grep -q . && api_style="${api_style:+$api_style + }SWR"
        grep -rl "axios" --include="*.ts" --include="*.tsx" --include="*.js" . 2>/dev/null | grep -v node_modules | head -1 | grep -q . && api_style="${api_style:+$api_style + }Axios"

        if [ -n "$api_style" ]; then
            echo "**API Client:** $api_style"
        fi
    fi

    # State management flow
    local state_mgmt=""
    grep -rl "zustand\|create(" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | head -1 | grep -q . && state_mgmt="Zustand"
    grep -rl "createSlice\|configureStore" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | head -1 | grep -q . && state_mgmt="Redux Toolkit"
    grep -rl "defineStore" --include="*.ts" --include="*.vue" . 2>/dev/null | grep -v node_modules | head -1 | grep -q . && state_mgmt="Pinia"
    grep -rl "makeAutoObservable\|makeObservable" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | head -1 | grep -q . && state_mgmt="MobX"

    if [ -n "$state_mgmt" ]; then
        echo "**State Management:** $state_mgmt"
    fi

    echo ""
    echo "_Detailed data flow analysis will be performed by Claude during init._"
    echo ""
}

# Generate architecture document
generate_architecture() {
    local project_name=$(basename "$(cd "$PROJECT_ROOT" && pwd)")
    local arch_type=$(detect_architecture "$PROJECT_ROOT")

    cat << HEADER
# Architecture — $project_name

> Auto-generated by architecture-gen.sh on $(date +%Y-%m-%d)
> Architecture type: $arch_type

## Overview

**Type:** $arch_type
HEADER

    case "$arch_type" in
        monorepo) echo "**Description:** Multi-package repository with shared tooling" ;;
        microservices) echo "**Description:** Multiple independent services" ;;
        fullstack) echo "**Description:** Frontend + backend in single repository" ;;
        spa) echo "**Description:** Single-page application" ;;
        api) echo "**Description:** API backend service" ;;
        mvc) echo "**Description:** Model-View-Controller architecture" ;;
        plugin) echo "**Description:** Plugin/extension for a host platform" ;;
        *) echo "**Description:** Standard project structure" ;;
    esac

    echo ""

    cd "$PROJECT_ROOT"

    # Dependencies
    detect_key_dependencies "$PROJECT_ROOT"

    # Modules
    detect_modules "$PROJECT_ROOT"

    # Patterns
    detect_patterns "$PROJECT_ROOT"

    # Data flow
    detect_data_flow "$PROJECT_ROOT"

    echo "---"
    echo ""
    echo "_Regenerate: \`bash scripts/architecture-gen.sh\`_"
}

# Main
main() {
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        echo "Architecture Analyzer v1.0.0"
        echo ""
        echo "Usage: $0 [project-root] [output-file]"
        echo ""
        echo "Analyzes codebase architecture and generates a Markdown report."
        echo "Detects: architecture type, dependencies, modules, patterns, data flow."
        exit 0
    fi

    echo -e "${CYAN}Architecture Analyzer v1.0.0${NC}"
    echo "============================"
    echo ""
    echo -e "Project: ${GREEN}$(basename "$(cd "$PROJECT_ROOT" && pwd)")${NC}"

    if [ -n "$OUTPUT_FILE" ]; then
        echo -e "Output:  ${YELLOW}$OUTPUT_FILE${NC}"
        echo ""
        echo -e "${YELLOW}Analyzing architecture...${NC}"
        generate_architecture > "$OUTPUT_FILE"
        local lines=$(wc -l < "$OUTPUT_FILE" | tr -d ' ')
        echo -e "${GREEN}Done!${NC} Generated $OUTPUT_FILE ($lines lines)"
    else
        echo ""
        generate_architecture
    fi
}

main "$@"
