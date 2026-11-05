---
last_aligned_with: v3.7.3
status: current
audience: active-user
---

# Project Detection Cache


---

## Overview

The project detection cache stores codebase analysis results to avoid re-scanning on every task. This significantly improves response time and reduces redundant file system operations.

**Supports:**
- Single project repos
- Monorepos (pnpm, npm/yarn workspaces, Lerna, Nx, Turborepo)
- Workspace folders with multiple independent project repos
- Individual detection stored in each project's `.claude/project-contexts/`

---

## Project Types

| Type | Description | Example |
|------|-------------|---------|
| **Single Project** | One project, one repo | Standard React/Laravel app |
| **Monorepo** | One repo, multiple packages | pnpm workspaces, Lerna, Nx, Turborepo |
| **Workspace** | Parent folder with multiple independent repos | ~/Projects/ with multiple git repos |

### Detection Priority

```
1. Check if monorepo (pnpm-workspace.yaml, lerna.json, turbo.json, workspaces in package.json)
   → If yes: Scan packages/apps, cache each + monorepo index

2. Check if workspace (no config files, contains 2+ project subdirs)
   → If yes: Scan projects, cache each + workspace index

3. Otherwise: Single project detection
```

### Monorepo Detection

Detects these monorepo tools:

| Tool | Config File |
|------|-------------|
| pnpm | `pnpm-workspace.yaml` |
| npm/yarn | `package.json` with `workspaces` |
| Lerna | `lerna.json` |
| Nx | `nx.json` |
| Turborepo | `turbo.json` |
| Rush | `rush.json` |

### Workspace Detection

A folder is considered a workspace if:
- It has no config files itself (not a project)
- It contains 2+ subdirectories that are projects

---

## What Gets Cached

```toon
cache_contents[8]{item,description,example}:
  projectType,Monorepo/library/single-repo,single-repo
  framework,Detected framework,nextjs/laravel/flutter
  packageManager,Detected package manager,pnpm/composer/pip
  testInfra,Test framework + directories,{framework: vitest testDirs: [tests]}
  filePatterns,Frontend/backend/template files,{templates: [blade] styles: [tailwind]}
  agents,Primary + secondary agents,{primary: web-nextjs secondary: [architect]}
  timestamp,When cache was created,1705849200000
  keyFilesHash,Hash of config files,a1b2c3d4e5f6
```

---

## Storage Location

**Single Project:**
```
.claude/project-contexts/[project-name]/project-detection.json
```

**Monorepo (single repo, multiple packages):**
```
~/my-monorepo/
├── .claude/project-contexts/
│   └── my-monorepo/
│       ├── project-detection.json       # Root project detection
│       └── monorepo-detection.json      # Monorepo index
├── packages/
│   ├── web/
│   │   └── .claude/project-contexts/
│   │       └── web/
│   │           └── project-detection.json   # Web package
│   └── api/
│       └── .claude/project-contexts/
│           └── api/
│               └── project-detection.json   # API package
└── apps/
    └── mobile/
        └── .claude/project-contexts/
            └── mobile/
                └── project-detection.json   # Mobile app
```

**Workspace (multiple independent repos):**
```
~/Projects/my-workspace/
├── .claude/project-contexts/
│   └── workspace-detection.json     # Index of all projects
├── frontend-app/
│   └── .claude/project-contexts/
│       └── frontend-app/
│           └── project-detection.json   # Frontend project
├── backend-api/
│   └── .claude/project-contexts/
│       └── backend-api/
│           └── project-detection.json   # Backend project
└── mobile-app/
    └── .claude/project-contexts/
        └── mobile-app/
            └── project-detection.json   # Mobile project
```

**Why `project-contexts/` instead of `cache/`?**
- `project-contexts/` = Persistent project configuration (detection, conventions, rules)
- `cache/` = Temporary session data (memory, auto-learn, learned patterns)

---

## Cache Invalidation

The cache is automatically invalidated when:

| Trigger | Description |
|---------|-------------|
| Config file changes | package.json, composer.json, go.mod, etc. mtime/size changed |
| Age > 24 hours | Cache older than 24 hours is refreshed |
| Manual refresh | User runs `/project:refresh` |

### Monitored Config Files

```toon
key_files[17]{file,detects}:
  package.json,JS/TS framework + dependencies
  composer.json,PHP framework
  pubspec.yaml,Flutter
  go.mod,Go modules
  pyproject.toml,Python framework
  requirements.txt,Python dependencies
  Cargo.toml,Rust
  project.godot,Godot engine
  angular.json,Angular
  next.config.js/mjs/ts,Next.js
  nuxt.config.ts,Nuxt
  vite.config.ts,Vite
  vitest.config.ts,Vitest
  jest.config.js,Jest
  tsconfig.json,TypeScript
```

