'use strict';

/**
 * af-child-env — what a spawned third-party tool is allowed to see.
 *
 * The two failure modes are opposite and both matter: leaking a credential to a
 * repo's own linter binary, and stripping PATH so that binary cannot run at all.
 * PATH is the sharp edge — a naive /PAT/i for "personal access token" matches it.
 */

const {
  isSecretName, filterChildEnv, droppedKeys,
} = require('../af-child-env.cjs');

describe('isSecretName — drops', () => {
  it.each([
    'SUPABASE_SECRET_KEY',
    'JIRA_API_TOKEN',
    'GITHUB_TOKEN',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_ACCESS_KEY_ID',
    'FIGMA_API_TOKEN',
    'SLACK_BOT_TOKEN',
    'NPM_PASSWORD',
    'DB_PASSWD',
    'GCP_CREDENTIALS',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'OPENAI_APIKEY',
    'SSH_PRIVATE_KEY',
    'PAT',
    'GH_PAT',
    'PAT_TOKEN',
    'npm_config__authToken',
  ])('%s', (name) => expect(isSecretName(name)).toBe(true));
});

describe('isSecretName — keeps', () => {
  it.each([
    'PATH',
    'HOME',
    'USER',
    'SHELL',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'TERM',
    'PWD',
    'NODE_ENV',
    'NODE_OPTIONS',
    'NODE_PATH',
    'PYTHONPATH',
    'LD_LIBRARY_PATH',
    'ESLINT_USE_FLAT_CONFIG',
    'CLAUDE_PLUGIN_ROOT',
    'CLAUDE_PROJECT_DIR',
    'AF_PROJECT_ROOT',
    'AF_LEARNING_ENABLED',
    'CI',
  ])('%s', (name) => expect(isSecretName(name)).toBe(false));

  it('keeps PATH — the /PAT/i trap', () => {
    // A regex written for "personal access token" as a bare substring also
    // matches PATH, which would leave every spawned linter unable to resolve
    // its own binary. This is the regression this assertion exists for.
    expect(isSecretName('PATH')).toBe(false);
    expect(isSecretName('MANPATH')).toBe(false);
    expect(isSecretName('SOME_PROJECT_PATH')).toBe(false);
  });

  it('is false for empty/undefined names', () => {
    expect(isSecretName('')).toBe(false);
    expect(isSecretName(undefined)).toBe(false);
  });
});

describe('filterChildEnv', () => {
  const source = {
    PATH: '/usr/bin',
    HOME: '/home/dev',
    NODE_ENV: 'test',
    SUPABASE_SECRET_KEY: 'sk-live-do-not-leak',
    JIRA_API_TOKEN: 'jira-tok',
    AF_PROJECT_ROOT: '/repo',
  };

  it('keeps what a tool needs and drops what it does not', () => {
    const env = filterChildEnv(source);
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/dev');
    expect(env.NODE_ENV).toBe('test');
    expect(env.AF_PROJECT_ROOT).toBe('/repo');
    expect(env).not.toHaveProperty('SUPABASE_SECRET_KEY');
    expect(env).not.toHaveProperty('JIRA_API_TOKEN');
  });

  it('does not mutate the source environment', () => {
    filterChildEnv(source);
    expect(source.SUPABASE_SECRET_KEY).toBe('sk-live-do-not-leak');
  });

  it('applies `extra` last, so a caller can pass a value the child needs', () => {
    const env = filterChildEnv(source, { ESLINT_USE_FLAT_CONFIG: 'false' });
    expect(env.ESLINT_USE_FLAT_CONFIG).toBe('false');
  });

  it('lets `extra` re-add a credential-named var deliberately', () => {
    const env = filterChildEnv(source, { JIRA_API_TOKEN: 'needed-here' });
    expect(env.JIRA_API_TOKEN).toBe('needed-here');
  });

  it('skips undefined values rather than passing "undefined" strings', () => {
    expect(filterChildEnv({ PATH: '/usr/bin', NOPE: undefined })).not.toHaveProperty('NOPE');
  });

  it('passes everything through when AF_CHILD_ENV_UNFILTERED=true', () => {
    const env = filterChildEnv({ ...source, AF_CHILD_ENV_UNFILTERED: 'true' });
    expect(env.SUPABASE_SECRET_KEY).toBe('sk-live-do-not-leak');
  });

  it('is not disabled by any other value of the escape hatch', () => {
    const env = filterChildEnv({ ...source, AF_CHILD_ENV_UNFILTERED: '1' });
    expect(env).not.toHaveProperty('SUPABASE_SECRET_KEY');
  });
});

describe('droppedKeys', () => {
  it('reports what would be stripped, sorted', () => {
    expect(droppedKeys({ PATH: 'x', JIRA_API_TOKEN: 'a', SUPABASE_SECRET_KEY: 'b' }))
      .toEqual(['JIRA_API_TOKEN', 'SUPABASE_SECRET_KEY']);
  });
});
