# Scanner Agent - Reference Patterns

**Source:** `agents/scanner.md`
**Load:** On-demand when deep project detection expertise needed

---

## Project Detection

```toon
detection_sources[10]{file,detects,agent_mapping}:
  package.json,JS/TS framework + deps,web-*/backend-nodejs
  composer.json,PHP/Laravel,backend-laravel
  pubspec.yaml,Flutter/Dart,mobile-flutter
  go.mod,Go modules,backend-go
  pyproject.toml,Python framework,backend-python
  requirements.txt,Python deps,backend-python
  Cargo.toml,Rust,backend-rust
  angular.json,Angular,web-angular
  next.config.*,Next.js,web-nextjs
  project.godot,Godot engine,gamedev
```

**Detection priority:** 1) Explicit config files (angular.json, next.config.js), 2) Package dependencies, 3) File patterns (*.vue, *.dart), 4) Directory structure.

---

## Project Types

```toon
project_types[4]{type,detection}:
  single-repo,One package.json/composer.json at root
  monorepo,"pnpm-workspace.yaml / lerna.json / turbo.json / nx.json / rush.json / package.json workspaces"
  workspace,Parent folder with 2+ project subdirs
  library,exports field in package.json
```

---

## Configuration Loading

**Load order:** 1) project-config.yaml, 2) conventions.md, 3) rules.md, 4) examples.md (all from `.claude/project-contexts/[project-name]/`).

### Project Config Schema

```yaml
project: { name, type }
tech_stack: { framework, language, package_manager }
agents: { primary, secondary[] }
testing: { framework, coverage_target }
integrations: { jira_project, figma_file }
```

---

## Cache Management

```toon
cache_locations[3]{type,path}:
  Single Project,.claude/project-contexts/[name]/project-detection.json
  Monorepo root,.claude/project-contexts/[root]/monorepo-detection.json
  Workspace,.claude/project-contexts/workspace-detection.json
```

**Invalidation:** Config file mtime/size changed -> re-scan. Cache >24h -> re-scan. `/project refresh` -> force re-scan.

**Fast path:** Use cached detection (~5ms) when valid. Full scan (~200ms) on cache miss, then save.

---

## Context Tracking

```toon
context_tracking[6]{item,purpose}:
  Active project,Currently focused project (for workspaces)
  Active agents,Agents activated this session
  Workflow phase,Current phase in 5-phase workflow
  Pending approvals,Items waiting for user approval
  Modified files,Files changed this session
  Test status,Current test pass/fail state
```

Context injects into: agent detection (project-specific priority), subagent spawning (phase, approvals), session continuation (state preservation).

---

## Integration with Agent Detector

Agent detector runs every message -> calls scanner for context -> scanner returns cached detection -> detector uses it for agent scoring -> detected agent loads with project context.

---

## Legacy Agents (Deprecated)

`project-detector.md`, `project-config-loader.md`, `project-context-manager.md` are consolidated into scanner. Legacy files remain for backwards compatibility but redirect here.
