---
last_aligned_with: v3.7.3
status: reference
audience: power-user
---

# Archon OS Workflow Diagrams

**Format:** Mermaid (render with GitHub, VS Code, or mermaid.live)
**Purpose:** Visual documentation of Archon OS 5-phase workflow and architecture

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [5-Phase Workflow](#2-5-phase-workflow-sequence)
3. [TDD Workflow (RED/GREEN/REFACTOR)](#3-tdd-workflow)
4. [Agent Detection Flow](#4-agent-detection-flow)
5. [Phase Transition Logic](#5-phase-transition-logic)
6. [Session Handoff Flow](#6-session-handoff-flow)
7. [Workflow State Machine](#7-workflow-state-machine)
8. [Multi-Agent Collaboration](#8-multi-agent-collaboration)
9. [Token Budget Distribution](#9-token-budget-distribution)
10. [Approval Gate Flow](#10-approval-gate-flow)

---

## 1. System Architecture

### 1.1 Overall Plugin Architecture

```mermaid
graph TB
    subgraph "Claude Code Interface"
        CC[Claude Code CLI]
    end

    subgraph "Archon OS Plugin"
        PM[PM Operations Orchestrator]
        AD[Agent Detector]
        WO[Workflow Orchestrator]

        subgraph "Development Agents"
            RN[mobile]
            FL[mobile-flutter]
            RE[frontend]
            NX[web-nextjs]
            VU[frontend]
            AN[web-angular]
            NO[architect]
            PY[backend-python]
            GO[backend-go]
            LA[backend-laravel]
            DB[architect]
        end

        subgraph "Quality Agents"
            QA[tester]
            SE[security]
            UI[frontend]
        end

        subgraph "Operations Agents"
            DO[devops]
            JI[jira-operations]
            CO[confluence-operations]
            SL[slack-operations]
        end

        subgraph "Skills"
            SK1[run-orchestrator]
            SK2[agent-detector]
            SK3[project-context-loader]
            SK4[bugfix-quick]
            SK5[test-writer]
            SK6[code-reviewer]
        end
    end

    subgraph "External Integrations"
        JIRA[JIRA API]
        CONF[Confluence API]
        FIG[Figma API]
        SLACK[Slack API]
    end

    subgraph "State Management"
        STATE[.claude/logs/workflows/]
        CONTEXT[.claude/project-contexts/]
    end

    CC --> PM
    PM --> AD
    AD --> WO
    WO --> SK1

    PM --> JI
    PM --> CO

    JI --> JIRA
    CO --> CONF
    UI --> FIG
    SL --> SLACK

    WO --> STATE
    SK3 --> CONTEXT
```

### 1.2 Skill Invocation Architecture

```mermaid
graph LR
    subgraph "User Input"
        MSG[User Message]
    end

    subgraph "Always First"
        AD[agent-detector<br/>Priority: HIGHEST]
    end

    subgraph "Context Loading"
        PCL[project-context-loader<br/>Priority: HIGH]
    end

    subgraph "Task Skills"
        WO[run-orchestrator<br/>Complex features]
        BF[bugfix-quick<br/>Bug fixes]
        TW[test-writer<br/>Test requests]
    end

    subgraph "Integration Skills"
        JI[jira-integration<br/>Ticket IDs]
        FI[figma-integration<br/>Figma URLs]
        CI[confluence-integration<br/>Docs]
    end

    subgraph "Post-Implementation"
        CR[code-reviewer<br/>After code]
    end

    MSG --> AD
    AD --> PCL
    PCL --> WO
    PCL --> BF
    PCL --> TW
    WO --> JI
    WO --> FI
    WO --> CI
    WO --> CR
    BF --> CR
    TW --> CR
```

---

## 2. 5-Phase Workflow Sequence

### 2.1 Complete Workflow Sequence

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant PM as PM Orchestrator
    participant DEV as Dev Agent
    participant UI as UI Designer
    participant QA as QA Automation
    participant SEC as Security Expert

    Note over U,SEC: Phase 1: Understand + Design (APPROVAL gate)
    U->>PM: /run "Add user auth"
    PM->>PM: Analyze requirements
    PM->>DEV: Cross-review requirements
    PM->>DEV: Design architecture
    DEV->>DEV: Create tech spec
    DEV->>UI: Component breakdown (if applicable)
    UI->>UI: Extract design tokens
    PM-->>U: Show deliverables + Approval Gate
    U->>PM: approve

    Note over U,SEC: Phase 2: Test RED (auto-continue)
    PM->>QA: Plan test strategy + write tests
    QA->>QA: Define test cases
    QA->>QA: Write failing tests
    QA->>QA: Run tests - MUST FAIL
    QA-->>U: Tests failing ✓ (auto-continue)

    Note over U,SEC: Phase 3: Build GREEN (APPROVAL gate)
    QA->>DEV: Implement to pass tests
    DEV->>DEV: Write minimal code
    DEV->>DEV: Run tests - MUST PASS
    DEV->>DEV: Check coverage ≥80%
    DEV-->>U: Tests passing ✓ + Approval Gate
    U->>DEV: approve

    Note over U,SEC: Phase 4: Refactor + Review (auto-continue)
    DEV->>DEV: Refactor code
    DEV->>DEV: Run tests - MUST STILL PASS
    DEV->>SEC: Security review
    SEC->>SEC: OWASP checks
    SEC->>QA: Quality review
    SEC-->>U: Refactored + reviewed ✓ (auto-continue)

    Note over U,SEC: Phase 5: Finalize (auto-complete)
    SEC->>QA: Final verification
    QA->>QA: Run all tests + verify coverage ≥80%
    QA->>PM: Generate docs
    PM->>PM: Update README, API docs
    PM->>PM: Send Slack notification
    PM->>PM: Update JIRA ticket
    PM-->>U: Workflow Complete ✓
```

### 2.2 Phase Overview (Simplified)

```mermaid
graph LR
    subgraph "Planning"
        P1[Phase 1<br/>Understand + Design]
    end

    subgraph "TDD"
        P2[Phase 2<br/>Test RED]
        P3[Phase 3<br/>Build GREEN]
        P4[Phase 4<br/>Refactor + Review]
    end

    subgraph "Delivery"
        P5[Phase 5<br/>Finalize]
    end

    P1 -->|"APPROVAL"| P2
    P2 -->|"auto-continue"| P3
    P3 -->|"APPROVAL"| P4
    P4 -->|"auto-continue"| P5
    P5 -->|"auto-complete"| DONE((Done))
```

---

## 3. TDD Workflow

### 3.1 TDD Cycle Flowchart

```mermaid
flowchart TD
    START([Phase 1 approved]) --> P2

    subgraph P2 [Phase 2: Test RED]
        A1[Plan test strategy] --> A2[Define test cases]
        A2 --> A3[Write failing tests]
        A3 --> A4[Run tests]
        A4 --> A5{Tests FAIL?}
        A5 -->|Yes ✓| A6[Tests failing as expected]
        A5 -->|No ✗| A7[ERROR: Tests should fail!<br/>Tests aren't testing new code]
        A7 --> A1
    end

    A6 --> AUTO1[Auto-continue to Phase 3]

    subgraph P3 [Phase 3: Build GREEN]
        B1[Write minimal code] --> B2[Just enough to pass]
        B2 --> B3[Run tests]
        B3 --> B4{Tests PASS?}
        B4 -->|Yes| B5{Coverage ≥80%?}
        B4 -->|No| B6[Fix implementation<br/>NOT the tests]
        B6 --> B1
        B5 -->|Yes ✓| B7[Implementation complete]
        B5 -->|No| B8[Add more tests or<br/>increase coverage]
        B8 --> B1
    end

    B7 --> GATE{Approval Gate}
    GATE -->|approve| P4
    GATE -->|reject| B1

    subgraph P4 [Phase 4: Refactor + Review]
        C1[Identify improvements] --> C2[Refactor code]
        C2 --> C3[Run tests]
        C3 --> C4{Tests STILL PASS?}
        C4 -->|Yes ✓| C5[Security + quality review]
        C4 -->|No ✗| C6[REVERT refactor<br/>Tests must pass]
        C6 --> C1
        C5 --> C7[Review complete]
    end

    C7 --> AUTO2[Auto-continue to Phase 5]
    AUTO2 --> DONE([Phase 5: Finalize])
```

### 3.2 TDD State Transitions

```mermaid
stateDiagram-v2
    [*] --> RED: Phase 1 approved

    RED: Phase 2 - Test RED
    RED --> RED: Tests pass (wrong!)
    RED --> AUTO_GREEN: Tests fail ✓

    AUTO_GREEN: Auto-continue
    AUTO_GREEN --> GREEN

    GREEN: Phase 3 - Build GREEN
    GREEN --> GREEN: Tests fail / Coverage < 80%
    GREEN --> GATE_GREEN: Tests pass + Coverage ≥80%

    GATE_GREEN: Approval Gate
    GATE_GREEN --> REFACTOR: approve
    GATE_GREEN --> GREEN: reject

    REFACTOR: Phase 4 - Refactor + Review
    REFACTOR --> REFACTOR: Tests fail (revert!)
    REFACTOR --> AUTO_FINAL: Tests pass + review complete

    AUTO_FINAL: Auto-continue
    AUTO_FINAL --> [*]: Phase 5 Finalize
```

---

## 4. Agent Detection Flow

### 4.1 Multi-Layer Detection Algorithm

```mermaid
flowchart TD
    START([User Message]) --> L1

    subgraph L1 [Layer 1: Explicit Technology]
        L1A[Check for tech keywords]
        L1B{Found?}
        L1C[+60 points to matching agent]
        L1A --> L1B
        L1B -->|Yes| L1C
    end

    L1 --> L2

    subgraph L2 [Layer 2: Intent Detection]
        L2A[Check action keywords]
        L2B{Intent matched?}
        L2C[+50 points to primary agent<br/>+30 points to secondary]
        L2A --> L2B
        L2B -->|Yes| L2C
    end

    L2 --> L3

    subgraph L3 [Layer 3: Project Context]
        L3A[Read package.json<br/>composer.json<br/>go.mod etc.]
        L3B{Tech stack detected?}
        L3C[+40 points to matching agent]
        L3A --> L3B
        L3B -->|Yes| L3C
    end

    L3 --> L4

    subgraph L4 [Layer 4: File Patterns]
        L4A[Check recent files<br/>Naming conventions]
        L4B{Patterns matched?}
        L4C[+20 points to matching agent]
        L4A --> L4B
        L4B -->|Yes| L4C
    end

    L4 --> SCORE

    subgraph SCORE [Calculate Final Scores]
        S1[Sum all points per agent]
        S2{Score ≥80?}
        S3[PRIMARY Agent]
        S4{Score 50-79?}
        S5[SECONDARY Agent]
        S6{Score 30-49?}
        S7[OPTIONAL Agent]
        S8[Not Selected]

        S1 --> S2
        S2 -->|Yes| S3
        S2 -->|No| S4
        S4 -->|Yes| S5
        S4 -->|No| S6
        S6 -->|Yes| S7
        S6 -->|No| S8
    end

    SCORE --> BANNER[Show Agent Banner]
    BANNER --> EXECUTE[Execute with Selected Agents]
```

### 4.2 Scoring Weights Summary

```mermaid
pie showData
    title Agent Detection Scoring Weights
    "Explicit Mention (+60)" : 60
    "Keyword Match (+50)" : 50
    "Project Context (+40)" : 40
    "Semantic Match (+35)" : 35
    "Task Complexity (+30)" : 30
    "Conversation History (+25)" : 25
    "Project Priority (+25)" : 25
    "File Patterns (+20)" : 20
```

---

## 5. Phase Transition Logic

### 5.1 Approval Gate Decision Tree

```mermaid
flowchart TD
    GATE([Phase N Complete<br/>Show Approval Gate]) --> INPUT{User Input?}

    INPUT -->|"approve" / "yes"| CHECK
    INPUT -->|"reject: reason"| REJECT
    INPUT -->|"modify: changes"| MODIFY
    INPUT -->|"stop" / "cancel"| STOP

    subgraph CHECK [Validation Checks]
        C1{Phase-specific<br/>validation?}
        C1 -->|Phase 1| C2[Requirements + design complete?]
        C1 -->|Phase 3| C3{Tests PASS?<br/>Coverage ≥80%?}

        C2 --> PASS
        C3 -->|Yes| PASS
        C3 -->|No| BLOCK1[ERROR: Tests must pass]
    end

    PASS[Validation Passed ✓] --> NEXT[Continue to<br/>next phase]

    BLOCK1 --> GATE

    subgraph REJECT [Rejection Flow]
        R1[Analyze feedback]
        R2[Brainstorm alternatives]
        R3[Present options]
        R4[Re-do Phase N]
        R1 --> R2 --> R3 --> R4
    end

    R4 --> GATE

    subgraph MODIFY [Modification Flow]
        M1[Light brainstorm]
        M2[Adjust deliverables]
        M3[Update Phase N]
        M1 --> M2 --> M3
    end

    M3 --> GATE

    STOP --> SAVE[Save workflow state]
    SAVE --> END([Workflow Paused])
```

### 5.2 Phase Continuation Rules

```mermaid
flowchart LR
    subgraph "Approval Gates (2)"
        AG1[Phase 1: Understand + Design]
        AG3[Phase 3: Build GREEN]
    end

    subgraph "Auto-Continue (2)"
        AC2[Phase 2: Test RED]
        AC4[Phase 4: Refactor + Review]
    end

    subgraph "Auto-Complete (1)"
        AC5[Phase 5: Finalize]
    end

    AG1 -->|"APPROVAL"| AC2
    AC2 -->|"auto"| AG3
    AG3 -->|"APPROVAL"| AC4
    AC4 -->|"auto"| AC5
    AC5 -->|"auto"| DONE((Done))
```

---

## 6. Session Handoff Flow

### 6.1 Token Threshold Handling

```mermaid
sequenceDiagram
    autonumber
    participant S1 as Session 1
    participant TM as Token Monitor
    participant SM as State Manager
    participant S2 as Session 2

    Note over S1,S2: Normal Operation
    S1->>TM: Track token usage
    TM->>TM: Current: 140K tokens

    Note over S1,S2: 75% Warning (150K)
    S1->>TM: Continue working
    TM->>TM: Current: 150K tokens
    TM-->>S1: ⚠️ TOKEN WARNING<br/>75% context used

    Note over S1,S2: 85% Suggestion (170K)
    S1->>TM: Continue working
    TM->>TM: Current: 170K tokens
    TM-->>S1: 💡 SUGGEST HANDOFF<br/>85% context used
    S1->>SM: handoff (optional)

    Note over S1,S2: 90% Force (180K)
    S1->>TM: Continue working
    TM->>TM: Current: 180K tokens
    TM-->>S1: 🛑 FORCE HANDOFF<br/>90% context used
    S1->>SM: Auto-save state

    Note over S1,S2: State Export
    SM->>SM: Export state.json
    SM->>SM: Export state.toon
    SM->>SM: Generate HANDOFF.md
    SM-->>S1: Handoff complete

    Note over S1,S2: New Session Resume
    S2->>SM: Load HANDOFF.md
    SM-->>S2: Human-readable context
    S2->>SM: Load state.toon
    SM-->>S2: Token-efficient state (~500 tokens)
    S2->>S2: Resume from Phase N
```

### 6.2 State Persistence Flow

```mermaid
flowchart TB
    subgraph "Session 1"
        S1A[Working on Phase 5]
        S1B[Token limit reached]
        S1C[handoff]
    end

    subgraph "State Export"
        E1[state.json<br/>Full state]
        E2[state.toon<br/>Token-efficient]
        E3[HANDOFF.md<br/>Human-readable]
    end

    subgraph "Storage"
        ST1[.claude/logs/workflows/wf-001/]
        ST2[~/.claude/state/temp/]
    end

    subgraph "Session 2"
        S2A[New session starts]
        S2B[Load handoff context]
        S2C[Resume Phase 5]
    end

    S1A --> S1B --> S1C
    S1C --> E1
    S1C --> E2
    S1C --> E3

    E1 --> ST1
    E2 --> ST1
    E3 --> ST2

    ST1 --> S2B
    ST2 --> S2B
    S2A --> S2B --> S2C
```

---

## 7. Workflow State Machine

### 7.1 Workflow Lifecycle States

```mermaid
stateDiagram-v2
    [*] --> Created: /run

    Created --> Phase1_InProgress: Initialize

    Phase1_InProgress --> Phase1_Pending: Work complete
    Phase1_Pending --> Phase2_InProgress: approve (APPROVAL gate)
    Phase1_Pending --> Phase1_InProgress: reject
    Phase1_Pending --> Paused: stop

    Phase2_InProgress --> Phase3_InProgress: Tests failing ✓ (auto-continue)
    Phase2_InProgress --> Paused: stop

    Phase3_InProgress --> Phase3_Pending: Tests passing ✓
    Phase3_Pending --> Phase4_InProgress: approve (APPROVAL gate)
    Phase3_Pending --> Phase3_InProgress: reject
    Phase3_Pending --> Paused: stop

    Phase4_InProgress --> Phase5_InProgress: Refactored + reviewed (auto-continue)
    Phase4_InProgress --> Paused: stop

    Phase5_InProgress --> Completed: Auto-complete

    Paused --> Phase1_InProgress: /run resume (phase 1)
    Paused --> Phase2_InProgress: /run resume (phase 2)
    Paused --> Phase3_InProgress: /run resume (phase 3)
    Paused --> Phase4_InProgress: /run resume (phase 4)
    Paused --> Phase5_InProgress: /run resume (phase 5)

    Completed --> Archived: Archive
    Completed --> [*]: Delete
    Paused --> [*]: Delete
    Archived --> [*]: Delete
```

### 7.2 Multi-Workflow States

```mermaid
stateDiagram-v2
    state "Workflow A" as WFA {
        [*] --> A_Active
        A_Active --> A_Paused: switch to B
        A_Paused --> A_Active: switch to A
    }

    state "Workflow B" as WFB {
        [*] --> B_Paused
        B_Paused --> B_Active: switch to B
        B_Active --> B_Paused: switch to A
    }

    state "Workflow C" as WFC {
        [*] --> C_Paused
        C_Paused --> C_Active: switch to C
        C_Active --> C_Paused: switch to other
    }

    note right of WFA: Only ONE workflow\ncan be active at a time
```

---

## 8. Multi-Agent Collaboration

### 8.1 Agent Swimlane Diagram

```mermaid
sequenceDiagram
    participant User
    participant PM as PM Orchestrator
    participant DEV as Dev Agent
    participant QA as QA Agent
    participant UI as UI Designer
    participant SEC as Security Expert

    rect rgb(200, 220, 255)
        Note over User,SEC: Phase 1: Understand + Design (APPROVAL gate)
        User->>PM: Start feature request
        PM->>PM: Analyze requirements
        PM->>DEV: Design architecture
        DEV->>UI: Component breakdown
        DEV->>QA: Review design
        QA-->>DEV: Feedback
        PM-->>User: Approval Gate
        User->>PM: approve
    end

    rect rgb(200, 255, 200)
        Note over User,SEC: Phase 2-4: TDD Cycle (~80K-150K tokens)
        PM->>QA: Phase 2: Plan + write tests (RED)
        QA->>QA: Write failing tests
        QA-->>User: Tests failing ✓ (auto-continue)

        QA->>DEV: Phase 3: Implement (GREEN)
        DEV->>DEV: Write code
        DEV-->>User: Tests passing ✓ + Approval Gate
        User->>DEV: approve

        DEV->>DEV: Phase 4: Refactor
        DEV->>SEC: Security review
        SEC->>QA: Quality review
        SEC-->>User: Refactored + reviewed ✓ (auto-continue)
    end

    rect rgb(255, 220, 200)
        Note over User,SEC: Phase 5: Finalize (auto-complete)
        SEC->>QA: Final verification
        QA->>PM: Generate docs
        PM->>PM: Notifications
        PM-->>User: Workflow Complete!
    end
```

### 8.2 Background Agent Pattern

```mermaid
flowchart TB
    subgraph "Main Session (Interactive)"
        MS1[User Interaction]
        MS2[Core Implementation]
        MS3[Decision Making]
        MS4[Merge Results]
    end

    subgraph "Background Agents (Parallel)"
        BA1[Agent: Tests<br/>Write tests in parallel]
        BA2[Agent: Docs<br/>Generate documentation]
        BA3[Agent: Review<br/>Security scanning]
    end

    subgraph "Temp Storage"
        TMP[/tmp/archon/agents/]
    end

    MS1 --> MS2
    MS2 -->|Delegate| BA1
    MS2 -->|Delegate| BA2
    MS2 -->|Delegate| BA3

    BA1 -->|Write| TMP
    BA2 -->|Write| TMP
    BA3 -->|Write| TMP

    TMP -->|Read| MS4
    MS3 --> MS4
```

---

## 9. Token Budget Distribution

### 9.1 Session Token Allocation

```mermaid
gantt
    title Token Budget per Phase (~40K total target)
    dateFormat X
    axisFormat %s

    section Phase 1
    Understand + Design         :a1, 0, 35

    section Phase 2
    Test RED                    :a2, 0, 40

    section Phase 3
    Build GREEN                 :a3, 0, 40

    section Phase 4
    Refactor + Review           :a4, 0, 15

    section Phase 5
    Finalize                    :a5, 0, 8
```

### 9.2 Token Threshold Visualization

```mermaid
xychart-beta
    title "Token Usage Thresholds"
    x-axis ["0%", "25%", "50%", "75%", "85%", "90%", "100%"]
    y-axis "Action Required" 0 --> 4
    bar [0, 0, 0, 1, 2, 3, 4]
```

Legend:
- 0 = Normal operation
- 1 = Warning shown (75%)
- 2 = Suggest handoff (85%)
- 3 = Force handoff (90%)
- 4 = Limit reached (100%)

---

## 10. Approval Gate Flow

### 10.1 Gate Response Handling

```mermaid
flowchart TD
    GATE[/"Approval Gate Displayed"\]

    GATE --> R1{Response Type?}

    R1 -->|approve / yes| V1[Run Validation]
    R1 -->|reject: reason| B1[Brainstorm Mode]
    R1 -->|modify: changes| M1[Light Brainstorm]
    R1 -->|stop / cancel| S1[Save State]

    V1 --> V2{Validation<br/>Passed?}
    V2 -->|Yes| NEXT[AUTO-CONTINUE<br/>Next Phase]
    V2 -->|No| ERR[Show Error<br/>Return to Gate]
    ERR --> GATE

    B1 --> B2[Analyze Feedback]
    B2 --> B3[Generate Alternatives]
    B3 --> B4[Present Options with Pros/Cons]
    B4 --> B5[User Selects Option]
    B5 --> B6[Re-execute Phase]
    B6 --> GATE

    M1 --> M2[Quick Analysis]
    M2 --> M3[Adjust Deliverables]
    M3 --> GATE

    S1 --> S2[Export workflow-state.json]
    S2 --> S3[Generate Handoff Doc]
    S3 --> END([Workflow Paused])

    NEXT --> DONE([Continue to next phase])
```

### 10.2 Gate Banner Format

```mermaid
flowchart LR
    subgraph "Approval Gate Banner (Phase 1 or Phase 3 only)"
        direction TB
        H1["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]
        H2["🏗️ Phase N: Name - Approval Needed"]
        H3["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]
        H4["## Summary"]
        H5["[Deliverables list]"]
        H6["---"]
        H7["📍 Progress: ████░░░░ X/5"]
        H8["⏭️ Next: Phase N+1"]
        H9["---"]
        H10["Options:"]
        H11["• approve → Continue"]
        H12["• reject: reason → Redo"]
        H13["• modify: changes → Adjust"]
        H14["• stop → Pause workflow"]

        H1 --> H2 --> H3 --> H4 --> H5 --> H6 --> H7 --> H8 --> H9 --> H10 --> H11 --> H12 --> H13 --> H14
    end
```

---

## Rendering Instructions

### GitHub
Mermaid diagrams render automatically in GitHub markdown files.

### VS Code
Install the "Markdown Preview Mermaid Support" extension.

### Online
Use [mermaid.live](https://mermaid.live) to render and edit diagrams.

### Export
Use mermaid-cli to export as PNG/SVG:
```bash
npx @mermaid-js/mermaid-cli -i WORKFLOW_DIAGRAMS.md -o output/
```

---

**Last Updated:** 2026-03-12
**Format:** Mermaid
