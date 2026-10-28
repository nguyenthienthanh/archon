#!/usr/bin/env node

/**
 * dispatch.cjs — run several hook scripts inside ONE node process.
 *
 * WHY THIS EXISTS
 * ---------------
 * hooks.json used to register 54 separate `node <script>.cjs` commands. A
 * single Read tool call fired 5 of them on PreToolUse alone; measured on a
 * 48GB M-series box that was ~536ms wall and ~45MB peak RSS *per script* —
 * pure interpreter boot, repeated. Multiply by PostToolUse, by the eh plugin's
 * own 31 hooks, and by the 5-7 parallel subagents an /eh:autopilot or
 * /eh:code-review run fans out to, and hook boot dominates both latency and
 * page-fault pressure.
 *
 * Node boot is ~40ms of each script's ~58ms. Folding N scripts into one
 * process removes (N-1) boots.
 *
 * HOW IT WORKS
 * ------------
 * Every hook script in this directory (49 of 50) ends with the standard
 * `if (require.main === module) main()` guard and reads its payload through
 * lib/safe-stdin.cjs. So we can:
 *   1. read fd 0 once, into RAW;
 *   2. seed the require cache with a safe-stdin whose readStdinSafely()
 *      replays RAW (fd 0 is drained after the first read — replaying is the
 *      whole trick), and patch fs.readFileSync(0) for the 5 scripts that
 *      bypass the lib;
 *   3. load each script with process.mainModule pointed at it, so its
 *      require.main guard fires;
 *   4. intercept process.exit so one script exiting doesn't kill the rest.
 *
 * EXIT SEMANTICS
 * --------------
 * Claude Code treats exit 2 as "block the tool call" and shows stderr to the
 * model; any other non-zero exit is a non-blocking warning. We preserve both:
 * the first script to exit 2 wins, its stderr is forwarded, and remaining
 * scripts are skipped (the tool call is already dead). A warn-only exit (1)
 * does NOT cancel the rest of the chain — before dispatch each hook was its
 * own hooks.json entry and ran regardless of its siblings' codes; the first
 * warn code becomes the chain's exit code once every hook has run.
 *
 * KNOWN LIMIT: exit codes are read after each hook's *synchronous* part. A
 * hook that calls process.exit(2) from a timer or promise callback cannot
 * block or fail the chain — the code lands after the chain result is latched.
 * No shipped hook blocks asynchronously today; if one ever must, register it
 * as its own hooks.json entry instead of a dispatch spec.
 *
 * WAITING FOR ASYNC WORK
 * ----------------------
 * We do not wait between hooks, and the process is never force-exited on the
 * happy path. Each hook's synchronous part runs to completion, then the next
 * starts; whatever async work a hook left behind drains on the shared event
 * loop and the process exits naturally once it is done — the same lifetime the
 * hook had when it owned its own process.
 *
 * Waiting per hook was tried and removed. Only 44 of 50 hooks call
 * process.exit; for the other six (prompt-reminder is one, and it runs on every
 * UserPromptSubmit) there is no completion signal to wait for, so any bounded
 * wait cost the full timeout on every prompt. Watching live handles instead
 * does not work either: a timer left behind by an earlier hook sits in the next
 * hook's baseline, so when that straggler fires the next hook looks finished
 * and gets cut short.
 *
 * SAFETY
 * ------
 * Blast radius is every tool call in every session, so:
 *   - AF_DISPATCH_DISABLED=1 falls back to spawning each script as before;
 *   - a dispatcher-level crash falls back to spawning, but only if no hook has
 *     run yet — re-running hooks would repeat their side effects;
 *   - an unref'd watchdog (AF_DISPATCH_TIMEOUT_MS, default 5000) force-exits if
 *     a hook leaks a live handle, so a leak cannot wedge the user's tool call.
 *
 * USAGE (from hooks.json)
 *   node dispatch.cjs scout-block pre-flight-validate
 *   node dispatch.cjs '>tool-call-tracer+CLAUDE_HOOK_PHASE=pre' auto-learn
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { spawnSync } = require("node:child_process");
const { AsyncLocalStorage } = require("node:async_hooks");

// Captured before anything patches process.exit.
const REAL_EXIT = process.exit.bind(process);

// Tags every async continuation a hook schedules with that hook's state, so a
// process.exit fired from a stray timer is attributed to the hook that armed
// it rather than to whichever hook is running when it lands.
const hookContext = new AsyncLocalStorage();

// Overridable so tests can point at fixture hooks instead of the real ones.
const HOOK_DIR = process.env.AF_DISPATCH_HOOK_DIR || __dirname;
const TIMEOUT_MS = Number(process.env.AF_DISPATCH_TIMEOUT_MS || 5000);

/**
 * Parse a spec into {name, file, env, mergeStderr}.
 *
 *   name                     plain
 *   name+KEY=VAL,KEY2=VAL2   per-script env
 *   >name                    merge this script's stderr into stdout
 *
 * The `>` form reproduces the `2>&1` that some — but not all — of the original
 * per-script commands carried. It matters: on PreToolUse, stderr is what Claude
 * Code shows the model when a hook blocks, so silently merging or un-merging a
 * script's stream changes what the model sees.
 */
