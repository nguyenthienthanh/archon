module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__', '<rootDir>/archon-os/hooks/lib/__tests__', '<rootDir>/archon-os/scripts/__tests__'],
  testMatch: ['**/*.test.cjs'],

  // Strips the host's own plugin configuration out of every worker's env. The
  // suite is normally run from inside a Claude Code session running this plugin,
  // so without it a test asserting an unconfigured default reads the developer's
  // live session instead. See the header of jest.setup.cjs.
  setupFiles: ['<rootDir>/jest.setup.cjs'],

  // Worker fan-out is the plugin's main RAM lever, and it scales with the
  // machine: jest's default is cpu-1 full node processes, so the same suite
  // costs 9 workers on a 10-core box and 15 on a 16-core one — which is why
  // memory pressure showed up on some machines and not others.
  //
  // Most suites here spawn shells and hit the filesystem rather than burning
  // CPU, so the default over-subscribes and the workers contend: measured on a
  // 10-core M-series, 1150 tests take 44.3s at cpu-1 and 30.3s at 50%. Half the
  // cores is both faster and bounded.
  maxWorkers: '50%',
  // Restart a worker that grows past this instead of letting a leak ride to the
  // end of the run — bounds worst-case tree RSS to maxWorkers × limit.
  workerIdleMemoryLimit: '512MB',
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/__tests__/'],
  collectCoverageFrom: [
    'archon-os/hooks/*.cjs',
    'archon-os/hooks/lib/*.cjs',
    '!archon-os/hooks/.eslintrc.cjs',
  ],
  // No-regression gate: each floor sits just under the CURRENT measured level,
  // so a drop fails CI while normal run-to-run jitter does not.
  //
  // `functions` was 40 — a level never actually reached. It failed every run
  // since at least 2026-07-14 (32.32%, then 32.63% after six new hook suites),
  // so the gate reported red permanently and therefore signalled nothing. Reset
  // to the measured floor (32.63% observed, range 32.32–33.24) to restore the
  // regression signal it was written to provide.
  //
  // Why 40 is out of reach by writing tests alone: 24 of the 49 hooks have no
  // module.exports — they execute main() on require, so their ~77 functions
  // (~18% of scope) cannot be unit-tested at all. Ratchet this floor up as the
  // FEAT-007 hook-runtime refactor makes those hooks importable (issues #5, #22);
  // target stays 60%.
  coverageThreshold: {
    global: {
      statements: 25,
      branches: 20,
      functions: 32,
      lines: 25,
    },
  },
};
