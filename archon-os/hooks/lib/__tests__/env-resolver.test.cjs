'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseEnvFile, resolveEnv, loadProjectEnv } = require('../env-resolver.cjs');

describe('env-resolver', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'af-env-test-')));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.TEST_VAR_A;
    delete process.env.JIRA_BASE_URL;
    delete process.env.JIRA_URL;
    delete process.env.FIGMA_API_TOKEN;
    delete process.env.FIGMA_API_KEY;
  });

  describe('parseEnvFile', () => {
    it('parses unquoted and quoted key-value pairs with optional export', () => {
      const p = path.join(tmpDir, '.env');
      fs.writeFileSync(
        p,
        `
# Comment line
PLAIN_KEY=hello_world
export EXPORTED_KEY="quoted value"
SINGLE_QUOTED='single'
WITH_COMMENT=my_val # inline comment
`,
      );

      const parsed = parseEnvFile(p);
      expect(parsed.PLAIN_KEY).toBe('hello_world');
      expect(parsed.EXPORTED_KEY).toBe('quoted value');
      expect(parsed.SINGLE_QUOTED).toBe('single');
      expect(parsed.WITH_COMMENT).toBe('my_val');
    });

    it('returns empty object if file does not exist', () => {
      expect(parseEnvFile('/nonexistent/.env')).toEqual({});
    });
  });

  describe('resolveEnv with cascading priority', () => {
    it('prefers active process.env over files', () => {
      process.env.TEST_VAR_A = 'from_process_env';
      const p = path.join(tmpDir, '.env');
      fs.writeFileSync(p, 'TEST_VAR_A=from_file\n');

      expect(resolveEnv('TEST_VAR_A', tmpDir)).toBe('from_process_env');
    });

    it('falls back to .env if process.env is unset', () => {
      const p = path.join(tmpDir, '.env');
      fs.writeFileSync(p, 'TEST_VAR_A=from_dot_env\n');

      expect(resolveEnv('TEST_VAR_A', tmpDir)).toBe('from_dot_env');
      expect(process.env.TEST_VAR_A).toBe('from_dot_env');
    });

    it('prioritizes .env.local over .env and .envrc', () => {
      fs.writeFileSync(path.join(tmpDir, '.envrc'), 'TEST_VAR_A=from_envrc\n');
      fs.writeFileSync(path.join(tmpDir, '.env'), 'TEST_VAR_A=from_env\n');
      fs.writeFileSync(path.join(tmpDir, '.env.local'), 'TEST_VAR_A=from_env_local\n');

      expect(resolveEnv('TEST_VAR_A', tmpDir)).toBe('from_env_local');
    });

    it('normalizes legacy aliases (JIRA_URL -> JIRA_BASE_URL)', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'JIRA_URL=https://myjira.atlassian.net\n');

      // Request canonical name
      const val = resolveEnv('JIRA_BASE_URL', tmpDir);
      expect(val).toBe('https://myjira.atlassian.net');
      expect(process.env.JIRA_BASE_URL).toBe('https://myjira.atlassian.net');
      expect(process.env.JIRA_URL).toBe('https://myjira.atlassian.net');
    });

    it('normalizes legacy aliases (FIGMA_API_KEY -> FIGMA_API_TOKEN)', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'FIGMA_API_KEY=figma_secret\n');

      const val = resolveEnv('FIGMA_API_TOKEN', tmpDir);
      expect(val).toBe('figma_secret');
      expect(process.env.FIGMA_API_TOKEN).toBe('figma_secret');
    });
  });

  describe('loadProjectEnv', () => {
    it('hydrates all variables and normalizes aliases in bulk', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'JIRA_URL=https://test.atlassian.net\nTEST_VAR_A=bulk_loaded\n');

      const loaded = loadProjectEnv(tmpDir);
      expect(loaded.TEST_VAR_A).toBe('bulk_loaded');
      expect(process.env.JIRA_BASE_URL).toBe('https://test.atlassian.net');
    });
  });
});
