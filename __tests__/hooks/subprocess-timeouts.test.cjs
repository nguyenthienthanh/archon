/**
 * Regression guard: every child_process call made from a hook must be bounded.
 *
 * An unbounded call wedges the hook and, under the dispatcher, the whole hook
 * chain. This walks the real source of every hook + lib file and fails on any
 * exec/spawn call site that has no `timeout:` — so a NEW unbounded call cannot
 * be added without this test going red.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'archon-os', 'hooks');

function listSources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((ent) => {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) return ent.name === '__tests__' ? [] : listSources(full);
    return ent.isFile() && ent.name.endsWith('.cjs') ? [full] : [];
  });
}

/**
 * Find every `execSync(`/`execFileSync(`/`spawnSync(` invocation and return the
 * source slice from the call up to its balanced closing paren.
 */
function findCallSites(source) {
  const sites = [];
  const re = /\b(execSync|execFileSync|spawnSync)\s*\(/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < source.length; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    sites.push({
      fn: m[1],
      line: source.slice(0, m.index).split('\n').length,
      text: source.slice(m.index, i + 1),
    });
  }
  return sites;
}

describe('hook subprocess calls are bounded', () => {
  const files = listSources(ROOT);

  it('finds hook sources to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('every exec/spawn call site passes a timeout', () => {
    const unbounded = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      for (const site of findCallSites(source)) {
        // A call forwarding a caller-supplied options object inherits its
        // bounds from the wrapper's defaults (see execSafe in af-config-utils).
        const inheritsOpts = /\.\.\.opts\b/.test(site.text);
        if (!/\btimeout\s*:/.test(site.text) && !inheritsOpts) {
          unbounded.push(`${path.relative(ROOT, file)}:${site.line} ${site.fn}`);
        }
      }
    }
    expect(unbounded).toEqual([]);
  });

  // The specific sites this change fixed — named so a regression points at the
  // exact hook rather than just "something is unbounded".
  const CALL_SITES = [
    ['lib/af-config-utils.cjs', 'execSafe'],
    ['firebase-cleanup.cjs', 'firebase login:list'],
    ['playwright-reaper.cjs', 'ps -Ao'],
    ['compact-handoff.cjs', 'git diff --name-only HEAD'],
    ['post-execute-conflict-rescan.cjs', 'git diff --name-only'],
    ['workflow-edit-learn.cjs', 'git'],
    ['lint-autofix.cjs', 'which'],
    ['lib/af-project-cache.cjs', 'rev-parse'],
  ];

  it.each(CALL_SITES)('%s bounds its %s call', (relFile) => {
    const source = fs.readFileSync(path.join(ROOT, relFile), 'utf-8');
    const sites = findCallSites(source);
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      expect(/\btimeout\s*:|\.\.\.opts\b/.test(site.text)).toBe(true);
    }
  });

  // Large-output commands must also raise maxBuffer above Node's 1MB default,
  // otherwise overflow silently degrades to "no data".
  const LARGE_OUTPUT_FILES = [
    'playwright-reaper.cjs',
    'compact-handoff.cjs',
    'post-execute-conflict-rescan.cjs',
    'workflow-edit-learn.cjs',
  ];

  it.each(LARGE_OUTPUT_FILES)('%s raises maxBuffer for large output', (relFile) => {
    const source = fs.readFileSync(path.join(ROOT, relFile), 'utf-8');
    for (const site of findCallSites(source)) {
      expect(/\bmaxBuffer\s*:/.test(site.text)).toBe(true);
    }
  });
});
