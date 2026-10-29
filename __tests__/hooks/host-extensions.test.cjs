/**
 * host-extensions — discovery of the host's own rules/skills/agents (user + project scope)
 * and the migration of skill files Claude Code never registers.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const host = require('../../archon-os/hooks/lib/host-extensions.cjs');
const { migrate, describe: describeSkill } = require('../../archon-os/scripts/migrate-host-skills.cjs');

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

describe('host-extensions', () => {
  let tmp, home, proj;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-host-ext-'));
    home = path.join(tmp, 'home');
    proj = path.join(tmp, 'proj');
    write(path.join(home, '.claude/rules/security.md'), '# Security\n');
    write(path.join(home, '.claude/skills/advisory/SKILL.md'), '---\nname: advisory\ndescription: Board review\n---\nbody');
    write(path.join(proj, '.claude/rules/game-dev.md'), '# Game dev\n');
    write(path.join(proj, '.claude/rules/scoped.md'), '---\npaths: src/**\n---\nscoped');
    write(path.join(proj, '.claude/skills/run-pipeline/SKILL.md'), '---\nname: run-pipeline\ndescription: Run it\n---\nbody');
    write(path.join(proj, '.claude/skills/game-router.md'), '# Skill: Game Router\n\n**Trigger:** any task touching apps/<game>/\n');
    write(path.join(proj, '.claude/skills/bare/SKILL.md'), '# Bare skill, no frontmatter\n');
    write(path.join(proj, '.claude/agents/reviewer.md'), '---\nname: reviewer\n---\n');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    delete process.env.AF_HOST_EXTENSIONS_DISABLED;
  });

  test('discovers user and project rules, skills and agents', () => {
    const { user, project } = host.discover(proj, { home });
    expect(user.rules.map((r) => path.basename(r.path))).toEqual(['security.md']);
    expect(user.skills.map((s) => s.name)).toEqual(['advisory']);
    expect(project.rules).toHaveLength(2);
    expect(project.rules.find((r) => r.path.endsWith('scoped.md')).scoped).toBe(true);
    expect(project.skills.map((s) => s.name)).toEqual(['run-pipeline']);
    expect(project.agents).toEqual(['reviewer']);
  });

  test('flags flat .md skills and SKILL.md without description as unregistered', () => {
    const { project } = host.discover(proj, { home });
    const reasons = project.unregistered.map((u) => `${path.relative(proj, u.path)}|${u.reason}`).sort();
    expect(reasons).toEqual([
      '.claude/skills/bare/SKILL.md|SKILL.md has no `description` frontmatter',
      '.claude/skills/game-router.md|flat .md — must be <name>/SKILL.md',
    ]);
  });

  test('project scope is skipped when the project dir is the home dir', () => {
    const { project } = host.discover(home, { home });
    expect(project.rules).toEqual([]);
    expect(project.skills).toEqual([]);
  });

  test('session index names both scopes and warns about unregistered skills', () => {
    const text = host.formatIndex(host.discover(proj, { home }), { projectDir: proj });
    expect(text).toMatch(/OVERRIDE plugin defaults/);
    expect(text).toMatch(/user: rules 1 .*skills: advisory/);
    expect(text).toMatch(/project: rules 2 \(1 path-scoped\).*skills: run-pipeline.*agents: reviewer/);
    expect(text).toMatch(/2 host skill file\(s\) are NOT registered/);
    expect(text).toMatch(/migrate-host-skills\.cjs/);
  });

  test('subagent index lists unscoped rule paths and skill paths, project first', () => {
    const text = host.formatIndex(host.discover(proj, { home }), { projectDir: proj, forSubagent: true });
    expect(text).toMatch(/\.claude\/rules\/game-dev\.md/);
    expect(text).not.toMatch(/scoped\.md/);
    expect(text.indexOf('run-pipeline →')).toBeLessThan(text.indexOf('advisory →'));
    expect(text).not.toMatch(/NOT registered/);
  });

  test('returns null when nothing exists or when disabled', () => {
    const empty = path.join(tmp, 'empty');
    fs.mkdirSync(empty);
    expect(host.formatIndex(host.discover(empty, { home: empty }), { projectDir: empty })).toBeNull();
    process.env.AF_HOST_EXTENSIONS_DISABLED = 'true';
    expect(host.formatIndex(host.discover(proj, { home }), { projectDir: proj })).toBeNull();
  });
});

describe('migrate-host-skills', () => {
  let tmp, skillsDir;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-migrate-'));
    skillsDir = path.join(tmp, '.claude/skills');
    write(path.join(skillsDir, 'game-router.md'), '# Skill: Game Router\n\n**Trigger:** any task touching apps/<game>/\n\nBody.\n');
    write(path.join(skillsDir, 'deploy.md'), '# Deploy Game to itch.io\n\n## Steps\n');
    write(path.join(skillsDir, 'ok/SKILL.md'), '---\nname: ok\ndescription: fine\n---\n');
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test('description prefers the Trigger line, falls back to the heading', () => {
    expect(describeSkill('# Skill: X\n**Trigger:** do y\n', 'x')).toBe('do y');
    expect(describeSkill('# Deploy Game\n', 'deploy')).toBe('Deploy Game');
    expect(describeSkill('# Deploy Game\n\nPush builds via butler.\n## Args\n', 'deploy')).toBe('Deploy Game. Push builds via butler.');
    expect(describeSkill('# Brief\n## Triggers\n- Editing sects\n', 'brief')).toBe('Brief. Editing sects');
    expect(describeSkill('no heading', 'fallback')).toBe('fallback');
  });

  test('dry run plans without touching disk', () => {
    const plans = migrate(skillsDir);
    expect(plans).toHaveLength(2);
    expect(fs.existsSync(path.join(skillsDir, 'game-router.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'game-router/SKILL.md'))).toBe(false);
  });

  test('--apply converts flat files into registrable SKILL.md', () => {
    migrate(skillsDir, { apply: true });
    expect(fs.existsSync(path.join(skillsDir, 'game-router.md'))).toBe(false);
    const text = fs.readFileSync(path.join(skillsDir, 'game-router/SKILL.md'), 'utf8');
    expect(text).toMatch(/^---\nname: "game-router"\ndescription: "any task touching apps\/<game>\/"\n---\n\n# Skill: Game Router/);
    expect(host.listSkills(skillsDir).unregistered).toEqual([]);
    expect(host.listSkills(skillsDir).skills.map((s) => s.name).sort()).toEqual(['deploy', 'game-router', 'ok']);
  });

  test('skips a flat file whose target directory already has SKILL.md', () => {
    write(path.join(skillsDir, 'clash/SKILL.md'), '# no frontmatter\n');
    write(path.join(skillsDir, 'clash.md'), '# Clash\n');
    const plans = migrate(skillsDir, { apply: true });
    expect(plans.find((p) => p.from.endsWith('clash.md')).conflict).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'clash.md'))).toBe(true);
  });
});
