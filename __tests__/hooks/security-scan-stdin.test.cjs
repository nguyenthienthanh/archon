/**
 * FEAT-007 / STORY-0010 — security-scan reads the file path from stdin.
 * main() read process.env.CLAUDE_FILE_PATHS (never set by the hook API) → the
 * scanner silently skipped every file. Now resolves from tool_input.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCAN = path.join(process.cwd(), 'archon-os', 'hooks', 'security-scan.cjs');
const { resolveScanPath } = require('../../archon-os/hooks/security-scan.cjs');

describe('security-scan.resolveScanPath', () => {
  it('reads tool_input.file_path from stdin', () => {
    expect(resolveScanPath({ tool_input: { file_path: '/a.js' } })).toBe('/a.js');
  });
  it('reads tool_input.path', () => {
    expect(resolveScanPath({ tool_input: { path: '/b.ts' } })).toBe('/b.ts');
  });
  it('falls back to CLAUDE_FILE_PATHS env', () => {
    const prev = process.env.CLAUDE_FILE_PATHS;
    process.env.CLAUDE_FILE_PATHS = '/legacy.py';
    try { expect(resolveScanPath({})).toBe('/legacy.py'); }
    finally { if (prev === undefined) delete process.env.CLAUDE_FILE_PATHS; else process.env.CLAUDE_FILE_PATHS = prev; }
  });
});

describe('security-scan end-to-end via stdin', () => {
  it('flags a secret in the file named by stdin tool_input (exit 1)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-'));
    const file = path.join(dir, 'creds.js');
    fs.writeFileSync(file, 'const key = "AKIAIOSFODNN7EXAMPLE";\n');
    const r = spawnSync('node', [SCAN], {
      input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: file } }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_FILE_PATHS: '' }, // ensure env is NOT the source
    });
    fs.rmSync(dir, { recursive: true, force: true });
    expect(r.status).toBe(1);              // before fix: env empty → exit 0 (dead)
    expect(r.stderr).toMatch(/Security scan/);
  });

  it('exits 0 for a clean file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-'));
    const file = path.join(dir, 'ok.js');
    fs.writeFileSync(file, 'const x = 1;\n');
    const r = spawnSync('node', [SCAN], {
      input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: file } }),
      encoding: 'utf8', env: { ...process.env, CLAUDE_FILE_PATHS: '' },
    });
    fs.rmSync(dir, { recursive: true, force: true });
    expect(r.status).toBe(0);
  });
});
