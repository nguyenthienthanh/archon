# OS Architecture — AI Reference

**Format:** TOON | **Human version:** `docs/architecture/os-architecture.md` (repo root)

---

## OS Map

```toon
os_map[10]{concept,implementation,detail}:
  CPU/Kernel,Claude + orchestrator rules,Dispatch + verify — never execute directly
  RAM,Context window,Managed segments with eviction policies
  Processes,9 agents,PID + state + token budget per agent
  Scheduler,5-phase TDD workflow,Priority-based phase progression
  Interrupts,Approval gates (P1 + P3),Human-in-the-loop checkpoints
  IPC,Handoff state / TOON snapshots,Agent-to-agent data passing
  Device Drivers,6 MCP servers,Auto-invoked external interfaces
  Filesystem,Project files on disk,Read on demand — never preload
  Compression,TOON format,Minimize memory footprint
  Context Switch,Agent swap protocol,Save state → evict → load new → inject
```

## Memory Segments

```toon
segments[6]{segment,budget,eviction}:
  KERNEL,2K,Never evict
  INDEX,800,Never evict
  STACK (agent instructions),4K,Evict on agent switch
  HEAP (project context),8K,LRU — compact via TOON
  BUFFER (tool/MCP responses),4K,Evict after processing
  RESERVE (compact buffer),2K,Protected
```

## Context Switch Protocol

```toon
context_switch[4]{step,action}:
  1,Save current agent state to TOON snapshot
  2,Evict STACK segment (agent instructions)
  3,Load new agent instructions into STACK
  4,Inject relevant project context into HEAP
```

## Compression Tiers

```toon
compression[3]{tier,trigger,action}:
  MicroCompact,Every 10 turns or >60% context,Local cleanup — free
  AutoCompact,>80% context,Single /compact call
  ManualCompact,User request or workflow:handoff,Full session snapshot
```
