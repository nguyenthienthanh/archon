---
last_aligned_with: v3.7.3
status: needs_review
audience: active-user
---

# Behavioral Eval Setup

Automated trigger-accuracy testing for Archon OS skills, agents, and commands using [`cc-plugin-eval`](https://github.com/sjnims/cc-plugin-eval). Catches regression when skill descriptions drift or rules are edited.

---

## Dependencies

- Node.js **18+**
- `ANTHROPIC_API_KEY` environment variable (eval makes real model calls)
- ~$1–10 USD budget per full eval run (depends on scenario count)

---

## One-Time Setup

```bash
# Clone the eval tool (outside the plugin repo)
cd /tmp
git clone https://github.com/sjnims/cc-plugin-eval
cd cc-plugin-eval
npm install && npm run build
```

---

## Archon OS Eval Config

The plugin ships `archon-os/.eval-config.yaml` with sensible defaults:

```yaml
execution:
  model: "claude-sonnet-4-5-20250929"
  max_turns: 5
  timeout_ms: 60000
  max_budget_usd: 10.0
  disallowed_tools: [Write, Edit, Bash]  # eval is read-only — no side effects

evaluation:
  detection_mode: "programmatic_first"
  num_samples: 1

generation:
  scenarios_per_component: 5
  diversity: 0.7

conflict_detection: true
```

Override via CLI flags when needed.

---

## Running the Eval

### Estimate cost first

```bash
npx cc-plugin-eval run -p ./archon-os --dry-run
```

### Full eval

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx cc-plugin-eval run -p ./archon-os --config archon-os/.eval-config.yaml
```

### Focused eval (auto-invoke skills only — what CI runs)

```bash
npx cc-plugin-eval run -p ./archon-os \
  --components skills \
  --filter "autoInvoke:true" \
  --output archon-os/eval-results.json
```

---

## Output

Results land in `eval-results.json` — a structured report with:

- **Trigger accuracy per component** — did the skill fire when it should have?
- **Conflict map** — which prompts triggered multiple components (potential routing ambiguity)
- **Token usage per scenario** — expensive components stand out
- **Execution time** — per-scenario and aggregate

Example output shape:

```json
{
  "components": {
    "skills": [
      {
        "name": "agent-detector",
        "triggerAccuracy": 0.96,
        "scenarios": [...],
        "tokens": {"prompt": 1200, "completion": 450}
      }
    ]
  },
  "conflicts": [...],
  "summary": {...}
}
```

---

## Generating the Baseline

The baseline file `archon-os/eval-baseline.json` is what CI compares against. Regenerate when:

- Adding new auto-invoke skills
- Substantially rewriting skill descriptions
- After a proven improvement you want to lock in

```bash
npx cc-plugin-eval run -p ./archon-os \
  --components skills \
  --filter "autoInvoke:true" \
  --output archon-os/eval-baseline.json
```

Commit `archon-os/eval-baseline.json` so CI has something to compare against.

**First baseline note:** not yet committed. First run happens after CI infrastructure is in place and an API key is configured (see below).

---

## CI Integration

`.github/workflows/behavioral-eval.yml` runs this eval on every PR that touches skills, agents, commands, or rules. See the workflow file for details.

Regression check: `archon-os/scripts/ci/check-eval-regression.cjs` compares current results against the baseline. Fails if:

- Trigger accuracy < 85% on any auto-invoke skill
- Accuracy drops > 10% from baseline

---

## Local Workflow

For contributors editing skills:

```bash
# 1. Make changes to archon-os/skills/*/SKILL.md
# 2. Run focused eval locally (faster than full)
npx cc-plugin-eval run -p ./archon-os --components skills \
  --filter "name:your-skill-name"
# 3. Check the output for trigger accuracy
# 4. If accuracy dropped, iterate on the description
# 5. Commit + open PR — CI runs full auto-invoke suite
```

---

## Cost Management

Per-run cost depends on component count and scenario count. For Archon OS's 5 auto-invoke skills × 5 scenarios each = 25 scenarios, typical cost is ~$0.30–$1.00 on Sonnet. Full eval across all 44 skills is ~$5–$10.

**Budget guards:**
- `max_budget_usd: 10.0` in config hard-stops if exceeded
- `--dry-run` estimates before spending
- CI only runs on PRs touching skills/agents/rules (path filter)

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `cc-plugin-eval: command not found` | Tool not installed | Re-run the Setup steps |
| `ANTHROPIC_API_KEY is required` | Env var missing | `export ANTHROPIC_API_KEY=...` |
| All skills score 0% | Wrong plugin path | Pass absolute path via `-p` |
| CI passes locally but fails in Action | Node version mismatch | Ensure Node 20 in workflow |
| Baseline file missing in CI | Not yet committed | First run: skip regression check or commit initial baseline |

---

## Related

- [CONTRIBUTING.md](../../CONTRIBUTING.md) — PR workflow including eval expectations
- [BENEFITS.md](../reference/BENEFITS.md) — why behavioral eval matters
- [`cc-plugin-eval` docs](https://github.com/sjnims/cc-plugin-eval) — upstream tool
