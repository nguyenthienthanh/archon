# Aura Frog Hooks System

**Purpose:** Configure Claude Code lifecycle hooks for Aura Frog workflows

---

## hooks.json Structure

Aura Frog uses Claude Code hooks to enhance workflow automation and safety.

### File Location
```
aura-frog/hooks/hooks.json
```

Referenced in plugin.json:
```json
{
  "hooks": "./hooks/hooks.json"
}
```

---

## Active Hooks (45 Total)

> **v3.7.0 additions:** alpha.1: `pre-execute-load-plan-context.cjs`, `session-start-restore-active.cjs`. alpha.2: `post-execute-update-node.cjs`, `tdd-red-failure-tracker.cjs`, `tool-call-tracer.cjs`. alpha.3: `jira-auto-fetch.cjs`. alpha.4: `feature-done-trigger-archive.cjs`, `session-reset-trigger.cjs`, `json-toon-projector.cjs`. beta.1: `pre-flight-validate.cjs`. beta.2: `pre-dispatch-conflict-check.cjs`, `post-execute-conflict-rescan.cjs`, `pending-confirm-timeout.cjs`. **rc.1: `mcp-call-gate.cjs`** — PreToolUse on `mcp__.*` enforces per-agent allowlist + rate limits, writes sanitized audit to `<security-dir>/mcp-audit.jsonl` (resolved by `hooks/lib/security-dir.cjs`).
>
> **v3.7.4 follow-up:** `task-track-model.cjs` (PreToolUse `Task`) + `task-clear-model.cjs` (PostToolUse `Task`) maintain `.aura-frog/runtime/model-stack.jsonl` so the statusline can show the per-step subagent model. Fail-open observability — see [docs/statusline-model-tracking.md](../docs/statusline-model-tracking.md).

### 0. SessionStart - Environment Injection (NEW in 1.4.0)
**When:** Once per session (startup, resume, clear, compact)

**Actions:**
- ✅ Auto-detect project type (monorepo, library, single-repo)
- ✅ Auto-detect package manager (npm, pnpm, yarn, bun, composer, poetry, go, cargo)
- ✅ Auto-detect framework (Next.js, React, Vue, Laravel, Django, etc.)
- ✅ Resolve active/suggested plans from branch matching
- ✅ Inject 20+ environment variables for agents

**Injected Environment Variables:**
```toon
env_vars[16]{var,description}:
  AF_SESSION_ID,Current session identifier
  AF_PROJECT_TYPE,monorepo | library | single-repo
  AF_PACKAGE_MANAGER,npm | pnpm | yarn | bun | composer | etc.
  AF_FRAMEWORK,nextjs | react | vue | laravel | django | etc.
  AF_ACTIVE_PLAN,Explicitly active plan path
  AF_SUGGESTED_PLAN,Branch-matched plan path (hint only)
  AF_REPORTS_PATH,Where to save reports
  AF_PLANS_PATH,Plans directory
  AF_GIT_BRANCH,Current git branch
  AF_NODE_VERSION,Node.js version
  AF_PYTHON_VERSION,Python version (if available)
  AF_PHP_VERSION,PHP version (if available)
  AF_GO_VERSION,Go version (if available)
  AF_OS_PLATFORM,darwin | linux | win32
  AF_USER,Current username
  AF_TIMEZONE,System timezone
```

**Configuration:** `.claude/.af.json` (local) or `~/.claude/.af.json` (global)

**Example Output:**
```
🐸 Session startup. Type: single-repo | PM: pnpm | Framework: nextjs | Suggested: 241223-user-auth
```

**Script:** `hooks/session-start.cjs`
**Config Utils:** `hooks/lib/af-config-utils.cjs`

---

### 0b. SessionStart - Firebase Cleanup (NEW in 1.16.0)
**When:** Once per session (after environment injection)

**Actions:**
- ✅ Check if Firebase is configured (firebase.json, login, or ENV vars)
- ✅ Clean up auto-created firebase-debug.log if Firebase not configured
- ✅ Prevent cluttering project with unused debug logs
- ✅ Non-blocking - silent cleanup

**Example:**
```
🧹 Cleaned up unused firebase-debug.log (Firebase not configured)
```

**Script:** `hooks/firebase-cleanup.cjs`

---

### 0c. SessionStart - Workflow Edit Detection (NEW in 1.16.0)
**When:** Once per session (after environment injection)

**Actions:**
- ✅ Scan workflow MD files for user edits
- ✅ Detect changes made outside of Claude sessions
- ✅ Extract patterns from user modifications
- ✅ Record learnings automatically

**Monitored Paths:**
- `.claude/cache/run-state.json`
- `.claude/logs/runs/*.md`
- `docs/workflow/*.md`
- Any `phase-*.md`, `plan.md`, `spec.md`, `requirements.md`