---

## Using the Cache

### For Agent Detection

```javascript
// In agent-detector skill
const { detectProject, getCachedDetection } = require('./hooks/lib/project-cache.cjs');

// Fast path - try cache first
let detection = getCachedDetection();

// If cache miss, do full detection (auto-caches)
if (!detection) {
  detection = detectProject();
}

// Use detection.agents.primary, detection.framework, etc.
```

### Manual Commands

```bash
# Show current cached detection
/project:status

# Force refresh (re-scan codebase)
/project:refresh
```

---

## Cache Structure

**Single Project Cache (`project-detection.json`):**
```json
{
  "projectName": "my-app",
  "projectPath": "/path/to/my-app",
  "projectType": "single-repo",
  "packageManager": "pnpm",
  "framework": "nextjs",
  "testInfra": {
    "hasTests": true,
    "framework": "vitest",
    "configFile": "vitest.config.ts",
    "testDirs": ["tests", "__tests__"]
  },
  "filePatterns": {
    "frontend": [".tsx", ".jsx"],
    "backend": [".ts"],
    "templates": [],
    "styles": ["tailwind", "css"],
    "configs": ["typescript", "eslint"]
  },
  "agents": {
    "primary": "web-nextjs",
    "secondary": ["architect"],
    "available": ["architect", "security", "tester"]
  },
  "cwd": "/path/to/project",
  "detectedAt": "2026-01-21T10:30:00.000Z",
  "timestamp": 1705849200000,
  "keyFilesHash": "a1b2c3d4e5f6",
  "version": "2.0.0"
}
```

**Workspace Cache (`workspace-detection.json`):**
```json
{
  "isWorkspace": true,
  "workspacePath": "/path/to/workspace",
  "projectCount": 3,
  "projects": [
    {
      "name": "frontend-app",
      "path": "frontend-app",
      "absolutePath": "/path/to/workspace/frontend-app",
      "framework": "nextjs",
      "packageManager": "pnpm",
      "agents": { "primary": "web-nextjs", "secondary": [] },
      "testInfra": "vitest"
    },
    {
      "name": "backend-api",
      "path": "backend-api",
      "absolutePath": "/path/to/workspace/backend-api",
      "framework": "laravel",
      "packageManager": "composer",
      "agents": { "primary": "backend-laravel", "secondary": ["frontend"] },
      "testInfra": "phpunit"
    },
    {
      "name": "mobile-app",
      "path": "mobile-app",
      "absolutePath": "/path/to/workspace/mobile-app",
      "framework": "react-native",
      "packageManager": "yarn",
      "agents": { "primary": "mobile", "secondary": [] },
      "testInfra": "jest"
    }
  ],
  "detectedAt": "2026-01-21T10:30:00.000Z",
  "timestamp": 1705849200000,
  "version": "2.0.0"
}
```

---

## Performance Impact

| Scenario | Without Cache | With Cache |
|----------|---------------|------------|
| First task | ~200ms (full scan) | ~200ms (full scan) |
| Subsequent tasks | ~200ms (re-scan) | ~5ms (cache read) |
| After config change | ~200ms | ~200ms (auto-refresh) |

**Token savings:** Cache eliminates repeated file reads, saving ~100-500 tokens per task in exploration overhead.

---

## Troubleshooting

### Cache Not Being Used

1. Check if cache file exists: `ls .claude/cache/project-detection.json`
2. Verify cache is valid: Check timestamp and key files hash
3. Force refresh: `/project:refresh`

### Wrong Detection

1. Run `/project:refresh` to rescan
2. Check if new dependencies are installed
3. Verify config files are correct

### Cache Corruption

```bash
# Delete cache to force fresh scan
rm .claude/cache/project-detection.json
```

---

## Workspace Task Matching

When in a workspace, the system can match tasks to specific projects:

```javascript
const { getProjectForTask } = require('./hooks/lib/project-cache.cjs');

// User task: "Fix the login bug in backend-api"
const result = getProjectForTask("Fix the login bug in backend-api");

// result:
// {
//   workspace: { isWorkspace: true, projects: [...] },
//   targetProject: { framework: "laravel", agents: {...} },
//   matchedBy: "task_mention"
// }
```

---

## Related Files

- **Cache Library:** `hooks/lib/project-cache.cjs`
- **Agent Detector:** `skills/agent-detector/SKILL.md`
- **Config Utils:** `hooks/lib/config-utils.cjs`
- **Commands:** `commands/project/refresh.md`, `commands/project/status.md`

---

