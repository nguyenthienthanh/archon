/**
 * Tests for archon-os/hooks/lib/af-exec.cjs
 *
 * The point of this module is that a subprocess limit breach becomes VISIBLE
 * instead of being swallowed by a bare catch, so that is what is asserted.
 */

const { execSync } = require('child_process');
const {
  classifyExecError,
  warnExecLimit,
  TIMEOUT_QUICK_MS,
  TIMEOUT_DEFAULT_MS,
  TIMEOUT_SLOW_MS,
  MAX_BUFFER_DEFAULT,
  MAX_BUFFER_LARGE,
} = require('../af-exec.cjs');

describe('af-exec', () => {
  describe('classifyExecError', () => {
    it('classifies ENOBUFS as a buffer breach', () => {
      expect(classifyExecError({ code: 'ENOBUFS' })).toBe('buffer');
    });

    it('classifies ETIMEDOUT as a timeout', () => {
      expect(classifyExecError({ code: 'ETIMEDOUT' })).toBe('timeout');
    });

    it('classifies a killed child as a timeout', () => {
      expect(classifyExecError({ killed: true })).toBe('timeout');
    });

    it('returns null for an ordinary failure (command not found)', () => {
      expect(classifyExecError({ code: 'ENOENT' })).toBeNull();
    });

    it('returns null for a non-zero exit', () => {
      expect(classifyExecError({ status: 1 })).toBeNull();
    });

    it('returns null for null/undefined', () => {
      expect(classifyExecError(null)).toBeNull();
      expect(classifyExecError(undefined)).toBeNull();
    });
  });

  describe('warnExecLimit', () => {
    let spy;
    beforeEach(() => { spy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
    afterEach(() => { spy.mockRestore(); });

    it('warns on stderr for a timeout', () => {
      expect(warnExecLimit('probe', { killed: true })).toBe('timeout');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][0])).toContain('probe');
    });

    it('warns on stderr for a maxBuffer overflow', () => {
      expect(warnExecLimit('probe', { code: 'ENOBUFS' })).toBe('buffer');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('stays silent for an ordinary failure', () => {
      expect(warnExecLimit('probe', { code: 'ENOENT' })).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('limit constants', () => {
    it('orders the timeout tiers quick < default < slow', () => {
      expect(TIMEOUT_QUICK_MS).toBeLessThan(TIMEOUT_DEFAULT_MS);
      expect(TIMEOUT_DEFAULT_MS).toBeLessThan(TIMEOUT_SLOW_MS);
    });

    it('raises both maxBuffer tiers above Node\'s 1MB default', () => {
      expect(MAX_BUFFER_DEFAULT).toBeGreaterThan(1024 * 1024);
      expect(MAX_BUFFER_LARGE).toBeGreaterThan(MAX_BUFFER_DEFAULT);
    });
  });

  describe('real subprocess behaviour', () => {
    // The whole reason for the change: without `timeout` this call never returns.
    it('a timeout actually kills a hung child and is classified as such', () => {
      let err = null;
      try {
        execSync('sleep 10', { timeout: 250, killSignal: 'SIGKILL', stdio: 'ignore' });
      } catch (e) { err = e; }
      expect(err).not.toBeNull();
      expect(classifyExecError(err)).toBe('timeout');
    });

    it('a maxBuffer overflow is classified as a buffer breach', () => {
      let err = null;
      try {
        execSync('printf "%0.sx" $(seq 1 5000)', { maxBuffer: 64, encoding: 'utf8' });
      } catch (e) { err = e; }
      expect(err).not.toBeNull();
      expect(classifyExecError(err)).toBe('buffer');
    });
  });
});