**What It Learns:**
- User preferences for formatting (headers, bullet points)
- Verbosity preferences (content added/removed)
- Documentation style preferences

**Example:**
```
🧠 Workflow Edit: Detected 2 pattern(s) from user edits to plan.md
```

**Script:** `hooks/workflow-edit-learn.cjs`

---

### 0d. SessionStart - Compact Resume (rewritten in 3.8.0)
**When:** Every SessionStart. Ignores `clear`.

**Actions:**
- ✅ Export `AF_CLAUDE_SESSION_ID` + `AF_TRANSCRIPT_PATH` to `CLAUDE_ENV_FILE` (used by the manual `--save`)
- ✅ Same session (`session_id` match; `compact` ≤6h, `resume`/`startup` ≤30min, manual handoffs no limit): read `.claude/handoffs/<name>.json` and emit `hookSpecificOutput.additionalContext` — handoff note, active run (`logs/runs/<id>/run-state.json`), the project's plan (plan tree anchor + plan docs), last 3 user prompts, uncommitted files, and how to continue
- ✅ Delete auto snapshots after injecting; manual handoffs stay
- ✅ New session: inject only an index of named handoffs (`/run resume <name>`), never another session's content

No "type continue" step: after an auto-compact Claude continues the turn with the injected context. Disable with `AF_COMPACT_HANDOFF_DISABLED=true`.

**Example injected context:**
```
# 🔄 Aura Frog — resume: Auth work

Handoff `auth-work` · saved 2026-09-13T10:00:00Z · resume with `/run resume auth-work`

## Active run: auth-0913
- **Task:** Implement JWT login
- **Where:** Standard · feature · phase 3
- **Agent:** tester
- **State file:** `.claude/logs/runs/auth-0913/run-state.json`

## Last user requests (oldest → newest)
- approve

## How to continue
Re-read `.claude/logs/runs/auth-0913/run-state.json` (and its deliverables) before acting, then continue the run from its current phase. Do not restart completed phases.
```

**Script:** `hooks/compact-handoff.cjs --resume`

---

### 1. PreToolUse - Scout Block (NEW in 1.4.0)
**When:** Before Bash, Read, Write, Edit, Glob, or Grep tool execution

**Actions:**
- ✅ Block scanning of node_modules, dist, build, vendor, .git
- ✅ Prevent wasteful token usage from large directory scans
- ✅ Allow build commands (npm build, yarn build)
- ✅ Custom patterns via `.afignore` file

**Blocked Directories:**
- `node_modules` - NPM packages
- `dist`, `build` - Build outputs
- `vendor` - Vendor packages
- `.git` - Git internals
- `__pycache__` - Python cache
- `.next`, `.nuxt` - Framework caches
- `coverage` - Test coverage

**Example:**
```bash
User: cat node_modules/react/package.json
Hook: ⛔ Blocked: command accesses node_modules
```

**Customization:** Add patterns to `.afignore`:
```
# .afignore
.expo
android/build
ios/Pods
```

**What is checked:** in Bash, only segments (split on `&&` / `||` / `;` / `|`) whose first word is
`cd`, `ls`, `cat`, `head`, `tail`, `find` or `grep`. So `cd repo && rm -f .git/index.lock` is allowed.

**Disable:** Set `AF_SCOUT_BLOCK=false` in environment

---

### 1b. PreToolUse - Commit Attribution (NEW in 2.0.0)
**When:** Before any Bash tool execution containing `git commit`

**Actions:**
- ✅ Detect git commit commands
- ✅ Check for `Co-Authored-By:` in commit message
- ✅ Warn if AI attribution is missing
- ✅ Skip amend-only and file-based commits

**Example:**
```bash
User: git commit -m "Add login feature"
Hook: 💡 Missing AI attribution. Add to commit message:
      Co-Authored-By: Claude <noreply@anthropic.com>
```

**Script:** `hooks/commit-attribution.cjs`

---

### 2. PreToolUse - Bash Safety
**When:** Before any Bash tool execution

**Actions:**
- ✅ Block destructive commands (`rm -rf /`, `mkfs`, `dd`, fork bombs, system shutdown)
- ✅ Prevent accidental system damage
- ✅ Show warning message

**Blocked Patterns:**
- `rm -rf /` - Recursive delete from root
- `mkfs` - Format filesystem
- `dd if=` - Low-level disk operations
- `:(){` - Fork bomb
- `shutdown`, `reboot`, `halt` - System control

**Example:**
```bash
User: rm -rf / --no-preserve-root
Hook: ⚠️ Blocked: Potentially destructive command detected
```

---

### 3. PreToolUse - Project Context Reminder
**When:** Before Write or Edit tool execution

