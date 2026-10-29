'use strict';
/*
 * The plugin's name is read from plugin.json, never spelled out here. It was
 * hardcoded as 'aura-frog' and went red the moment the v4 rebrand landed —
 * a test asserting a literal the product no longer uses tells you nothing
 * about the porter, which is what this file is for.
 */
/**
 * port-plugin.test.cjs — Tests for the cross-tool porter script (FEAT-009).
 *
 * Covers:
 *   - collectUniversalLayer returns non-zero counts for this live repo
 *   - buildCopilotInstructions returns non-empty string with applyTo marker
 *   - buildCopilotAreaInstructions returns files with applyTo frontmatter
 *   - buildAgentsMd returns non-empty string with agent roster heading
 *   - buildCursorRules returns files with MDC frontmatter keys
 *   - writePortBundle('codex', tmpdir) creates AGENTS.md + PORT_MANIFEST.json
 *   - manifest has correct target + counts
 *   - dryRun option writes nothing to disk
 *   - buildManifest shape is correct
 */

const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

const porter = require('../port-plugin.cjs');

/** Single source of truth for the plugin's own name. */
const PLUGIN_NAME = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '.claude-plugin', 'plugin.json'), 'utf8',
)).name;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
}

function rmTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// The real plugin root (repo checked out on disk)
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// collectUniversalLayer
// ---------------------------------------------------------------------------

