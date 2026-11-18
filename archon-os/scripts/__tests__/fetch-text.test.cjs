/**
 * Tests for archon-os/scripts/web/fetch-text.{sh,py} — plain main-content text
 * from a web page. Ladder: trafilatura -> bs4 -> stdlib html.parser. Must work
 * with neither library installed. No network in tests: --file only.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SH = path.join(__dirname, '../web/fetch-text.sh');
const VENV_PY = path.join(os.homedir(), '.local/share/archon-os/venv/bin/python');

const HTML = `<!doctype html><html><head><title>T</title><style>.x{color:red}</style>
<script>var SECRET_SCRIPT = 1;</script></head><body>
<nav>Home | About | Contact</nav>
<article><h1>Bounded debate</h1>
<p>Majority voting accounts for most of the gains attributed to multi-agent debate in this study of seven benchmarks.</p>
<p>Accuracy fell as the number of debate rounds increased from two to five across both model families.</p>
</article><footer>Copyright footer text</footer></body></html>`;

const fixture = () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-text-')), 'page.html');
  fs.writeFileSync(f, HTML);
  return f;
};

const run = (args, python) => spawnSync('bash', [SH, ...args], {
  encoding: 'utf8',
  env: { ...process.env, ARCHON_PYTHON: python },
});

const stdlibOnly = (() => {
  const r = spawnSync('python3', ['-I', '-c', 'import trafilatura'], { encoding: 'utf8' });
  return r.status !== 0;
})();

describe('fetch-text', () => {
  (stdlibOnly ? it : it.skip)('falls back to stdlib html.parser when no library is installed', () => {
    const r = run(['--file', fixture()], 'python3');
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/backend=stdlib/);
    expect(r.stdout).toContain('Majority voting accounts');
    expect(r.stdout).not.toContain('SECRET_SCRIPT');
    expect(r.stdout).not.toContain('color:red');
  });

  (fs.existsSync(VENV_PY) ? it : it.skip)('uses trafilatura when available and drops nav/footer boilerplate', () => {
    const r = run(['--file', fixture()], VENV_PY);
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/backend=trafilatura/);
    expect(r.stdout).toContain('Accuracy fell');
    expect(r.stdout).not.toContain('SECRET_SCRIPT');
    expect(r.stdout).not.toContain('Home | About');
  });

  it('rejects non-http(s) URLs', () => {
    const r = run(['file:///etc/passwd'], 'python3');
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
  });

  it('exits 2 with usage when given nothing', () => {
    expect(run([], 'python3').status).toBe(2);
  });
});
