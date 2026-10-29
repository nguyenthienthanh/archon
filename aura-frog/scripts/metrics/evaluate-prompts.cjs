#!/usr/bin/env node
/**
 * Aura Frog - Prompt Usage Evaluator
 *
 * Analyzes prompt logs to evaluate how the user uses Claude Code
 * and generates actionable suggestions for improvement.
 *
 * Usage:
 *   node evaluate-prompts.cjs                    # Last 7 days
 *   node evaluate-prompts.cjs --days 30          # Last 30 days
 *   node evaluate-prompts.cjs --focus efficiency  # Focus area
 *
 * Output: Markdown report to stdout
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

const PROMPTS_DIR = path.join(process.cwd(), '.claude', 'metrics', 'prompts');
const SESSIONS_DIR = path.join(process.cwd(), '.claude', 'metrics', 'sessions');

// All available skills (44 total as of v3.7.0 — see aura-frog/skills/)
// Available skills — categorized list used for prompt-evaluation heuristics.
// Authoritative count lives on disk under aura-frog/skills/*/SKILL.md; this list
// powers suggestion rules and need not be exhaustive.
const AVAILABLE_SKILLS = [
  // Auto-invoke
  'agent-detector', 'bugfix-quick', 'code-reviewer', 'code-simplifier', 'test-writer',
  'plan-loader', 'reasoning-trace-recorder', 'extension-detector', 'permanent-memory-loader',
  // Orchestration & workflow
  'run-orchestrator', 'session-continuation', 'self-improve',
  'project-context-loader',
  // Reasoning techniques
  'self-consistency', 'tree-of-thoughts', 'chain-of-verification',
  // Code-writing
  'refactor-expert', 'api-designer', 'migration-helper', 'documentation',
  'git',
  // Coverage skills
  'deep-debugging', 'monorepo', 'perf-profiling',
  // Thinking
  'problem-solving', 'scalable-thinking', 'prompt-evaluator',
  // Design & UI
  'design-expert', 'stitch-design',
  // Framework experts (individual *-expert skills folded into framework-expert/refs/)
  'framework-expert',
  // Hierarchical planning + safety
  'plan-validator', 'plan-archivist', 'failure-classifier',
  'self-healing-orchestrator', 'conflict-detector', 'mcp-security-auditor',
  'preflight-validator',
];

// Available command top-level categories. The core surface stays small (6 verbs)
// so users never face discovery paralysis; specialized /archon-os:* commands layer on
// top for hierarchical planning and safety ops.
const AVAILABLE_COMMAND_CATEGORIES = [
  'run', 'check', 'design', 'project', 'af', 'help', 'aura',
];

// Available agents. Router was consolidated into the agent-detector skill, so this
// list reflects the specialist roster (build/review + planning + safety).
const AVAILABLE_AGENTS = [
  'lead', 'architect', 'frontend', 'mobile', 'strategist',
  'security', 'tester', 'devops', 'scanner',
  'master-planner', 'feature-architect', 'story-planner', 'replanner',
  'epic-summarizer', 'conflict-arbiter',
];

