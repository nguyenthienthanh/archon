#!/usr/bin/env node
/**
 * diff-smells.cjs — deterministic, ZERO-MODEL enforcement of
 * rules/core/simplicity-over-complexity.md and rules/core/code-quality.md.
 *
 * Scans the lines a change ADDS (old debt does not drown the review) for:
 *   user-path       /Users/<name>/, /home/<name>/, C:\Users\<name>\ — breaks on every other machine
 *   adhoc-schedule  setInterval / cron.schedule / crontab / launchctl / LaunchAgents / schedule.every
 *                   outside the file that declares `archon:scheduler-seam`
 *   dup-literal     the same magic number or long string added in 2+ different files
 *   dead-export     a newly exported JS/TS name with zero whole-word references anywhere else
 *
 * It is a structured check, not a judgement: run it from Bash directly. When a
 * subagent must run it, use the cheapest model and relay the JSON verbatim.
 * Test and fixture files are exempt.
 *
 * Usage: diff-smells.cjs [--base <ref>] [--all] [--json]
 *   --base <ref>  compare the working tree with <ref> (default HEAD); untracked files count as added
 *   --all         treat every tracked + untracked file as added (whole-repo audit)
 * Exit:  0 clean | 1 findings | 2 not a git repo / usage error
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SEAM_MARKER = 'archon:scheduler-seam';
const MAX_FILE_BYTES = 1_000_000;
const MIN_STRING_LEN = 12;
// Magic numbers worth naming are timeouts/TTLs/limits (5000, 86400). Shorter
// ones (ports aside) are mostly dates, percentages and ANSI codes — noise.
const COMMON_NUMBERS = new Set(['1000', '1024']);
const CODE_EXT = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.py', '.php', '.go', '.rb', '.sh', '.bash', '.zsh']);
const JS_EXT = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx']);
const TEST_PATH = /(^|\/)(__tests__|tests?|fixtures?|spec)\/|\.(test|spec)\.[a-z]+$/i;
const SELF = path.resolve(__filename);

// Placeholder names (`/Users/x/`, `/home/user/`) are documentation, not a leak.
const USER_PATH = /(?:\/Users|\/home)\/(?!(?:Shared|[a-z]|user|username|name|you|me|example)\/)[A-Za-z0-9._-]+\/|[A-Za-z]:\\\\?Users\\\\?(?!(?:user|name|you)\\)[A-Za-z0-9._-]+\\/;
// The scheduling ACT, not a mention of a scheduler path (a safety check listing
// LaunchAgents/ schedules nothing).
const SCHEDULE_PATTERNS = [
  /\bsetInterval\s*\(/, /\bcron\.schedule\s*\(/, /\bcrontab\s+(?:-[^l\s]|\S+\.\S+|-\s*$)|\|\s*crontab\b/,
  /\blaunchctl\s+(?:load|bootstrap|submit)\b/, /\bschedule\.every\s*\(/,
];
const NUMBER = /(?<![\w.])[1-9]\d{3,}(?![\w.])/g;
const HAS_WORD = /[A-Za-z0-9]/;
// "${BASH_SOURCE[0]}" is an expansion idiom, not a literal value.
const SHELL_EXPANSION = /^\$\{?[\w[\]@#]+\}?$/;
const STRING = /(['"])((?:(?!\1)[^\\\n]|\\.){12,})\1/g;
const IMPORT_LINE = /\brequire\s*\(|^\s*import\b|\bfrom\s+['"]/;
const COMMENT_LINE = /^\s*(?:\/\/|#|\*|\/\*)/;
const TRAILING_COMMENT = /\s(?:\/\/|#)\s.*$/;
const isYear = (n) => n.length === 4 && Number(n) >= 1900 && Number(n) <= 2100;

const FIX = {
  'user-path': 'derive from $HOME / os.homedir() / an env var or config value',
  'adhoc-schedule': 'route through the one scheduler seam (mark it `archon:scheduler-seam`), do not add another',
  'dup-literal': 'define the value once as a named constant and import it',
  'dead-export': 'delete it, or add the caller that needs it',
};

// stderr is captured, not printed: `git show base:new-file` failing is expected.
const git = (root, args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
});
const lines = (out) => out.split('\n').filter(Boolean);
const ext = (file) => path.extname(file).toLowerCase();

function readText(root, file) {
  const abs = path.join(root, file);
  try {
    const stat = fs.statSync(abs);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    const text = fs.readFileSync(abs, 'utf8');
    return text.includes('\0') ? null : text;
  } catch {
    return null;
  }
}

/** Map<file, [{line, text}]> of the lines this change adds. */
function collectAdded(root, { base, all }) {
  const added = new Map();
  const wholeFile = (file) => {
    const text = readText(root, file);
    if (text !== null) added.set(file, text.split('\n').map((t, i) => ({ line: i + 1, text: t })));
  };

  for (const file of lines(git(root, ['ls-files', '--others', '--exclude-standard']))) wholeFile(file);
  if (all) {
    for (const file of lines(git(root, ['ls-files']))) wholeFile(file);
    return added;
  }

  let file = null;
  let next = 0;
  // Pin the prefixes and disable path quoting: diff.noprefix or a space in a
  // path must not shift `+++ b/<file>` parsing.
  const diffArgs = ['-c', 'core.quotepath=off', 'diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames',
    '--src-prefix=a/', '--dst-prefix=b/', base];
  for (const row of git(root, diffArgs).split('\n')) {
    if (row.startsWith('+++ ')) {
      // git appends a TAB to a path that contains a space.
      file = row === '+++ /dev/null' ? null : row.slice(6).replace(/\t$/, '');
      if (file && !added.has(file)) added.set(file, []);
    } else if (row.startsWith('@@')) {
      next = Number(/\+(\d+)/.exec(row)[1]);
    } else if (file && row.startsWith('+')) {
      added.get(file).push({ line: next++, text: row.slice(1) });
    }
  }
  return added;
}

