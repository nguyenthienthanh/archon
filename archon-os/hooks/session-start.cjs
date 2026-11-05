#!/usr/bin/env node
/**
 * Archon OS - SessionStart Hook
 *
 * Fires: Once per session (startup, resume, clear, compact)
 * Purpose: Load config, detect project info, inject env vars, output context
 *
 * Injected Environment Variables:
 *   ARCHON_SESSION_ID        - Current session identifier
 *   ARCHON_PROJECT_TYPE      - monorepo | library | single-repo
 *   ARCHON_PACKAGE_MANAGER   - npm | pnpm | yarn | bun | composer | poetry | go | cargo
 *   ARCHON_FRAMEWORK         - nextjs | react | vue | laravel | django | etc.
 *   ARCHON_ACTIVE_PLAN       - Explicitly active plan path (directive)
 *   ARCHON_SUGGESTED_PLAN    - Branch-matched plan path (hint only)
 *   ARCHON_REPORTS_PATH      - Where to save reports
 *   ARCHON_PLANS_PATH        - Plans directory
 *   ARCHON_WORKFLOWS_PATH    - Workflows directory
 *   ARCHON_GIT_BRANCH        - Current git branch
 *   ARCHON_GIT_URL           - Git remote URL
 *   ARCHON_NODE_VERSION      - Node.js version
 *   ARCHON_PYTHON_VERSION    - Python version (if available)
 *   ARCHON_PHP_VERSION       - PHP version (if available)
 *   ARCHON_GO_VERSION        - Go version (if available)
 *   ARCHON_GODOT_VERSION     - Godot version (if available, detected from project.godot)
 *   ARCHON_OS_PLATFORM       - darwin | linux | win32
 *   ARCHON_USER              - Current username
 *   ARCHON_TIMEZONE          - System timezone
 *   ARCHON_PLAN_NAMING       - Plan naming format
 *   ARCHON_PLAN_DATE_FORMAT  - Date format for plans
 *   ARCHON_PROJECT_ROOT      - Absolute path to project root
 *   ARCHON_MEMORY_LOADED     - Whether memory was loaded (true/false)
 *   ARCHON_MEMORY_COUNT      - Number of memory items loaded
 *   ARCHON_MEMORY_ERROR      - Error message if memory loading failed
 *
 * Exit Codes:
 *   0 - Success (non-blocking, allows continuation)
 *
 * @version 1.1.0
 */

const fs = require('fs');
const { readStdinSafely } = require('./lib/safe-stdin.cjs');
const os = require('os');
const path = require('path');

const {
  loadConfig,
  detectProjectType,
  detectPackageManager,
  detectFramework,
  getNodeVersion,
  getPythonVersion,
  getPhpVersion,
  getGoVersion,
  getGodotVersion,
  getGitBranch,
  getGitRemoteUrl,
  resolvePlanPath,
  getReportsPath,
  resolveSessionId,
  writeSessionState,
  writeEnv
} = require('./lib/config-utils.cjs');

const { loadMemory } = require('./lib/memory-loader.cjs');

// Session cache config

const { findProjectRoot } = require('./lib/hook-runtime.cjs');
const SESSION_CACHE_FILE = path.join(findProjectRoot(), '.claude', 'cache', 'session-start-cache.json');
const SESSION_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const ENVRC_PATH = path.join(process.cwd(), '.envrc');

/**
 * Decide whether a loaded cache object is stale. Pure — all environment facts
 * arrive as arguments, so the rule set is unit-testable without touching the
 * real .claude/cache or the working tree's git state.
 *
 * @param {object} cache        parsed cache object
 * @param {object} env
 * @param {number} env.now            current epoch ms
 * @param {number} env.ttl            max age in ms
 * @param {number|null} env.envrcMtime .envrc mtime in ms, or null when absent
 * @param {string} env.currentBranch   current git branch, '' when undetectable
 * @returns {string|null} the staleness reason, or null when the cache is usable
 */
