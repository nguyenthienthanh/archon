'use strict';
/**
 * port-plugin.cjs — Cross-tool porter for the Archon OS universal layer.
 * FEAT-009 / port script.
 *
 * Exports the plugin's universal instruction layer (rules, skills, agents,
 * commands, MCP config) into the native formats of:
 *   - GitHub Copilot  → .github/copilot-instructions.md + path-scoped instruction files
 *   - Codex/OpenAI   → AGENTS.md (OpenAI AGENTS.md convention)
 *   - Cursor         → .cursor/rules/*.mdc (MDC frontmatter)
 *
 * CLI:
 *   node archon-os/scripts/port-plugin.cjs <target> [--out <dir>] [--dry-run]
 *
 * where <target> ∈ {copilot, codex, cursor, all}
 *
 * Each run produces PORT_MANIFEST.json in the output directory.
 *
 * Design constraints (per spec):
 * - Pure Node CJS, no new npm dependencies.
 * - Do NOT call Date.now()/new Date() inside pure/tested helpers.
 *   Accept `generatedAt` as an option (default null in tests); only the
 *   CLI path may stamp a real timestamp.
 * - Best-effort: never throw on a single missing source file.
 * - Guard all side effects (fs writes, stdout) behind require.main === module.
 */

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGIN_JSON_REL   = '.claude-plugin/plugin.json';
const MCP_JSON_REL      = '.mcp.json';
const CLAUDE_MD_REL     = 'CLAUDE.md';
const RULES_DIR_REL     = 'rules';
const SKILLS_DIR_REL    = 'skills';
const AGENTS_DIR_REL    = 'agents';
const COMMANDS_DIR_REL  = 'commands';

const NON_PORTABLE = [
  'CLAUDE.md filename — Codex uses AGENTS.md, Cursor uses .cursorrules or .cursor/rules/*.mdc',
  'effort: high frontmatter — Claude Code–specific; other tools ignore or map to temperature',
  'paths: "**/*.tsx" auto-invoke — Claude Code skill feature; fall back to manual invocation',
  'cache_control breakpoints — Anthropic SDK–specific; use tool-native caching if available',
  'subagent_type values — Claude Code Agent tool; map to tool-native spawn primitive',
  'hooks/ directory — lifecycle hook scripts (PreToolUse, PostToolUse, etc.) are NOT portable; must be rewritten per tool event model',
];

// Rule category → Copilot applyTo globs (best-effort mapping)
const CATEGORY_GLOBS = {
  core:     '**/*',
  agent:    '**/*.{ts,tsx,js,jsx,cjs,mjs,py,go,rb,java,kt,swift}',
  workflow: '**/*',
};

// ---------------------------------------------------------------------------
// Helpers — pure (no I/O side-effects, safe to test)
// ---------------------------------------------------------------------------

/**
 * Safely read a file; return '' on any error (best-effort).
 */
function safeRead(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch (_) { return ''; }
}

/**
 * List files in a directory matching an extension. Returns [] if dir missing.
 */
function listFiles(dir, ext) {
  try {
    return fs.readdirSync(dir)
      .filter((f) => !ext || f.endsWith(ext))
      .map((f) => path.join(dir, f));
  } catch (_) { return []; }
}

/**
 * List markdown files in subdirectories (skills/<name>/SKILL.md pattern).
 */
function listSubdirFiles(parentDir, filename) {
  try {
    return fs.readdirSync(parentDir)
      .map((name) => path.join(parentDir, name, filename))
      .filter((p) => fs.existsSync(p));
  } catch (_) { return []; }
}

/**
 * Strip YAML frontmatter block from markdown text. Returns body only.
 */
function stripFrontmatter(text) {
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return text;
  return text.slice(end + 4).trimStart();
}

/**
 * Extract a single frontmatter field value from text.
 */