function findUserPaths(file, rows, findings) {
  for (const { line, text } of rows) {
    const m = USER_PATH.exec(text);
    if (m) findings.push({ smell: 'user-path', file, line, evidence: m[0] });
  }
}

function findSchedules(root, file, rows, findings) {
  if (!CODE_EXT.has(ext(file)) || path.resolve(root, file) === SELF) return;
  if ((readText(root, file) || '').includes(SEAM_MARKER)) return;
  for (const { line, text } of rows) {
    const hit = SCHEDULE_PATTERNS.find((re) => re.test(text));
    if (hit) findings.push({ smell: 'adhoc-schedule', file, line, evidence: text.trim().slice(0, 160) });
  }
}

function collectLiterals(file, rows, literals) {
  if (!CODE_EXT.has(ext(file))) return;
  for (const { line, text: raw } of rows) {
    if (IMPORT_LINE.test(raw) || COMMENT_LINE.test(raw)) continue;
    const text = raw.replace(TRAILING_COMMENT, '');
    const values = [...text.matchAll(NUMBER)].map((m) => m[0]).filter((n) => !COMMON_NUMBERS.has(n) && !isYear(n));
    values.push(...[...text.matchAll(STRING)].map((m) => m[2]).filter((s) => s.length >= MIN_STRING_LEN && HAS_WORD.test(s) && !SHELL_EXPANSION.test(s)));
    for (const value of values) {
      if (!literals.has(value)) literals.set(value, new Map());
      const files = literals.get(value);
      if (!files.has(file)) files.set(file, line);
    }
  }
}

function exportNames(text) {
  const names = new Set();
  const add = (list) => list.split(',').forEach((part) => {
    const name = part.split(':')[0].replace(/\bas\b.*$/, '').trim();
    if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
  });
  // In `module.exports = {...}` only `name` and `name: identifier` export code.
  // `key: 'literal'` is a config object (jest.config.cjs), not an API.
  for (const m of text.matchAll(/module\.exports\s*=\s*\{([^}]*)\}/g)) {
    for (const part of m[1].replace(/\/\/[^\n]*/g, '').split(',')) {
      const entry = /^\s*([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$.]*)\s*)?$/.exec(part);
      if (entry) names.add(entry[1]);
    }
  }
  for (const m of text.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) add(m[1]);
  for (const m of text.matchAll(/\b(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]);
  for (const m of text.matchAll(/^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  return names;
}

function baseText(root, base, file) {
  try {
    return git(root, ['show', `${base}:${file}`]);
  } catch {
    return '';
  }
}

function findDeadExports(root, files, { base, all }, findings) {
  const jsFiles = files.filter((f) => JS_EXT.has(ext(f)) && !TEST_PATH.test(f));
  if (jsFiles.length === 0) return;

  // One word index over the whole tree: word -> files that mention it.
  const index = new Map();
  const everyFile = new Set([...lines(git(root, ['ls-files'])), ...lines(git(root, ['ls-files', '--others', '--exclude-standard']))]);
  for (const file of everyFile) {
    const text = readText(root, file);
    if (text === null) continue;
    for (const word of new Set(text.match(/[A-Za-z_$][\w$]*/g) || [])) {
      if (!index.has(word)) index.set(word, new Set());
      index.get(word).add(file);
    }
  }

  for (const file of jsFiles) {
    const text = readText(root, file);
    if (text === null) continue;
    const before = all ? new Set() : exportNames(baseText(root, base, file));
    for (const name of exportNames(text)) {
      if (before.has(name)) continue;
      const users = [...(index.get(name) || [])].filter((f) => f !== file);
      if (users.length > 0) continue;
      const line = text.split('\n').findIndex((l) => new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(l)) + 1;
      findings.push({ smell: 'dead-export', file, line, evidence: name });
    }
  }
}

function scan(root, opts) {
  const added = collectAdded(root, opts);
  const findings = [];
  const literals = new Map();
  const scanned = [...added.keys()].filter((f) => !TEST_PATH.test(f));

  for (const file of scanned) {
    const rows = added.get(file);
    findUserPaths(file, rows, findings);
    findSchedules(root, file, rows, findings);
    collectLiterals(file, rows, literals);
  }
  for (const [value, files] of literals) {
    if (files.size < 2) continue;
    const [[file, line]] = files;
    findings.push({ smell: 'dup-literal', file, line, evidence: value, files: [...files.keys()] });
  }
  findDeadExports(root, scanned, opts, findings);

  for (const f of findings) f.fix = FIX[f.smell];
  return { findings, scanned_files: scanned.length };
}

function main(argv) {
  const args = argv.slice(2);
  const baseIdx = args.indexOf('--base');
  const base = baseIdx >= 0 ? args[baseIdx + 1] : 'HEAD';
  if (!base) {
    console.error('diff-smells: --base needs a ref');
    return 2;
  }

  let root;
  try {
    root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  } catch {
    console.error('diff-smells: not inside a git repository');
    return 2;
  }

  const result = scan(root, { base, all: args.includes('--all') });
  if (args.includes('--json')) {
    console.log(JSON.stringify(result));
  } else if (result.findings.length === 0) {
    console.log(`diff-smells: clean (${result.scanned_files} files)`);
  } else {
    for (const f of result.findings) console.log(`${f.smell.padEnd(15)} ${f.file}:${f.line}  ${f.evidence}  → ${f.fix}`);
  }
  return result.findings.length > 0 ? 1 : 0;
}

process.exit(main(process.argv));
