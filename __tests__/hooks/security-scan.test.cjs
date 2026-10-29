/**
 * Tests for archon-os/hooks/security-scan.cjs
 * Pure-function tests via require()-from-source.
 */

const {
  PATTERNS,
  SCANNABLE,
  scanContent,
  isScannable,
} = require('../../archon-os/hooks/security-scan.cjs');

describe('security-scan', () => {
  describe('isScannable', () => {
    it('true for .js', () => expect(isScannable('foo.js')).toBe(true));
    it('true for .ts', () => expect(isScannable('foo.ts')).toBe(true));
    it('true for .py', () => expect(isScannable('foo.py')).toBe(true));
    it('true for .go', () => expect(isScannable('main.go')).toBe(true));
    it('false for .md', () => expect(isScannable('readme.md')).toBe(false));
    it('false for .json', () => expect(isScannable('package.json')).toBe(false));
    it('case-insensitive', () => expect(isScannable('Foo.JS')).toBe(true));
  });

  describe('scanContent — secrets', () => {
    it('flags AWS access key', () => {
      const f = scanContent('const key = "AKIAIOSFODNN7EXAMPLE";');
      expect(f.some(x => x.category === 'secrets' && /AWS/.test(x.msg))).toBe(true);
    });
    it('flags GitHub PAT', () => {
      const f = scanContent('const t = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";');
      expect(f.some(x => x.category === 'secrets')).toBe(true);
    });
    it('flags OpenAI sk- key', () => {
      const f = scanContent('const k = "sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";');
      expect(f.some(x => x.category === 'secrets')).toBe(true);
    });
    it('flags hardcoded password', () => {
      const f = scanContent('const password = "supersecret123";');
      expect(f.some(x => x.category === 'secrets')).toBe(true);
    });
    it('flags RSA private key', () => {
      const f = scanContent('-----BEGIN RSA PRIVATE KEY-----');
      expect(f.some(x => x.category === 'secrets')).toBe(true);
    });
  });

  describe('scanContent — injection', () => {
    it('flags SQL injection — interpolation before SQL keyword', () => {
      // Regex requires ${...} before SQL verb (matches mid-line concatenations
      // where userInput is spliced ahead of the query).
      const f = scanContent('const q = `${userInput} SELECT * FROM users`;');
      expect(f.some(x => x.category === 'injection')).toBe(true);
    });
    it('flags exec with interpolation', () => {
      const f = scanContent('exec(`ls ${userInput}`)');
      expect(f.some(x => x.category === 'injection')).toBe(true);
    });
  });

  describe('scanContent — xss', () => {
    it('flags innerHTML assignment', () => {
      const f = scanContent('el.innerHTML = userInput;');
      expect(f.some(x => x.category === 'xss')).toBe(true);
    });
    it('flags dangerouslySetInnerHTML', () => {
      const f = scanContent('<div dangerouslySetInnerHTML={{__html: x}} />');
      expect(f.some(x => x.category === 'xss')).toBe(true);
    });
  });

  describe('scanContent — crypto', () => {
    it('flags MD5', () => {
      expect(scanContent("createHash('md5')").some(x => x.category === 'crypto')).toBe(true);
    });
    it('flags SHA1', () => {
      expect(scanContent("createHash('sha1')").some(x => x.category === 'crypto')).toBe(true);
    });
    it('flags Math.random used near a secret keyword', () => {
      // Regex requires Math.random() THEN a secret word on the same line.
      expect(scanContent('const x = Math.random() + " for token generation";').some(x => x.category === 'crypto')).toBe(true);
    });
  });

  describe('scanContent — comment handling', () => {
    it('ignores // line comments', () => {
      expect(scanContent('// const password = "secret123";')).toEqual([]);
    });
    it('ignores # line comments', () => {
      expect(scanContent('# const password = "secret123"')).toEqual([]);
    });
    it('ignores JSDoc * lines', () => {
      expect(scanContent('  * const password = "secret123";')).toEqual([]);
    });
  });

  describe('PATTERNS / SCANNABLE structure', () => {
    it('PATTERNS has 4 categories', () => {
      expect(Object.keys(PATTERNS).sort()).toEqual(['crypto', 'injection', 'secrets', 'xss']);
    });
    it('every pattern has re + msg', () => {
      for (const list of Object.values(PATTERNS)) {
        for (const p of list) {
          expect(p.re).toBeInstanceOf(RegExp);
          expect(typeof p.msg).toBe('string');
        }
      }
    });
    it('SCANNABLE contains code extensions', () => {
      ['.js', '.ts', '.py', '.go', '.rb'].forEach(e => expect(SCANNABLE.has(e)).toBe(true));
    });
    it('SCANNABLE excludes config extensions', () => {
      ['.json', '.yaml', '.md'].forEach(e => expect(SCANNABLE.has(e)).toBe(false));
    });
  });
});
