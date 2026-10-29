#!/bin/bash
# Context Compression Generator
# Creates token-efficient session context in TOON format
# Aura Frog Plugin Script

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Directories
OUTPUT_DIR="${1:-.claude}"
PROJECT_ROOT="${2:-.}"

usage() {
    echo "Context Compression Generator"
    echo ""
    echo "Usage: $0 [output-dir] [project-root]"
    echo ""
    echo "Generates session-context.toon for AI consumption."
    echo "Token-efficient TOON format with codebase patterns."
    echo ""
    echo "Output:"
    echo "  session-context.toon  - Patterns + workflow state (~200 tokens)"
}

# Detect project type and tech stack
detect_tech_stack() {
    local techs=""

    # Frontend
    [ -f "package.json" ] && grep -q '"react"' package.json 2>/dev/null && techs+="React,"
    [ -f "package.json" ] && grep -q '"next"' package.json 2>/dev/null && techs+="Next.js,"
    [ -f "package.json" ] && grep -q '"vue"' package.json 2>/dev/null && techs+="Vue,"
    [ -f "angular.json" ] && techs+="Angular,"
    [ -f "app.json" ] && grep -q '"expo"' app.json 2>/dev/null && techs+="React Native,"
    [ -f "pubspec.yaml" ] && techs+="Flutter,"

    # Backend
    [ -f "package.json" ] && grep -q '"express"' package.json 2>/dev/null && techs+="Express,"
    [ -f "package.json" ] && grep -q '"@nestjs"' package.json 2>/dev/null && techs+="NestJS,"
    [ -f "requirements.txt" ] || [ -f "pyproject.toml" ] && techs+="Python,"
    [ -f "go.mod" ] && techs+="Go,"
    [ -f "composer.json" ] && grep -q '"laravel"' composer.json 2>/dev/null && techs+="Laravel,"

    # TypeScript
    [ -f "tsconfig.json" ] && techs+="TypeScript,"

    # Styling
    [ -f "tailwind.config.js" ] || [ -f "tailwind.config.ts" ] && techs+="TailwindCSS,"

    # Remove trailing comma
    echo "${techs%,}"
}

# Detect file naming convention
detect_file_naming() {
    if [ -d "src/components" ]; then
        local sample=$(ls src/components/ 2>/dev/null | head -1)
        if [[ "$sample" =~ ^[A-Z] ]]; then
            echo "PascalCase"
        elif [[ "$sample" =~ ^[a-z].*-[a-z] ]]; then
            echo "kebab-case"
        else
            echo "camelCase"
        fi
    else
        echo "PascalCase"
    fi
}

# Detect import style
detect_import_style() {
    if grep -rq "from ['\"]@/" --include="*.ts" --include="*.tsx" . 2>/dev/null; then
        echo "absolute @/"
    elif grep -rq "from ['\"]~/" --include="*.ts" --include="*.tsx" . 2>/dev/null; then
        echo "absolute ~/"
    else
        echo "relative"
    fi
}

# Detect export pattern
detect_export_pattern() {
    local default_count=$(grep -r "export default" --include="*.ts" --include="*.tsx" . 2>/dev/null | wc -l)
    local named_count=$(grep -r "export const\|export function\|export class" --include="*.ts" --include="*.tsx" . 2>/dev/null | wc -l)

    if [ "$default_count" -gt "$named_count" ]; then
        echo "default"
    else
        echo "named"
    fi
}

# Detect error handling pattern
detect_error_pattern() {
    if grep -rq "Result<\|Either<\|{ ok:" --include="*.ts" --include="*.tsx" . 2>/dev/null; then
        echo "result"
    else
        echo "exceptions"
    fi
}

# Detect testing framework
detect_testing() {
    if [ -f "vitest.config.ts" ] || [ -f "vitest.config.js" ]; then
        echo "vitest"
    elif [ -f "jest.config.ts" ] || [ -f "jest.config.js" ]; then
        echo "jest"
    elif [ -f "pytest.ini" ] || [ -f "pyproject.toml" ]; then
        echo "pytest"
    else
        echo "unknown"
    fi
}

# Detect styling approach
detect_styling() {
    if [ -f "tailwind.config.js" ] || [ -f "tailwind.config.ts" ]; then
        echo "tailwind"
    elif grep -rq "styled-components\|@emotion" --include="*.ts" --include="*.tsx" . 2>/dev/null; then
        echo "css-in-js"
    elif find . -name "*.module.css" -type f 2>/dev/null | head -1 | grep -q .; then
        echo "css-modules"
    else
        echo "css"
    fi
}