function cacheStaleReason(cache, { now, ttl, envrcMtime, currentBranch }) {
  if (!cache) return 'missing';

  const cachedAt = cache.cachedAt || 0;

  if (now - cachedAt > ttl) return 'ttl_expired';

  // .envrc rewritten after we cached → env vars may have changed.
  if (envrcMtime !== null && envrcMtime !== undefined && envrcMtime > cachedAt) {
    return 'envrc_changed';
  }

  // Git branch switched since cache → stale (the fast path would otherwise
  // replay the old ARCHON_GIT_BRANCH for up to the TTL). Safe-by-construction: it
  // can only invalidate (→ full re-detection), never produce a wrong value; an
  // undetectable branch ('') falls through to the TTL-only behaviour.
  const cachedBranch = cache.envVars && cache.envVars.ARCHON_GIT_BRANCH;
  if (cachedBranch !== undefined && currentBranch && currentBranch !== cachedBranch) {
    return 'branch_switched';
  }

  return null;
}

/**
 * Check if session cache is valid. I/O wrapper around cacheStaleReason().
 */
function getValidCache() {
  try {
    if (!fs.existsSync(SESSION_CACHE_FILE)) return null;

    const cache = JSON.parse(fs.readFileSync(SESSION_CACHE_FILE, 'utf-8'));
    const envrcMtime = fs.existsSync(ENVRC_PATH) ? fs.statSync(ENVRC_PATH).mtimeMs : null;

    const reason = cacheStaleReason(cache, {
      now: Date.now(),
      ttl: SESSION_CACHE_TTL,
      envrcMtime,
      currentBranch: getGitBranch() || '',
    });

    return reason === null ? cache : null;
  } catch { return null; }
}

/**
 * Save session cache
 */
function saveSessionCache(data) {
  try {
    const cacheDir = path.dirname(SESSION_CACHE_FILE);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(SESSION_CACHE_FILE, JSON.stringify({ ...data, cachedAt: Date.now() }, null, 2));
  } catch { /* non-blocking */ }
}

/**
 * Emit a one-line banner when the persisted project-context cache is stale
 * (FEAT-008 / STORY-0013). Best-effort + non-blocking: any failure is swallowed
 * so it can never break session start. Disable with
 * ARCHON_CONTEXT_STALE_BANNER_DISABLED=true.
 */
function emitContextStalenessBanner() {
  if (process.env.ARCHON_CONTEXT_STALE_BANNER_DISABLED === 'true') return;
  try {
    // Prefer the durable snapshot (FEAT-008 / STORY-0014): if a fresh snapshot
    // exists, the session can reuse it instead of re-scanning the codebase.
    try {
      const snap = require('../scripts/context-snapshot.cjs');
      const meta = snap.readSnapshotMeta('.');
      if (meta) {
        if (snap.isSnapshotFresh('.')) {
          const at = (meta.gitHead || 'no-git').substring(0, 12);
          console.log(`📸 Project context snapshot is FRESH (git ${at}) — reuse it, no re-scan needed: ${snap.getSnapshotPath('.')}`);
        } else {
          console.log('📸 Project context snapshot is STALE — refresh with: node archon-os/scripts/context-snapshot.cjs');
        }
        return; // snapshot verdict supersedes the raw-detection check
      }
    } catch { /* snapshot module optional — fall through to detection-cache check */ }

    const cache = require('./lib/project-cache.cjs');
    const detectionPath = cache.getDetectionPath();
    if (!fs.existsSync(detectionPath)) return; // nothing persisted yet — nothing to flag
    const raw = JSON.parse(fs.readFileSync(detectionPath, 'utf-8'));
    const s = cache.getCacheStaleness(raw, '.');
    if (s.stale && s.reason) {
      console.log(`Project context cache is stale (${s.reason}) — will rebuild on next scan. Run /project refresh to force now.`);
    }
  } catch { /* non-blocking */ }
}

/**
 * Warn when the instruction files Claude Code loads at startup (CLAUDE.md chain +
 * unscoped .claude/rules + ~/.claude) approach its 150k-char limit. Fires below the
 * limit so the fix (`paths:` frontmatter, move logs to docs/) lands before every
 * session pays for it. Threshold: ARCHON_CONTEXT_BUDGET_WARN (default 100000);
 * disable with ARCHON_CONTEXT_BUDGET_DISABLED=true. Never breaks session start.
 */
function emitContextBudgetWarning() {
  try {
    const msg = require('../scripts/context-budget.cjs').budgetWarning(findProjectRoot());
    if (msg) console.log(msg);
  } catch { /* non-blocking */ }
}

/**
 * Index the host's own rules/skills/agents (~/.claude + <project>/.claude) so plugin
 * routing prefers them, and flag skill files Claude Code will never register.
 * Disable with ARCHON_HOST_EXTENSIONS_DISABLED=true. Never breaks session start.
 */
