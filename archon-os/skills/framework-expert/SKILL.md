---
name: framework-expert
description: "Unified framework expertise bundle. Lazy-loads relevant framework patterns (React, Vue, Angular, Next.js, Node.js, Python, Laravel, Go, Flutter, React Native, TypeScript) based on detected tech stack."
autoInvoke: false
priority: 50
triggers:
  - "framework"
  - "react"
  - "vue"
  - "angular"
  - "nextjs"
  - "nodejs"
  - "python"
  - "laravel"
  - "go"
  - "flutter"
context: fork
user-invocable: false
---

> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.


# Framework Expert (Bundle)

Lazy-loads detected framework patterns. Per-framework depth (gotchas, decision
criteria, code examples) lives in `refs/<framework>.md` — this bundle no longer
delegates to separate `<name>-expert` skills; **Read the matching ref file on
demand** once you detect the stack. Use Context7 for full library docs.

## Detection

```toon
bundles[4]{bundle,frameworks,detect_by}:
  web-frontend,"react vue angular nextjs","package.json deps"
  web-backend,"nodejs python laravel go","package.json/requirements.txt/composer.json/go.mod"
  mobile,"react-native flutter","app.json (expo) or pubspec.yaml"
  typescript,typescript,"tsconfig.json or .ts files"
```

Svelte and Godot used to be listed here and had no reference of their own, so
detecting either sent the model looking for depth that does not exist — reach
for Context7 for those instead.

## Framework References (Read on demand)

Once a framework is detected, Read its ref file for the gotchas and decision
tables:

```toon
refs[11]{framework,ref}:
  React,refs/react.md
  Vue,refs/vue.md
  Angular,refs/angular.md
  Next.js,refs/nextjs.md
  Node.js,refs/nodejs.md
  Python,refs/python.md
  Laravel,refs/laravel.md
  Go,refs/go.md
  Flutter,refs/flutter.md
  React Native,refs/react-native.md
  TypeScript,refs/typescript.md
```

## Core Patterns (All Frameworks)

```toon
core[8]{pattern,rule}:
  File organization,Group by feature not type
  Naming,PascalCase components camelCase functions
  Error handling,Graceful degradation + user feedback
  State,Minimize global state
  API design,RESTful or GraphQL conventions
  Testing,Unit + integration + e2e
  Performance,Lazy loading + code splitting
  Security,Input validation + sanitization
```

Load framework-specific patterns from `refs/<framework>.md` on demand.
