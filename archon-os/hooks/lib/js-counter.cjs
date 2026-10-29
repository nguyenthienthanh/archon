#!/usr/bin/env node
/**
 * Aura Frog — JS-side atomic counter mint.
 *
 * Increments a `.counters.json` counter under a mkdir-based lock that shares
 * the SAME `${file}.lock` path the bash `_lib.sh with_lock` uses, so JS hooks
 * (e.g. pre-dispatch-conflict-check minting CONFLICT-NNNNN) and bash mutators
 * (next_counter minting TASK/STORY/…) are mutually exclusive and never mint a
 * duplicate id. Write is atomic (tmp + rename).
 *
 * @version 1.0.0 (FEAT-007 / STORY-0029)
 */

'use strict';

const fs = require('fs');

function acquireLock(lockDir, { timeoutMs = 10000, spinMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { fs.mkdirSync(lockDir); return true; }
    catch (e) {
      if (e.code !== 'EEXIST') return false;
      // Stale-lock breaker: steal a lock older than the timeout (crashed holder).
      try {
        const age = Date.now() - fs.statSync(lockDir).mtimeMs;
        if (age > timeoutMs) { try { fs.rmdirSync(lockDir); } catch { /* raced */ } continue; }
      } catch { /* lock vanished — retry mkdir */ }
      if (Date.now() > deadline) return false;
      const until = Date.now() + spinMs;      // short sync spin; hooks are brief
      while (Date.now() < until) { /* wait */ }
    }
  }
}

function releaseLock(lockDir) { try { fs.rmdirSync(lockDir); } catch { /* best-effort */ } }

/**
 * Atomically increment counters.<kind> in `countersFile`. Returns the new
 * numeric value, or null if the lock could not be acquired.
 */
function nextCounter(countersFile, kind) {
  const lock = `${countersFile}.lock`;
  if (!acquireLock(lock)) return null;
  try {
    let data = {};
    try { data = JSON.parse(fs.readFileSync(countersFile, 'utf8')); } catch { data = {}; }
    if (!data.counters || typeof data.counters !== 'object') data.counters = {};
    const next = (data.counters[kind] || 0) + 1;
    data.counters[kind] = next;
    data.updated_at = new Date().toISOString();
    const tmp = `${countersFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, countersFile);
    return next;
  } catch {
    return null;
  } finally {
    releaseLock(lock);
  }
}

module.exports = { nextCounter, acquireLock, releaseLock };
