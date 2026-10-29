/**
 * STORY-0023 — _json_escape (_lib.sh) used by promote-node.sh history events.
 * The old promote note escaping only handled '"' (via ${NOTE//"/\"}), so a note
 * containing a backslash produced invalid JSON in history.jsonl. _json_escape
 * now handles backslash, quote, and control chars.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LIB = path.join(process.cwd(), 'archon-os', 'scripts', 'plans', '_lib.sh');

function jsonEscape(input, { forceSedFallback = false } = {}) {
  const env = { ...process.env, INPUT: input };
  let stubDir;
  if (forceSedFallback) {
    // Shadow python3 with a stub that exits 1 (keeping real PATH for sed),
    // so _json_escape falls through to its sed branch.
    stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-'));
    fs.writeFileSync(path.join(stubDir, 'python3'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    env.PATH = `${stubDir}:${process.env.PATH}`;
  }
  const p = spawnSync('bash', ['-c', `source "${LIB}"; _json_escape "$INPUT"`],
    { encoding: 'utf8', env });
  if (stubDir) fs.rmSync(stubDir, { recursive: true, force: true });
  return p.stdout;
}

describe('_json_escape produces valid JSON string content', () => {
  const tricky = 'a\\b"c\tend'; // backslash, double-quote, tab

  it('python3 path round-trips through JSON.parse', () => {
    const escaped = jsonEscape(tricky);
    expect(JSON.parse(`"${escaped}"`)).toBe(tricky);
  });

  it('sed fallback (no python3) still yields parseable JSON for backslash+quote', () => {
    const simple = 'a\\b"c'; // sed fallback handles \ and " (not control chars)
    const escaped = jsonEscape(simple, { forceSedFallback: true });
    expect(JSON.parse(`"${escaped}"`)).toBe(simple);
  });

  it('a plain note is unchanged', () => {
    expect(jsonEscape('promoted for scope growth')).toBe('promoted for scope growth');
  });
});
