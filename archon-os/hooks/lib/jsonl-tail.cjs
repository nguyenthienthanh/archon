'use strict';
/**
 * Aura Frog — Bounded JSONL Tail Reader
 *
 * Append-only stores (.claude/plans/history.jsonl, conflicts.jsonl) grow without
 * bound, yet every Stop-registered reader only cares about the newest events
 * ("was there an execution_completed in the last 60s?"). Slurping the whole file
 * and .split('\n')-ing it costs ~2x the file size in peak RSS — three times per
 * Stop, inside one dispatch process.
 *
 * readJsonlTail() reads at most `maxBytes` from the END of the file, so cost is
 * bounded by the window instead of by history length. When the read is
 * truncated the first line is almost certainly cut in half, so it is dropped.
 *
 * Lines come back oldest-first (same order as the file), matching what the
 * newest-first scanners in the reader hooks already expect.
 */

const fs = require('node:fs');
const { StringDecoder } = require('node:string_decoder');

// 512 KB ≈ tens of thousands of plan events — far beyond any reader's window,
// while capping worst-case RSS at ~1 MB instead of "however big history got".
const DEFAULT_MAX_BYTES = 512 * 1024;

/**
 * Read the trailing window of a JSONL file as an array of non-empty lines.
 *
 * @param {string} file           path to the .jsonl file
 * @param {object} [opts]
 * @param {number} [opts.maxBytes] size of the trailing window (default 512 KB)
 * @param {number} [opts.maxLines] keep at most this many trailing lines
 * @returns {string[]} lines, oldest-first; [] when missing/unreadable/empty
 */
function readJsonlTail(file, opts = {}) {
  const maxBytes = opts.maxBytes || DEFAULT_MAX_BYTES;
  let fd;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return []; // missing or unreadable — fail open, same as the old existsSync guard
  }

  try {
    const size = fs.fstatSync(fd).size;
    if (size === 0) return [];

    const truncated = size > maxBytes;
    const start = truncated ? size - maxBytes : 0;
    const length = size - start;

    const buf = Buffer.allocUnsafe(length);
    let filled = 0;
    while (filled < length) {
      const n = fs.readSync(fd, buf, filled, length - filled, start + filled);
      if (n <= 0) break;
      filled += n;
    }

    // StringDecoder, not buf.toString(): a truncated read can start mid
    // multi-byte sequence, and toString() would emit a replacement char.
    const decoder = new StringDecoder('utf8');
    const text = decoder.write(buf.subarray(0, filled)) + decoder.end();

    let lines = text.split('\n');
    // Truncated read → the first line is a fragment of a real record. Drop it.
    if (truncated) lines.shift();

    lines = lines.filter(Boolean);
    if (opts.maxLines && lines.length > opts.maxLines) {
      lines = lines.slice(lines.length - opts.maxLines);
    }
    return lines;
  } catch {
    return [];
  } finally {
    try { fs.closeSync(fd); } catch {/* best-effort */}
  }
}

module.exports = { readJsonlTail, DEFAULT_MAX_BYTES };
