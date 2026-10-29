# Lead Agent - Reference Patterns

**Source:** `agents/lead.md`
**Load:** On-demand when detailed workflow orchestration patterns needed

---

## Team Roster

```toon
dev_agents[11]{agent,priority,specialization}:
  mobile-react-native,100,React Native + Expo
  mobile-flutter,95,Flutter + Dart
  backend-nodejs,95,"Node.js, Express, NestJS"
  web-angular,90,"Angular 17+, signals"
  web-vuejs,90,"Vue 3, Composition API"
  web-reactjs,90,"React 18, hooks"
  web-nextjs,90,"Next.js, SSR/SSG"
  backend-python,90,"Django, FastAPI"
  backend-laravel,90,Laravel PHP
  backend-go,85,"Go, Gin, Fiber"
  architect,85,System design + schema + query optimization
```

```toon
quality_agents[5]{agent,priority,specialization}:
  security,95,"OWASP, vulnerability scanning"
  devops,90,"Docker, K8s, CI/CD"
  scanner,100,Project detection + context management
  tester,85,"Jest, Cypress, Detox"
  frontend,85,"UI/UX, Figma integration"
```

```toon
system_agents[1]{agent,priority,specialization}:
  router,100,Agent selection + routing
```

---

## Approval Gates

**Phase Completion:** Present deliverables + summary + metrics. Options: `approve`/`yes` (next phase), `reject: <reason>` (restart), `modify: <changes>` (refine), `stop` (cancel).

**Code Generation:** List files to generate/modify + impact (LOC, tests). Await `proceed` or `stop`.

**External Write:** Confirm before writing to JIRA/Confluence/Slack. Await `confirm` or `cancel`.

---

## Agent Coordination

**Task Assignment:** Specify agent, priority, task description, context (ticket + phase), deliverables, estimate.

**Cross-Agent Communication:** From/To/Subject/Question/Urgency format.

**Conflict Resolution:** Present options with pros/cons, provide recommendation, request human decision.

---

## Escalation Triggers

```toon
escalations[7]{trigger,severity}:
  Agent conflict unresolved after 2 rounds,High
  Technical impossibility discovered,High
  Requirements contradiction,High
  Scope change >20% timeline impact,Medium
  Security vulnerability found,Critical
  Breaking changes required,Medium
  External API/service down,Medium
```

Format: Severity + Issue + Impact + Attempted solutions + Recommendation + Blocking agents/phases.

---

## Quality Gates

**Pre-Phase Transition:** All deliverables generated, quality met, gate presented, human approved.

**Pre-Implementation:** Requirements + architecture approved, tests planned, no blockers.

**Pre-Code Review:** All tests pass, coverage >= threshold, linter clean.

**Pre-Production:** QA passed, docs complete, deployment guide ready, rollback plan documented.

---

## Success Metrics

```toon
metrics[5]{metric,target}:
  Phase Completion Rate,100%
  Rework Rate,<10%
  Test Coverage,>=80%
  Critical Bugs in Prod,0
  Cross-Review Issues Caught,>90%
```

---

## Team Lead Mode Sequences

**Parallel Startup:** TeamCreate -> TaskCreate (all tasks in one message) -> Spawn teammates in parallel (each gets: team config path, TaskList instructions, claim/complete/report pattern, relevant context).

**Monitor + Cross-Review:** Receive completion messages, assign cross-reviews, forward feedback to original authors.

**Phase Transition:** Shutdown current teammates -> spawn new set for next phase. Single-agent phases (5): lead works alone.

### Active Agent Roster

```toon
active_agents[10]{agent,role,phases}:
  lead,Lead/Coordinator,1+5
  architect,System design + backend + database,1+2+3+4
  frontend,Frontend + design systems,1+3
  mobile,React Native + Flutter,1+3 (mobile projects)
  gamedev,Godot game dev,All phases (game projects)
  tester,Testing + QA,1+2+3+4
  security,Security audits,4
  devops,CI/CD + infrastructure,3+4+5
  router,Agent selection,N/A (detection only)
  scanner,Project context,N/A (context only)
```
