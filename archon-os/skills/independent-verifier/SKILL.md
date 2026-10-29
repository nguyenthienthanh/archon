---
name: independent-verifier
description: "Second opinion on another agent's result from a cheap model. Deterministic scope gate first (free), then k=3 blind Haiku samples; confidence comes from AGREEMENT, never from self-report. One verdict back, no debate. May only lower confidence."
when_to_use: "a result carries a conclusion (test/coverage claim, security finding, capability claim, 'X does not work'), before an approval gate, before a handoff, reason: verify, second opinion, independent check"
allowed-tools: Bash, Task, Read
effort: low
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.

# Independent verifier

**FEAT-E.** Grades a result produced by **another** agent. Hard constraints, all
three non-negotiable:

```toon
constraints[3]{rule,why}:
  Not the producer,"An agent asked to grade its own output agrees with itself — that is the failure this exists to catch"
  No shared context,"Self-preference, familiarity and agreement bias all ride in on shared context"
  One verdict back,"No debate, no conversation — debate between models escalates sycophancy"
```

**The verifier may only ever LOWER confidence.** `SUPPORTED` is advisory and
silences nothing, so a rubber stamp is a **no-op**, never an endorsement.

---

## Step 0 — deterministic gate, zero model calls

Always first. Costs nothing and catches the dominant defect class
(a universal conclusion drawn from one instance).

```bash
echo '{"conclusion":"<the claim>","observation":"<raw tool output>",
       "evidence":[{"probe":"<exact command>","outcome":"fail|pass"}]}' \
  | node "${CLAUDE_PLUGIN_ROOT}/scripts/verify-claim.cjs" --gate
```

- `blocked: true` → **STOP. Return the verdict. Do not call a model.** Report
  `verdict`, `reasons`, `alternative_causes`, `required_probes`.
- `model_calls_needed: true` → continue to Step 1 with the `blind_input` and
  `verdict_schema` the command printed.

The gate never returns `SUPPORTED` — the best it says is "nothing deterministic
to flag".

**Known false-positive class:** a universal capability claim backed by
documentation rather than by a probe ("X cannot be done, the docs say so") is
blocked, because the gate counts probes, not citations. The fix is the same
either way — **cite the probe or narrow the claim** — so it is left in rather
than widened away.

---

## Step 1 — k independent BLIND samples

```
Task(
  subagent_type: "general-purpose",
  model: "haiku",            // aliases only: sonnet|opus|haiku|fable
  prompt: VERIFIER_PROMPT + JSON.stringify(blind_input)
)
```

- **k = 3 by default**, each a **fresh** Task. Never reuse the producing agent,
  never pass the transcript, never let two samples see each other.
- Use the **in-session Agent tool**, not `claude -p`: a cold `claude -p` costs
  **$0.00996/call** from the ~46K-token system-prompt cache write, versus
  **$0.00047** with `--safe-mode --tools ""` — a 21× spread. k=3 in-session
  Haiku ≈ **$0.0016**, about 7% of one Sonnet pass.
- If you must use the CLI, pass the printed `verdict_schema` to `--json-schema`.
  A bare `{verdict: string}` schema makes the model stuff a whole JSON document
  into the field; the schema must carry **enums and typed numbers**.

### VERIFIER_PROMPT

```
You are checking ONE claim against ONE body of evidence. You are not the author
and you will not be told who is. Do not debate, do not ask questions, do not
revise: emit one JSON object and stop.

1. From the observation and evidence ALONE, write the strongest statement the
   evidence supports — before you look at the claim.
2. Compare the claim to that statement. If the claim is wider, say so.
3. A failure that already has a non-capability explanation (a limit flag, a
   wrong name, a missing credential, a timeout) does NOT support a claim that
   the capability is absent.
4. A claim may only be SUPPORTED if a DIFFERENT valid input of the same class
   was also probed. If it was not, the verdict is CANNOT_CHECK.
5. List everything you could not check in checks_not_possible. Never leave it
   empty just because you found nothing — say what you could not reach.

verdict: SUPPORTED | OVERGENERALIZED | WRONG_CAUSE | UNDERSPECIFIED | REFUTED |
         CANNOT_CHECK
```

Confidence is **not** requested. If the model emits one it is discarded.

---

## Step 2 — one verdict back

```bash
echo '{"gate":<gate output>,"priorConfidence":"HIGH","samples":[<k samples>]}' \
  | node "${CLAUDE_PLUGIN_ROOT}/scripts/verify-claim.cjs" --aggregate
```

`confidence` comes from the **modal-verdict fraction** over k samples
(`3/3 → HIGH`, `2/3 → MEDIUM`, split → `LOW` + `CANNOT_CHECK`) and is then
clamped to at most the prior. A two-way split between an endorsement and an
adverse finding resolves **adverse**.

---

## Step 3 — the loop target is NOT a score

> **Pass the threshold, or hit the retry cap and escalate to a human.**

Optimizing a confidence score is reward hacking: the agent learns to satisfy the
verifier instead of being right.

- **A retry must change the EVIDENCE.** Ask before retrying; the answer is not
  a judgement call:

```bash
echo '{"attempt":1,"probe_ledger":["claude -p \"/run\""],
       "new_probe":"claude -p \"/archon-os:run\""}' \
  | node "${CLAUDE_PLUGIN_ROOT}/scripts/verify-claim.cjs" --retry
```

  `allowed: false, reason: "no_new_evidence"` → the retry is a rewording; do not
  run it. `escalate_to_human: true` → the loop cap is reached: **stop and ask the
  human.** Do not re-run the verifier.

```toon
config[3]{env,default,meaning}:
  ARCHON_VERIFIER_K,3,independent samples per verdict
  ARCHON_VERIFIER_THRESHOLD,0.67,modal fraction an adverse verdict needs to block
  ARCHON_VERIFIER_LOOP_CAP,2,retries before a human is asked
```

`ARCHON_CLAIM_GATE=false` disables the PostToolUse scope gate only; the explicit
`--gate` / `--aggregate` path stays available.

---

## What this does NOT do

- It does not re-run the producer's work, and it does not re-check "did it
  fail?" — a re-check **confirms** a false conclusion, because the failure
  really happened. The value is in the **counterfactual probe**.
- It does not grade style, scope or progress. Watching is the observer's job;
  grading is this one's. One agent doing both is the cover-up this shape exists
  to prevent.
- It does not certify. `SUPPORTED` means "nothing found", never "correct":
  verifiers certify reliably only on easy problems, and the
  generation–verification gap is **smallest** in exactly this weak-verifier /
  strong-generator corner.

## Measurement

`node archon-os/scripts/verifier-corpus-eval.cjs` scores the labelled corpus in
`archon-os/scripts/verifier-corpus/claims.json` and derives whether the cheap
model has earned the right to replace the predecessor verification technique.
Today: **keep the predecessor** — the model arm is unmeasured and 20 referencing
files remain. Run the script; do not re-state its numbers from memory.
