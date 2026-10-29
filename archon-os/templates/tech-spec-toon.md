# Tech Spec (AI-Readable)

**Format:** TOON (Token-Optimized)
**Purpose:** Concise tech spec for AI implementation guidance

---

## Header

```toon
spec:
  feature: [Feature Name]
  jira: [JIRA-XXX]
  author: [Agent Name]
  date: [YYYY-MM-DD]
  version: 1.0.0
```

---

## Overview

```toon
overview:
  purpose: [Brief description - 1-2 sentences]
  scope: [What's included]
  out_of_scope: [What's excluded]
```

---

## Requirements

```toon
functional[N]{id,requirement,priority,status}:
  FR-001,[Requirement description],high,pending
  FR-002,[Requirement description],medium,pending

nonfunctional[N]{id,requirement,target,status}:
  NFR-001,Page load time,<2s,pending
  NFR-002,Test coverage,>=80%,pending
```

---

## Architecture

```toon
architecture:
  pattern: [e.g., Feature-based, Clean Architecture]
  layers: presentation;domain;data
```

### Component Structure

```
FeatureContainer
├── FeatureHeader
├── FeatureContent
│   ├── Section1
│   └── Section2
└── FeatureFooter
```

### Data Flow

```
User Action → Hook → API → Backend → DB → Response → UI Update
```

---

## Files

```toon
files[N]{path,action,purpose}:
  src/features/[feature]/index.ts,CREATE,Feature barrel export
  src/features/[feature]/components/[Component].tsx,CREATE,Main component
  src/features/[feature]/hooks/use[Feature].ts,CREATE,Feature hook
  src/features/[feature]/api/[feature]Api.ts,CREATE,API client
  src/features/[feature]/types/index.ts,CREATE,Type definitions
  src/features/[feature]/__tests__/[feature].test.ts,CREATE,Unit tests
```

---

## API Contracts

```toon
apis[N]{method,endpoint,auth,request,response}:
  GET,/api/[resource],true,{page;limit},{data;meta}
  POST,/api/[resource],true,{name;description},{data;message}
  PUT,/api/[resource]/{id},true,{name;description},{data;message}
  DELETE,/api/[resource]/{id},true,{},{message}
```

### Request/Response Details

```toon
models[N]{name,fields,optional}:
  CreateRequest,name:string;description:string,description
  UpdateRequest,name:string;description:string;status:string,all
  Response,id:string;name:string;createdAt:Date,none
  ListResponse,data:Item[];meta:Meta,none
```

---

## Data Models

### Frontend (TypeScript)

```typescript
interface [Feature] {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}
```

### Database Schema

```toon
tables[N]{name,columns,indexes}:
  [features],id:uuid;name:varchar(255);status:varchar(50);user_id:uuid;created_at:timestamp,user_id;status
```

---

## State Management

```toon
state:
  library: [zustand/redux/pinia]

slices[N]{name,state,actions}:
  [feature]Slice,[items];[selectedItem];[loading],[setItems];[addItem];[updateItem];[removeItem]
```

---

## Security

```toon
security[N]{aspect,implementation}:
  authentication,JWT tokens with 1h expiry
  authorization,RBAC with role checks
  validation,Yup frontend + Laravel backend
  encryption,AES-256 at rest; HTTPS in transit
  rate_limiting,100 req/min per user
```

---

## Performance

```toon
targets[N]{metric,target}:
  page_load,<2s
  api_response,<500ms p95
  render_time,<100ms
  memory,<150MB
```

---

## Testing

```toon
coverage:
  target: 85

tests[N]{type,scope,count}:
  unit,hooks;utils;services,15
  component,UI components,10
  integration,API flows,8
  e2e,Critical paths,5
```

---

## Dependencies

```toon
packages[N]{name,version,purpose}:
  react-query,4.26.1,Server state
  zustand,4.3.6,Client state
  axios,1.6.0,HTTP client
  yup,1.4.0,Validation
```

---

## Risks

```toon
risks[N]{risk,impact,probability,mitigation}:
  API downtime,high,medium,Retry logic + fallback UI
  Performance issues,medium,low,Load testing + monitoring
  Security vulnerabilities,critical,low,Security audit + pen testing
```

---

## Timeline

```toon
phases[N]{phase,duration,deliverables}:
  planning,1d,Tech spec + LLD
  design,1d,Component breakdown
  implementation,3d,Code + tests
  testing,2d,QA + bug fixes
  documentation,1d,Docs + guides
  deployment,1d,Staging + production
```

---

**Status:** Ready for Implementation
**Total Files:** [N]
**Total APIs:** [N]
**Est. Duration:** [N] days