# Detect indentation style
detect_indentation() {
    local sample_file=""
    for ext in ts tsx js jsx py go php dart rs; do
        sample_file=$(find . -name "*.$ext" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/vendor/*" -type f 2>/dev/null | head -1)
        [ -n "$sample_file" ] && break
    done

    if [ -n "$sample_file" ]; then
        local tab_count=$(grep -cP '^\t' "$sample_file" 2>/dev/null || echo 0)
        local space4_count=$(grep -cP '^    \S' "$sample_file" 2>/dev/null || echo 0)
        local space2_count=$(grep -cP '^  \S' "$sample_file" 2>/dev/null || echo 0)

        if [ "$tab_count" -gt "$space2_count" ] && [ "$tab_count" -gt "$space4_count" ]; then
            echo "tabs"
        elif [ "$space4_count" -gt "$space2_count" ]; then
            echo "4-space"
        else
            echo "2-space"
        fi
    else
        echo "2-space"
    fi
}

# Detect state management approach
detect_state_mgmt() {
    if grep -rq "zustand\|create(" --include="*.ts" --include="*.tsx" . 2>/dev/null; then
        echo "zustand"
    elif grep -rq "createSlice\|configureStore\|@reduxjs" --include="*.ts" --include="*.tsx" . 2>/dev/null; then
        echo "redux"
    elif grep -rq "defineStore" --include="*.ts" --include="*.vue" . 2>/dev/null; then
        echo "pinia"
    elif grep -rq "makeAutoObservable\|makeObservable" --include="*.ts" --include="*.tsx" . 2>/dev/null; then
        echo "mobx"
    elif grep -rq "BlocProvider\|Cubit" --include="*.dart" . 2>/dev/null; then
        echo "bloc"
    elif grep -rq "ChangeNotifierProvider\|Riverpod" --include="*.dart" . 2>/dev/null; then
        echo "riverpod"
    elif grep -rq "useContext\|createContext" --include="*.ts" --include="*.tsx" . 2>/dev/null; then
        echo "context"
    elif grep -rq "useState" --include="*.ts" --include="*.tsx" . 2>/dev/null; then
        echo "local-state"
    else
        echo "none"
    fi
}

# Detect API integration pattern
detect_api_pattern() {
    if grep -rq "@trpc\|trpc" --include="*.ts" --include="*.tsx" . 2>/dev/null; then
        echo "trpc"
    elif grep -rq "useQuery\|useMutation\|QueryClient" --include="*.ts" --include="*.tsx" . 2>/dev/null; then
        echo "react-query"
    elif grep -rq "useSWR" --include="*.ts" --include="*.tsx" . 2>/dev/null; then
        echo "swr"
    elif grep -rq "axios" --include="*.ts" --include="*.tsx" --include="*.js" . 2>/dev/null; then
        echo "axios"
    elif grep -rq "fetch(" --include="*.ts" --include="*.tsx" --include="*.js" . 2>/dev/null; then
        echo "fetch"
    elif grep -rq "http\.get\|http\.post\|Dio" --include="*.dart" . 2>/dev/null; then
        echo "dio/http"
    else
        echo "none"
    fi
}

# Detect component style (functional vs class)
detect_component_style() {
    local func_count=$(grep -rc "const.*=.*(" --include="*.tsx" --include="*.jsx" . 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')
    local class_count=$(grep -rc "class.*extends.*Component\|class.*extends.*React" --include="*.tsx" --include="*.jsx" . 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')

    if [ "$class_count" -gt "$func_count" ]; then
        echo "class"
    elif [ "$func_count" -gt 0 ]; then
        echo "functional"
    else
        echo "n/a"
    fi
}

# Detect environment variable pattern
detect_env_pattern() {
    if [ -f ".env.local" ] || [ -f ".env.development" ]; then
        echo "dotenv-multi"
    elif [ -f ".env" ] || [ -f ".env.example" ]; then
        echo "dotenv"
    elif [ -f ".envrc" ] || [ -f ".envrc.template" ]; then
        echo "direnv"
    elif grep -rq "process\.env\|os\.environ\|os\.Getenv" --include="*.ts" --include="*.js" --include="*.py" --include="*.go" . 2>/dev/null; then
        echo "env-vars"
    else
        echo "none"
    fi
}

# Detect monorepo tool
detect_monorepo() {
    if [ -f "pnpm-workspace.yaml" ]; then
        echo "pnpm"
    elif [ -f "lerna.json" ]; then
        echo "lerna"
    elif [ -f "nx.json" ]; then
        echo "nx"
    elif [ -f "turbo.json" ]; then
        echo "turbo"
    elif [ -f "rush.json" ]; then
        echo "rush"
    elif [ -f "package.json" ] && grep -q '"workspaces"' package.json 2>/dev/null; then
        echo "npm-workspaces"
    else
        echo "none"
    fi
}

# Get current git branch
get_git_branch() {
    git branch --show-current 2>/dev/null || echo "main"
}

# Get example for pattern
get_example() {
    local pattern="$1"
    case "$pattern" in
        "PascalCase") echo "UserProfile.tsx" ;;
        "kebab-case") echo "user-profile.tsx" ;;
        "camelCase") echo "userProfile.tsx" ;;
        "absolute @/") echo "@/components/Button" ;;
        "absolute ~/") echo "~/components/Button" ;;
        "relative") echo "../components/Button" ;;
        "named") echo "export const Component" ;;
        "default") echo "export default Component" ;;
        "result") echo "{ ok: true, data }" ;;
        "exceptions") echo "try/catch" ;;
        "tailwind") echo "className=\"flex\"" ;;
        "css-in-js") echo "styled.div" ;;
        "css-modules") echo "styles.container" ;;
        *) echo "$pattern" ;;
    esac
}

# Generate session-context.toon
generate_session_context() {
    local project_name=$(basename "$(pwd)")
    local tech_stack=$(detect_tech_stack)
    local file_naming=$(detect_file_naming)
    local imports=$(detect_import_style)
    local exports=$(detect_export_pattern)
    local errors=$(detect_error_pattern)
    local testing=$(detect_testing)
    local styling=$(detect_styling)
    local branch=$(get_git_branch)

    local indentation=$(detect_indentation)
    local state_mgmt=$(detect_state_mgmt)
    local api_pattern=$(detect_api_pattern)
    local component_style=$(detect_component_style)
    local env_pattern=$(detect_env_pattern)
    local monorepo=$(detect_monorepo)

    cat << EOF
# Session Context
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Valid for: 1 hour (regenerate if patterns change)

---

project:
  name: $project_name
  stack: $tech_stack

patterns[12]{type,convention,example}:
  file_naming,$file_naming,$(get_example "$file_naming")
  imports,$imports,$(get_example "$imports")
  exports,$exports,$(get_example "$exports")
  errors,$errors,$(get_example "$errors")
  testing,$testing,describe/it
  styling,$styling,$(get_example "$styling")
  indentation,$indentation,${indentation}
  state_mgmt,$state_mgmt,${state_mgmt}
  api_pattern,$api_pattern,${api_pattern}
  components,$component_style,${component_style}
  env,$env_pattern,${env_pattern}
  monorepo,$monorepo,${monorepo}

workflow:
  phase: 0
  feature: none
  branch: $branch

decisions[0]{id,choice,reason}:
  # Add decisions as they are made
EOF
}

# Main
main() {
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        usage
        exit 0
    fi

    cd "$PROJECT_ROOT"

    echo -e "${CYAN}Context Compression Generator${NC}"
    echo "======================================="
    echo ""
    echo -e "Project: ${GREEN}$(basename "$(pwd)")${NC}"
    echo -e "Output:  ${BLUE}$OUTPUT_DIR/session-context.toon${NC}"
    echo ""

    mkdir -p "$OUTPUT_DIR"

    echo -e "${YELLOW}Scanning codebase patterns (12 detections)...${NC}"

    echo -e "  File naming:   $(detect_file_naming)"
    echo -e "  Imports:       $(detect_import_style)"
    echo -e "  Exports:       $(detect_export_pattern)"
    echo -e "  Errors:        $(detect_error_pattern)"
    echo -e "  Testing:       $(detect_testing)"
    echo -e "  Styling:       $(detect_styling)"
    echo -e "  Indentation:   $(detect_indentation)"
    echo -e "  State mgmt:    $(detect_state_mgmt)"
    echo -e "  API pattern:   $(detect_api_pattern)"
    echo -e "  Components:    $(detect_component_style)"
    echo -e "  Env pattern:   $(detect_env_pattern)"
    echo -e "  Monorepo:      $(detect_monorepo)"
    echo ""

    echo -e "${YELLOW}Generating session-context.toon...${NC}"
    generate_session_context > "$OUTPUT_DIR/session-context.toon"

    local size=$(wc -c < "$OUTPUT_DIR/session-context.toon" | tr -d ' ')
    local tokens=$((size / 4))

    echo ""
    echo -e "${GREEN}Done!${NC}"
    echo ""
    echo "Generated: $OUTPUT_DIR/session-context.toon (~$tokens tokens)"
    echo ""
    echo -e "${CYAN}Usage:${NC}"
    echo "  Claude will auto-read .claude/session-context.toon at session start"
    echo "  To regenerate: bash scripts/context-compress.sh"
}

main "$@"
