---
last_aligned_with: v3.7.3
status: needs_review
audience: active-user
---

# TOON Format Guide

**Purpose:** Token-optimized notation for AI-readable documents
**Source:** [TOON Format](https://github.com/toon-format/toon) by toon-format
**License:** MIT

---

## Credits & Attribution

TOON (Token-Oriented Object Notation) is an open-source format created by the [toon-format](https://github.com/toon-format) team.

- **Repository:** https://github.com/toon-format/toon
- **Documentation:** https://toonformat.dev
- **NPM Package:** `@toon-format/toon`

Archon OS uses TOON format under the MIT license to optimize token usage in AI-readable documents.

---

## What is TOON?

TOON (Token-Oriented Object Notation) reduces token usage by ~40% compared to JSON/Markdown tables while improving AI accuracy.

**When to use TOON:**
- Structured data in TECH_SPEC, TEST_PLAN
- File lists, API contracts, test cases
- Any tabular data AI needs to read

**When NOT to use TOON:**
- Narrative documentation (use Markdown)
- Human-facing docs (README, guides)
- Deeply nested non-uniform data

---

## Syntax Reference

### Basic Key-Value

```toon
feature: User Authentication
priority: high
status: in_progress
```

### Simple Arrays

```toon
tags[3]: auth,profile,api
dependencies[4]: react,zustand,axios,yup
```

### Tabular Arrays (Most Savings)

Declare structure once, then stream rows:

```toon
files[4]{path,action,purpose}:
  src/services/auth.ts,CREATE,Auth service
  src/hooks/useAuth.ts,CREATE,Auth hook
  src/api/login.ts,CREATE,Login endpoint
  src/types/auth.ts,CREATE,Type definitions
```

**Syntax breakdown:**
- `files` - array name
- `[4]` - array length
- `{path,action,purpose}` - column headers
- `:` - separator
- Each line = one row, comma-separated values

### Nested Objects

```toon
config:
  database:
    host: localhost
    port: 5432
  cache:
    enabled: true
    ttl: 300
```

### Mixed Content

```toon
spec:
  feature: User Profile
  type: feature

files[3]{path,action,purpose}:
  src/screens/Profile.tsx,CREATE,Profile screen
  src/hooks/useProfile.ts,CREATE,Profile hook
  src/api/profile.ts,CREATE,Profile API

apis[2]{method,endpoint,request,response}:
  GET,/api/profile,{},User
  PUT,/api/profile,ProfileUpdate,User
```

---

## TOON in Archon OS

### TECH_SPEC.md Format

```toon
spec:
  feature: [Feature Name]
  jira: [JIRA-XXX]
  date: [YYYY-MM-DD]

requirements[N]{id,description,priority,status}:
  FR-001,User can login with email,High,pending
  FR-002,User can reset password,Medium,pending

files[N]{path,action,purpose}:
  src/services/auth.ts,CREATE,Authentication service
  src/hooks/useAuth.ts,CREATE,Auth state hook
  src/screens/Login.tsx,CREATE,Login screen

apis[N]{method,endpoint,auth,request,response}:
  POST,/api/auth/login,false,{email;password},{token;user}
  POST,/api/auth/logout,true,{},{success}
  GET,/api/auth/me,true,{},User

models[N]{name,fields,relations}:
  User,id;email;name;avatar,hasMany:Session
  Session,id;token;userId;expiresAt,belongsTo:User

risks[N]{risk,impact,probability,mitigation}:
  API downtime,High,Medium,Retry logic + fallback
  Token exposure,Critical,Low,Secure storage
```

### TEST_PLAN.md Format

```toon
plan:
  feature: [Feature Name]
  coverage_target: 85
  test_lead: tester

tests[N]{id,category,description,priority}:
  TC-001,unit,Auth service login function,high
  TC-002,unit,Auth service logout function,high
  TC-003,integration,Login flow with API,high
  TC-004,e2e,Complete login journey,critical

scenarios[N]{id,given,when,then}:
  SC-001,User on login page,Enters valid credentials,Redirected to home
  SC-002,User on login page,Enters invalid password,Shows error message
  SC-003,User logged in,Clicks logout,Redirected to login

risks[N]{risk,impact,mitigation}:
  Flaky tests,Medium,Add retries + stable selectors
  API rate limits,High,Mock API in tests
```

### Workflow Deliverables

```toon
deliverables[N]{phase,document,location,required}:
  1,REQUIREMENTS.md,.claude/logs/workflows/{id}/,yes
  2,TECH_SPEC.md,.claude/logs/workflows/{id}/,yes
  2,TECH_SPEC_CONFLUENCE.md,.claude/logs/workflows/{id}/,yes
  3,UI_BREAKDOWN.md,.claude/logs/workflows/{id}/,if_ui
  4,TEST_PLAN.md,.claude/logs/workflows/{id}/,yes
  6,CODE_REVIEW.md,.claude/logs/workflows/{id}/,yes
  7,QA_REPORT.md,.claude/logs/workflows/{id}/,yes
  8,IMPLEMENTATION_SUMMARY.md,.claude/logs/workflows/{id}/,yes
```

---

## Token Savings Examples

### Example 1: File List

**Markdown (45 tokens):**
```markdown
| File | Action | Purpose |
|------|--------|---------|
| src/auth.ts | CREATE | Auth service |
| src/login.tsx | CREATE | Login screen |
| src/types.ts | MODIFY | Add types |
```

**TOON (28 tokens, 38% savings):**
```toon
files[3]{path,action,purpose}:
  src/auth.ts,CREATE,Auth service
  src/login.tsx,CREATE,Login screen
  src/types.ts,MODIFY,Add types
```

### Example 2: API Contracts

**Markdown (120 tokens):**
```markdown
| Method | Endpoint | Auth | Request | Response |
|--------|----------|------|---------|----------|
| POST | /api/auth/login | No | { email, password } | { token, user } |
| POST | /api/auth/logout | Yes | {} | { success } |
| GET | /api/auth/me | Yes | {} | User |
```

**TOON (65 tokens, 46% savings):**
```toon
apis[3]{method,endpoint,auth,request,response}:
  POST,/api/auth/login,false,{email;password},{token;user}
  POST,/api/auth/logout,true,{},{success}
  GET,/api/auth/me,true,{},User
```

### Example 3: Test Cases

**Markdown (180 tokens):**
```markdown
| ID | Category | Description | Priority | Status |
|----|----------|-------------|----------|--------|
| TC-001 | Unit | Auth service login | High | Pending |
| TC-002 | Unit | Auth service logout | High | Pending |
| TC-003 | Integration | Login flow | High | Pending |
| TC-004 | E2E | Complete journey | Critical | Pending |
```

**TOON (95 tokens, 47% savings):**
```toon
tests[4]{id,category,description,priority,status}:
  TC-001,unit,Auth service login,high,pending
  TC-002,unit,Auth service logout,high,pending
  TC-003,integration,Login flow,high,pending
  TC-004,e2e,Complete journey,critical,pending
```

---

## Special Characters

Use semicolons for nested values within cells:

```toon
models[2]{name,fields}:
  User,id;email;name;createdAt
  Post,id;title;content;userId
```

Use quotes for values containing commas:

```toon
messages[2]{key,text}:
  welcome,"Hello, welcome!"
  error,"Oops, something went wrong"
```

---

## Validation

TOON is validated by array length declarations:

```toon
# Valid: 3 items declared, 3 rows provided
files[3]{path,action}:
  a.ts,CREATE
  b.ts,MODIFY
  c.ts,DELETE

# Invalid: 3 declared but 2 provided
files[3]{path,action}:
  a.ts,CREATE
  b.ts,MODIFY
```

---

## Best Practices

1. **Declare lengths** - `[N]` helps AI verify completeness
2. **Consistent columns** - Keep same fields across rows
3. **Short headers** - Use abbreviated column names
4. **Semicolons for nesting** - Avoid commas within values
5. **Mix with Markdown** - Use TOON for data, Markdown for narrative

---

## Related

- `workflow-deliverables.md` - Phase document requirements
- `templates/tech-spec.md` - TOON-enabled tech spec template
- `templates/test-plan.md` - TOON-enabled test plan template

---