function extractFrontmatterField(text, field) {
  const m = text.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

/**
 * Read plugin.json from the plugin root. Returns { name, version } or defaults.
 */
function readPluginMeta(pluginRoot) {
  const p = path.join(pluginRoot, PLUGIN_JSON_REL);
  try {
    const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { name: obj.name || 'archon-os', version: obj.version || 'unknown' };
  } catch (_) {
    return { name: 'archon-os', version: 'unknown' };
  }
}

/**
 * Read .mcp.json and return a structured summary.
 * Returns { servers: [{ name, command, args, env, disabled }] }
 */
function readMcpConfig(pluginRoot) {
  const p = path.join(pluginRoot, MCP_JSON_REL);
  try {
    const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
    const servers = Object.entries(obj.mcpServers || {}).map(([name, cfg]) => ({
      name,
      command: [cfg.command, ...(cfg.args || [])].join(' '),
      env: cfg.env ? Object.keys(cfg.env) : [],
      disabled: cfg.disabled === true,
    }));
    return { servers };
  } catch (_) {
    return { servers: [] };
  }
}

/**
 * collectUniversalLayer — scans the plugin root and returns:
 * {
 *   pluginRoot, meta, mcpConfig, claudeMd,
 *   rules: { core, agent, workflow },       // { category: [{ path, name, body }] }
 *   skills: [{ path, name, body }],
 *   agents: [{ path, name, body }],
 *   commands: [{ path, name, body }],
 *   counts: { rules, skills, agents, commands }
 * }
 */
function collectUniversalLayer(pluginRoot) {
  const meta      = readPluginMeta(pluginRoot);
  const mcpConfig = readMcpConfig(pluginRoot);
  const claudeMd  = safeRead(path.join(pluginRoot, CLAUDE_MD_REL));

  // Rules — 3 categories
  const ruleCategories = ['core', 'agent', 'workflow'];
  const rules = {};
  let ruleTotal = 0;
  for (const cat of ruleCategories) {
    const dir   = path.join(pluginRoot, RULES_DIR_REL, cat);
    const files = listFiles(dir, '.md').filter((f) => path.basename(f) !== 'README.md');
    rules[cat]  = files.map((f) => {
      const body = safeRead(f);
      const name = path.basename(f, '.md');
      return { path: f, name, body };
    });
    ruleTotal += rules[cat].length;
  }

  // Skills — skills/<name>/SKILL.md
  const skillDir  = path.join(pluginRoot, SKILLS_DIR_REL);
  const skillFiles = listSubdirFiles(skillDir, 'SKILL.md');
  const skills = skillFiles.map((f) => {
    const body = safeRead(f);
    const name = path.basename(path.dirname(f));
    return { path: f, name, body };
  });

  // Agents — agents/*.md (skip README and subdirs)
  const agentDir = path.join(pluginRoot, AGENTS_DIR_REL);
  const agentFiles = listFiles(agentDir, '.md').filter(
    (f) => path.basename(f) !== 'README.md' && !f.includes('/reference/')
  );
  const agents = agentFiles.map((f) => {
    const body = safeRead(f);
    const name = path.basename(f, '.md');
    return { path: f, name, body };
  });

  // Commands — commands/*.md (skip README)
  const cmdDir   = path.join(pluginRoot, COMMANDS_DIR_REL);
  const cmdFiles = listFiles(cmdDir, '.md').filter((f) => path.basename(f) !== 'README.md');
  const commands = cmdFiles.map((f) => {
    const body = safeRead(f);
    const name = path.basename(f, '.md');
    return { path: f, name, body };
  });

  return {
    pluginRoot,
    meta,
    mcpConfig,
    claudeMd,
    rules,
    skills,
    agents,
    commands,
    counts: {
      rules:    ruleTotal,
      skills:   skills.length,
      agents:   agents.length,
      commands: commands.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Builder — Copilot
// ---------------------------------------------------------------------------

/**
 * buildCopilotInstructions — produce the main copilot-instructions.md content.
 * @param {object} sources  return value of collectUniversalLayer()
 * @returns {string}
 */
function buildCopilotInstructions(sources) {
  const { meta, claudeMd, mcpConfig, counts } = sources;
  const header = [
    `# ${meta.name} — GitHub Copilot Instructions`,
    '',
    `> Auto-generated from ${meta.name} v${meta.version} universal layer.`,
    `> Source: archon-os/CLAUDE.md + rules/ (${counts.rules} rules) + skills/ (${counts.skills} skills) + agents/ (${counts.agents} agents).`,
    `> Do not edit directly — re-run \`node archon-os/scripts/port-plugin.cjs copilot\` to regenerate.`,
    '',
    '---',
    '',
  ].join('\n');

  // Include the stripped CLAUDE.md body as the main instruction surface
  const claudeBody = stripFrontmatter(claudeMd) || '(CLAUDE.md not found)';

  // MCP servers section
  const mcpLines = mcpConfig.servers.length > 0
    ? [
        '',
        '## MCP Servers (translated from .mcp.json)',
        '',
        '| Server | Command | Env Required | Enabled |',
        '|--------|---------|--------------|---------|',
        ...mcpConfig.servers.map((s) =>
          `| ${s.name} | \`${s.command}\` | ${s.env.length ? s.env.join(', ') : '—'} | ${s.disabled ? 'opt-in' : 'yes'} |`
        ),
        '',
        '> MCP is an open cross-tool standard — these servers work with any MCP-compatible host.',
        '',
      ].join('\n')
    : '';

  // Non-portable notice
  const nonPortableSection = [
    '',
    '## Non-Portable Items',
    '',
    'The following Claude Code–specific features have no direct Copilot equivalent:',
    '',
    ...NON_PORTABLE.map((item) => `- ${item}`),
    '',
    '> See docs/PORTABILITY.md for the full portability reference.',
    '',
  ].join('\n');

  return header + claudeBody + mcpLines + nonPortableSection;
}

/**
 * buildCopilotAreaInstructions — produce path-scoped .instructions.md files.
 * Returns an array of { filename, content } objects (one per rule category).
 * @param {object} sources
 * @returns {Array<{filename: string, content: string}>}
 */
function buildCopilotAreaInstructions(sources) {
  const { meta, rules } = sources;
  const files = [];

  for (const [cat, ruleList] of Object.entries(rules)) {
    if (!ruleList.length) continue;
    const applyTo = CATEGORY_GLOBS[cat] || '**/*';
    const header = [
      '---',
      `applyTo: "${applyTo}"`,
      '---',
      '',
      `# Archon OS ${cat.charAt(0).toUpperCase() + cat.slice(1)} Rules`,
      '',
      `> Auto-generated from ${meta.name} v${meta.version}. Category: ${cat} (${ruleList.length} rules).`,
      '',
    ].join('\n');

    const bodies = ruleList.map((r) => {
      const body = stripFrontmatter(r.body).trim();
      return `## Rule: ${r.name}\n\n${body || '(empty)'}`;
    }).join('\n\n---\n\n');

    files.push({
      filename: `${cat}.instructions.md`,
      content: header + bodies + '\n',
    });
  }

  return files;
}

// ---------------------------------------------------------------------------
// Builder — Codex / AGENTS.md
// ---------------------------------------------------------------------------

/**
 * buildAgentsMd — produce AGENTS.md for Codex/OpenAI AGENTS.md convention.
 * @param {object} sources  return value of collectUniversalLayer()
 * @returns {string}
 */
function buildAgentsMd(sources) {
  const { meta, claudeMd, rules, skills, agents, commands, counts, mcpConfig } = sources;

  const header = [
    `# AGENTS.md — ${meta.name} v${meta.version}`,
    '',
    '> Auto-generated from the Archon OS universal layer for Codex/OpenAI.',
    `> Source: CLAUDE.md + ${counts.rules} rules + ${counts.skills} skills + ${counts.agents} agents + ${counts.commands} commands.`,
    '> Re-generate: `node archon-os/scripts/port-plugin.cjs codex`',
    '',
    '> **Note:** Lifecycle hooks (PreToolUse, PostToolUse, SessionStart, etc.) are NOT included.',
    '> Codex has no lifecycle event system. See docs/PORTABILITY.md for the event mapping table.',
    '',
    '---',
    '',
  ].join('\n');

  // Core instructions from CLAUDE.md
  const claudeBody = stripFrontmatter(claudeMd) || '(CLAUDE.md not found)';
  const coreSection = [
    '## Core Instructions',
    '',
    claudeBody,
    '',
    '---',
    '',
  ].join('\n');

  // Agent roster
  const agentRows = agents.map((a) => {
    const agentName = extractFrontmatterField(a.body, 'name') || a.name;
    const desc = extractFrontmatterField(a.body, 'description') || '—';
    const model = extractFrontmatterField(a.body, 'model') || 'inherit';
    return `| ${agentName} | ${desc} | ${model} |`;
  });
  const agentRosterSection = [
    '## Agent Roster',
    '',
    `${counts.agents} agents available. Use these to understand domain specialization and delegation.`,
    '',
    '| Agent | Description | Model |',
    '|-------|-------------|-------|',
    ...agentRows,
    '',
    '---',
    '',
  ].join('\n');

  // Rules summary (grouped by category)
  const rulesSection = [
    '## Rules',
    '',
    `${counts.rules} rules across 3 tiers: core (every session), agent (per-domain), workflow (per-phase).`,
    '',
    ...Object.entries(rules).flatMap(([cat, ruleList]) => {
      if (!ruleList.length) return [];
      return [
        `### ${cat.charAt(0).toUpperCase() + cat.slice(1)} Rules (${ruleList.length})`,
        '',
        ...ruleList.map((r) => {
          const body = stripFrontmatter(r.body).trim();
          const firstLine = body.split('\n').find((l) => l.trim()) || '(no description)';
          // Trim long first lines
          const summary = firstLine.replace(/^#+\s*/, '').substring(0, 120);
          return `- **${r.name}**: ${summary}`;
        }),
        '',
      ];
    }),
    '---',
    '',
  ].join('\n');

  // Skills summary
  const skillsSection = [
    '## Skills',
    '',
    `${counts.skills} skills available. Skills are AI-discoverable knowledge modules.`,
    '',
    ...skills.map((s) => {
      const desc = extractFrontmatterField(s.body, 'description') || '—';
      return `- **${s.name}**: ${desc}`;
    }),
    '',
    '---',
    '',
  ].join('\n');

  // Command playbooks
  const commandSection = [
    '## Command Playbooks',
    '',
    `${counts.commands} commands available via slash syntax.`,
    '',
    ...commands.map((c) => {
      const body = stripFrontmatter(c.body).trim();
      const firstHeading = body.match(/^##?\s+(.+)$/m);
      const summary = firstHeading ? firstHeading[1].substring(0, 100) : c.name;
      return `- **/${c.name}**: ${summary}`;
    }),
    '',
    '---',
    '',
  ].join('\n');

  // MCP
  const mcpSection = mcpConfig.servers.length > 0
    ? [
        '## MCP Servers',
        '',
        'MCP is an open cross-tool standard. These servers are available:',
        '',
        '| Server | Command | Env Required | Default |',
        '|--------|---------|--------------|---------|',
        ...mcpConfig.servers.map((s) =>
          `| ${s.name} | \`${s.command}\` | ${s.env.length ? s.env.join(', ') : '—'} | ${s.disabled ? 'opt-in' : 'enabled'} |`
        ),
        '',
        '---',
        '',
      ].join('\n')
    : '';

  // Non-portable notice
  const nonPortableSection = [
    '## Non-Portable Items',
    '',
    'These Claude Code–specific features are not included in this AGENTS.md:',
    '',
    ...NON_PORTABLE.map((item) => `- ${item}`),
    '',
    '> See docs/PORTABILITY.md for the full portability reference.',
    '',
  ].join('\n');

  return header + coreSection + agentRosterSection + rulesSection + skillsSection + commandSection + mcpSection + nonPortableSection;
}

// ---------------------------------------------------------------------------
// Builder — Cursor MDC rules
// ---------------------------------------------------------------------------

/**
 * buildCursorRules — produce .cursor/rules/*.mdc content.
 * Returns an array of { filename, content } objects (one per rule category
 * plus a combined agents+skills+commands overview file).
 * @param {object} sources  return value of collectUniversalLayer()
 * @returns {Array<{filename: string, content: string}>}
 */
function buildCursorRules(sources) {
  const { meta, rules, skills, agents, commands, counts, mcpConfig } = sources;
  const files = [];

  // One MDC file per rule category
  for (const [cat, ruleList] of Object.entries(rules)) {
    if (!ruleList.length) continue;
    const globs = CATEGORY_GLOBS[cat] || '**/*';
    const alwaysApply = cat === 'core';

    const frontmatter = [
      '---',
      `description: "Archon OS ${cat} rules — auto-generated from ${meta.name} v${meta.version}"`,
      `globs: "${globs}"`,
      `alwaysApply: ${alwaysApply}`,
      '---',
      '',
    ].join('\n');

    const bodies = ruleList.map((r) => {
      const body = stripFrontmatter(r.body).trim();
      return `## ${r.name}\n\n${body || '(empty)'}`;
    }).join('\n\n---\n\n');

    files.push({
      filename: `archon-os-${cat}-rules.mdc`,
      content: frontmatter + bodies + '\n',
    });
  }

  // Agent + skills overview MDC
  const agentRows = agents.map((a) => {
    const agentName = extractFrontmatterField(a.body, 'name') || a.name;
    const desc = extractFrontmatterField(a.body, 'description') || '—';
    return `| ${agentName} | ${desc} |`;
  });

  const skillRows = skills.map((s) => {
    const desc = extractFrontmatterField(s.body, 'description') || '—';
    return `| ${s.name} | ${desc} |`;
  });

  const commandRows = commands.map((c) => {
    const body = stripFrontmatter(c.body).trim();
    const firstLine = body.split('\n').find((l) => l.trim()) || c.name;
    const summary = firstLine.replace(/^#+\s*/, '').substring(0, 100);
    return `| /${c.name} | ${summary} |`;
  });

  const mcpRows = mcpConfig.servers.map((s) =>
    `| ${s.name} | \`${s.command}\` | ${s.disabled ? 'opt-in' : 'enabled'} |`
  );

  const overviewMdc = [
    '---',
    `description: "Archon OS agents, skills, and commands overview — ${meta.name} v${meta.version}"`,
    'globs: "**/*"',
    'alwaysApply: true',
    '---',
    '',
    `# Archon OS — Agents, Skills & Commands`,
    '',
    `> Auto-generated from ${meta.name} v${meta.version}.`,
    `> ${counts.agents} agents · ${counts.skills} skills · ${counts.commands} commands · ${counts.rules} rules.`,
    '',
    '## Agent Roster',
    '',
    '| Agent | Description |',
    '|-------|-------------|',
    ...agentRows,
    '',
    '## Skills',
    '',
    '| Skill | Description |',
    '|-------|-------------|',
    ...skillRows,
    '',
    '## Commands',
    '',
    '| Command | Summary |',
    '|---------|---------|',
    ...commandRows,
    '',
    ...(mcpConfig.servers.length > 0 ? [
      '## MCP Servers',
      '',
      '| Server | Command | Default |',
      '|--------|---------|---------|',
      ...mcpRows,
      '',
    ] : []),
    '## Non-Portable Items',
    '',
    ...NON_PORTABLE.map((item) => `- ${item}`),
    '',
    '> See docs/PORTABILITY.md for the full portability reference.',
    '',
  ].join('\n');

  files.push({ filename: 'archon-os-overview.mdc', content: overviewMdc });

  return files;
}

// ---------------------------------------------------------------------------
// Manifest builder
// ---------------------------------------------------------------------------

/**
 * buildManifest — construct the PORT_MANIFEST.json object.
 * @param {string}   target
 * @param {object}   sources        return of collectUniversalLayer()
 * @param {string[]} writtenPaths   file paths actually written
 * @param {string|null} generatedAt ISO timestamp or null
 * @returns {object}
 */
function buildManifest(target, sources, writtenPaths, generatedAt) {
  return {
    target,
    sourcePluginName: sources.meta.name,
    sourceVersion:    sources.meta.version,
    generatedAt:      generatedAt || null,
    counts:           sources.counts,
    files:            writtenPaths,
    nonPortable:      NON_PORTABLE,
  };
}

// ---------------------------------------------------------------------------
// Writer — orchestrates building + writing for a single target
// ---------------------------------------------------------------------------

/**
 * writePortBundle — build and write port output for one target.
 *
 * @param {'copilot'|'codex'|'cursor'} target
 * @param {string}  outDir          absolute path to output directory
 * @param {object}  [opts]
 * @param {string}  [opts.pluginRoot]   default: detect from __dirname
 * @param {boolean} [opts.dryRun]       if true, skip all writes (manifest is returned but not written)
 * @param {string|null} [opts.generatedAt] ISO timestamp override; null in tests
 * @returns {{ manifest: object, sources: object }}
 */
function writePortBundle(target, outDir, opts = {}) {
  const pluginRoot = opts.pluginRoot || path.resolve(__dirname, '..');
  const dryRun     = opts.dryRun === true;
  const generatedAt = opts.generatedAt !== undefined ? opts.generatedAt : null;

  const sources = collectUniversalLayer(pluginRoot);
  const writtenPaths = [];

  function writeFile(relPath, content) {
    const fullPath = path.join(outDir, relPath);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf8');
    }
    writtenPaths.push(fullPath);
  }

  if (target === 'copilot') {
    const mainContent   = buildCopilotInstructions(sources);
    const areaFiles     = buildCopilotAreaInstructions(sources);
    writeFile('.github/copilot-instructions.md', mainContent);
    for (const { filename, content } of areaFiles) {
      writeFile(`.github/instructions/${filename}`, content);
    }
  } else if (target === 'codex') {
    const agentsMd = buildAgentsMd(sources);
    writeFile('AGENTS.md', agentsMd);
  } else if (target === 'cursor') {
    const mdcFiles = buildCursorRules(sources);
    for (const { filename, content } of mdcFiles) {
      writeFile(`.cursor/rules/${filename}`, content);
    }
  } else {
    throw new Error(`Unknown target: ${target}. Must be one of: copilot, codex, cursor, all`);
  }

  const manifest = buildManifest(target, sources, writtenPaths, generatedAt);

  if (!dryRun) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'PORT_MANIFEST.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      'utf8'
    );
  }

  return { manifest, sources };
}

// ---------------------------------------------------------------------------
// Exports — pure helpers + writePortBundle are all testable
// ---------------------------------------------------------------------------

module.exports = {
  // collection
  collectUniversalLayer,
  readPluginMeta,
  readMcpConfig,
  // builders
  buildCopilotInstructions,
  buildCopilotAreaInstructions,
  buildAgentsMd,
  buildCursorRules,
  buildManifest,
  // writer
  writePortBundle,
  // helpers exposed for tests
  safeRead,
  stripFrontmatter,
  extractFrontmatterField,
  // constants
  NON_PORTABLE,
};

// ---------------------------------------------------------------------------
// CLI entry — guarded behind require.main
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write([
      'Usage: node archon-os/scripts/port-plugin.cjs <target> [--out <dir>] [--dry-run]',
      '',
      'Targets: copilot, codex, cursor, all',
      '',
      'Options:',
      '  --out <dir>   Output directory (default: ./dist/port/<target>/)',
      '  --dry-run     Plan + show what would be written, do nothing',
      '',
      'Examples:',
      '  node archon-os/scripts/port-plugin.cjs codex',
      '  node archon-os/scripts/port-plugin.cjs all --out /tmp/port',
      '  node archon-os/scripts/port-plugin.cjs copilot --dry-run',
      '',
    ].join('\n'));
    process.exit(0);
  }

  const target  = args[0];
  const outIdx  = args.indexOf('--out');
  const dryRun  = args.includes('--dry-run');
  const targets = target === 'all' ? ['copilot', 'codex', 'cursor'] : [target];

  // Validate target
  const valid = ['copilot', 'codex', 'cursor', 'all'];
  if (!valid.includes(target)) {
    process.stderr.write(`Error: unknown target "${target}". Must be one of: ${valid.join(', ')}\n`);
    process.exit(1);
  }

  const baseOut = outIdx !== -1 && args[outIdx + 1]
    ? path.resolve(args[outIdx + 1])
    : path.resolve('dist', 'port');

  const generatedAt = new Date().toISOString();

  for (const t of targets) {
    const outDir = target === 'all' ? path.join(baseOut, t) : baseOut;
    try {
      const { manifest } = writePortBundle(t, outDir, {
        pluginRoot: path.resolve(__dirname, '..'),
        dryRun,
        generatedAt,
      });
      const verb = dryRun ? '[dry-run] would write' : 'wrote';
      process.stdout.write(
        `${dryRun ? '[DRY-RUN] ' : ''}Port: ${t} — ${verb} ${manifest.files.length} file(s) to ${outDir}\n` +
        `  counts: rules=${manifest.counts.rules} skills=${manifest.counts.skills} agents=${manifest.counts.agents} commands=${manifest.counts.commands}\n` +
        `  files:\n${manifest.files.map((f) => `    ${f}`).join('\n')}\n`
      );
    } catch (err) {
      process.stderr.write(`Error porting target "${t}": ${err.message}\n`);
      process.exit(1);
    }
  }
}
