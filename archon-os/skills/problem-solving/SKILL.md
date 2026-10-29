---
name: problem-solving
description: "5 techniques for different problem types. Use when stuck or facing complex challenges."
autoInvoke: false
priority: high
triggers:
  - "stuck"
  - "can't figure out"
  - "need breakthrough"
  - "multiple approaches"
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Problem Solving Techniques

Use when stuck, need breakthrough, or evaluating approaches.

## Decision Matrix

```toon
techniques[5]{symptom,technique,approach}:
  "Tried everything / spiraling",Simplification Cascades,"Strip to minimal → rebuild one piece at a time → find breaking layer"
  "Need creative idea",Collision-Zone Thinking,"Combine principles from unrelated domains into novel solution"
  "Same issue keeps recurring",Meta-Pattern Recognition,"List all similar issues → find shared root → fix the pattern"
  "Stuck in only-one-way thinking",Inversion Exercise,"State assumption → ask 'what if opposite?' → explore inverted approach"
  "Will it scale?",Scale Game,"Test at 10x/100x/1000x → find breaking point → design for 10x actual need"
```

## Simplification Cascades (Most Used)

1. Remove ALL features except core
2. Make it work with hardcoded values
3. Add ONE thing back
4. Repeat until issue appears
5. Fix at that layer

## Inversion Exercise

1. State current assumption: "We must do X"
2. Ask: "What if we never do X?" or "What if we do the opposite?"
3. Explore — often reveals a better design

## Scale Game

Test at 10x, 100x, 1000x current load. Find breaking point. Design for 10x actual need (not 1000x).

## Quick Reference

Stuck → Simplify first. Creative block → Collision zones. Recurring → Meta-patterns. Tunnel vision → Invert. Scaling → Scale game.
