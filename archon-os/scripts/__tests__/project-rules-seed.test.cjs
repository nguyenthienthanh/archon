/**
 * Tests for archon-os/scripts/project-rules-seed.cjs — `/project init` seeds
 * stack best-practice rules from skills/framework-expert/refs/ into the
 * project's auto-loaded .claude/rules/stack/. Reuses detectFramework().
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '../project-rules-seed.cjs');
const REFS = path.join(__dirname, '../../skills/framework-expert/refs');

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-seed-'));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return dir;
}

const seed = (dir, args = []) => spawnSync('node', [CLI, '--dir', dir, '--json', ...args], { encoding: 'utf8' });
const stackDir = (dir) => path.join(dir, '.claude/rules/stack');
const seeded = (dir) => (fs.existsSync(stackDir(dir)) ? fs.readdirSync(stackDir(dir)).sort() : []);

describe('project-rules-seed', () => {
  it('seeds laravel.md for a Laravel project, with a provenance header and the ref body', () => {
    const dir = project({ 'composer.json': { require: { 'laravel/framework': '^11.0' } } });
    const r = seed(dir);
    expect(r.status).toBe(0);
    expect(seeded(dir)).toEqual(['laravel.md']);
    const body = fs.readFileSync(path.join(stackDir(dir), 'laravel.md'), 'utf8');
    expect(body).toMatch(/^<!-- archon-seed: source=skills\/framework-expert\/refs\/laravel\.md plugin=\d/);
    expect(body).toContain(fs.readFileSync(path.join(REFS, 'laravel.md'), 'utf8').trim());
  });

  it('seeds nextjs + react + typescript for a Next.js TS project', () => {
    const dir = project({ 'package.json': { dependencies: { next: '15', react: '19' } }, 'tsconfig.json': '{}' });
    seed(dir);
    expect(seeded(dir)).toEqual(['nextjs.md', 'react.md', 'typescript.md']);
  });

  it('maps aliases to the shared ref (fastapi -> python, express -> nodejs)', () => {
    const py = project({ 'requirements.txt': 'fastapi==0.110\n' });
    seed(py);
    expect(seeded(py)).toEqual(['python.md']);
    const node = project({ 'package.json': { dependencies: { express: '4' } } });
    seed(node);
    expect(seeded(node)).toEqual(['nodejs.md']);
  });

  it('never overwrites a project-edited rule without --force', () => {
    const dir = project({ 'composer.json': { require: { 'laravel/framework': '^11.0' } } });
    seed(dir);
    const file = path.join(stackDir(dir), 'laravel.md');
    fs.writeFileSync(file, 'PROJECT OWNED');
    const r = seed(dir);
    expect(JSON.parse(r.stdout).skipped).toEqual(['laravel.md']);
    expect(fs.readFileSync(file, 'utf8')).toBe('PROJECT OWNED');
    seed(dir, ['--force']);
    expect(fs.readFileSync(file, 'utf8')).not.toBe('PROJECT OWNED');
  });

  it('writes nothing and says so when no stack has a ref', () => {
    const dir = project({ 'README.md': 'hi' });
    const r = seed(dir);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ written: [], refs: [] });
    expect(fs.existsSync(stackDir(dir))).toBe(false);
  });

  it('never writes through a symlink, even with --force (review #7)', () => {
    const dir = project({ 'composer.json': { require: { 'laravel/framework': '^11.0' } } });
    const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'outside-')), 'victim.md');
    fs.mkdirSync(stackDir(dir), { recursive: true });
    fs.symlinkSync(outside, path.join(stackDir(dir), 'laravel.md'));
    const r = seed(dir, ['--force']);
    expect(JSON.parse(r.stdout).skipped).toEqual(['laravel.md']);
    expect(fs.existsSync(outside)).toBe(false);
  });

  it('exits 2 when --dir has no value (review #8)', () => {
    expect(spawnSync('node', [CLI, '--dir'], { encoding: 'utf8' }).status).toBe(2);
    expect(spawnSync('node', [CLI, '--dir', '--force'], { encoding: 'utf8' }).status).toBe(2);
  });

  it('--dry-run reports refs without writing', () => {
    const dir = project({ 'go.mod': 'module x\n' });
    const r = seed(dir, ['--dry-run']);
    expect(JSON.parse(r.stdout).refs).toEqual(['go']);
    expect(fs.existsSync(stackDir(dir))).toBe(false);
  });
});