function emitHostExtensions() {
  try {
    const host = require('./lib/host-extensions.cjs');
    const root = findProjectRoot();
    const msg = host.formatIndex(host.discover(root), { projectDir: root });
    if (msg) console.log(msg);
  } catch { /* non-blocking */ }
}

/**
 * Build context summary for output (compact, single line)
 */
function buildContextOutput(config, detections, resolved, memoryResult) {
  const parts = [];

  // Project info
  if (detections.type) parts.push(`Type: ${detections.type}`);
  if (detections.pm) parts.push(`PM: ${detections.pm}`);
  if (detections.framework) parts.push(`Framework: ${detections.framework}`);

  // Plan status
  if (resolved.path) {
    if (resolved.resolvedBy === 'session') {
      parts.push(`Plan: ${path.basename(resolved.path)}`);
    } else if (resolved.resolvedBy === 'branch') {
      parts.push(`Suggested: ${path.basename(resolved.path)}`);
    }
  }

  // Memory status
  if (memoryResult?.loaded) {
    const cached = memoryResult.cached ? ' (cached)' : '';
    parts.push(`Memory: ${memoryResult.count} items${cached}`);
  }

  return parts.join(' | ');
}

/**
 * Main hook execution
 */
async function main() {
  try {
    // Universal Cascading Environment Resolver (12-Factor passive resolution)
    try {
      const { loadProjectEnv } = require('./lib/env-resolver.cjs');
      loadProjectEnv(findProjectRoot());
    } catch { /* graceful degradation */ }

    // Read stdin for session data
    let data = {};
    try {
      const stdin = readStdinSafely();
      if (stdin) data = JSON.parse(stdin);
    } catch (e) { /* ignore stdin errors */ }

    const envFile = process.env.CLAUDE_ENV_FILE;
    const source = data.source || 'unknown';
    // Canonical key shared with every reader hook (ppid / ARCHON_SESSION_ID) — NOT
    // data.session_id, which readers never see and which desynced this writer.
    const sessionId = resolveSessionId();

    // One-shot legacy migration: .aura/plans → .claude/plans (v3.7.3+).
    // Fires when only the legacy dir exists and ARCHON_PLANS_DIR is unset.
    // Runs BEFORE any other hook reads plan state so downstream consumers
    // always see the canonical path. Loud notice; safe no-op otherwise.
    try {
      const { migrateLegacyPlansDir } = require('./lib/plans-dir.cjs');
      const migration = migrateLegacyPlansDir();
      if (migration.migrated) {
        console.log(`Migrated legacy .aura/plans → .claude/plans (v3.7.3 schema). Source: ${migration.from}`);
      } else if (migration.error) {
        console.log(`⚠️  Legacy .aura/plans migration failed: ${migration.error}. Run manually: mv .aura/plans .claude/plans`);
      }
    } catch { /* non-blocking */ }

    // Fast path: use cached session if valid (skips all detection)
    const cached = getValidCache();
    if (cached && envFile && source !== 'init') {
      // Apply cached env vars
      for (const [key, value] of Object.entries(cached.envVars || {})) {
        if (value) writeEnv(envFile, key, value);
      }
      console.log(`Session ${source} (cached). ${cached.contextSummary || ''}`);
      // Emit plugin prefix banner on cached fast-path too
      try {
        const pluginJsonPath = path.join(__dirname, '..', '.claude-plugin', 'plugin.json');
        if (fs.existsSync(pluginJsonPath)) {
          const pluginData = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
          const pluginPrefix = pluginData.name || 'archon-os';
          console.log(`🔌 plugin-prefix: ${pluginPrefix} (use as subagent_type prefix: \`${pluginPrefix}:<agent-id>\` — see rules/core/agent-namespacing.md)`);
        }
      } catch {/* best-effort */}
      emitContextStalenessBanner();
      emitContextBudgetWarning();
      emitHostExtensions();
      process.exit(0);
    }

    // Load cascading config
    const config = loadConfig();

    // Detect project info
    const detections = {
      type: detectProjectType(config.project?.type),
      pm: detectPackageManager(config.project?.packageManager),
      framework: detectFramework(config.project?.framework)
    };

    // Resolve plan path
    const resolved = resolvePlanPath(sessionId, config);

    // Save session state (only persist explicitly active plans)
    if (sessionId) {
      writeSessionState(sessionId, {
        sessionOrigin: process.cwd(),
        activePlan: resolved.resolvedBy === 'session' ? resolved.path : null,
        suggestedPlan: resolved.resolvedBy === 'branch' ? resolved.path : null,
        projectType: detections.type,
        packageManager: detections.pm,
        framework: detections.framework,
        timestamp: Date.now(),
        source
      });
    }

    // Calculate reports path
    const reportsPath = getReportsPath(resolved.path, resolved.resolvedBy, config);

    // Load memory from Supabase (non-blocking)
    let memoryResult = { loaded: false, count: 0, error: null };
    try {
      memoryResult = await loadMemory();
    } catch (e) {
      memoryResult.error = e.message;
    }

    // Collect static environment info
    const staticEnv = {
      nodeVersion: getNodeVersion(),
      pythonVersion: getPythonVersion(),
      phpVersion: getPhpVersion(),
      goVersion: getGoVersion(),
      godotVersion: getGodotVersion(),
      osPlatform: process.platform,
      gitBranch: getGitBranch(),
      gitUrl: getGitRemoteUrl(),
      user: process.env.USER || process.env.USERNAME || process.env.LOGNAME || os.userInfo().username,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      projectRoot: process.cwd()
    };

    // Write environment variables
    if (envFile) {
      // Session & project info
      writeEnv(envFile, 'ARCHON_SESSION_ID', sessionId || '');
      writeEnv(envFile, 'ARCHON_PROJECT_TYPE', detections.type || '');
      writeEnv(envFile, 'ARCHON_PACKAGE_MANAGER', detections.pm || '');
      writeEnv(envFile, 'ARCHON_FRAMEWORK', detections.framework || '');
      writeEnv(envFile, 'ARCHON_PROJECT_ROOT', staticEnv.projectRoot);

      // Plan resolution
      writeEnv(envFile, 'ARCHON_ACTIVE_PLAN', resolved.resolvedBy === 'session' ? resolved.path : '');
      writeEnv(envFile, 'ARCHON_SUGGESTED_PLAN', resolved.resolvedBy === 'branch' ? resolved.path : '');
      writeEnv(envFile, 'ARCHON_REPORTS_PATH', reportsPath);

      // Paths
      writeEnv(envFile, 'ARCHON_PLANS_PATH', config.paths?.plans || 'plans');
      writeEnv(envFile, 'ARCHON_WORKFLOWS_PATH', config.paths?.workflows || '.claude/logs/runs');

      // Plan config
      writeEnv(envFile, 'ARCHON_PLAN_NAMING', config.plan?.namingFormat || '{date}-{slug}');
      writeEnv(envFile, 'ARCHON_PLAN_DATE_FORMAT', config.plan?.dateFormat || 'YYMMDD');
      if (config.plan?.issuePrefix) {
        writeEnv(envFile, 'ARCHON_PLAN_ISSUE_PREFIX', config.plan.issuePrefix);
      }

      // Git info
      writeEnv(envFile, 'ARCHON_GIT_BRANCH', staticEnv.gitBranch || '');
      writeEnv(envFile, 'ARCHON_GIT_URL', staticEnv.gitUrl || '');

      // Runtime versions
      writeEnv(envFile, 'ARCHON_NODE_VERSION', staticEnv.nodeVersion || '');
      if (staticEnv.pythonVersion) writeEnv(envFile, 'ARCHON_PYTHON_VERSION', staticEnv.pythonVersion);
      if (staticEnv.phpVersion) writeEnv(envFile, 'ARCHON_PHP_VERSION', staticEnv.phpVersion);
      if (staticEnv.goVersion) writeEnv(envFile, 'ARCHON_GO_VERSION', staticEnv.goVersion);
      if (staticEnv.godotVersion) writeEnv(envFile, 'ARCHON_GODOT_VERSION', staticEnv.godotVersion);

      // System info
      writeEnv(envFile, 'ARCHON_OS_PLATFORM', staticEnv.osPlatform);
      writeEnv(envFile, 'ARCHON_USER', staticEnv.user);
      writeEnv(envFile, 'ARCHON_TIMEZONE', staticEnv.timezone);

      // Locale config
      if (config.locale?.responseLanguage) {
        writeEnv(envFile, 'ARCHON_RESPONSE_LANGUAGE', config.locale.responseLanguage);
      }

      // Memory status
      writeEnv(envFile, 'ARCHON_MEMORY_LOADED', memoryResult.loaded ? 'true' : 'false');
      writeEnv(envFile, 'ARCHON_MEMORY_COUNT', memoryResult.count.toString());
      if (memoryResult.error) {
        writeEnv(envFile, 'ARCHON_MEMORY_ERROR', memoryResult.error);
      }
    }

    // Output context summary
    const contextSummary = buildContextOutput(config, detections, resolved, memoryResult);

    // Save session cache for fast path on next startup
    const envVars = {
      ARCHON_SESSION_ID: sessionId || '',
      ARCHON_PROJECT_TYPE: detections.type || '',
      ARCHON_PACKAGE_MANAGER: detections.pm || '',
      ARCHON_FRAMEWORK: detections.framework || '',
      ARCHON_PROJECT_ROOT: staticEnv.projectRoot,
      ARCHON_ACTIVE_PLAN: resolved.resolvedBy === 'session' ? resolved.path : '',
      ARCHON_SUGGESTED_PLAN: resolved.resolvedBy === 'branch' ? resolved.path : '',
      ARCHON_REPORTS_PATH: reportsPath,
      ARCHON_PLANS_PATH: config.paths?.plans || 'plans',
      ARCHON_WORKFLOWS_PATH: config.paths?.workflows || '.claude/logs/runs',
      ARCHON_GIT_BRANCH: staticEnv.gitBranch || '',
      ARCHON_GIT_URL: staticEnv.gitUrl || '',
      ARCHON_NODE_VERSION: staticEnv.nodeVersion || '',
      ARCHON_OS_PLATFORM: staticEnv.osPlatform,
      ARCHON_USER: staticEnv.user,
      ARCHON_TIMEZONE: staticEnv.timezone,
      ARCHON_MEMORY_LOADED: memoryResult.loaded ? 'true' : 'false',
      ARCHON_MEMORY_COUNT: memoryResult.count.toString()
    };
    if (staticEnv.pythonVersion) envVars.ARCHON_PYTHON_VERSION = staticEnv.pythonVersion;
    if (staticEnv.phpVersion) envVars.ARCHON_PHP_VERSION = staticEnv.phpVersion;
    if (staticEnv.goVersion) envVars.ARCHON_GO_VERSION = staticEnv.goVersion;
    if (staticEnv.godotVersion) envVars.ARCHON_GODOT_VERSION = staticEnv.godotVersion;
    if (config.locale?.responseLanguage) envVars.ARCHON_RESPONSE_LANGUAGE = config.locale.responseLanguage;

    saveSessionCache({
      envVars,
      contextSummary: contextSummary || '',
      agent: 'ready',
      phase: '-'
    });

    if (contextSummary) {
      console.log(`Session ${source}. ${contextSummary}`);
    } else {
      console.log(`Session ${source}.`);
    }

    // Emit plugin prefix banner — single source of truth for Agent tool dispatch.
    // Skills/rules MUST use this prefix when invoking plugin agents (not the
    // hardcoded string "archon-os"). See rules/core/agent-namespacing.md.
    try {
      const pluginJsonPath = path.join(__dirname, '..', '.claude-plugin', 'plugin.json');
      if (fs.existsSync(pluginJsonPath)) {
        const pluginData = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
        const pluginPrefix = pluginData.name || 'archon-os';
        console.log(`🔌 plugin-prefix: ${pluginPrefix} (use as subagent_type prefix: \`${pluginPrefix}:<agent-id>\` — see rules/core/agent-namespacing.md)`);
      }
    } catch {/* best-effort; silent on failure */}

    emitContextStalenessBanner();
    emitContextBudgetWarning();
    emitHostExtensions();

    // Check if statusLine is configured — one-time hint
    const statusHintFile = path.join(findProjectRoot(), '.claude', 'cache', 'statusline-hint-shown');
    if (!fs.existsSync(statusHintFile)) {
      try {
        // Check project settings for statusLine
        const settingsPath = path.join(findProjectRoot(), '.claude', 'settings.local.json');
        let hasStatusLine = false;
        if (fs.existsSync(settingsPath)) {
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          hasStatusLine = !!settings.statusLine;
        }
        if (!hasStatusLine) {
          console.log('💡 Tip: Enable Archon OS status line for always-visible agent/phase info (0 tokens). Run: project:sync-settings');
        }
        // Mark hint as shown
        const hintDir = path.dirname(statusHintFile);
        if (!fs.existsSync(hintDir)) fs.mkdirSync(hintDir, { recursive: true });
        fs.writeFileSync(statusHintFile, Date.now().toString());
      } catch { /* non-blocking */ }
    }

    // Detect stale ~/.claude/statusline-command.sh shim (pre-v3.7.3 layout).
    // Older installs hard-coded `│ P{phase} │` with ARCHON_PHASE="-", which renders
    // a literal `P-` when no run is active. The plugin now ships the corrected
    // shim at archon-os/scripts/statusline-shim.sh. We don't auto-write to the
    // user's home dir — print a one-time copyable command instead.
    try {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (home) {
        const userShim = path.join(home, '.claude', 'statusline-command.sh');
        const staleHintFile = path.join(findProjectRoot(), '.claude', 'cache', 'statusline-stale-shim-hint-shown');
        if (fs.existsSync(userShim) && !fs.existsSync(staleHintFile)) {
          const shimContent = fs.readFileSync(userShim, 'utf-8');
          // Stale markers: hard-coded `│ P%s │` printf, or ARCHON_PHASE="-" default.
          const isStale = /\|\s*P%s\s*\|/.test(shimContent) || /ARCHON_PHASE\s*=\s*"-"/.test(shimContent);
          if (isStale) {
            const pluginShim = path.join(home, '.claude', 'plugins', 'marketplaces', 'archon', 'archon-os', 'scripts', 'statusline-shim.sh');
            console.log('⚠️  Detected stale ~/.claude/statusline-command.sh (renders `P-` instead of mode/step/agent).');
            console.log(`   Fix:  cp '${pluginShim}' '${userShim}' && chmod +x '${userShim}'`);
            console.log('   Or point settings.json directly at the plugin: see archon-os/settings.example.json');
            try {
              const hintDir = path.dirname(staleHintFile);
              if (!fs.existsSync(hintDir)) fs.mkdirSync(hintDir, { recursive: true });
              fs.writeFileSync(staleHintFile, Date.now().toString());
            } catch { /* non-blocking */ }
          }
        }
      }
    } catch { /* non-blocking */ }

    // Show user assertions if configured
    if (config.assertions?.length > 0) {
      console.log('\nUser Assertions:');
      config.assertions.forEach((assertion, i) => {
        console.log(`  ${i + 1}. ${assertion}`);
      });
    }

    // Retention sweep — prune audit/trace JSONL entries older than
    // ARCHON_AUDIT_RETENTION_DAYS (default 30). Async (fire and forget).
    try { sweepRetention(); } catch { /* non-blocking */ }

    process.exit(0);
  } catch (error) {
    console.error(`SessionStart hook error: ${error.message}`);
    process.exit(0); // Non-blocking
  }
}

