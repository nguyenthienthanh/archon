#!/usr/bin/env node
/**
 * security-scan.cjs - Scan written/edited files for security issues
 *
 * PostToolUse hook on Write|Edit. Runs async.
 * Detects common vulnerability patterns without requiring external tools.
 *
 * Exit codes:
 * - 0: No issues or not applicable
 * - 1: Warning (issues found)
 */

const fs = require('fs');
const path = require('path');
const { readHookInputCompat } = require('./lib/hook-runtime.cjs');

// Resolve the file to scan from the PostToolUse stdin payload (tool_input),
// falling back to the legacy CLAUDE_FILE_PATHS env var. The old code read only
// the env var — which the hook API never sets — so the scanner silently
// skipped every file and did nothing.
function resolveScanPath(input) {
  const ti = (input && input.tool_input) || {};
  return ti.file_path || ti.path || process.env.CLAUDE_FILE_PATHS || '';
}

// Security patterns by category
const PATTERNS = {
  secrets: [
    { re: /['"]AKIA[0-9A-Z]{16}['"]/, msg: 'AWS access key' },
    { re: /['"]ghp_[a-zA-Z0-9]{36}['"]/, msg: 'GitHub personal access token' },
    { re: /['"]sk-[a-zA-Z0-9]{32,}['"]/, msg: 'API secret key (OpenAI/Stripe pattern)' },
    { re: /['"]xox[bprs]-[a-zA-Z0-9-]+['"]/, msg: 'Slack token' },
    { re: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/, msg: 'Private key' },
    { re: /password\s*[:=]\s*['"][^'"]{4,}['"](?!\s*[,;]\s*\/\/)/, msg: 'Hardcoded password' },
  ],
  injection: [
    { re: /\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b/i, msg: 'Possible SQL injection (template literal in query)' },
    { re: /['"\s+]\s*\+\s*\w+.*(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b/i, msg: 'Possible SQL injection (string concat)' },
    { re: /exec\(\s*['"`].*\$\{/, msg: 'Possible command injection (exec with interpolation)' },
    { re: /child_process.*exec\((?!.*execFile)/, msg: 'Prefer execFile over exec for command safety' },
  ],
  xss: [
    { re: /\.innerHTML\s*=\s*(?!['"`]\s*['"`])/, msg: 'innerHTML assignment (XSS risk)' },
    { re: /dangerouslySetInnerHTML/, msg: 'dangerouslySetInnerHTML (verify sanitization)' },
    { re: /\$\(.*\)\.html\((?!['"`])/, msg: 'jQuery .html() with dynamic content (XSS risk)' },
  ],
  crypto: [
    { re: /createHash\(['"]md5['"]\)/, msg: 'MD5 is not secure for hashing' },
    { re: /createHash\(['"]sha1['"]\)/, msg: 'SHA1 is not secure for hashing' },
    { re: /Math\.random\(\).*(?:token|key|secret|password|salt|nonce)/i, msg: 'Math.random() for security-sensitive value' },
  ],
};

// File extensions to scan
const SCANNABLE = new Set([
  '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx',
  '.py', '.rb', '.php', '.go', '.java', '.rs',
  '.vue', '.svelte',
]);

// Pure function — scan content + return findings. No I/O, no exit.
function scanContent(content) {
  const lines = content.split('\n');
  const findings = [];
  for (const [category, patterns] of Object.entries(PATTERNS)) {
    for (const { re, msg } of patterns) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) continue;
        if (line.trimStart().startsWith('*')) continue;
        if (re.test(line)) {
          findings.push({ category, msg, line: i + 1 });
          break;
        }
      }
    }
  }
  return findings;
}

function isScannable(filePath) {
  return SCANNABLE.has(path.extname(filePath).toLowerCase());
}

function main() {
  try {
    let input = {};
    try { input = readHookInputCompat(); } catch { /* fall back to env below */ }
    const filePath = resolveScanPath(input);
    if (!filePath) process.exit(0);
    if (!isScannable(filePath)) process.exit(0);
    if (!fs.existsSync(filePath)) process.exit(0);

    const content = fs.readFileSync(filePath, 'utf-8');
    const findings = scanContent(content);

    if (findings.length > 0) {
      const icon = findings.some(f => f.category === 'secrets') ? '🔴' : '🟡';
      console.error(`${icon} Security scan: ${findings.length} issue(s) in ${path.basename(filePath)}`);
      for (const f of findings.slice(0, 5)) {
        console.error(`   L${f.line}: [${f.category}] ${f.msg}`);
      }
      if (findings.length > 5) {
        console.error(`   ... and ${findings.length - 5} more`);
      }
      process.exit(1);
    }
    process.exit(0);
  } catch {
    process.exit(0);
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = { PATTERNS, SCANNABLE, scanContent, isScannable, resolveScanPath };
}