// Suggestion rules
const SUGGESTION_RULES = [
  {
    id: 'short_prompts',
    check: (stats) => stats.avgWords < 15,
    title: 'Add more context to prompts',
    detail: `Your prompts average ${'{avgWords}'} words. Adding context about what you expect (file paths, expected behavior, constraints) helps Claude produce better results on the first try.`,
    priority: 'high',
  },
  {
    id: 'high_correction_rate',
    check: (stats) => stats.correctionRate > 25,
    title: 'Reduce corrections with specific prompts',
    detail: `${'{correctionRate}'}% of your prompts are corrections. Try being more specific upfront — include expected output format, constraints, or examples.`,
    priority: 'high',
  },
  {
    id: 'low_workflow_usage',
    check: (stats) => stats.workflowUsage < 15 && stats.implementCount > 5,
    title: 'Use workflows for complex tasks',
    detail: `Only ${'{workflowUsage}'}% of implementation tasks use /run. Structured workflows improve quality with TDD and code review phases.`,
    priority: 'medium',
  },
  {
    id: 'low_skill_discovery',
    check: (stats) => stats.skillUsagePercent < 20,
    title: 'Explore more plugin skills',
    detail: `You're using ${'{usedSkillCount}'}/${'{totalSkills}'} available skills (${'{skillUsagePercent}'}%). Unused skills that may help: ${'{unusedRelevant}'}.`,
    priority: 'medium',
  },
  {
    id: 'no_testing',
    check: (stats) => stats.testPercent < 5 && stats.implementCount > 3,
    title: 'Add testing to your workflow',
    detail: `Only ${'{testPercent}'}% of prompts involve testing. Try /run "add tests for <module>" — the test-writer skill auto-fires.`,
    priority: 'high',
  },
  {
    id: 'high_debug_ratio',
    check: (stats) => stats.debugPercent > 35,
    title: 'High debugging ratio — try systematic debugging',
    detail: `${'{debugPercent}'}% of prompts are debug-related. Use /run "fix <bug>" — bugfix-quick auto-fires; escalates to deep-debugging for hard cases.`,
    priority: 'medium',
  },
  {
    id: 'no_code_review',
    check: (stats) => stats.reviewPercent < 3 && stats.implementCount > 5,
    title: 'Add code reviews to catch issues early',
    detail: 'Almost no code review prompts detected. Use /simplify after changes or /check review (code-reviewer skill) for evidence-based reviews.',
    priority: 'medium',
  },
  {
    id: 'low_agent_diversity',
    check: (stats) => stats.uniqueAgents < 3 && stats.totalPrompts > 20,
    title: 'Leverage specialized agents',
    detail: `You've used ${'{uniqueAgents}'} of ${'{totalAgents}'} agents. Unused agents: ${'{unusedAgents}'}. Specialized agents have deeper domain knowledge.`,
    priority: 'low',
  },
  {
    id: 'no_learning',
    check: (stats) => !stats.usedCommands.some(c => c.startsWith('learn')),
    title: 'Check your learning insights',
    detail: 'Run /learn:status to see what patterns have been captured, and /learn:analyze for actionable insights from your usage.',
    priority: 'low',
  },
  {
    id: 'long_sessions',
    check: (stats) => stats.avgPromptsPerSession > 30,
    title: 'Consider breaking long sessions',
    detail: `Averaging ${'{avgPromptsPerSession}'} prompts/session. Long sessions consume context. Use /workflow:handoff to save state and start fresh.`,
    priority: 'medium',
  },
];

/**
 * Parse CLI arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = { days: 7, focus: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      options.days = parseInt(args[i + 1], 10) || 7;
      i++;
    } else if (args[i] === '--focus' && args[i + 1]) {
      options.focus = args[i + 1];
      i++;
    }
  }

  return options;
}

/**
 * Load prompt logs for date range
 */