/**
 * Prune append-only JSONL stores (mcp-audit, plan history/conflicts, plan
 * traces, metrics sessions) and stale workflow run dirs to keep them from
 * growing unbounded. JSONL files are filtered in-place by parsing each line's
 * `ts` field (ISO-8601) and dropping entries older than the retention window.
 * Drops the entire file if every line is expired.
 *
 * Disable: ARCHON_AUDIT_RETENTION_DAYS=0 keeps everything.
 * Tune:    ARCHON_AUDIT_RETENTION_DAYS=N (default 30).
 */
function sweepRetention() {
  const retentionDays = parseInt(process.env.ARCHON_AUDIT_RETENTION_DAYS || '30', 10);
  if (!retentionDays || retentionDays <= 0) return;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const resolvePlansDir = require('./lib/plans-dir.cjs');
  const plansDir = resolvePlansDir();
  const targets = [
    // MCP audit lives in its own security dir by design (security domain stays
    // separate from plans), resolved through lib/security-dir.cjs so the sweep
    // and mcp-call-gate — its only writer — cannot disagree about the location.
    // Plan traces follow the v3.7.3 .claude/plans path, with legacy .aura/plans
    // honored via the resolver.
    require('./lib/security-dir.cjs').resolveMcpAuditFile(findProjectRoot()),
    // The two append-only plan logs. Six hooks append to these and nothing
    // truncated them before; three Stop-registered hooks read their tails.
    path.join(plansDir, 'history.jsonl'),
    path.join(plansDir, 'conflicts.jsonl'),
    ...listFiles(path.join(plansDir, 'traces')),
    // v3.7.3+ tool-call-tracer writes {taskFolder}/trace.jsonl, not the legacy
    // traces/ dir — those co-located files escaped the sweep entirely.
    ...findCoLocatedTraces(path.join(plansDir, 'features')),
    ...listFiles(path.join(findProjectRoot(), '.claude', 'metrics', 'sessions')),
  ];

  for (const file of targets) {
    pruneJsonlByTimestamp(file, cutoff);
  }

  // One directory per workflow, never pruned before. Both roots: team-bridge's
  // resolveWorkflowDir() falls back to the legacy .claude/logs/workflows, and a
  // workflow that landed there kept everything under it forever — including the
  // teams/phase-*/team-log.jsonl and per-agent logs, which are unrotated appends
  // with no sweep of their own. Pruning the run directory covers them wherever
  // the workflow lives, which a per-file target could not: ARCHON_TEAM_LOG_DIR only
  // exists inside a live team session, so at SessionStart there is nothing to read.
  const logsRoot = path.join(findProjectRoot(), '.claude', 'logs');
  pruneStaleRunDirs(path.join(logsRoot, 'runs'), cutoff);
  pruneStaleRunDirs(path.join(logsRoot, 'workflows'), cutoff);

  sweepStaleSessionState();
}

