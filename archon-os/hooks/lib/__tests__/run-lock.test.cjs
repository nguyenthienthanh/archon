/**
 * Tests for archon-os/hooks/lib/run-lock.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { acquireRunLock, isStaleLock, isPidAlive, DEFAULT_STALE_MS } = require('../run-lock.cjs');

let dir;
let lockPath;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-lock-'));
  lockPath = path.join(dir, 'nested', 'run.lock');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('run-lock', () => {
  describe('isPidAlive', () => {
    it('is true for this process', () => {
      expect(isPidAlive(process.pid)).toBe(true);
    });
    it('is false for a pid that cannot exist', () => {
      expect(isPidAlive(2 ** 31 - 1)).toBe(false);
    });
    it('is false for garbage input', () => {
      expect(isPidAlive(0)).toBe(false);
      expect(isPidAlive(-1)).toBe(false);
      expect(isPidAlive('abc')).toBe(false);
      expect(isPidAlive(undefined)).toBe(false);
    });
  });

  describe('isStaleLock', () => {
    it('treats a live, fresh lock as held', () => {
      expect(isStaleLock({ pid: process.pid, ts: Date.now() })).toBe(false);
    });
    it('treats a dead owner as stale', () => {
      expect(isStaleLock({ pid: 2 ** 31 - 1, ts: Date.now() })).toBe(true);
    });
    it('treats an expired lock as stale even with a live owner', () => {
      expect(isStaleLock({ pid: process.pid, ts: Date.now() - DEFAULT_STALE_MS - 1 })).toBe(true);
    });
    it('treats an unreadable/corrupt lock as stale', () => {
      expect(isStaleLock(null)).toBe(true);
      expect(isStaleLock('nonsense')).toBe(true);
      expect(isStaleLock({ pid: process.pid })).toBe(true);
    });
  });

  describe('acquireRunLock', () => {
    it('grants the lock and creates the file, mkdir -p included', () => {
      const release = acquireRunLock(lockPath);
      expect(typeof release).toBe('function');
      expect(fs.existsSync(lockPath)).toBe(true);
      release();
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    // The single-flight property: concurrent Writes must not stack linters.
    it('refuses a second acquire while the first is held', () => {
      const first = acquireRunLock(lockPath);
      expect(first).not.toBeNull();
      expect(acquireRunLock(lockPath)).toBeNull();
      first();
      expect(acquireRunLock(lockPath)).not.toBeNull();
    });

    it('reclaims a lock whose owner PID is gone', () => {
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      fs.writeFileSync(lockPath, JSON.stringify({ pid: 2 ** 31 - 1, ts: Date.now() }));
      const release = acquireRunLock(lockPath);
      expect(release).not.toBeNull();
      expect(JSON.parse(fs.readFileSync(lockPath, 'utf-8')).pid).toBe(process.pid);
      release();
    });

    it('reclaims a lock older than staleMs', () => {
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() - 10000 }));
      expect(acquireRunLock(lockPath, { staleMs: 1000 })).not.toBeNull();
    });

    it('reclaims a corrupt lock file', () => {
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      fs.writeFileSync(lockPath, 'not json at all');
      const release = acquireRunLock(lockPath);
      expect(release).not.toBeNull();
      release();
    });

    it('release is idempotent and does not delete a lock taken over by someone else', () => {
      const release = acquireRunLock(lockPath);
      release();
      // Someone else now owns it.
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid + 1, ts: Date.now() }));
      release(); // second call must be a no-op
      expect(fs.existsSync(lockPath)).toBe(true);
    });
  });
});