function loadPromptLogs(days) {
  const entries = [];

  if (!fs.existsSync(PROMPTS_DIR)) {
    return entries;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const files = fs.readdirSync(PROMPTS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .sort();

  for (const file of files) {
    // Check date from filename (YYYY-MM-DD.jsonl)
    const fileDate = file.replace('.jsonl', '');
    if (fileDate < cutoff.toISOString().slice(0, 10)) continue;

    const filePath = path.join(PROMPTS_DIR, file);
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch { /* skip malformed lines */ }
    }
  }

  return entries;
}

/**
 * Load session metrics for date range
 */
function loadSessionMetrics(days) {
  const sessions = [];

  if (!fs.existsSync(SESSIONS_DIR)) {
    return sessions;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  for (const file of files) {
    const filePath = path.join(SESSIONS_DIR, file);
    try {
      sessions.push(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    } catch { /* skip malformed */ }
  }

  return sessions;
}

/**
 * Compute statistics from prompt logs
 */
function computeStats(entries, sessions) {
  if (entries.length === 0) {
    return null;
  }

  // Basic counts
  const totalPrompts = entries.length;
  const totalWords = entries.reduce((sum, e) => sum + (e.words || 0), 0);
  const totalChars = entries.reduce((sum, e) => sum + (e.chars || 0), 0);
  const avgWords = Math.round(totalWords / totalPrompts);
  const avgChars = Math.round(totalChars / totalPrompts);

  // Intent distribution
  const intentCounts = {};
  for (const e of entries) {
    const intent = e.intent || 'chat';
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  }

  // Percentages
  const implementCount = (intentCounts.implement || 0);
  const debugPercent = Math.round(((intentCounts.debug || 0) / totalPrompts) * 100);
  const testPercent = Math.round(((intentCounts.test || 0) / totalPrompts) * 100);
  const reviewPercent = Math.round(((intentCounts.review || 0) / totalPrompts) * 100);
  const questionPercent = Math.round(((intentCounts.question || 0) / totalPrompts) * 100);
  const feedbackPercent = Math.round(((intentCounts.feedback || 0) / totalPrompts) * 100);
  const correctionRate = feedbackPercent;

  // Commands used
  const usedCommands = new Set();
  for (const e of entries) {
    for (const cmd of (e.commands || [])) {
      usedCommands.add(cmd);
    }
  }

  // Workflow usage
  const workflowCommands = [...usedCommands].filter(c => c.startsWith('workflow'));
  const workflowUsage = implementCount > 0
    ? Math.round((workflowCommands.length / Math.max(implementCount, 1)) * 100)
    : 0;

  // Agent usage
  const usedAgents = new Set();
  for (const e of entries) {
    if (e.agent) usedAgents.add(e.agent);
  }
  const uniqueAgents = usedAgents.size;
  const unusedAgents = AVAILABLE_AGENTS.filter(a => !usedAgents.has(a));

  // Skill discovery (from commands that match skill names)
  const usedSkills = new Set();
  for (const cmd of usedCommands) {
    // Map commands to skills
    const parts = cmd.split(':');
    usedSkills.add(parts[0]);
  }
  // Also count agents as skill usage proxy
  for (const a of usedAgents) {
    usedSkills.add(a);
  }
  const usedSkillCount = usedSkills.size;
  const skillUsagePercent = Math.round((usedSkillCount / AVAILABLE_SKILLS.length) * 100);
  const unusedRelevant = AVAILABLE_SKILLS
    .filter(s => !usedSkills.has(s) && !s.includes('expert'))
    .slice(0, 5)
    .join(', ');

  // Complexity signals
  const complexitySignals = {};
  for (const e of entries) {
    for (const sig of (e.complexity || [])) {
      complexitySignals[sig] = (complexitySignals[sig] || 0) + 1;
    }
  }

  // Session analysis
  const sessionIds = new Set(entries.map(e => e.sessionId).filter(Boolean));
  const promptsPerSession = {};
  for (const e of entries) {
    if (e.sessionId) {
      promptsPerSession[e.sessionId] = (promptsPerSession[e.sessionId] || 0) + 1;
    }
  }
  const sessionCounts = Object.values(promptsPerSession);
  const avgPromptsPerSession = sessionCounts.length > 0
    ? Math.round(sessionCounts.reduce((a, b) => a + b, 0) / sessionCounts.length)
    : 0;

  // Daily distribution
  const dailyCounts = {};
  for (const e of entries) {
    const date = e.ts ? e.ts.slice(0, 10) : 'unknown';
    dailyCounts[date] = (dailyCounts[date] || 0) + 1;
  }

  // Hour distribution
  const hourCounts = new Array(24).fill(0);
  for (const e of entries) {
    if (e.ts) {
      const hour = new Date(e.ts).getHours();
      hourCounts[hour]++;
    }
  }
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  // Token metrics from sessions
  let totalTokensEstimate = 0;
  const tokensByTool = {};
  for (const s of sessions) {
    totalTokensEstimate += s.totalTokens || 0;
    for (const [tool, tokens] of Object.entries(s.tokensByTool || {})) {
      tokensByTool[tool] = (tokensByTool[tool] || 0) + tokens;
    }
  }

  return {
    totalPrompts,
    totalWords,
    totalChars,
    avgWords,
    avgChars,
    intentCounts,
    implementCount,
    debugPercent,
    testPercent,
    reviewPercent,
    questionPercent,
    feedbackPercent,
    correctionRate,
    usedCommands: [...usedCommands],
    workflowUsage,
    uniqueAgents,
    unusedAgents,
    usedSkillCount,
    totalSkills: AVAILABLE_SKILLS.length,
    skillUsagePercent,
    unusedRelevant,
    complexitySignals,
    totalSessions: sessionIds.size,
    avgPromptsPerSession,
    dailyCounts,
    peakHour,
    totalTokensEstimate,
    tokensByTool,
    totalAgents: AVAILABLE_AGENTS.length,
  };
}

/**
 * Generate suggestions based on stats
 */
function generateSuggestions(stats) {
  const suggestions = [];

  for (const rule of SUGGESTION_RULES) {
    try {
      if (rule.check(stats)) {
        // Interpolate template values
        let detail = rule.detail;
        const replacements = {
          '{avgWords}': stats.avgWords,
          '{correctionRate}': stats.correctionRate,
          '{workflowUsage}': stats.workflowUsage,
          '{usedSkillCount}': stats.usedSkillCount,
          '{totalSkills}': stats.totalSkills,
          '{skillUsagePercent}': stats.skillUsagePercent,
          '{unusedRelevant}': stats.unusedRelevant,
          '{testPercent}': stats.testPercent,
          '{debugPercent}': stats.debugPercent,
          '{uniqueAgents}': stats.uniqueAgents,
          '{totalAgents}': stats.totalAgents,
          '{unusedAgents}': stats.unusedAgents.slice(0, 4).join(', '),
          '{avgPromptsPerSession}': stats.avgPromptsPerSession,
        };

        for (const [key, val] of Object.entries(replacements)) {
          detail = detail.replace(key, val);
        }

        suggestions.push({
          id: rule.id,
          title: rule.title,
          detail,
          priority: rule.priority,
        });
      }
    } catch { /* rule evaluation error - skip */ }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

  return suggestions;
}

/**
 * Generate gaps analysis
 */
function generateGaps(stats) {
  const gaps = [];

  // Unused command categories
  const usedCategories = new Set(stats.usedCommands.map(c => c.split(':')[0]));
  const unusedCategories = AVAILABLE_COMMAND_CATEGORIES.filter(c => !usedCategories.has(c));
  if (unusedCategories.length > 5) {
    gaps.push({
      area: 'Command Coverage',
      gap: `${unusedCategories.length} command categories never used`,
      unused: unusedCategories.join(', '),
      suggestion: 'Run /help to discover available commands',
    });
  }

  // No workflow usage
  if (stats.workflowUsage === 0 && stats.implementCount > 0) {
    gaps.push({
      area: 'Workflow Adoption',
      gap: 'No structured workflows used for implementation tasks',
      unused: '/run',
      suggestion: 'Workflows enforce TDD and code review — try /run "<task>" for your next feature',
    });
  }

  // No security awareness
  if (!stats.usedCommands.some(c => c.startsWith('security')) && stats.totalPrompts > 20) {
    gaps.push({
      area: 'Security',
      gap: 'No security scanning or audit commands used',
      unused: '/security:audit, /security:scan, /security:deps',
      suggestion: 'Run /security:audit periodically to catch vulnerabilities early',
    });
  }

  // No performance analysis
  if (!stats.usedCommands.some(c => c.startsWith('perf')) && stats.totalPrompts > 20) {
    gaps.push({
      area: 'Performance',
      gap: 'No performance analysis commands used',
      unused: '/perf:analyze, /perf:bundle, /perf:lighthouse',
      suggestion: 'Run /perf:analyze to identify bottlenecks before they reach production',
    });
  }

  // Low question ratio (not exploring enough)
  if (stats.questionPercent < 10 && stats.totalPrompts > 20) {
    gaps.push({
      area: 'Code Understanding',
      gap: 'Few questions asked — mostly directing, not exploring',
      unused: 'Questions about architecture, alternatives, trade-offs',
      suggestion: 'Ask Claude "why" and "what alternatives" — it can surface insights you might miss',
    });
  }

  return gaps;
}

/**
 * Format report as markdown
 */
function formatReport(stats, suggestions, gaps, options) {
  const lines = [];
  const now = new Date().toISOString();

  lines.push('## Prompt Usage Evaluation Report');
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Period:** Last ${options.days} days`);
  lines.push('');

  // --- Overview ---
  lines.push('### Overview');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total prompts | ${stats.totalPrompts} |`);
  lines.push(`| Total sessions | ${stats.totalSessions} |`);
  lines.push(`| Avg prompts/session | ${stats.avgPromptsPerSession} |`);
  lines.push(`| Avg words/prompt | ${stats.avgWords} |`);
  lines.push(`| Avg chars/prompt | ${stats.avgChars} |`);
  lines.push(`| Peak activity hour | ${stats.peakHour}:00 |`);
  if (stats.totalTokensEstimate > 0) {
    lines.push(`| Est. tokens consumed | ~${Math.round(stats.totalTokensEstimate / 1000)}K |`);
  }
  lines.push('');

  // --- Intent Distribution ---
  lines.push('### Intent Distribution');
  lines.push('');
  lines.push('| Intent | Count | % |');
  lines.push('|--------|-------|---|');

  const sortedIntents = Object.entries(stats.intentCounts)
    .sort((a, b) => b[1] - a[1]);

  for (const [intent, count] of sortedIntents) {
    const pct = Math.round((count / stats.totalPrompts) * 100);
    const bar = '█'.repeat(Math.max(1, Math.round(pct / 5)));
    lines.push(`| ${intent} | ${count} | ${pct}% ${bar} |`);
  }
  lines.push('');

  // --- Feature Utilization ---
  lines.push('### Feature Utilization');
  lines.push('');
  lines.push('| Feature | Used | Available | % |');
  lines.push('|---------|------|-----------|---|');
  lines.push(`| Commands | ${stats.usedCommands.length} | ${AVAILABLE_COMMAND_CATEGORIES.length} categories | ${Math.round((stats.usedCommands.length / Math.max(AVAILABLE_COMMAND_CATEGORIES.length, 1)) * 100)}% |`);
  lines.push(`| Agents | ${stats.uniqueAgents} | ${stats.totalAgents} | ${Math.round((stats.uniqueAgents / stats.totalAgents) * 100)}% |`);
  lines.push(`| Skills (approx) | ${stats.usedSkillCount} | ${stats.totalSkills} | ${stats.skillUsagePercent}% |`);
  lines.push('');

  if (stats.usedCommands.length > 0) {
    lines.push('**Commands used:** ' + stats.usedCommands.slice(0, 15).join(', '));
    lines.push('');
  }

  // --- Complexity Profile ---
  if (Object.keys(stats.complexitySignals).length > 0) {
    lines.push('### Complexity Profile');
    lines.push('');
    lines.push('| Signal | Count |');
    lines.push('|--------|-------|');
    for (const [signal, count] of Object.entries(stats.complexitySignals).sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${signal} | ${count} |`);
    }
    lines.push('');
  }

  // --- Daily Activity ---
  const dailyEntries = Object.entries(stats.dailyCounts).sort();
  if (dailyEntries.length > 1) {
    lines.push('### Daily Activity');
    lines.push('');
    for (const [date, count] of dailyEntries) {
      const bar = '█'.repeat(Math.max(1, Math.round(count / 3)));
      lines.push(`${date} ${bar} ${count}`);
    }
    lines.push('');
  }

  // --- Suggestions ---
  if (suggestions.length > 0) {
    lines.push('### Suggestions for Improvement');
    lines.push('');

    const priorityIcons = { high: '🔴', medium: '🟡', low: '🟢' };

    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const icon = priorityIcons[s.priority] || '⚪';
      lines.push(`${i + 1}. ${icon} **${s.title}**`);
      lines.push(`   ${s.detail}`);
      lines.push('');
    }
  }

  // --- Gaps ---
  if (gaps.length > 0) {
    lines.push('### Gaps Identified');
    lines.push('');
    lines.push('| Area | Gap | Try |');
    lines.push('|------|-----|-----|');

    for (const g of gaps) {
      lines.push(`| ${g.area} | ${g.gap} | ${g.suggestion} |`);
    }
    lines.push('');
  }

  // --- Score ---
  const score = calculateScore(stats, suggestions, gaps);
  lines.push('### Usage Score');
  lines.push('');
  lines.push(`**${score}/100** — ${getScoreLabel(score)}`);
  lines.push('');
  lines.push('| Dimension | Score |');
  lines.push('|-----------|-------|');
  lines.push(`| Prompt Quality | ${score >= 70 ? '✅' : '⚠️'} ${Math.min(100, Math.round(stats.avgWords / 0.3))} |`);
  lines.push(`| Feature Discovery | ${stats.skillUsagePercent >= 20 ? '✅' : '⚠️'} ${Math.min(100, stats.skillUsagePercent * 3)} |`);
  lines.push(`| Workflow Adoption | ${stats.workflowUsage >= 15 ? '✅' : '⚠️'} ${Math.min(100, stats.workflowUsage * 3)} |`);
  lines.push(`| Testing Discipline | ${stats.testPercent >= 10 ? '✅' : '⚠️'} ${Math.min(100, stats.testPercent * 5)} |`);
  lines.push(`| Correction Efficiency | ${stats.correctionRate <= 20 ? '✅' : '⚠️'} ${Math.max(0, 100 - stats.correctionRate * 3)} |`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Calculate overall usage score (0-100)
 */
function calculateScore(stats, suggestions, gaps) {
  let score = 60; // Base score

  // Prompt quality (+/- 10)
  if (stats.avgWords >= 20) score += 10;
  else if (stats.avgWords >= 10) score += 5;
  else score -= 5;

  // Low correction rate (+10)
  if (stats.correctionRate <= 15) score += 10;
  else if (stats.correctionRate <= 25) score += 5;
  else score -= 5;

  // Feature discovery (+10)
  if (stats.skillUsagePercent >= 30) score += 10;
  else if (stats.skillUsagePercent >= 15) score += 5;

  // Workflow usage (+10)
  if (stats.workflowUsage >= 20) score += 10;
  else if (stats.workflowUsage >= 10) score += 5;

  // Testing (+5)
  if (stats.testPercent >= 10) score += 5;

  // Penalties
  score -= suggestions.filter(s => s.priority === 'high').length * 3;
  score -= gaps.length * 2;

  return Math.max(0, Math.min(100, score));
}

/**
 * Score label
 */
function getScoreLabel(score) {
  if (score >= 85) return 'Expert — You are leveraging Claude Code effectively';
  if (score >= 70) return 'Proficient — Good usage with room for improvement';
  if (score >= 50) return 'Developing — Several areas to explore';
  return 'Beginner — Many features available to improve your workflow';
}

/**
 * Main
 */
function main() {
  const options = parseArgs();

  const entries = loadPromptLogs(options.days);
  const sessions = loadSessionMetrics(options.days);

  if (entries.length === 0) {
    console.log('## No Prompt Data Found');
    console.log('');
    console.log('No prompt logs found for the specified period.');
    console.log('Prompt logging is enabled via the `prompt-logger` hook.');
    console.log('');
    console.log('**To start collecting data:**');
    console.log('1. Ensure `AF_PROMPT_LOGGING` is not set to `false`');
    console.log('2. Use Claude Code normally — prompts are logged automatically');
    console.log('3. Run this evaluation again after a few sessions');
    process.exit(0);
  }

  const stats = computeStats(entries, sessions);
  const suggestions = generateSuggestions(stats);
  const gaps = generateGaps(stats);
  const report = formatReport(stats, suggestions, gaps, options);

  console.log(report);
}

// Export for testing
module.exports = { computeStats, generateSuggestions, generateGaps, detectIntent: null };

if (require.main === module) {
  main();
}