/**
 * Delete abandoned session-state files from the OS temp dir, under both the
 * canonical archon-session- prefix and the pre-v4 af-session- one.
 *
 * Nothing ever removed these. That is a correctness problem before it is a
 * housekeeping one: the id is process.ppid, which the OS recycles, so a file
 * left by a session that ended last week is read as live state by whatever new
 * Claude Code process happens to land on that pid — restoring another session's
 * active plan, phase and agent into an unrelated one.
 *
 * Uses its own 24h window rather than ARCHON_AUDIT_RETENTION_DAYS: this is not
 * retention of an audit trail the user may want to keep, it is scratch state
 * that stops being true the moment its session ends. readSessionState applies
 * the same cutoff, so a stale file is inert even before the sweep reaches it.
 *
 * The temp dir is shared between users on most systems. Files we cannot stat or
 * unlink belong to someone else — skip them; that is not our failure to report.
 */
function sweepStaleSessionState(now = Date.now(), dir = os.tmpdir()) {
  const { SESSION_STATE_MAX_AGE_MS, SESSION_STATE_PREFIX, LEGACY_SESSION_STATE_PREFIX } =
    require('./lib/config-utils.cjs');
  const cutoff = now - SESSION_STATE_MAX_AGE_MS;
  let removed = 0;
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return 0; }
  for (const name of entries) {
    // Covers <prefix><id>.json and the .<rand> sidecars writeSessionState renames
    // from — a crash between write and rename leaves those behind too. Both
    // prefixes are swept: the legacy one still gets written by an older plugin
    // sharing this temp dir, and nothing else would ever collect it.
    if (!name.startsWith(SESSION_STATE_PREFIX) &&
        !name.startsWith(LEGACY_SESSION_STATE_PREFIX)) continue;
    const full = path.join(dir, name);
    try {
      if (fs.statSync(full).mtimeMs > cutoff) continue;
      fs.unlinkSync(full);
      removed++;
    } catch { /* another user's file, or gone already — not ours to fix */ }
  }
  return removed;
}

