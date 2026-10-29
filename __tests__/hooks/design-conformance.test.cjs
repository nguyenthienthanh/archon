/**
 * Tests for archon-os/hooks/design-conformance.cjs
 * Pure-function tests via require()-from-source.
 */

const {
  SCANNABLE,
  scanContent,
  isScannable,
  isTokenFile,
} = require('../../archon-os/hooks/design-conformance.cjs');

const has = (findings, cat) => findings.some((f) => f.category === cat);

describe('design-conformance', () => {
  describe('isScannable', () => {
    it('true for .tsx', () => expect(isScannable('Button.tsx')).toBe(true));
    it('true for .css', () => expect(isScannable('styles.css')).toBe(true));
    it('true for .vue', () => expect(isScannable('App.vue')).toBe(true));
    it('true for .scss', () => expect(isScannable('a.scss')).toBe(true));
    it('false for .md', () => expect(isScannable('readme.md')).toBe(false));
    it('false for .json', () => expect(isScannable('package.json')).toBe(false));
    it('case-insensitive', () => expect(isScannable('Foo.TSX')).toBe(true));
  });

  describe('isTokenFile — exemptions', () => {
    it('exempts a design-tokens path', () =>
      expect(isTokenFile('src/design-tokens/index.css')).toBe(true));
    it('exempts theme.ts', () => expect(isTokenFile('src/theme.ts')).toBe(true));
    it('exempts tokens.css', () => expect(isTokenFile('src/styles/tokens.css')).toBe(true));
    it('exempts tailwind.config.js', () => expect(isTokenFile('tailwind.config.js')).toBe(true));
    it('does NOT exempt a normal component', () =>
      expect(isTokenFile('src/components/Button.tsx')).toBe(false));
  });

  describe('hardcoded-color', () => {
    it('flags a hex literal in a component', () => {
      const f = scanContent('const s = { color: "#ff0000" };', 'Button.tsx');
      expect(has(f, 'hardcoded-color')).toBe(true);
    });
    it('flags rgb()', () => {
      const f = scanContent('.a { background: rgb(255,0,0); }', 'a.css');
      expect(has(f, 'hardcoded-color')).toBe(true);
    });
    it('does NOT flag a CSS custom property definition', () => {
      const f = scanContent(':root { --brand: #3366ff; }', 'a.css');
      expect(has(f, 'hardcoded-color')).toBe(false);
    });
    it('does NOT flag hex inside a token file', () => {
      const f = scanContent('.a { color: #123456; }', 'src/theme.css');
      expect(has(f, 'hardcoded-color')).toBe(false);
    });
    it('ignores hex in a comment', () => {
      const f = scanContent('// brand is #ff0000 historically', 'Button.tsx');
      expect(has(f, 'hardcoded-color')).toBe(false);
    });
  });

  describe('hardcoded-spacing', () => {
    it('flags RN numeric padding', () => {
      const f = scanContent('const s = { padding: 16 };', 'Card.tsx');
      expect(has(f, 'hardcoded-spacing')).toBe(true);
    });
    it('flags a px literal in css', () => {
      const f = scanContent('.a { margin: 24px; }', 'a.css');
      expect(has(f, 'hardcoded-spacing')).toBe(true);
    });
    it('does NOT flag zero', () => {
      const f = scanContent('const s = { margin: 0 };', 'Card.tsx');
      expect(has(f, 'hardcoded-spacing')).toBe(false);
    });
    it('does NOT flag spacing inside a token file', () => {
      const f = scanContent('.a { padding: 16px; }', 'src/tokens.css');
      expect(has(f, 'hardcoded-spacing')).toBe(false);
    });
  });

  describe('mixed-library', () => {
    it('flags a file importing MUI + Ant', () => {
      const src = "import { Button } from '@mui/material';\nimport { Table } from 'antd';";
      const f = scanContent(src, 'Page.tsx');
      expect(has(f, 'mixed-library')).toBe(true);
    });
    it('does NOT flag a single library', () => {
      const src = "import { Button } from '@mui/material';";
      const f = scanContent(src, 'Page.tsx');
      expect(has(f, 'mixed-library')).toBe(false);
    });
  });

  describe('motion-no-reduced', () => {
    it('flags a css transition with no reduced-motion guard', () => {
      const f = scanContent('.a { transition: all 0.3s ease; }', 'a.css');
      expect(has(f, 'motion-no-reduced')).toBe(true);
    });
    it('does NOT flag when prefers-reduced-motion is present', () => {
      const src = '.a { transition: all 0.3s; }\n@media (prefers-reduced-motion: reduce) { .a { transition: none; } }';
      const f = scanContent(src, 'a.css');
      expect(has(f, 'motion-no-reduced')).toBe(false);
    });
    it('does NOT flag when useReducedMotion is used', () => {
      const src = "const r = useReducedMotion();\n<motion.div animate={{ x: 1 }} />";
      const f = scanContent(src, 'A.tsx');
      expect(has(f, 'motion-no-reduced')).toBe(false);
    });
  });

  describe('clean file', () => {
    it('returns no findings for token-driven code', () => {
      const src = "import { Button } from '@mui/material';\nconst s = { color: 'var(--fg)', padding: 'var(--space-4)' };";
      const f = scanContent(src, 'Button.tsx');
      expect(f.length).toBe(0);
    });
  });
});