**Actions:**
- ✅ Check if project context exists (`.claude/project-contexts/*/project-config.yaml`)
- ✅ Remind user to run `/project init` if missing
- ✅ Helps prevent generating code without conventions

**Example:**
```
💡 Reminder: Run project:init to create project context before generating code
```

---

### 3b. PreToolUse - Security-Critical Warnings (NEW in 2.0.0)
**When:** Before Write or Edit to security-sensitive files

**Actions:**
- ✅ Tiered warnings based on file sensitivity level
- ✅ CRITICAL: `.env`, `credentials`, `.aws`, `.ssh`, `.pem`, `.key`
- ✅ HIGH: `auth/`, `payment/`, `crypto/`, `security/`, `jwt`, `oauth`
- ✅ MEDIUM: `config.*`, `settings.*`, `database.*`, `cors`, `csrf`

**Example:**
```
Writing: src/auth/jwt-handler.ts
Hook: 🟠 [HIGH] Security-critical code. Consider human review before merging.
      File: jwt-handler.ts

Writing: .env.production
Hook: 🔴 [CRITICAL] This file likely contains secrets. Verify it is NOT committed to git.
      File: .env.production
```

**Script:** `hooks/security-critical-warn.cjs`

---

### 4. PreToolUse - Secrets Protection
**When:** Before Write or Edit to sensitive files

**Actions:**
- ✅ Detect files that may contain secrets (.env, credentials, tokens, api-keys)
- ✅ Check if file is tracked by git
- ✅ Warn user to add to .gitignore

**Example:**
```
🔒 Warning: This file may contain secrets and is tracked by git. Consider adding to .gitignore
```

---

### 5. PostToolUse - Command Logging
**When:** After any Bash command completes

**Actions:**
- ✅ Log command execution to `.claude/logs/runs/commands.log`
- ✅ Include timestamp and command
- ✅ Useful for workflow tracking and debugging

**Log Format:**
```
[2025-11-27 14:30:45] Bash: npm test
[2025-11-27 14:31:02] Bash: git status
```

---

### 6. PostToolUse - Large File Warning
**When:** After Read tool completes

**Actions:**
- ✅ Detect files over 500 lines
- ✅ Warn about context consumption
- ✅ Suggest the large-response offloading technique for chunked reading

**Example:**
```
📄 Large file (1234 lines). Consider the write-to-file/summarize-in technique (rules/core/context-economy.md) for chunked reading.
```

---

### 7. PostToolUse - Lint Auto-Fix (NEW in 1.11.1)
**When:** After Write or Edit tool completes

**Actions:**
- ✅ Detect file type and available linters
- ✅ Auto-run appropriate linter with --fix flag
- ✅ Non-blocking - reports results but doesn't fail

**Supported Linters:**
| Language | Linters |
|----------|---------|
| JS/TS/Vue | ESLint, Prettier |
| CSS/SCSS | Prettier, Stylelint |
| PHP | PHP CS Fixer, Laravel Pint |
| Python | Ruff, Black |
| Go | gofmt, goimports |
| Ruby | Rubocop |
| Rust | rustfmt |
| Dart | dart format |

**Example:**
```
User edits: src/components/Button.tsx
Hook: 🔧 Auto-fixed: eslint, prettier
```

**Disable:** Set `AF_LINT_AUTOFIX=false` in environment

**Environment handed to the linter:** the fixer is the working repo's own
`node_modules/.bin` / `vendor/bin` binary — third-party code, run automatically
on every Write and Edit. It is spawned with a minimised environment
(`hooks/lib/af-child-env.cjs`): credential-shaped variables (`*SECRET*`,
`*TOKEN*`, `*KEY*`, `*PASSWORD*`, `*CREDENTIAL*`, `PAT`) are stripped, while
`PATH`, `HOME`, locale, `NODE_*` and the plugin's `AF_*` / `CLAUDE_*` wiring are
kept. Set `AF_CHILD_ENV_UNFILTERED=true` to pass the environment through
untouched, for a toolchain that genuinely needs a credential-named variable.

**Script:** `hooks/lint-autofix.cjs`

---

### 7b. PostToolUse - Security Scan (NEW in 2.0.0)
**When:** After Write or Edit tool completes (async)

**Actions:**
- ✅ Scan file content for common vulnerability patterns
- ✅ Detect hardcoded secrets (AWS keys, GitHub tokens, private keys)
- ✅ Detect injection risks (SQL, command, XSS)
- ✅ Detect weak cryptography (MD5, SHA1, Math.random for security)
- ✅ Non-blocking - reports findings as warnings
- ✅ No external tools required (regex-based)