describe('collectUniversalLayer', () => {
  let sources;

  beforeAll(() => {
    sources = porter.collectUniversalLayer(PLUGIN_ROOT);
  });

  test('returns an object with expected keys', () => {
    expect(sources).toHaveProperty('meta');
    expect(sources).toHaveProperty('counts');
    expect(sources).toHaveProperty('rules');
    expect(sources).toHaveProperty('skills');
    expect(sources).toHaveProperty('agents');
    expect(sources).toHaveProperty('commands');
    expect(sources).toHaveProperty('claudeMd');
    expect(sources).toHaveProperty('mcpConfig');
  });

  test('counts.rules is non-zero for this repo', () => {
    expect(sources.counts.rules).toBeGreaterThan(0);
  });

  test('counts.skills is non-zero for this repo', () => {
    expect(sources.counts.skills).toBeGreaterThan(0);
  });

  test('counts.agents is non-zero for this repo', () => {
    expect(sources.counts.agents).toBeGreaterThan(0);
  });

  test('counts.commands is non-zero for this repo', () => {
    expect(sources.counts.commands).toBeGreaterThan(0);
  });

  test('meta.name and meta.version are non-empty strings', () => {
    expect(typeof sources.meta.name).toBe('string');
    expect(sources.meta.name.length).toBeGreaterThan(0);
    expect(typeof sources.meta.version).toBe('string');
    expect(sources.meta.version.length).toBeGreaterThan(0);
  });

  test('meta.name equals the name in plugin.json', () => {
    expect(sources.meta.name).toBe(PLUGIN_NAME);
  });

  test('rules object has core, agent, workflow keys', () => {
    expect(sources.rules).toHaveProperty('core');
    expect(sources.rules).toHaveProperty('agent');
    expect(sources.rules).toHaveProperty('workflow');
  });

  test('each rule category has at least one entry', () => {
    expect(sources.rules.core.length).toBeGreaterThan(0);
    expect(sources.rules.agent.length).toBeGreaterThan(0);
    expect(sources.rules.workflow.length).toBeGreaterThan(0);
  });

  test('skills entries have name and body', () => {
    const first = sources.skills[0];
    expect(typeof first.name).toBe('string');
    expect(typeof first.body).toBe('string');
  });

  test('agents entries have name and body', () => {
    const first = sources.agents[0];
    expect(typeof first.name).toBe('string');
    expect(typeof first.body).toBe('string');
  });

  test('mcpConfig.servers is an array (may be empty if .mcp.json absent)', () => {
    expect(Array.isArray(sources.mcpConfig.servers)).toBe(true);
  });

  test('claudeMd is a string (may be empty if CLAUDE.md absent)', () => {
    expect(typeof sources.claudeMd).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// buildCopilotInstructions
// ---------------------------------------------------------------------------

describe('buildCopilotInstructions', () => {
  let sources;
  let output;

  beforeAll(() => {
    sources = porter.collectUniversalLayer(PLUGIN_ROOT);
    output  = porter.buildCopilotInstructions(sources);
  });

  test('returns a non-empty string', () => {
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(100);
  });

  test('contains plugin name in the header', () => {
    expect(output).toContain(sources.meta.name);
  });

  test('contains plugin version', () => {
    expect(output).toContain(sources.meta.version);
  });

  test('contains Non-Portable Items section', () => {
    expect(output).toContain('Non-Portable');
  });

  test('contains MCP Servers section when mcp.json has servers', () => {
    if (sources.mcpConfig.servers.length > 0) {
      expect(output).toContain('MCP Servers');
    }
  });
});

// ---------------------------------------------------------------------------
// buildCopilotAreaInstructions
// ---------------------------------------------------------------------------

describe('buildCopilotAreaInstructions', () => {
  let sources;
  let files;

  beforeAll(() => {
    sources = porter.collectUniversalLayer(PLUGIN_ROOT);
    files   = porter.buildCopilotAreaInstructions(sources);
  });

  test('returns an array of file objects', () => {
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });

  test('every file has filename and content fields', () => {
    for (const f of files) {
      expect(typeof f.filename).toBe('string');
      expect(typeof f.content).toBe('string');
    }
  });

  test('every file content contains applyTo frontmatter key', () => {
    for (const f of files) {
      expect(f.content).toContain('applyTo');
    }
  });

  test('filenames end with .instructions.md', () => {
    for (const f of files) {
      expect(f.filename).toMatch(/\.instructions\.md$/);
    }
  });

  test('content starts with YAML frontmatter block (---)', () => {
    for (const f of files) {
      expect(f.content.startsWith('---')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// buildAgentsMd
// ---------------------------------------------------------------------------

describe('buildAgentsMd', () => {
  let sources;
  let output;

  beforeAll(() => {
    sources = porter.collectUniversalLayer(PLUGIN_ROOT);
    output  = porter.buildAgentsMd(sources);
  });

  test('returns a non-empty string', () => {
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(200);
  });

  test('starts with # AGENTS.md heading', () => {
    expect(output).toMatch(/^# AGENTS\.md/);
  });

  test('contains ## Agent Roster heading', () => {
    expect(output).toContain('## Agent Roster');
  });

  test('contains ## Rules heading', () => {
    expect(output).toContain('## Rules');
  });

  test('contains ## Skills heading', () => {
    expect(output).toContain('## Skills');
  });

  test('contains ## Command Playbooks heading', () => {
    expect(output).toContain('## Command Playbooks');
  });

  test('contains hooks unsupported note', () => {
    // Per PORTABILITY.md: Codex has no lifecycle events
    expect(output).toContain('hooks');
  });

  test('contains plugin version', () => {
    expect(output).toContain(sources.meta.version);
  });

  test('contains Non-Portable Items section', () => {
    expect(output).toContain('Non-Portable');
  });

  test('contains at least one known agent name', () => {
    // lead, architect, devops, etc. are in the agents dir
    const hasKnownAgent =
      output.includes('lead') ||
      output.includes('architect') ||
      output.includes('devops') ||
      output.includes('tester');
    expect(hasKnownAgent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildCursorRules
// ---------------------------------------------------------------------------

describe('buildCursorRules', () => {
  let sources;
  let files;

  beforeAll(() => {
    sources = porter.collectUniversalLayer(PLUGIN_ROOT);
    files   = porter.buildCursorRules(sources);
  });

  test('returns an array of file objects', () => {
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });

  test('every file has filename and content fields', () => {
    for (const f of files) {
      expect(typeof f.filename).toBe('string');
      expect(typeof f.content).toBe('string');
    }
  });

  test('every file content starts with MDC frontmatter (---)', () => {
    for (const f of files) {
      expect(f.content.startsWith('---')).toBe(true);
    }
  });

  test('MDC frontmatter contains description key', () => {
    for (const f of files) {
      expect(f.content).toContain('description:');
    }
  });

  test('MDC frontmatter contains globs key', () => {
    for (const f of files) {
      expect(f.content).toContain('globs:');
    }
  });

  test('MDC frontmatter contains alwaysApply key', () => {
    for (const f of files) {
      expect(f.content).toContain('alwaysApply:');
    }
  });

  test('filenames end with .mdc', () => {
    for (const f of files) {
      expect(f.filename).toMatch(/\.mdc$/);
    }
  });

  test('includes an overview file', () => {
    const overview = files.find((f) => f.filename.includes('overview'));
    expect(overview).toBeDefined();
  });

  test('overview file contains Agent Roster heading', () => {
    const overview = files.find((f) => f.filename.includes('overview'));
    expect(overview).toBeDefined();
    expect(overview.content).toContain('Agent Roster');
  });
});

// ---------------------------------------------------------------------------
// buildManifest
// ---------------------------------------------------------------------------

describe('buildManifest', () => {
  let sources;
  let manifest;

  beforeAll(() => {
    sources  = porter.collectUniversalLayer(PLUGIN_ROOT);
    manifest = porter.buildManifest('codex', sources, ['/tmp/AGENTS.md'], null);
  });

  test('manifest.target equals the supplied target', () => {
    expect(manifest.target).toBe('codex');
  });

  test('manifest.sourcePluginName matches meta.name', () => {
    expect(manifest.sourcePluginName).toBe(sources.meta.name);
  });

  test('manifest.sourceVersion matches meta.version', () => {
    expect(manifest.sourceVersion).toBe(sources.meta.version);
  });

  test('manifest.generatedAt is null when not supplied', () => {
    expect(manifest.generatedAt).toBeNull();
  });

  test('manifest.counts matches sources.counts', () => {
    expect(manifest.counts.rules).toBe(sources.counts.rules);
    expect(manifest.counts.skills).toBe(sources.counts.skills);
    expect(manifest.counts.agents).toBe(sources.counts.agents);
    expect(manifest.counts.commands).toBe(sources.counts.commands);
  });

  test('manifest.files is the supplied writtenPaths array', () => {
    expect(manifest.files).toEqual(['/tmp/AGENTS.md']);
  });

  test('manifest.nonPortable is a non-empty array', () => {
    expect(Array.isArray(manifest.nonPortable)).toBe(true);
    expect(manifest.nonPortable.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// writePortBundle — codex target writes AGENTS.md + PORT_MANIFEST.json
// ---------------------------------------------------------------------------

describe('writePortBundle: codex', () => {
  let tmpDir;
  let result;

  beforeAll(() => {
    tmpDir = mkTmp('port-codex-');
    result = porter.writePortBundle('codex', tmpDir, {
      pluginRoot: PLUGIN_ROOT,
      generatedAt: null,
    });
  });

  afterAll(() => { rmTmp(tmpDir); });

  test('returns an object with manifest and sources', () => {
    expect(result).toHaveProperty('manifest');
    expect(result).toHaveProperty('sources');
  });

  test('writes AGENTS.md to outDir', () => {
    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    expect(fs.existsSync(agentsPath)).toBe(true);
  });

  test('AGENTS.md has non-trivial content', () => {
    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    expect(content.length).toBeGreaterThan(500);
    expect(content).toContain('## Agent Roster');
  });

  test('writes PORT_MANIFEST.json to outDir', () => {
    const manifestPath = path.join(tmpDir, 'PORT_MANIFEST.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  test('PORT_MANIFEST.json is valid JSON with correct target', () => {
    const raw  = fs.readFileSync(path.join(tmpDir, 'PORT_MANIFEST.json'), 'utf8');
    const obj  = JSON.parse(raw);
    expect(obj.target).toBe('codex');
  });

  test('manifest counts are non-zero', () => {
    const { manifest } = result;
    expect(manifest.counts.rules).toBeGreaterThan(0);
    expect(manifest.counts.skills).toBeGreaterThan(0);
    expect(manifest.counts.agents).toBeGreaterThan(0);
    expect(manifest.counts.commands).toBeGreaterThan(0);
  });

  test('manifest.generatedAt is null (not supplied)', () => {
    expect(result.manifest.generatedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// writePortBundle — copilot target
// ---------------------------------------------------------------------------

describe('writePortBundle: copilot', () => {
  let tmpDir;
  let result;

  beforeAll(() => {
    tmpDir = mkTmp('port-copilot-');
    result = porter.writePortBundle('copilot', tmpDir, {
      pluginRoot: PLUGIN_ROOT,
      generatedAt: null,
    });
  });

  afterAll(() => { rmTmp(tmpDir); });

  test('writes .github/copilot-instructions.md', () => {
    const p = path.join(tmpDir, '.github', 'copilot-instructions.md');
    expect(fs.existsSync(p)).toBe(true);
  });

  test('copilot-instructions.md contains plugin name', () => {
    const content = fs.readFileSync(path.join(tmpDir, '.github', 'copilot-instructions.md'), 'utf8');
    expect(content).toContain(PLUGIN_NAME);
  });

  test('writes at least one .github/instructions/*.instructions.md file', () => {
    const instrDir = path.join(tmpDir, '.github', 'instructions');
    const files = fs.readdirSync(instrDir).filter((f) => f.endsWith('.instructions.md'));
    expect(files.length).toBeGreaterThan(0);
  });

  test('instruction files contain applyTo frontmatter', () => {
    const instrDir = path.join(tmpDir, '.github', 'instructions');
    const files = fs.readdirSync(instrDir).filter((f) => f.endsWith('.instructions.md'));
    for (const f of files) {
      const content = fs.readFileSync(path.join(instrDir, f), 'utf8');
      expect(content).toContain('applyTo');
    }
  });

  test('writes PORT_MANIFEST.json', () => {
    expect(fs.existsSync(path.join(tmpDir, 'PORT_MANIFEST.json'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// writePortBundle — cursor target
// ---------------------------------------------------------------------------

describe('writePortBundle: cursor', () => {
  let tmpDir;
  let result;

  beforeAll(() => {
    tmpDir = mkTmp('port-cursor-');
    result = porter.writePortBundle('cursor', tmpDir, {
      pluginRoot: PLUGIN_ROOT,
      generatedAt: null,
    });
  });

  afterAll(() => { rmTmp(tmpDir); });

  test('writes files under .cursor/rules/', () => {
    const rulesDir = path.join(tmpDir, '.cursor', 'rules');
    expect(fs.existsSync(rulesDir)).toBe(true);
    const files = fs.readdirSync(rulesDir);
    expect(files.length).toBeGreaterThan(0);
  });

  test('all cursor files are .mdc', () => {
    const rulesDir = path.join(tmpDir, '.cursor', 'rules');
    const files = fs.readdirSync(rulesDir);
    for (const f of files) {
      expect(f).toMatch(/\.mdc$/);
    }
  });

  test('MDC files contain alwaysApply frontmatter', () => {
    const rulesDir = path.join(tmpDir, '.cursor', 'rules');
    const files = fs.readdirSync(rulesDir);
    for (const f of files) {
      const content = fs.readFileSync(path.join(rulesDir, f), 'utf8');
      expect(content).toContain('alwaysApply');
    }
  });

  test('writes PORT_MANIFEST.json', () => {
    expect(fs.existsSync(path.join(tmpDir, 'PORT_MANIFEST.json'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dryRun option — writes nothing to disk
// ---------------------------------------------------------------------------

describe('writePortBundle: dryRun', () => {
  test('dryRun:true writes no files for codex target', () => {
    const tmpDir = mkTmp('port-dry-');
    try {
      porter.writePortBundle('codex', tmpDir, {
        pluginRoot: PLUGIN_ROOT,
        dryRun:     true,
        generatedAt: null,
      });
      // outDir exists but nothing was written
      const files = fs.readdirSync(tmpDir);
      expect(files.length).toBe(0);
    } finally {
      rmTmp(tmpDir);
    }
  });

  test('dryRun:true writes no files for copilot target', () => {
    const tmpDir = mkTmp('port-dry-cop-');
    try {
      porter.writePortBundle('copilot', tmpDir, {
        pluginRoot: PLUGIN_ROOT,
        dryRun:     true,
        generatedAt: null,
      });
      const files = fs.readdirSync(tmpDir);
      expect(files.length).toBe(0);
    } finally {
      rmTmp(tmpDir);
    }
  });

  test('dryRun:true writes no files for cursor target', () => {
    const tmpDir = mkTmp('port-dry-cur-');
    try {
      porter.writePortBundle('cursor', tmpDir, {
        pluginRoot: PLUGIN_ROOT,
        dryRun:     true,
        generatedAt: null,
      });
      const files = fs.readdirSync(tmpDir);
      expect(files.length).toBe(0);
    } finally {
      rmTmp(tmpDir);
    }
  });

  test('dryRun still returns a manifest with correct target', () => {
    const tmpDir = mkTmp('port-dry-man-');
    try {
      const { manifest } = porter.writePortBundle('codex', tmpDir, {
        pluginRoot:  PLUGIN_ROOT,
        dryRun:      true,
        generatedAt: null,
      });
      expect(manifest.target).toBe('codex');
      expect(manifest.counts.rules).toBeGreaterThan(0);
    } finally {
      rmTmp(tmpDir);
    }
  });
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('stripFrontmatter', () => {
  test('removes YAML frontmatter block', () => {
    const input  = '---\nname: foo\n---\n\n# Body\n\nHello';
    const result = porter.stripFrontmatter(input);
    expect(result).toBe('# Body\n\nHello');
    expect(result).not.toContain('name: foo');
  });

  test('returns text unchanged when no frontmatter', () => {
    const input = '# Just a heading\n\nBody text.';
    expect(porter.stripFrontmatter(input)).toBe(input);
  });
});

describe('extractFrontmatterField', () => {
  const sample = '---\nname: agent-detector\ndescription: "Runs for every message."\nmodel: haiku\n---\n';

  test('extracts name field', () => {
    expect(porter.extractFrontmatterField(sample, 'name')).toBe('agent-detector');
  });

  test('strips surrounding quotes from description', () => {
    expect(porter.extractFrontmatterField(sample, 'description')).toBe('Runs for every message.');
  });

  test('returns null for missing field', () => {
    expect(porter.extractFrontmatterField(sample, 'nonexistent')).toBeNull();
  });
});
