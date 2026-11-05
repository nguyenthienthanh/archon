---
last_aligned_with: v4.0.0-alpha.3
status: current
audience: evaluator
---

# Compared to other Claude Code plugins

Honest comparison with two popular plugins in the ecosystem (April 2026).

| | **Archon OS** | **wshobson/agents** | **Superpowers** |
|---|---|---|---|
| **Agents** | 15 curated | 184 across 78 plugins | ~20 |
| **Skills** | 45 | 150 | Small focused set |
| **Commands** | 24 (14 user-facing + 10 legacy aliases) | 98 | ~10 |
| **Workflow** | 5-phase TDD with 2 gates | No structured workflow | Phase-gated workflow |
| **Agent routing** | Task-content Layer 0 override | Manual `/agent-name` | Similar to Archon OS |
| **TDD enforcement** | ✅ Mandatory RED→GREEN→REFACTOR | ❌ Per-agent | ✅ Phase-gated |
| **Context management** | 3-tier (MicroCompact / AutoCompact / ManualCompact) | ❌ Base Claude Code | Partial |
| **Approval gates** | 2 (P1 + P3) | ❌ | Multiple |
| **MCP bundled** | 6 (context7, playwright, vitest, firebase, figma, slack) | Varies per plugin | 2–3 |
| **Best fit** | Teams shipping production features with TDD discipline | Extending with niche specialists | Structured workflows for research/writing |
| **Weakness** | Steeper learning curve | Agent sprawl (184 is a lot) | Smaller ecosystem |

**Not competing — different optimization targets.** Archon OS optimizes for *production code quality* (TDD + security review). wshobson optimizes for *breadth of specialists*. Superpowers optimizes for *structured thinking over code*.

Combine freely — plugins coexist in Claude Code.