**Vulnerability Categories:**
| Category | Patterns Detected |
|----------|-------------------|
| Secrets | AWS keys, GitHub tokens, API keys, private keys, hardcoded passwords |
| Injection | SQL injection (concat/template), command injection (exec) |
| XSS | innerHTML, dangerouslySetInnerHTML, jQuery .html() |
| Crypto | MD5/SHA1 hashing, Math.random() for security values |

**Example:**
```
Writing: src/api/users.ts
Hook: 🟡 Security scan: 2 issue(s) in users.ts
      L23: [injection] Possible SQL injection (string concat)
      L45: [crypto] Math.random() for security-sensitive value
```

**Script:** `hooks/security-scan.cjs`

---

### 7c. PostToolUse - Auto Test Runner (NEW in 2.0.0)
**When:** After Write or Edit during TDD phases (2, 3, 4) - async

**Actions:**
- ✅ Auto-detect test runner from project config
- ✅ Run tests after implementation changes
- ✅ Only activates during TDD workflow phases
- ✅ Non-blocking with 30s timeout

**Supported Test Runners:**
| Project | Detection | Command |
|---------|-----------|---------|
| Vitest | devDependencies or test script | `npx vitest run` |
| Jest | devDependencies or test script | `npx jest --passWithNoTests` |
| npm test | package.json scripts.test | `npm test` |
| Pytest | pyproject.toml | `python -m pytest -x -q` |
| Go | go.mod | `go test ./...` |
| Cargo | Cargo.toml | `cargo test` |
| PHPUnit | phpunit.xml | `php vendor/bin/phpunit` |
| Laravel | artisan | `php artisan test` |

**Example:**
```
Writing: src/services/auth.ts (Phase 3)
Hook: ✅ Auto-test (vitest): Tests: 23 passed | Duration: 1.2s
```

**Script:** `hooks/auto-test-runner.cjs`

---

### 7d. PostToolUse - Token Tracker (NEW in 2.0.0)
**When:** After any tool execution (async)

**Actions:**
- ✅ Estimate cumulative token usage per session
- ✅ Track tool calls and file sizes
- ✅ Warn at 50%, 70%, 85% of 200K context limit
- ✅ Persist tracking across tool calls via cache file

**Thresholds:**
| Usage | Level | Action |
|-------|-------|--------|
| 50% (~100K) | 🟡 MODERATE | Stay focused |
| 70% (~140K) | 🟠 HIGH | Consider /compact |
| 85% (~170K) | 🔴 CRITICAL | Recommend handoff |

**Example:**
```
Hook: 🟠 Token usage: ~145K / 200K (72%) [HIGH]
      Consider /compact with focus instructions
```

**Cache:** `.claude/cache/token-tracker.json`
**Script:** `hooks/token-tracker.cjs`

---

### 7f. PostToolUse - Smart Learn (NEW in 1.16.0)
**When:** After Write, Edit, or Bash tool completes successfully

**Actions:**
- ✅ Track successful code patterns (arrow functions, const usage, async/await)
- ✅ Detect file modification patterns by extension
- ✅ Learn from successful bash commands
- ✅ Auto-create patterns after 3+ successful operations

**What It Learns (automatically, no user feedback needed):**
- Code style patterns (arrow functions, prefer const, explicit types)
- Framework patterns (React hooks, async/await)
- Successful command patterns

**Pattern Detection:**
| Language | Patterns Detected |
|----------|-------------------|
| TypeScript/JS | arrow_functions, prefer_const, async_await, explicit_types, react_hooks, error_handling |
| Python | python_type_hints, python_async |
| Bash | Command patterns, pipe usage, chaining |

**Example:**
```
🧠 Smart Learn: Pattern detected! "prefer_const" in .ts files
🧠 Smart Learn: Bash pattern! "npm" is frequently used
```

**Local Files:**
- `.claude/cache/smart-learn-cache.json` - Success tracking cache

**Script:** `hooks/smart-learn.cjs`

---

### 8. UserPromptSubmit - Prompt Reminder
**When:** Every user prompt submission

**Actions:**
- ✅ Inject TDD reminder for code-related tasks
- ✅ Show approval gate reminder for relevant phases
- ✅ Security reminder for sensitive operations (auth, password, token)

**Example:**
```
💡 🧪 TDD: Write tests first | 🔒 Security: Review before commit
```

**Script:** `hooks/prompt-reminder.cjs`

---

### 8b. UserPromptSubmit - Scope Drift Detection (NEW in 2.0.0)
**When:** Every user prompt submission (async)

**Actions:**
- ✅ Compare user prompt keywords against initial workflow task
- ✅ Detect feature-trigger phrases ("also add", "can you also", "new feature")
- ✅ Calculate keyword overlap with original task scope
- ✅ Warn when scope diverges significantly
- ✅ Skip workflow commands and short prompts

