#!/usr/bin/env node
/**
 * Aura Frog — Design Conformance (PostToolUse)
 *
 * Fires: PostToolUse with matcher "Write|Edit"
 * Purpose: Deterministic tier-1 design gate. Greps a written/edited UI file for
 *          the design-system violations the prose rules (theme-consistency,
 *          design-system-usage, motion-design) describe but nothing enforced:
 *            - hardcoded-color:   hex / rgb() literal in a value position
 *            - hardcoded-spacing: raw px / numeric padding|margin|gap
 *            - mixed-library:     one file importing 2+ known component libraries
 *            - motion-no-reduced: animation/transition without a prefers-reduced-motion guard
 *          This is the fast, rules-based signal the design-vision-loop runs
 *          BEFORE spending a vision call (Anthropic ranks rules-based feedback
 *          above LLM-as-judge).
 *
 * Contract: warnings only (exit 1 = advisory, hook is async & non-blocking),
 *           fail-open on anything unexpected (exit 0). Never blocks a write.
 *           Skips non-UI files and design-token/theme files (they DEFINE tokens).
 *
 * Disable: rename or chmod -x this file, or set AF_DESIGN_CONFORMANCE_DISABLED=1.
 *
 * @version 1.0.0 (FEAT-009 / STORY-0035 — design intelligence v2)
 */

const fs = require('fs');
const path = require('path');
const { readHookInputCompat } = require('./lib/hook-runtime.cjs');

// UI files worth scanning. Styles + component files across the common stacks.
const SCANNABLE = new Set([
  '.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte',
  '.css', '.scss', '.less',
]);

// Known single-purpose component libraries. A file importing 2+ of these is
// mixing design systems (design-system-usage: one library per project).
const UI_LIBRARIES = [
  { re: /['"]@mui\/(?:material|joy)['"]/, name: 'MUI' },
  { re: /['"]antd['"]/, name: 'Ant Design' },
  { re: /['"]@chakra-ui\/react['"]/, name: 'Chakra UI' },
  { re: /['"]@mantine\/core['"]/, name: 'Mantine' },
  { re: /['"]react-bootstrap['"]/, name: 'React Bootstrap' },
];

// A path that DEFINES tokens/theme is exempt from color/spacing literal checks.
function isTokenFile(filePath) {
  const p = filePath.toLowerCase();
  return /(?:^|[\/\\])(?:tokens?|theme|design-system|palette|colors?)\b/.test(p) ||
    /design-tokens/.test(p) ||
    p.endsWith('tailwind.config.js') || p.endsWith('tailwind.config.ts');
}

function isScannable(filePath) {
  return SCANNABLE.has(path.extname(filePath).toLowerCase());
}

function isComment(line) {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('#');
}

// A hex color literal in a value position: #rgb / #rrggbb / #rrggbbaa.
// Excludes lines that DEFINE a CSS custom property (--foo: #...) — that is the
// one legitimate place a raw hex belongs (the token definition itself).
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const RGB_RE = /\brgba?\(/;
// A CSS custom-property assignment anywhere on the line (e.g.
// `:root { --brand: #3366ff; }`) — the one legitimate home for a raw hex.
const DEFINES_CSS_VAR = /--[\w-]+\s*:/;

// Raw numeric spacing: `padding: 16`, `margin: 8`, `gap: 12` (RN/JS style) or
// `12px` used with a spacing property. Zero and percentages are allowed, so the
// numeric capture is non-zero (`[1-9]\d*`).
const SPACING_PROP_NUM = /\b(padding|margin|gap|inset|top|right|bottom|left)(?:Top|Right|Bottom|Left|Horizontal|Vertical|Start|End|X|Y)?\s*[:=]\s*['"`]?\s*([1-9]\d*)(?:px)?\b/;
const PX_LITERAL = /\b([1-9]\d*)px\b/; // non-zero px anywhere

// Motion without a reduced-motion guard.
const MOTION_RE = /(@keyframes\b|animation\s*:|transition\s*:|\banimate=|\bwhileHover=|\bwhileTap=)/;
const REDUCED_MOTION_RE = /prefers-reduced-motion|useReducedMotion|MotionConfig\b/;

/**
 * Pure scan. No I/O, no exit. Returns an array of findings.
 * @param {string} content
 * @param {string} filePath (used for token-file exemption + import context)
 * @returns {{category:string,line:number,msg:string}[]}
 */
function scanContent(content, filePath = '') {
  const findings = [];
  const lines = content.split('\n');
  const tokenFile = isTokenFile(filePath);

  // File-level: mixed component libraries.
  const libs = UI_LIBRARIES.filter((l) => l.re.test(content)).map((l) => l.name);
  if (libs.length >= 2) {
    findings.push({
      category: 'mixed-library',
      line: 1,
      msg: `imports ${libs.length} component libraries (${libs.join(', ')}) — one design system per project`,
    });
  }

  // File-level: motion without reduced-motion guard.
  if (MOTION_RE.test(content) && !REDUCED_MOTION_RE.test(content)) {
    findings.push({
      category: 'motion-no-reduced',
      line: 1,
      msg: 'animation/transition present but no prefers-reduced-motion guard in this file',
    });
  }

  if (tokenFile) return findings; // token/theme files legitimately hold raw values

  // Line-level: hardcoded color + spacing literals.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isComment(line)) continue;

    const hasHex = HEX_RE.test(line) && !DEFINES_CSS_VAR.test(line);
    const hasRgb = RGB_RE.test(line) && !DEFINES_CSS_VAR.test(line);
    if (hasHex || hasRgb) {
      findings.push({
        category: 'hardcoded-color',
        line: i + 1,
        msg: 'hardcoded color literal — use a design token (see theme-consistency)',
      });
    }

    if (SPACING_PROP_NUM.test(line) || PX_LITERAL.test(line)) {
      findings.push({
        category: 'hardcoded-spacing',
        line: i + 1,
        msg: 'hardcoded spacing value — use a spacing token / scale',
      });
    }
  }

  return findings;
}

function resolveScanPath(input) {
  const ti = (input && input.tool_input) || {};
  return ti.file_path || ti.path || process.env.CLAUDE_FILE_PATHS || '';
}

function main() {
  try {
    if (process.env.AF_DESIGN_CONFORMANCE_DISABLED === '1') process.exit(0);

    let input = {};
    try { input = readHookInputCompat(); } catch { /* fall back to env */ }
    const filePath = resolveScanPath(input);
    if (!filePath) process.exit(0);
    if (!isScannable(filePath)) process.exit(0);
    if (!fs.existsSync(filePath)) process.exit(0);

    const content = fs.readFileSync(filePath, 'utf-8');
    const findings = scanContent(content, filePath);

    if (findings.length > 0) {
      console.error(`🎨 Design conformance: ${findings.length} issue(s) in ${path.basename(filePath)}`);
      for (const f of findings.slice(0, 5)) {
        console.error(`   L${f.line}: [${f.category}] ${f.msg}`);
      }
      if (findings.length > 5) console.error(`   ... and ${findings.length - 5} more`);
      process.exit(1);
    }
    process.exit(0);
  } catch {
    process.exit(0); // fail-open — never block a write
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    SCANNABLE, UI_LIBRARIES, scanContent, isScannable, isTokenFile, resolveScanPath,
  };
}
