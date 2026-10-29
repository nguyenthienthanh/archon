#!/usr/bin/env node
/**
 * Archon OS — Code Map Digest Hook (FEAT-F)
 *
 * Fires: SessionStart (--session-start) and PostToolUse on Write|Edit (--post-tool-use)
 *
 * Two jobs, and deliberately no third:
 *
 *   --session-start    Inject a small digest that says WHERE TO GREP. The map
 *                      itself stays on disk (the 121k-LOC graph serialises to
 *                      ~128 KB, 13x over the 10,000-char injection cap), so
 *                      only the digest crosses into context, budgeted and
 *                      tiered — a section that does not fit is dropped BY NAME
 *                      in the text, never silently truncated.
 *   --post-tool-use    Queue the edited file for re-extraction. One append to
 *                      .claude/cache/code-map.dirty; no map read, no parse, no
 *                      rescan. The next reader drains the queue.
 *
 * Reverse-dependency lookup is ON DEMAND only:
 *
 *   node hooks/code-map-digest.cjs --rdeps <path> [--depth N]
 *
 * It is the one question grep cannot answer — grep returns text matches, not a
 * dependency closure — so it is also the one thing worth asking the map. It is
 * never run at startup: the digest advertises it, nothing more.
 *
 * Other modes: --rebuild (regenerate the cache), --digest (print it), --check
 * (freshness probe, exit 3 when stale).
 *
 * Zero LLM tokens, zero dependencies, zero native modules. The map is a derived
 * cache: delete .claude/cache/code-map.json and it regenerates.
 *
 * Disable: AF_CODE_MAP_DISABLED=true
 *
 * Exit Codes:
 *   0 - Success (non-blocking)
 *   1 - Bad usage
 *   3 - Disabled, or --check found the cache stale
 *
 * @version 1.0.0
 */

const codeMap = require('./lib/code-map.cjs');
const { findProjectRoot, readHookInputCompat } = require('./lib/hook-runtime.cjs');

/** PostToolUse payload → the edited file, or null. */
function editedFile(input) {
  const ti = input && input.tool_input;
  if (ti && typeof ti.file_path === 'string' && ti.file_path) return ti.file_path;
  const tr = input && input.tool_response;
  if (tr && typeof tr.filePath === 'string' && tr.filePath) return tr.filePath;
  return null;
}

function sessionStart(root) {
  const map = codeMap.currentMap(root);
  if (!map || Object.keys(map.files).length === 0) return;
  const digest = codeMap.buildDigest(root, map);
  // Belt and braces: the budget already sits under the cap, but a hook that
  // emits one character over the cap loses the whole injection.
  if (digest.chars > codeMap.HOOK_CHAR_CAP) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: digest.text },
  }));
}

function main() {
  const mode = process.argv[2] || '--session-start';
  const root = findProjectRoot();

  // Hook modes must never fail a session, so being disabled is a silent exit 0.
  // The CLI modes report it as exit 3 instead (see code-map.cjs#cli), because a
  // human or skill asking for a lookup deserves to know why it got nothing.
  if (codeMap.isDisabled() && (mode === '--session-start' || mode === '--post-tool-use')) {
    process.exit(0);
  }

  if (mode === '--session-start') {
    try { sessionStart(root); } catch { /* never block startup on a cache */ }
    process.exit(0);
  }

  if (mode === '--post-tool-use') {
    try {
      const input = readHookInputCompat();
      const file = editedFile(input);
      if (file) codeMap.markDirty(root, file);
    } catch { /* best-effort queue append */ }
    process.exit(0);
  }

  const { code, out } = codeMap.cli(process.argv.slice(2), root);
  if (out) process.stdout.write(out);
  process.exit(code);
}

if (require.main === module) {
  main();
} else {
  module.exports = { editedFile, sessionStart };
}