**Detection Logic:**
- Extracts keywords from current prompt and original task
- Checks for feature-trigger phrases indicating new scope
- Warns when: feature trigger detected AND keyword overlap < 20%

**Example:**
```
Workflow task: "Add user login with email/password"
User: "Can you also add a shopping cart and checkout flow?"
Hook: 🔀 Scope drift detected: This looks like a new feature outside the current workflow.
      Current task: "Add user login with email/password"
      Consider starting a separate workflow for better focus and token efficiency.
```

**Script:** `hooks/scope-drift.cjs`

> **Note (prompt source):** `prompt-reminder.cjs` and `scope-drift.cjs` read the
> user prompt via `lib/safe-stdin.cjs#readPromptFromStdin()` (stdin JSON first,
> `CLAUDE_USER_PROMPT` as TTY fallback). Earlier revisions read the env var
> alone, which Claude Code does not set in production — so the prompt was always
> empty and neither hook fired. Keep new UserPromptSubmit hooks on the shared
> `safe-stdin` helper.

---

### 8c. UserPromptSubmit - Plan Escalation Check (NEW in 3.8.0)
**When:** Every user prompt submission (async)

**Actions:**
- ✅ Score the prompt against the 8-signal escalation rubric in
  `rules/workflow/run-plan-bridge.md` (multi_feature, multi_week,
  shipping_scope, scale_words, cross_session, user_explicit, word_count,
  scope_verbs)
- ✅ When the summed weight ≥ 3 AND no plan tree exists, nudge Claude to offer
  the user the `plan` / `deep` / `details` choice before implementing
- ✅ Skip when a plan tree is already active, on slash commands, on override
  prefixes (`task:` / `project:` / `must do:` / `just do:` / `exactly:`), or
  when `AF_RUN_PLAN_BRIDGE_DISABLED` / `AF_ESCALATION_DISABLED` is set

**Why:** The escalation heuristic used to live only in run-orchestrator Step 0
(model-read markdown). This hook enforces it deterministically so project-scope
work surfaces the planning choice even when `/run` isn't typed.

**Example:**
```
User: "rewrite the whole auth system and migrate from Auth0 to Cognito, rollout v2.0"
Hook: 🐸 plan-escalation: task scores 4 (≥3) on the escalation rubric —
      signals: shipping_scope, scope_verbs. No active plan tree.
```

**Script:** `hooks/plan-escalation-check.cjs`

---

### 9. UserPromptSubmit - Auto-Learn (NEW in 1.11.0)
**When:** Every user prompt submission

**Actions:**
- ✅ Detect correction patterns in user messages (e.g., "no", "wrong", "actually", "don't do that")
- ✅ Detect approval patterns (e.g., "good", "great", "perfect")
- ✅ Categorize feedback (code_style, testing, security, etc.)
- ✅ **Deduplication** - Skips identical feedback within 24 hours
- ✅ **Pattern detection** - Auto-creates learned patterns after 3+ similar corrections
- ✅ **Local cache** - Saves to `.claude/cache/learned-patterns.md` + Supabase
- ✅ Non-blocking - never interrupts user flow

**Detection Patterns:**
- Direct negations: "no", "nope", "wrong", "incorrect"
- Corrections: "actually", "should be", "shouldn't", "instead of"
- Modifications: "change that", "fix that", "don't do that", "remove that"
- Preferences: "I prefer", "always use", "never use", "don't add"
- Approvals: "good job", "great", "perfect", "looks good"

**Example:**
```
User: "Don't add comments everywhere, only when needed"
Hook: 🧠 Learning: Captured correction [code_style:minimal_comments] (1x)

# After 3 similar corrections about comments:
Hook: 🧠 Learning: Pattern detected! "code_style:minimal_comments" (3 occurrences)
→ Auto-creates learned pattern in Supabase + local cache
```

**Local Files:**
- `.claude/cache/auto-learn-cache.json` - Deduplication cache (24h window)
- `.claude/cache/learned-patterns.md` - Human-readable patterns file

