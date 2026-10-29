'use strict';

/**
 * tool-context.cjs — pure readers for the PreToolUse/PostToolUse stdin payload.
 *
 * STORY-0010 (FEAT-007 / issue #7): three telemetry hooks — tool-call-tracer,
 * post-execute-update-node, tdd-red-failure-tracker — historically read the tool
 * name / command / exit code / duration from `CLAUDE_TOOL_*` environment
 * variables the hook API never actually sets, so they always saw the defaults.
 * The data lives in the hook's stdin JSON instead. These helpers extract it.
 *
 * Contract (documented Claude Code hook schema):
 *   - tool_name        top-level string
 *   - tool_input       top-level object (Bash → {command,...}; Read/Write/Edit → {file_path,...})
 *   - tool_response    PostToolUse object; for Bash carries {stdout, stderr, exit_code}
 *   - exit_code        duplicated at top level (same value as tool_response.exit_code)
 *   - duration         top-level number, SECONDS (float)
 *
 * Each reader takes ONLY the parsed stdin object and returns null when the field
 * is absent — never a default. That lets callers fall back to the legacy env var
 * without a present-but-zero exit code being mistaken for "missing" (0 is a valid
 * exit code). Callers keep the env fallback so a host that does not populate the
 * payload retains the pre-migration behaviour: this migration cannot regress.
 *
 * NOTE (duration units): `duration` is documented as seconds; the seconds→ms
 * conversion here is the one field not yet confirmed by a live-session probe.
 * It feeds telemetry only (trace duration_ms), so a unit error cannot change any
 * control-flow decision — unlike exit_code, which gates failed/RED classification.
 */

// Pure: the invoking tool's name, or null when absent. Accepts the legacy `tool`
// alias some older payloads used before the field was renamed to `tool_name`.
function readToolName(input) {
  if (!input) return null;
  if (typeof input.tool_name === 'string' && input.tool_name) return input.tool_name;
  if (typeof input.tool === 'string' && input.tool) return input.tool;
  return null;
}

// Pure: the command/return code. Prefers the event-specific tool_response.exit_code,
// then the top-level duplicate. Returns null (not 0) when neither is present, so a
// real exit 0 is distinguishable from "no exit code in this payload".
function readExitCode(input) {
  if (!input) return null;
  const tr = input.tool_response;
  if (tr && typeof tr.exit_code === 'number') return tr.exit_code;
  if (typeof input.exit_code === 'number') return input.exit_code;
  return null;
}

// Pure: the Bash command string from tool_input, or null.
function readCommand(input) {
  const ti = input && input.tool_input;
  return (ti && typeof ti.command === 'string') ? ti.command : null;
}

// Pure: the full tool_input serialised (the tracer hashes this and extracts a
// Read's file_path from it). Returns null when tool_input is absent/unserialisable.
function readArgs(input) {
  const ti = input && input.tool_input;
  if (ti && typeof ti === 'object') {
    try { return JSON.stringify(ti); } catch { return null; }
  }
  return null;
}

// Pure: wall-clock duration in milliseconds, converted from the documented
// seconds float. Returns null when absent or non-finite.
function readDurationMs(input) {
  if (input && typeof input.duration === 'number' && Number.isFinite(input.duration)) {
    return Math.round(input.duration * 1000);
  }
  return null;
}

module.exports = { readToolName, readExitCode, readCommand, readArgs, readDurationMs };
