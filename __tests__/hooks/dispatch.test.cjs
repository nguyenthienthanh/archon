/**
 * dispatch.cjs — runs several hook scripts in one node process.
 *
 * The behaviours locked down here are the ones that silently break hooks
 * rather than crash them, so they would not show up as a failed run.
 */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DISPATCH = path.join(
  __dirname,
  "..",
  "..",
  "archon-os",
  "hooks",
  "dispatch.cjs",
);

let fixtureDir;

/** Write a fixture hook and return its dispatch spec name. */
function hook(name, body) {
  fs.writeFileSync(
    path.join(fixtureDir, `${name}.cjs`),
    `'use strict';\nfunction main() {\n${body}\n}\nif (require.main === module) main();\nelse module.exports = { main };\n`,
  );
  return name;
}

function run(specs, { stdin = "{}", env = {} } = {}) {
  const res = spawnSync(process.execPath, [DISPATCH, ...specs], {
    input: stdin,
    encoding: "utf-8",
    env: { ...process.env, AF_DISPATCH_HOOK_DIR: fixtureDir, ...env },
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "af-dispatch-"));
});

afterEach(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

describe("exit semantics", () => {
  it("propagates a blocking exit even when the hook swallows it in its own catch", () => {
    // Real hooks wrap their body in `try { … } catch (e) { log(e); exit(0) }`.
    // Before the first-exit-wins latch, that catch absorbed the dispatcher's
    // unwind sentinel and reported success — disarming every blocking hook.
    const h = hook(
      "swallower",
      `  try {
    console.error('BLOCKED');
    process.exit(2);
  } catch (e) {
    console.error('swallowed: ' + e.message);
    process.exit(0);
  }`,
    );
    const { code, stderr } = run([h]);
    expect(code).toBe(2);
    expect(stderr).toContain("BLOCKED");
  });

  it("does not emit the swallowed-sentinel noise as hook output", () => {
    const h = hook(
      "noisy",
      `  try { process.exit(2); } catch (e) { console.error('LEAKED ' + e.message); process.exit(0); }`,
    );
    expect(run([h]).stderr).not.toContain("LEAKED");
  });

  it("stops the chain at the first blocking exit 2", () => {
    const a = hook("blocker", `  process.exit(2);`);
    const b = hook("after", `  console.log('SHOULD-NOT-RUN');`);
    const { code, stdout } = run([a, b]);
    expect(code).toBe(2);
    expect(stdout).not.toContain("SHOULD-NOT-RUN");
  });

  it("keeps running after a warn-only exit 1 and reports 1 for the chain", () => {
    // Claude Code's contract: only exit 2 blocks; exit 1 is a non-blocking
    // warning. scope-drift/security-scan/design-conformance all exit 1 on
    // ordinary findings — that must not cancel their sibling hooks.
    const warn = hook("warner", `  console.error('WARNED');\n  process.exit(1);`);
    const after = hook("after-warn", `  console.log('STILL-RAN');`);
    const { code, stdout, stderr } = run([warn, after]);
    expect(code).toBe(1);
    expect(stdout).toContain("STILL-RAN");
    expect(stderr).toContain("WARNED");
  });

  it("a later exit 2 still blocks even after an earlier warn", () => {
    const warn = hook("warn-first", `  process.exit(1);`);
    const block = hook("block-second", `  console.error('BLOCKED');\n  process.exit(2);`);
    const { code, stderr } = run([warn, block]);
    expect(code).toBe(2);
    expect(stderr).toContain("BLOCKED");
  });

  it("runs the whole chain when every hook allows", () => {
    const a = hook("one", `  console.log('A');`);
    const b = hook("two", `  console.log('B');`);
    const { code, stdout } = run([a, b]);
    expect(code).toBe(0);
    expect(stdout).toBe("A\nB\n");
  });

  it("keeps going when a hook throws, matching each hook's own catch-all", () => {
    const bad = hook("thrower", `  throw new Error('boom');`);
    const good = hook("survivor", `  console.log('STILL-RAN');`);
    const { code, stdout } = run([bad, good]);
    expect(code).toBe(0);
    expect(stdout).toContain("STILL-RAN");
  });

  it("skips a spec whose file does not exist", () => {
    const good = hook("present", `  console.log('OK');`);
    const { code, stdout } = run(["no-such-hook", good]);
    expect(code).toBe(0);
    expect(stdout).toContain("OK");
  });
});

describe("stdin replay", () => {
  // fd 0 drains on first read, so every hook after the first would see an
  // empty payload without the replay.
  const payload = JSON.stringify({ prompt: "HELLO", tool_name: "Read" });

  it("gives the same payload to every hook in the chain", () => {
    const body = `  const raw = require('fs').readFileSync(0, 'utf-8');
  console.log(JSON.parse(raw).prompt);`;
    const a = hook("reader-a", body);
    const b = hook("reader-b", body);
    expect(run([a, b], { stdin: payload }).stdout).toBe("HELLO\nHELLO\n");
  });

  it("serves readers going through lib/safe-stdin", () => {
    const lib = path.join(
      __dirname,
      "..",
      "..",
      "archon-os",
      "hooks",
      "lib",
      "safe-stdin.cjs",
    );
    const h = hook(
      "lib-reader",
      `  const { readStdinSafely } = require(${JSON.stringify(lib)});
  console.log(JSON.parse(readStdinSafely()).prompt);`,
    );
    expect(run([h], { stdin: payload }).stdout).toBe("HELLO\n");
  });

  it("tolerates an empty or malformed payload", () => {
    const h = hook("tolerant", `  console.log('RAN');`);
    expect(run([h], { stdin: "" }).code).toBe(0);
    expect(run([h], { stdin: "{not json" }).code).toBe(0);
  });
});

describe("spec parsing", () => {
  it("applies per-script env from the name+KEY=VAL form", () => {
    const h = hook(
      "env-reader",
      `  console.log(process.env.CLAUDE_HOOK_PHASE || 'unset');`,
    );
    expect(run([`${h}+CLAUDE_HOOK_PHASE=pre`]).stdout).toBe("pre\n");
  });

  it("scopes that env to the one script that declared it", () => {
    const a = hook(
      "env-a",
      `  console.log('a=' + (process.env.AF_TEST_VAR || 'unset'));`,
    );
    const b = hook(
      "env-b",
      `  console.log('b=' + (process.env.AF_TEST_VAR || 'unset'));`,
    );
    expect(run([`${a}+AF_TEST_VAR=x`, b]).stdout).toBe("a=x\nb=unset\n");
  });

  it("routes stderr to stdout for the > form, reproducing the old 2>&1", () => {
    const h = hook("merger", `  console.error('TO-STDOUT');`);
    const merged = run([`>${h}`]);
    expect(merged.stdout).toContain("TO-STDOUT");
    expect(merged.stderr).not.toContain("TO-STDOUT");
  });

  it("leaves stderr alone without the > form", () => {
    const h = hook("plain", `  console.error('TO-STDERR');`);
    const plain = run([h]);
    expect(plain.stderr).toContain("TO-STDERR");
    expect(plain.stdout).not.toContain("TO-STDERR");
  });
});

describe("async hooks", () => {
  it("still completes async work a hook left behind", () => {
    // The next hook starts as soon as the previous one's synchronous part is
    // done; the leftover work drains before the process exits, the same
    // lifetime it had when the hook owned its own process.
    const slow = hook(
      "slow",
      `  setTimeout(() => { console.log('SLOW-DONE'); process.exit(0); }, 150);`,
    );
    const next = hook("next", `  console.log('NEXT');`);
    expect(run([slow, next]).stdout).toBe("NEXT\nSLOW-DONE\n");
  });

  it("does not stall on a hook that never calls process.exit", () => {
    // Six real hooks never exit — prompt-reminder runs on every prompt. Any
    // per-hook wait cost the full timeout on each of them.
    const quiet = hook("quiet", `  console.log('QUIET');`);
    const started = Date.now();
    expect(run([quiet, quiet, quiet]).stdout).toBe("QUIET\nQUIET\nQUIET\n");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("does not let a late exit from a finished hook kill the chain", () => {
    // Per-hook restoration of the real process.exit meant a stray timer from
    // an earlier hook terminated the process mid-chain.
    const straggler = hook(
      "straggler",
      `  setTimeout(() => process.exit(0), 60);\n  process.exit(0);`,
    );
    const later = hook(
      "later",
      `  setTimeout(() => { console.log('LATER'); process.exit(0); }, 120);`,
    );
    const { code, stdout } = run([straggler, later]);
    expect(code).toBe(0);
    expect(stdout).toContain("LATER");
  });

  it("bounds a hook that never settles instead of hanging the tool call", () => {
    const leaky = hook("leaky", `  setInterval(() => {}, 20);`);
    const after = hook("after-leaky", `  console.log('REACHED');`);
    const { code, stdout } = run([leaky, after], {
      env: { AF_DISPATCH_TIMEOUT_MS: "200" },
    });
    expect(code).toBe(0);
    expect(stdout).toContain("REACHED");
  });
});

describe("safety net", () => {
  it("AF_DISPATCH_DISABLED=1 spawns per script and yields the same exit code", () => {
    const a = hook(
      "sn-block",
      `  console.error('BLOCKED');\n  process.exit(2);`,
    );
    const b = hook("sn-after", `  console.log('SHOULD-NOT-RUN');`);
    const forked = run([a, b], { env: { AF_DISPATCH_DISABLED: "1" } });
    expect(forked.code).toBe(2);
    expect(forked.stdout).not.toContain("SHOULD-NOT-RUN");
    expect(forked.code).toBe(run([a, b]).code);
  });

  it("AF_DISPATCH_DISABLED=1 matches warn-continue semantics too", () => {
    const warn = hook("sn-warn", `  process.exit(1);`);
    const after = hook("sn-after-warn", `  console.log('RAN-AFTER-WARN');`);
    const forked = run([warn, after], { env: { AF_DISPATCH_DISABLED: "1" } });
    expect(forked.code).toBe(1);
    expect(forked.stdout).toContain("RAN-AFTER-WARN");
    const inproc = run([warn, after]);
    expect(forked.code).toBe(inproc.code);
  });

  it("exits 0 when handed no specs", () => {
    expect(run([]).code).toBe(0);
  });
});