**Script:** `hooks/auto-learn.cjs` (v2.0.0)
**Requires:** `AF_LEARNING_ENABLED=true`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`

---

### 9b. UserPromptSubmit - Prompt Logger (NEW in 3.1.0)
**When:** Every user prompt submission (async)

**Actions:**
- Log user prompts with metadata (timestamp, word count, intent, complexity)
- Detect intent (question, command, task, debug, feedback, chat)
- Track commands/skills referenced in prompts
- Detect complexity signals (multi-file, architecture, security, performance)
- Store to `.claude/metrics/prompts/{date}.jsonl` (one line per prompt)
- Auto-cleanup logs older than 30 days

**Example:**
```
User: "Implement JWT authentication for the API"
→ Logged: {intent: "implement", words: 7, complexity: ["security"], agent: "lead"}
```

**Storage:** `.claude/metrics/prompts/{date}.jsonl`
**Retention:** 30 days (auto-cleaned)
**Disable:** Set `AF_PROMPT_LOGGING=false` in environment

**Script:** `hooks/prompt-logger.cjs`

---

### 10. SubagentStart - Context Injection
**When:** Any subagent starts

**Actions:**
- ✅ Inject current workflow phase
- ✅ Inject active plan path
- ✅ Show pending approvals
- ✅ Pass project context to subagents

**Example:**
```
--- Aura Frog Context ---
📍 Phase: 3
📋 Plan: plans/241223-user-profile
📦 Project: my-app
🤖 Agents: backend-nodejs, tester
-------------------------
```

**Script:** `hooks/subagent-init.cjs`
**Session State:** `hooks/lib/session-state.cjs`

---

### 10b. TeammateIdle - Idle Teammate Handler (NEW in 2.0.0)
**When:** A teammate has no remaining tasks (Agent Teams mode only)

**Actions:**
- ✅ Check for unclaimed tasks matching teammate's specialization
- ✅ Assign cross-review work from completed phases
- ✅ Check pending quality gates needing validation
- ✅ Exit 2 = keep alive (assign work), Exit 0 = let exit

**Agent Teams Required:** Only fires when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`

**Script:** `hooks/teammate-idle.cjs`

---

### 10c. TaskCompleted - Task Completion Validator (NEW in 2.0.0)
**When:** A teammate marks a task as done (Agent Teams mode only)

**Actions:**
- ✅ Validate TDD phase test references
- ✅ Check approval gate status
- ✅ Exit 2 = reject (needs revision), Exit 0 = accept