function listFiles(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.jsonl') || f.endsWith('.json'))
      .map(f => path.join(dir, f));
  } catch {
    return [];
  }
}

// Bounded recursive walk for co-located trace.jsonl files. The plan tree is
// features/<FEAT>/stories/<STORY>/tasks/<TASK>/trace.jsonl — depth 6 covers it
// with room to spare, and the file cap keeps a pathological tree from turning
// the sweep itself into the hazard it is meant to fix.
const TRACE_WALK_MAX_DEPTH = 6;
const TRACE_WALK_MAX_FILES = 2000;
function findCoLocatedTraces(rootDir, maxDepth = TRACE_WALK_MAX_DEPTH) {
  const found = [];
  try {
    if (!fs.existsSync(rootDir)) return found;
    const stack = [[rootDir, 0]];
    while (stack.length > 0 && found.length < TRACE_WALK_MAX_FILES) {
      const [dir, depth] = stack.pop();
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (depth < maxDepth) stack.push([full, depth + 1]);
        } else if (entry.name === 'trace.jsonl') {
          found.push(full);
          if (found.length >= TRACE_WALK_MAX_FILES) break;
        }
      }
    }
  } catch { /* best-effort */ }
  return found;
}

// Remove whole workflow run directories older than the retention window. Only
// directories are touched; the active-workflow.txt pointer (and whatever run it
// names) is always preserved so a resumed session still finds its state.
function pruneStaleRunDirs(runsDir, cutoffMs) {
  try {
    if (!fs.existsSync(runsDir)) return;
    let activeId = null;
    try {
      activeId = fs.readFileSync(path.join(runsDir, 'active-workflow.txt'), 'utf8').trim() || null;
    } catch { /* no pointer — nothing pinned */ }

    for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === activeId) continue;
      const full = path.join(runsDir, entry.name);
      try {
        if (fs.statSync(full).mtimeMs >= cutoffMs) continue;
        fs.rmSync(full, { recursive: true, force: true });
      } catch { /* skip this run dir */ }
    }
  } catch { /* best-effort; never block startup */ }
}

