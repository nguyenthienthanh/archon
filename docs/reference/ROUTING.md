---
last_aligned_with: v4.0.0-alpha.3
status: current
audience: active-user
---

# Routing: how Archon OS decides how hard to work

You never pick a strategy. You describe the task; `agent-detector` reads it and routes.
This page explains what it is deciding, so the decision is predictable rather than magic.

---

## The three strategies

Archon OS picks one of three execution strategies per task — you never configure it manually.

```mermaid
flowchart TB
    Prompt([Prompt]):::m --> AD[agent-detector analyzes]:::s
    AD --> Cx{Complexity?}:::g

    Cx -->|single file<br/>clear scope<br/>~5K tokens| Q[Quick Strategy]:::q
    Cx -->|2-5 files<br/>feature<br/>~20K tokens| S[Standard Strategy]:::st
    Cx -->|6+ files<br/>architecture<br/>~80K tokens| D[Deep Strategy]:::d

    Q --> QR[Direct edit<br/>haiku model<br/>no workflow]:::q
    S --> SR[Single agent inline<br/>sonnet model<br/>TDD optional]:::st
    D --> DR[5-phase TDD<br/>2 approval gates<br/>builder ≠ reviewer<br/>collaborative planning]:::d

    classDef m fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#000000
    classDef s fill:#ec4899,stroke:#9d174d,stroke-width:2px,color:#ffffff
    classDef g fill:#dc2626,stroke:#7f1d1d,stroke-width:2px,color:#ffffff
    classDef q fill:#10b981,stroke:#065f46,stroke-width:2px,color:#ffffff
    classDef st fill:#3b82f6,stroke:#1e40af,stroke-width:2px,color:#ffffff
    classDef d fill:#8b5cf6,stroke:#5b21b6,stroke-width:2px,color:#ffffff
```

| Strategy | Triggers | Model | Gates | Example |
|---|---|---|---|---|
| **Quick** | Single file, typo, one-line fix | haiku | 0 | "Fix typo in login.ts" |
| **Standard** | 2–5 files, one feature | sonnet | 0–1 | "Add email validation to signup form" |
| **Deep** | 6+ files, architecture, vague scope | sonnet (opus for design) | 2 (P1 + P3) | "Design and implement user subscription system" |

**Why three tiers instead of always-TDD?** Forcing Deep on every task burns tokens (~3× vs subagent mode) and slows iteration. Forcing Quick on complex work skips tests and breaks production. The three-tier model matches effort to risk.

**Team Mode** (subset of Deep): if the task spans 2+ domains AND `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, multiple agents work in parallel and cross-review each other. See [AGENT_TEAMS_GUIDE](../guides/AGENT_TEAMS_GUIDE.md).

Details: `rules/core/execution-rules.md`, `skills/agent-detector/SKILL.md`, `skills/run-orchestrator/SKILL.md`.

---

## How a prompt becomes shipped code

```mermaid
flowchart TB
    User([👤 User prompt]):::user --> CC[Claude Code CLI]:::cc
    CC -->|every message| AD[🔍 agent-detector skill<br/>model: haiku · auto-invoke]:::skill
    AD --> Cx{Complexity<br/>detected?}:::gate

    Cx -->|Quick<br/>1 file / clear scope| Direct[✏️ Direct edit<br/>no workflow]:::quick
    Cx -->|Standard<br/>2-5 files / feature| SingleAgent[🛠 Single agent<br/>agent-detector picks one]:::std
    Cx -->|Deep<br/>6+ files / architecture| RO[🎯 run-orchestrator skill<br/>5-phase TDD]:::deep

    RO --> P1[📐 P1: Understand + Design<br/>architect]:::phase
    P1 --> G1{{✋ Approve?}}:::gate
    G1 -->|approve| P2[🧪 P2: Test RED<br/>tester writes failing tests]:::phase
    P2 --> P3[⚙️ P3: Build GREEN<br/>architect/frontend/mobile]:::phase
    P3 --> G2{{✋ Approve?}}:::gate
    G2 -->|approve| P4[🔒 P4: Refactor + Review<br/>security + tester NOT builder]:::phase
    P4 --> P5[📦 P5: Finalize<br/>lead — docs + commit]:::phase
    P5 --> Done([✅ Production-ready]):::done

    SingleAgent --> Done
    Direct --> Done

    classDef user fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#000000
    classDef cc fill:#6366f1,stroke:#3730a3,stroke-width:2px,color:#ffffff
    classDef skill fill:#ec4899,stroke:#9d174d,stroke-width:2px,color:#ffffff
    classDef gate fill:#dc2626,stroke:#7f1d1d,stroke-width:2px,color:#ffffff
    classDef quick fill:#10b981,stroke:#065f46,stroke-width:2px,color:#ffffff
    classDef std fill:#3b82f6,stroke:#1e40af,stroke-width:2px,color:#ffffff
    classDef deep fill:#8b5cf6,stroke:#5b21b6,stroke-width:2px,color:#ffffff
    classDef phase fill:#475569,stroke:#1e293b,stroke-width:2px,color:#ffffff
    classDef done fill:#059669,stroke:#064e3b,stroke-width:2px,color:#ffffff
```

**The flow, explained:**
1. **Every message** you send goes through the `agent-detector` skill (runs on haiku for cost) — it classifies complexity + picks the right agent + suggests the right model.
2. **Quick tasks** (typo, one-line fix) → direct edit, no workflow overhead.
3. **Standard tasks** (one feature, clear scope) → single specialized agent runs inline.
4. **Deep tasks** (feature + multi-file + TDD) → `run-orchestrator` spawns the 5-phase workflow with two human approval gates.
5. Between phases, you either **approve**, **reject**, or **modify** — no commit happens until Phase 5 and you say so.