**Agent Teams Required:** Only fires when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`

**Script:** `hooks/task-completed.cjs`

---

### 11. Stop / PreCompact - Compact Handoff Save (rewritten in 3.8.0)
**When:**
- **PreCompact** (`--pre-compact`, trigger `manual` or `auto`) → always saves
- **Stop** → saves when context usage ≥ `AF_HANDOFF_THRESHOLD` (default 70). Usage comes from `.claude/cache/context-usage.json`, written by `scripts/statusline.sh` (hooks never receive `used_percentage`). Without statusline data it saves only while a run is open.

**Saves** `.claude/handoffs/<name>.{json,md}`, one per session. `<name>` is the slug of the session title (`/rename` → ai title → `session-<id8>`); a same-title clash with another session gets `-<id8>`. Content: newest open run from `.claude/logs/runs/*/run-state.json` (legacy `workflow-state.json` fallback, code projects only), the project's plan (`plans/active.json` resolved from the project root + plan docs such as `ROADMAP.md`, `*_PLAN.md`, `docs/*plan*`), last 3 user prompts from `transcript_path`, `git diff --name-only HEAD`, context usage. Non-code projects (no `.git`, no manifest) never get run/plan logs. Pruned after 14 days. Silent, non-blocking.

**CLI:** `--save [--note <text>]` (manual `handoff`), `--show <name>`, `--list`.

**Script:** `hooks/compact-handoff.cjs`

---

### 11b. PreCompact - Pre-Compact State Save (NEW in 2.0.0)
**When:** Before Claude auto-compacts context

**Actions:**
- Saves workflow state and transcript summary before context compaction
- Captures current phase, task, and agent information
- Ensures continuity across compact boundaries
- Complements the Stop hook and SessionStart Compact Resume hook

**Files Saved:**
- `.claude/cache/compact-handoff.json` - Pre-compact state snapshot
- `.claude/logs/runs/[id]/run-state.json` - Full workflow state (if workflow active)

**Example:**
```
Pre-compact: Workflow state saved for compact handoff
```

**Script:** `hooks/compact-handoff.cjs --pre-compact`

---

### 12. PostToolUse - Feedback Capture
**When:** User provides corrections or feedback

**Actions:**
- ✅ Detect user corrections (e.g., "no, that's wrong", "actually...")
- ✅ Capture approval/rejection reasons at gates
- ✅ Send feedback to Supabase for learning
- ✅ Feed the self-improve skill's Analyze loop

**Script:** `hooks/feedback-capture.cjs`
**Requires:** `AF_LEARNING_ENABLED=true`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`

---

### 14. Learning System Library (Updated in 1.16.0)
**Location:** `hooks/lib/af-learning.cjs`

**Provides:**
- ✅ **Dual-mode storage** - Supabase OR local files
- ✅ Local storage fallback when Supabase not configured
- ✅ Feedback submission functions
- ✅ Metrics tracking functions
- ✅ Pattern analysis utilities
- ✅ Auto-generated learned-rules.md file

**Storage Modes:**
| Mode | When Used | Location |
|------|-----------|----------|
| **Local** | No Supabase config | `.claude/learning/*.json` + `.claude/learning/learned-rules.md` |
| **Supabase** | SUPABASE_URL + SUPABASE_SECRET_KEY set | Cloud (cross-session, cross-machine) |

**Local Files Generated:**
- `.claude/learning/feedback.json` - All feedback entries
- `.claude/learning/patterns.json` - Learned patterns
- `.claude/learning/metrics.json` - Workflow metrics
- `.claude/learning/learned-rules.md` - Human-readable rules (**linked to main instructions**)
- `.claude/LEARNED_PATTERNS.md` - Reference link for Claude

**Key Functions:**
```javascript
isLearningEnabled()      // Returns true if learning available (local or Supabase)
isLocalMode()            // Returns true if using local storage
recordFeedback(feedback) // Store feedback (auto-routes to local or Supabase)
recordPattern(pattern)   // Store learned pattern
updateLearnedRulesMD()   // Regenerate the learned-rules.md file
```

---

### 15. Reflection Queue Library (KG-2.3) — OPT-IN, default OFF

**Location:** `hooks/lib/reflection-queue.cjs`

A durable, crash-safe on-disk queue for post-session reflections. Wired
additively into `learning-dispatch.cjs`: when the gate is ON, each PostToolUse
dispatch appends a reflection payload; when OFF (the default) the enqueue call
is a silent no-op and **nothing** changes.

**Env gate:** `AF_REFLECTION_QUEUE` — default **OFF**. Unset / `""` / `0` /
`false` / `off` / `no` ⇒ every export is a no-op and no file is written (zero
behaviour change). Any other value turns it on.

**Queue file:** `.claude/reflection/queue.jsonl` (append-only JSONL). One entry
per line:

```json
{ "id": "<sha256 of payload>", "ts": <epoch seconds>, "kind": "reflection", "payload": { ... }, "status": "pending" }
```

`id` is a content hash of the payload, so re-enqueueing an equal payload is
**idempotent** (dedupe on id, regardless of key order).

**Durability & crash-recovery:**
- `enqueue()` — one `fs.appendFileSync` of a single `\n`-terminated line (atomic
  for small lines): a crash mid-write leaves the whole line or nothing.
- `drain(handlerFn)` — runs the handler over each `pending` entry, marks handled
  ones `done`, then rewrites the file via **temp-file + atomic rename** (never a
  truncate-in-place). A crash before the rename leaves the original file intact.
- Recovery — a `pending` entry left by a crash (or a handler that threw / returned
  `false`) is simply re-seen and re-handled on the next drain. Idempotent by id.

**Retention:** on every rewrite the processor keeps entries that are still
`pending` **or** newer than `RETENTION_DAYS` (30), then caps the total to the
most recent `MAX_ENTRIES` (500). Done + old entries are pruned.

**API:** `enqueue(payload)`, `drain(handlerFn)`, `stats()` — all gated by the env
var and **fail-closed** (never throw into the caller; warn once per process).

**Self-test:** `node scripts/ci/validate-reflection-queue.cjs` (exits non-zero on
failure) — exercises gate-off no-op → enqueue → dedupe → drain → crash-recovery →
retention/cap → fail-closed.

---

## Hook Types

### Type: "command"
Executes bash command, uses exit code:
- **Exit 0:** Continue normally
- **Exit 1:** Warning (show stderr, continue)
- **Exit 2:** Block operation (show stderr, stop)

---

## 🎯 Benefits

**Safety:**
- ✅ Blocks destructive commands
- ✅ Prevents system damage
- ✅ Validates operations before execution

**Workflow Enhancement:**
- ✅ Auto-detects JIRA tickets and Figma links
- ✅ Reminds about project context
- ✅ Command logging for debugging

**User Experience:**
- ✅ Guided workflow (reminders at right time)
- ✅ Proactive suggestions
- ✅ Safety without interruption

---

## 📚 Environment Variables Available in Hooks

Claude Code provides these environment variables to hooks:

- `$CLAUDE_TOOL_INPUT` - Input to the tool being called
- `$CLAUDE_TOOL_OUTPUT` - Output from completed tool (PostToolUse only)
- `$CLAUDE_USER_INPUT` - User's prompt text (UserPromptSubmit only)
- `$CLAUDE_FILE_PATHS` - File paths affected by tool (if applicable)
- `$CLAUDE_NOTIFICATION` - Notification content (Notification only)

---

## 🔄 Hook Execution Flow

```
Session Start (startup/resume/clear/compact)
  ↓
[SessionStart Hook] - Auto-detect project, inject env vars
  ↓
User Input
  ↓
[UserPromptSubmit Hook] - Detect JIRA/Figma
  ↓
Claude Decides to Use Tool (e.g., Bash, Write, Edit)
  ↓
[PreToolUse Hook] - Safety checks, reminders
  ↓
Tool Execution
  ↓
[PostToolUse Hook] - Logging, warnings
  ↓
Response to User
  ↓
[PreCompact Hook] - Save workflow state before auto-compact
  ↓
[Stop Hook] - Save state + session metrics
```

---

## Hook Summary Table

```toon
hooks[32]{event,name,purpose}:
  SessionStart,Environment Injection,Auto-detect project and inject env vars
  SessionStart,Firebase Cleanup,Clean up firebase-debug.log if not configured
  SessionStart,Workflow Edit Detection,Detect user edits to workflow files
  SessionStart,Compact Resume,Restore workflow context after compact
  PreToolUse,Scout Block,Block scanning of node_modules/dist/vendor
  PreToolUse,Commit Attribution,Warn if git commit missing Co-Authored-By
  PreToolUse,Bash Safety,Block destructive system commands
  PreToolUse,Project Context,Remind to initialize project context
  PreToolUse,Security-Critical Warnings,Tiered warnings for sensitive files
  PreToolUse,Secrets Protection,Warn about secrets in tracked files
  PostToolUse,Command Logging,Log bash commands for audit
  PostToolUse,Large File Warning,Warn about context consumption
  PostToolUse,Lint Auto-Fix,Auto-run linters after file changes
  PostToolUse,Security Scan,Detect vulnerability patterns in written code
  PostToolUse,Design Conformance,Flag hardcoded colors/spacing + mixed UI libs + unguarded motion
  PostToolUse,Auto Test Runner,Auto-run tests during TDD phases
  PostToolUse,Token Tracker,Estimate and warn on token usage thresholds
  PostToolUse,Feedback Capture,Capture file edit corrections
  PostToolUse,Smart Learn,Auto-learn from successful operations
  UserPromptSubmit,Prompt Reminder,TDD/security/approval reminders
  UserPromptSubmit,Scope Drift Detection,Warn when conversation scope diverges
  UserPromptSubmit,Plan Escalation Check,Nudge to /archon-os:plan when scope weight ≥ 3 and no plan tree
  UserPromptSubmit,Auto-Learn,Auto-detect corrections in messages
  UserPromptSubmit,Prompt Logger,Log prompts with metadata for usage analysis
  SubagentStart,Context Injection,Auto-inject workflow context to subagents
  TeammateIdle,Idle Teammate Handler,Assign work to idle teammates (Agent Teams)
  TaskCompleted,Task Completion Validator,Validate teammate task completion (Agent Teams)
  SessionStart,Test Pattern Extractor,Extract test conventions from recent test files
  Stop,Compact Handoff + Metrics,Auto-save workflow state + session metrics
  Stop,Rate Limit Reminder,Remind to check /usage for API rate limits
  Stop,Context Auto-Refresh,Regenerate stale project-context snapshot (debounced; FEAT-008)
  PreCompact,Pre-Compact State Save,Save workflow state before auto-compact
```

---

## Exit Code Standard

| Code | Meaning | Use When |
|------|---------|----------|
| `0` | Success / non-blocking | Hook ran successfully, continue normally |
| `1` | Warning | Hook detected a non-critical issue; show stderr, continue |
| `2` | Block action | Hook detected a critical issue, prevent the tool from executing |

**Convention:** Use `0` for success and early-exit (fail-open). Use `1` for soft warnings (e.g., missing attribution, security scan findings). Use `2` for hard blocks (e.g., destructive commands, scanning blocked directories, rejecting incomplete tasks).

**Current usage across hooks:**

| Hook | Exit 0 | Exit 1 | Exit 2 | Notes |
|------|--------|--------|--------|-------|
| `scout-block.cjs` | Yes | -- | Yes | Blocks node_modules/dist scanning |
| `commit-attribution.cjs` | Yes | Yes | -- | Warns on missing Co-Authored-By |
| `security-scan.cjs` | Yes | Yes | -- | Warns on vulnerability patterns |
| `security-critical-warn.cjs` | Yes | -- | -- | Warns via stderr, exits 0 |
| `scope-drift.cjs` | Yes | Yes | -- | Warns on scope divergence |
| `task-completed.cjs` | Yes | -- | Yes | Rejects incomplete tasks (Agent Teams) |
| `teammate-idle.cjs` | Yes | -- | Yes | Keeps alive with work assignment |
| All other hooks | Yes | -- | -- | Non-blocking, success-only |

---

**Last Updated:** 2026-04-06
**Status:** Active hooks system (51 hooks)