function parseSpec(rawSpec) {
  const mergeStderr = rawSpec.startsWith(">");
  const spec = mergeStderr ? rawSpec.slice(1) : rawSpec;
  const [name, envPart] = spec.split("+");
  const env = {};
  if (envPart) {
    for (const pair of envPart.split(",")) {
      const eq = pair.indexOf("=");
      if (eq > 0) env[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
  const base = name.endsWith(".cjs") ? name : `${name}.cjs`;
  return { name, file: path.join(HOOK_DIR, base), env, mergeStderr };
}

class ExitSentinel extends Error {
  /**
   * `owner` is the hook state that was current when exit() was called. A hook
   * can call exit from a timer long after its turn ended, and that sentinel
   * must not be credited to whichever hook happens to be running when it
   * lands.
   */
  constructor(code, owner) {
    super(`hook exit ${code}`);
    this.code = code === undefined ? 0 : Number(code);
    this.owner = owner;
  }
}

/**
 * Replay-able stdin. fd 0 can only be drained once, but each script expects to
 * read the full payload, so we hand every script the same buffered copy.
 */
function seedStdin(raw) {
  const libPath = require.resolve("./lib/safe-stdin.cjs");
  const real = require(libPath);

  const patched = {
    ...real,
    readStdinSafely: () => raw,
    readPromptFromStdin: () => {
      if (!raw) return process.env.CLAUDE_USER_PROMPT || "";
      const data = real.parseStdinJson(raw);
      if (data && typeof data === "object")
        return data.prompt || data.user_prompt || "";
      return raw;
    },
    // The real watchdog force-exits the process, which under dispatch would
    // take the sibling hooks with it. Downgrade it to this hook's own exit.
    installWatchdog: (ms, code = 0) => {
      const t = setTimeout(() => process.exit(code), ms);
      if (typeof t.unref === "function") t.unref();
      return t;
    },
  };

  require.cache[libPath] = {
    id: libPath,
    filename: libPath,
    loaded: true,
    exports: patched,
    paths: [],
    children: [],
  };

  const realReadFileSync = fs.readFileSync;
  fs.readFileSync = function (target, ...rest) {
    if (target === 0 || target === "/dev/stdin") {
      const enc =
        typeof rest[0] === "string" ? rest[0] : rest[0] && rest[0].encoding;
      return enc ? raw : Buffer.from(raw);
    }
    return realReadFileSync.call(this, target, ...rest);
  };
}

/** Load one script with its require.main guard satisfied. */
function loadHook(file) {
  const m = new Module(file, null);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const savedMain = process.mainModule;
  process.mainModule = m;
  try {
    m.load(file);
  } finally {
    process.mainModule = savedMain;
  }
}

function runInProcess(specs, progress) {
  // Only exit 2 blocks (Claude Code's contract); it aborts the rest of the
  // chain, matching the fact that the tool call is already dead. Any other
  // non-zero exit is a warning: forward it as the chain's exit code, but keep
  // running the remaining hooks — before dispatch, each hook was its own
  // hooks.json entry and a warn-only exit(1) never cancelled its siblings
  // (scope-drift, security-scan and design-conformance all exit 1 routinely).
  let blocked = null;
  let firstWarn = 0;

  for (const spec of specs) {
    if (blocked) break;
    if (!fs.existsSync(spec.file)) continue;

    const savedEnv = {};
    for (const [k, v] of Object.entries(spec.env)) {
      savedEnv[k] = process.env[k];
      process.env[k] = v;
    }

    const state = { exited: false, code: 0, name: spec.name };
    progress.current = state;
    progress.ran += 1;

    // Anything the script logs while unwinding from a swallowed sentinel is an
    // artefact of this dispatcher, not a real hook message. Its genuine output
    // was already written before it called exit.
    const realStderrWrite = process.stderr.write.bind(process.stderr);
    const sink = spec.mergeStderr
      ? process.stdout.write.bind(process.stdout)
      : realStderrWrite;
    process.stderr.write = (chunk, ...rest) =>
      state.exited ? true : sink(chunk, ...rest);

    try {
      hookContext.run(state, () => loadHook(spec.file));
    } catch (err) {
      if (err instanceof ExitSentinel) {
        // Latched in the exit interceptor; nothing more to record.
      } else {
        // Sync crash: treat as non-blocking, same as each hook's own catch-all
        // which exits 0 rather than wedging the tool call.
        realStderrWrite(
          `dispatch: ${spec.name} error: ${err && err.message}\n`,
        );
      }
    }

    progress.current = null;
    process.stderr.write = realStderrWrite;
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }

    if (state.code === 2) blocked = { spec, code: state.code };
    else if (state.code !== 0 && !firstWarn) firstWarn = state.code;
  }

  return blocked ? blocked.code : firstWarn;
}

/** Original behaviour: one child process per script. Used as the safety net. */
function runSpawned(specs, raw) {
  let firstWarn = 0;
  for (const spec of specs) {
    if (!fs.existsSync(spec.file)) continue;
    // NOT minimised through lib/af-child-env.cjs, unlike lint-autofix's linter
    // spawn. The children here are this plugin's own hooks, several of which
    // exist to use exactly the credentials that filter strips: jira-auto-fetch
    // needs JIRA_API_TOKEN, the learning hooks need SUPABASE_SECRET_KEY.
    // Stripping them would break those hooks on the spawn path only — and buy
    // nothing, since runInProcess (the default) runs the same code in this very
    // process with the full environment already.
    const res = spawnSync(process.execPath, [spec.file], {
      input: raw,
      env: { ...process.env, ...spec.env },
      stdio: ["pipe", "inherit", spec.mergeStderr ? 1 : "inherit"],
      timeout: TIMEOUT_MS,
    });
    // Same semantics as runInProcess: exit 2 blocks and aborts; any other
    // non-zero is a warning that must not cancel the remaining hooks.
    if (res.status === 2) return 2;
    if (res.status && !firstWarn) firstWarn = res.status;
  }
  return firstWarn;
}

/**
 * Hand the exit code to node rather than exiting outright, so buffered stdout
 * flushes and any async work the hooks left behind still runs. The watchdog is
 * unref'd: it cannot hold the process open by itself, but if a hook leaked a
 * live handle it will fire and cut the process loose.
 */
function finish(code) {
  process.exitCode = code;
  const guard = setTimeout(() => REAL_EXIT(code), TIMEOUT_MS);
  if (typeof guard.unref === "function") guard.unref();
}

function main() {
  // Universal Passive Environment Hydration (12-Factor, zero shell eval)
  try {
    const { loadProjectEnv } = require('./lib/env-resolver.cjs');
    loadProjectEnv();
  } catch { /* non-blocking */ }

  const specs = process.argv.slice(2).filter(Boolean).map(parseSpec);
  if (specs.length === 0) REAL_EXIT(0);

  let raw = "";
  try {
    const st = fs.fstatSync(0);
    if (st.isFIFO() || st.isFile() || st.isSocket())
      raw = fs.readFileSync(0, "utf-8");
  } catch {
    raw = "";
  }

  if (process.env.AF_DISPATCH_DISABLED === "1") {
    finish(runSpawned(specs, raw));
    return;
  }

  const progress = { ran: 0, current: null };

  // Installed for the life of the process, not per hook.
  //
  // First exit wins, and the sentinel is thrown only to unwind. Most hooks wrap
  // their body in `try { … } catch (e) { log(e); exit(0) }`; that catch swallows
  // the sentinel and then reports success, which would silently disarm every
  // blocking hook (scout-block's exit 2 became 0 in the differential test).
  // Latching the first code makes the swallowed path unable to overwrite it.
  //
  // Never restored, because a hook can call exit from a timer after its turn is
  // over; the real exit would terminate the process and drop the hooks still to
  // come, or stamp a stray exit code on a chain that already passed.
  process.exit = (code) => {
    const owner = hookContext.getStore() || progress.current;
    if (owner && !owner.exited) {
      owner.exited = true;
      owner.code = code === undefined ? 0 : Number(code);
    }
    throw new ExitSentinel(owner ? owner.code : 0, owner);
  };

  // A hook calling process.exit from a timer throws the sentinel into a
  // callback, where it surfaces as an uncaughtException — not a rejection — and
  // node's default is to abort with a non-zero code, which Claude Code would
  // read as "block this tool call". Both channels have to be absorbed.
  const absorb = (err) => {
    if (err instanceof ExitSentinel) return;
    const who = progress.current ? progress.current.name : "chain";
    process.stderr.write(
      `dispatch: ${who} async error: ${err && err.message}\n`,
    );
  };
  process.on("uncaughtException", absorb);
  process.on("unhandledRejection", absorb);

  seedStdin(raw);

  let code;
  try {
    code = runInProcess(specs, progress);
  } catch (err) {
    if (progress.ran === 0) {
      process.stderr.write(
        `dispatch: falling back to spawn (${err && err.message})\n`,
      );
      code = runSpawned(specs, raw);
    } else {
      // Re-running the chain would repeat side effects the hooks that already
      // fired have committed (log writes, git edits, lint autofixes), so stop
      // here and let the tool call through rather than double-applying them.
      process.stderr.write(
        `dispatch: aborted after ${progress.ran} hook(s) (${err && err.message})\n`,
      );
      code = 0;
    }
  }
  finish(code);
}

if (require.main === module) {
  main();
} else {
  module.exports = { parseSpec, runSpawned };
}