// Streaming prune: read in fixed-size chunks and write survivors straight to a
// tmp file. Peak RSS is the chunk buffer, not 2x the file — which matters most
// for exactly the case the size guard below lets through (a large, stale file).
const PRUNE_CHUNK_BYTES = 64 * 1024;
const PRUNE_FLUSH_BYTES = 64 * 1024;

function pruneJsonlByTimestamp(file, cutoffMs) {
  let inFd = null;
  let outFd = null;
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    if (!fs.existsSync(file)) return;
    const stat = fs.statSync(file);
    // Cheap pre-check: if mtime is recent, nothing has aged out since last sweep.
    if (stat.mtimeMs > cutoffMs && stat.size < 1024 * 1024) return;

    const { StringDecoder } = require('node:string_decoder');
    const decoder = new StringDecoder('utf8');

    inFd = fs.openSync(file, 'r');
    outFd = fs.openSync(tmp, 'w');

    let dropped = 0;
    let keptCount = 0;
    let pending = '';
    let pendingBytes = 0;

    const flush = () => {
      if (!pending) return;
      fs.writeSync(outFd, pending);
      pending = '';
      pendingBytes = 0;
    };

    const handle = (line) => {
      if (!line.trim()) return;
      let ts;
      let keep = true;
      try {
        const obj = JSON.parse(line);
        ts = obj.ts || obj.timestamp || obj.lastUpdated;
        const ms = ts ? Date.parse(ts) : NaN;
        keep = !(Number.isFinite(ms) && ms < cutoffMs);
      } catch {
        // Malformed line — keep it (don't silently destroy unparseable data).
        keep = true;
      }
      if (!keep) { dropped++; return; }
      keptCount++;
      pending += line + '\n';
      pendingBytes += line.length + 1;
      if (pendingBytes >= PRUNE_FLUSH_BYTES) flush();
    };

    const buf = Buffer.allocUnsafe(PRUNE_CHUNK_BYTES);
    let carry = '';
    let bytesRead;
    while ((bytesRead = fs.readSync(inFd, buf, 0, PRUNE_CHUNK_BYTES, null)) > 0) {
      carry += decoder.write(buf.subarray(0, bytesRead));
      let nl;
      while ((nl = carry.indexOf('\n')) !== -1) {
        handle(carry.slice(0, nl));
        carry = carry.slice(nl + 1);
      }
    }
    carry += decoder.end();
    if (carry) handle(carry);
    flush();

    fs.closeSync(inFd); inFd = null;
    fs.closeSync(outFd); outFd = null;

    if (dropped === 0) {
      fs.unlinkSync(tmp); // nothing aged out — leave the original untouched
      return;
    }
    if (keptCount === 0) {
      fs.unlinkSync(tmp);
      fs.unlinkSync(file);
      return;
    }
    // Atomic swap — never half-replace a JSONL store.
    fs.renameSync(tmp, file);
  } catch {
    // best-effort; never block startup
    try { if (inFd !== null) fs.closeSync(inFd); } catch { /* ignore */ }
    try { if (outFd !== null) fs.closeSync(outFd); } catch { /* ignore */ }
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

// Run as a hook; stay importable for tests. Requiring this file previously
// executed main() as a side effect (writing the cache, emitting the banner,
// sweeping retention), which is why none of its logic could be unit-tested.
// FEAT-007 / issue #5: make hooks importable without changing hook behaviour.
if (require.main === module) {
  main();
} else {
  module.exports = {
    cacheStaleReason, getValidCache, buildContextOutput, listFiles, pruneJsonlByTimestamp,
    emitContextStalenessBanner, sweepRetention, findCoLocatedTraces, pruneStaleRunDirs,
    sweepStaleSessionState,
  };
}
