#!/usr/bin/env node
/**
 * token-tracker.cjs - Approximate cumulative tool-call cost
 *
 * PostToolUse hook (all tools). Runs async.
 *
 * IMPORTANT — these numbers are HEURISTIC, not authoritative. Claude Code does
 * not currently expose actual API usage to hooks via stdin; this tracker uses
 * static per-tool estimates as a rough proxy for "session is getting heavy".
 *
 * Behaviour:
 *   - Aggregates tool-call counts + crude byte/token estimates per session
 *   - Warns at 50/70/85% of a configurable budget (AF_TOKEN_BUDGET, default
 *     200K — set to 1000000 for Sonnet-4.5 1M contexts)
 *   - Writes session metrics to .claude/metrics/sessions/ for the dashboard
 *   - NEVER displays % numbers as if they were real API counts — the warning
 *     copy says "approx" so users know it's a heuristic
 *
 * Disable: AF_TOKEN_TRACKER_DISABLED=true
 *
 * Exit codes:
 * - 0: Always (informational only)
 *
 * @version 1.2.0 (honest about estimation; budget now env-configurable)
 */

const fs = require('fs');
const { readStdinSafely } = require('./lib/safe-stdin.cjs');
const path = require('path');

if (process.env.AF_TOKEN_TRACKER_DISABLED === 'true') process.exit(0);


const { findProjectRoot } = require('./lib/hook-runtime.cjs');
const CACHE_FILE = path.join(findProjectRoot(), '.claude', 'cache', 'token-tracker.json');
const CONTEXT_LIMIT = parseInt(process.env.AF_TOKEN_BUDGET || '200000', 10);

// Token estimation per operation type
const TOKEN_COSTS = {
  Read: 800,       // Average file read
  Write: 500,      // Average file write
  Edit: 300,       // Average edit
  Bash: 400,       // Average command output
  Glob: 100,       // File listing
  Grep: 200,       // Search results
  Task: 2000,      // Subagent overhead
  default: 200,    // Other tools
};

const THRESHOLDS = [
  { pct: 85, icon: '🔴', label: 'CRITICAL', msg: 'Strongly recommend /compact or session handoff' },
  { pct: 70, icon: '🟠', label: 'HIGH', msg: 'Consider /compact with focus instructions' },
  { pct: 50, icon: '🟡', label: 'MODERATE', msg: 'Context filling up, stay focused' },
];

function loadTracker() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch { /* cache read failed - fresh tracker on next call */ }
  return {
    sessionId: process.ppid?.toString(),
    totalEstimate: 5000, // Base system prompt estimate
    toolCalls: 0,
    lastWarningPct: 0,
    startedAt: Date.now(),
  };
}

function saveTracker(tracker) {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(tracker, null, 2));
  } catch { /* cache write - non-blocking */ }
}

// Save session metrics to .claude/metrics/sessions/ for dashboard
function saveSessionMetrics(tracker, toolName) {
  try {
    const metricsDir = path.join(findProjectRoot(), '.claude', 'metrics', 'sessions');
    if (!fs.existsSync(metricsDir)) fs.mkdirSync(metricsDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const sessionId = tracker.sessionId || 'unknown';
    const metricsFile = path.join(metricsDir, `${date}-${sessionId}.json`);

    let metrics;
    try {
      metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf-8'));
    } catch {
      metrics = {
        sessionId,
        date,
        startedAt: tracker.startedAt,
        totalTokens: 0,
        toolCalls: 0,
        tokensByTool: {},
        tokensByPhase: {},
        agent: process.env.AF_CURRENT_AGENT || 'unknown',
      };
    }

    const cost = TOKEN_COSTS[toolName] || TOKEN_COSTS.default;
    metrics.totalTokens = tracker.totalEstimate;
    metrics.toolCalls = tracker.toolCalls;
    metrics.tokensByTool[toolName] = (metrics.tokensByTool[toolName] || 0) + cost;
    metrics.lastUpdated = new Date().toISOString();

    // Track phase if available
    const phase = process.env.AF_CURRENT_PHASE;
    if (phase) {
      metrics.tokensByPhase[phase] = (metrics.tokensByPhase[phase] || 0) + cost;
    }

    fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));
  } catch { /* metrics save - non-blocking, best-effort */ }
}

function estimateFileTokens(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      // ~4 chars per token for code
      return Math.min(Math.ceil(stat.size / 4), 10000);
    }
  } catch { /* file stat failed - non-blocking */ }
  return 0;
}

function main() {
  try {
    const input = readStdinSafely();
    if (!input) process.exit(0);

    const data = JSON.parse(input);
    const toolName = data.tool_name || 'default';
    const toolInput = data.tool_input || {};

    const tracker = loadTracker();

    const currentSession = process.ppid?.toString();
    if (tracker.sessionId !== currentSession) {
      tracker.sessionId = currentSession;
      tracker.totalEstimate = 5000;
      tracker.toolCalls = 0;
      tracker.lastWarningPct = 0;
      tracker.startedAt = Date.now();
    }

    let tokensUsed = TOKEN_COSTS[toolName] || TOKEN_COSTS.default;
    if (toolName === 'Read') {
      tokensUsed += estimateFileTokens(toolInput.file_path);
    }
    tokensUsed += 200;

    tracker.totalEstimate += tokensUsed;
    tracker.toolCalls++;

    const currentPct = Math.round((tracker.totalEstimate / CONTEXT_LIMIT) * 100);
    const budgetK = Math.round(CONTEXT_LIMIT / 1000);
    for (const threshold of THRESHOLDS) {
      if (currentPct >= threshold.pct && tracker.lastWarningPct < threshold.pct) {
        console.error(`${threshold.icon} Approx token usage: ~${Math.round(tracker.totalEstimate / 1000)}K / ${budgetK}K (~${currentPct}%, heuristic) [${threshold.label}]`);
        console.error(`   ${threshold.msg}`);
        tracker.lastWarningPct = threshold.pct;
        break;
      }
    }

    saveTracker(tracker);
    saveSessionMetrics(tracker, toolName);
    process.exit(0);
  } catch {
    process.exit(0);
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    TOKEN_COSTS,
    THRESHOLDS,
    CONTEXT_LIMIT,
    estimateFileTokens,
    loadTracker,
  };
}
