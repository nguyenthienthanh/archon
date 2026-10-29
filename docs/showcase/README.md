# Archon OS Showcase

Real outputs from actual Archon OS workflow runs. These are not mocked — they show exactly what the plugin produces.

## Sample Workflows

| Sample | Task | Complexity |
|--------|------|-----------|
| [JWT Auth API](./sample-jwt-auth/) | Build JWT authentication API | Deep |
| [Bug Fix](./sample-bugfix/) | Fix pagination off-by-one error | Quick |

## How to Read

Each sample contains the deliverables from a real workflow run:
- `PHASE_1_REQUIREMENTS.md` — Requirements analysis + design decisions
- `PHASE_2_TESTS.md` — Test plan (RED phase)
- `PHASE_4_REVIEW.md` — 6-aspect code review report
- `PHASE_5_SUMMARY.md` — Final summary

## Try It Yourself

```bash
# Install Archon OS
/plugin marketplace add nguyenthienthanh/archon
/plugin install archon-os@archon

# Run a workflow
workflow:start "Your task here"
```
