<div align="center">

<img alt="The Archon OS owl watching a plan tree" src="assets/brand/mascot.svg" width="520">

# Contributing to Archon OS

### A Plugin for [Claude Code](https://docs.anthropic.com/en/docs/claude-code)

> **Planning-first AI engineering** — plans that survive a session reset

</div>

---

Thank you for your interest in contributing to Archon OS! This is a plugin for **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** (Anthropic's official CLI for Claude). This guide will help you get started.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Version Management](#version-management)
- [Documentation](#documentation)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

---

## Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/). By participating, you agree to uphold this code. Please report unacceptable behavior to the project maintainers.

---

## Getting Started

### Prerequisites

- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** — Anthropic's agentic coding CLI (this plugin is built for it)
- **Git** — Version control
- **Bash** — For running scripts (macOS/Linux/WSL)
- **jq** — JSON processing (for integration scripts)

### Fork and Clone

```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/YOUR-USERNAME/archon.git
cd archon
```

---

## Development Setup

### 1. Install the Plugin Locally

```bash
# In Claude Code, add your local repository as a marketplace
/plugin marketplace add /path/to/your/archon

# Install from your local marketplace
/plugin install archon-os@local-dev
```

### 2. Create Local Settings

```bash
cd archon-os
cp settings.example.json settings.local.json
```

### 3. Set Up Environment Variables (Optional)

```bash
cp .envrc.template .envrc
# Edit .envrc with your test credentials
```

---

## Project Structure

```
<repo root>
├── archon-os/                       # Main plugin directory
│   ├── AGENTS.md                    # Canonical AI instructions
│   ├── CLAUDE.md                    # Legacy bridge → @AGENTS.md
│   ├── .mcp.json                    # Bundled MCP servers config
│   ├── stats.json                   # Generated component counts (single source)
│   ├── agents/                      # Specialized agent definitions
│   ├── commands/                    # Slash commands (/run /check /design /project /archon /help + /archon-os:* planning suite)
│   ├── skills/                      # Skills (auto-invoke + on-demand reference)
│   ├── rules/                       # Quality rules (core + agent + workflow)
│   ├── hooks/                       # Lifecycle hooks (.cjs scripts)
│   ├── docs/                        # AI reference docs + phase guides
│   ├── templates/                   # Document templates
│   ├── scripts/                     # Bash + Node scripts (CI, plans, preflight, workflow, security)
│   └── project-contexts/            # Project templates
├── __tests__/                       # Jest suites for hooks + scripts
├── assets/brand/                    # Brand marks (SVG sources + derived PNG)
├── docs/                            # Human docs (architecture, guides, ADRs, reference)
├── scripts/                         # Repo-level scripts
│   ├── archon                       # CLI wrapper
│   ├── af                           # symlink -> archon (the pre-v4 name)
│   ├── audit/                       # Reference-integrity + portability gates
│   ├── gen-plugin-readme.sh         # archon-os/README.md <- README.md
│   └── sync-version.sh              # Version synchronization
├── CONTRIBUTING.md                  # This file
└── README.md                        # Project overview
```

**Component counts** are not written down here on purpose. Run
`archon-os/scripts/ci/generate-stats.sh` and read `archon-os/stats.json`;
`archon-os/scripts/ci/validate-readme-counts.sh` is the gate that keeps the
README honest about them.

---

## Making Changes

### Branching Strategy

We use **GitHub Flow**:

1. **main** - Production-ready code
2. **feature/** - New features (`feature/add-python-agent`)
3. **fix/** - Bug fixes (`fix/approval-gate-bug`)
4. **docs/** - Documentation (`docs/update-readme`)
5. **chore/** - Maintenance (`chore/bump-version`)

### Creating a Branch

```bash
git checkout -b feature/your-feature-name
```

### Coding Standards

**File Permissions:**
- Documentation: `644` (rw-r--r--)
- Scripts: `755` (rwxr-xr-x)
- Config files: `644`

**Markdown:**
- Use `##` for main sections, `###` for subsections
- Include code fences with language identifiers
- Keep line length ≤120 characters

**YAML:**
- Use 2-space indentation
- Quote string values
- Comment complex configurations

**Bash Scripts:**
- Use `#!/bin/bash` shebang
- Include error handling: `set -e`
- Add usage documentation in comments
- Use descriptive variable names

---

## Version Management

### Version Format

We use **Semantic Versioning** (SemVer):
- **Major.Minor.Patch** (e.g., `5.0.0`)
- **Suffixes:** `-alpha`, `-beta`, `-rc1`

### Synchronizing Versions

Use the version sync script to update versions across all files:

```bash
# Update to new version
./scripts/sync-version.sh 1.0.0

# Review changes
git diff

# Commit
git commit -am "chore: Bump version to 1.0.0"
```

### Files with Version Numbers

The sync script updates (the authoritative list is `MD_FILES` / `JSON_FILES` /
`YAML_FILES` in `scripts/sync-version.sh`):
- `archon-os/.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `archon-os/CLAUDE.md` — the canonical-instructions comment
- `README.md` — nav line and the sample `/archon status` output. It is the landing
  page, not the spec: deep technical content belongs in `docs/` (see
  `docs/contributing/README.md`). `archon-os/README.md` is GENERATED from it —
  run `bash scripts/gen-plugin-readme.sh`, never edit it by hand.
- `archon-os/ccpm-config.yaml` — only if you generated one locally (gitignored)

**Manual Update:**
- `docs/reference/CHANGELOG.md` — add release notes

> Version footers were removed from the component READMEs in v2.1.0+, so there
> is nothing to bump in `agents/README.md`, `skills/README.md` and friends.

---

## Documentation

### Documentation Standards

**Required Sections:**
- Purpose/Overview
- Installation/Setup
- Usage/Examples
- Configuration
- Troubleshooting (if applicable)

**File Headers:**
```markdown
# Document Title

**Version:** X.Y.Z
**Last Updated:** YYYY-MM-DD
**Purpose:** Brief description

---
```

### Documentation Types

1. **User Documentation** (`docs/`)
   - Setup guides, integration guides, troubleshooting
   - Organized into: getting-started, architecture, guides, operations, reference

2. **AI Documentation** (`archon-os/docs/`)
   - Compact TOON-formatted references for Claude
   - Phase definitions

3. **Agent Documentation** (`archon-os/agents/`)
   - Agent capabilities
   - Configuration
   - Examples

4. **Command Documentation** (`archon-os/commands/`)
   - Command usage
   - Parameters
   - Examples

### Updating Documentation

When adding features:
1. Update relevant guide in `docs/` (human docs) or `archon-os/docs/` (AI refs)
2. Update `README.md` if user-facing
3. Add examples to appropriate files
4. Update `docs/reference/CHANGELOG.md`

---

## Testing

### Manual Testing

**Before Submitting:**
1. Install plugin locally
2. Test in a sample project
3. Verify all commands work
4. Check documentation accuracy

**Test Checklist:**
```bash
# 1. Plugin installation
/plugin install archon-os@local-dev

# 2. Project initialization
cd ~/test-project
project:init

# 3. Workflow execution
workflow:start "Test feature"

# 4. Agent activation
agent:list

# 5. MCP integrations (if applicable)
mcp:status
```

### Integration Testing

Archon OS uses bundled MCP servers for integrations (JIRA, Figma, Confluence, Slack).

**Testing MCP Integrations:**

1. Configure environment variables in `.envrc`:
```bash
export JIRA_URL="https://test.atlassian.net"
export JIRA_EMAIL="test@example.com"
export JIRA_API_TOKEN="test-token"
direnv allow
```

2. Restart Claude Code (MCP loads at startup)

3. Verify MCP status:
```bash
mcp:status
```

4. Test with a ticket reference in conversation:
```
"Fetch JIRA ticket TEST-123"
```

**See:** [MCP Guide](docs/operations/MCP_GUIDE.md) for complete MCP setup

---

## Behavioral Evaluation

Every PR that touches `skills/`, `agents/`, `commands/`, or `rules/` automatically runs a **behavioral eval** via [`cc-plugin-eval`](https://github.com/sjnims/cc-plugin-eval) in GitHub Actions. This measures whether skills still trigger correctly when expected — catching regressions when a rewrite breaks the description-to-intent matching.

### What runs

- Auto-invoke skills only (the 5 skills with `autoInvoke: true`)
- 5 scenarios per skill, auto-generated for diversity
- Compared against `archon-os/eval-baseline.json`

### Thresholds

- **Absolute:** trigger accuracy ≥ 85% per skill
- **Relative:** no drop > 10% from baseline

CI fails if either threshold breaks. If that happens, check the `eval-results.json` artifact uploaded by the Action for per-scenario detail.

### Running locally before PR

```bash
# From repo root, after cc-plugin-eval is installed (see EVAL_SETUP.md)
npx cc-plugin-eval run -p ./archon-os \
  --components skills --filter "autoInvoke:true" \
  --output eval-results.json

node archon-os/scripts/ci/check-eval-regression.cjs \
  --current eval-results.json \
  --baseline archon-os/eval-baseline.json
```

### Updating the baseline

Regenerate `archon-os/eval-baseline.json` when:
- Adding a new auto-invoke skill
- Substantially rewriting a skill description in a way that improves accuracy

Full setup + troubleshooting: [docs/guides/EVAL_SETUP.md](docs/guides/EVAL_SETUP.md).

---

## Submitting Changes

### Commit Message Format

We use **Conventional Commits**:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `chore` - Maintenance
- `refactor` - Code refactoring
- `test` - Testing
- `perf` - Performance

**Examples:**
```bash
feat(agents): Add Python backend agent
fix(workflow): Fix approval gate auto-continue
docs(integration): Update JIRA setup guide
chore(deps): Bump version to 1.0.0
```

### Pull Request Process

1. **Create Pull Request**
   - Use clear, descriptive title
   - Reference related issues: `Fixes #123`
   - Provide detailed description

2. **PR Template:**
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Refactoring

## Testing
- [ ] Manual testing completed
- [ ] Documentation updated
- [ ] No breaking changes

## Checklist
- [ ] Code follows project standards
- [ ] Commit messages follow conventions
- [ ] Documentation updated
- [ ] Version bumped (if needed)
```

3. **Review Process**
   - Address review feedback
   - Keep PR focused and atomic
   - Squash commits if needed

4. **Merge**
   - Maintainer will merge when approved
   - Delete branch after merge

---

## Release Process

### Creating a Release

**For Maintainers:**

1. **Update Version**
```bash
# Sync version across files
./scripts/sync-version.sh 1.0.0

# Update CHANGELOG.md
# Add release date and notes
```

2. **Commit and Tag**
```bash
git add .
git commit -m "chore: Release v1.0.0"
git tag v1.0.0
git push origin main --tags
```

3. **GitHub Release**
   - Go to GitHub Releases
   - Create new release from tag
   - Copy CHANGELOG entry
   - Publish release

4. **Announcement**
   - Update README.md with latest version
   - Notify users (if applicable)

### Release Checklist

- [ ] All tests passing
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version synchronized
- [ ] Git tag created
- [ ] GitHub release published
- [ ] Plugin marketplace updated

---

## Getting Help

**Questions?**
- 📖 Read the [documentation](docs/README.md)
- 🐛 Check [existing issues](https://github.com/nguyenthienthanh/archon/issues)
- 💬 Open a new issue for discussion

**Found a Bug?**
- 🔍 Search existing issues first
- 📝 Create detailed bug report
- 🧪 Include reproduction steps

**Want a Feature?**
- 💡 Open feature request issue
- 📋 Describe use case
- 🤝 Consider implementing it!

---

## Recognition

Contributors will be recognized in:
- GitHub contributors page
- Release notes (for significant contributions)
- CHANGELOG.md

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Archon OS!**

Your contributions help make AI-powered project management better for everyone.
