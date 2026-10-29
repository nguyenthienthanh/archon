# Test Plan (AI-Readable)

**Format:** TOON (Token-Optimized)
**Purpose:** Concise test plan for AI test generation

---

## Header

```toon
plan:
  feature: [Feature Name]
  jira: [JIRA-XXX]
  date: [YYYY-MM-DD]
  lead: tester
```

---

## Strategy

```toon
strategy:
  coverage_target: 85

distribution[3]{type,percentage}:
  unit,60
  integration,30
  e2e,10

scope:
  in: [Feature components;hooks;API;state]
  out: [Third-party libs;legacy code]
```

---

## Environment

```toon
environments[N]{platform,versions,network}:
  iOS,16+;17+,wifi;4g
  Android,12+;13+;14+,wifi;4g
  Web,Chrome 120+;Safari 17+;Firefox 120+,broadband

test_data:
  source: staging
  refresh: before_each_run
```

---

## Test Cases

```toon
tests[N]{id,type,component,description,priority}:
  TC-001,unit,useAuth,Login function returns token,high
  TC-002,unit,useAuth,Logout clears state,high
  TC-003,unit,useAuth,Token refresh on expiry,high
  TC-004,unit,authApi,API error handling,medium
  TC-005,component,LoginForm,Renders all fields,high
  TC-006,component,LoginForm,Validates email format,high
  TC-007,component,LoginForm,Shows password toggle,medium
  TC-008,component,LoginForm,Disables submit when invalid,high
  TC-009,integration,LoginFlow,Successful login redirects,critical
  TC-010,integration,LoginFlow,Failed login shows error,high
  TC-011,integration,LoginFlow,Network error shows retry,medium
  TC-012,e2e,AuthJourney,Complete login to logout,critical
  TC-013,e2e,AuthJourney,Password reset flow,high
```

---

## Scenarios (BDD)

```toon
scenarios[N]{id,feature,given,when,then}:
  SC-001,Login,User on login page,Enters valid credentials,Redirected to home
  SC-002,Login,User on login page,Enters invalid email,Shows validation error
  SC-003,Login,User on login page,Enters wrong password,Shows auth error
  SC-004,Login,User on login page,Server unavailable,Shows network error
  SC-005,Logout,User logged in,Clicks logout,Redirected to login + state cleared
```

---

## Data Requirements

```toon
test_users[N]{role,email,password,purpose}:
  admin,admin@test.com,Test123!,Admin flow tests
  user,user@test.com,Test123!,Standard user tests
  guest,guest@test.com,Test123!,Limited access tests

test_fixtures[N]{name,file,purpose}:
  validUser,fixtures/valid-user.json,Successful responses
  invalidCreds,fixtures/invalid-creds.json,Error responses
  networkError,fixtures/network-error.json,Timeout/error states
```

---

## Mocks & Stubs

```toon
mocks[N]{service,method,response}:
  authApi,login,{token:jwt;user:User}
  authApi,logout,{success:true}
  authApi,refreshToken,{token:newJwt}
  authApi,login_error,{error:Invalid credentials;status:401}
```

---

## Coverage Mapping

```toon
coverage[N]{file,lines,branches,functions}:
  src/hooks/useAuth.ts,95,90,100
  src/api/authApi.ts,90,85,100
  src/components/LoginForm.tsx,85,80,90
  src/utils/tokenStorage.ts,100,100,100
```

---

## Risk Assessment

```toon
risks[N]{risk,impact,probability,mitigation}:
  Flaky tests,medium,medium,Stable selectors + retries
  API rate limits,high,low,Mock API in CI
  Test data pollution,medium,medium,Isolated test DB
  Slow E2E tests,low,high,Parallelize + headless
```

---

## Schedule

```toon
schedule[N]{phase,duration,tasks}:
  planning,1d,Test plan + case design
  unit_tests,2d,Write unit + component tests
  integration,1d,API integration tests
  e2e,1d,Critical path E2E tests
  execution,1d,Full test run + fixes
  regression,1d,Regression + sign-off
```

---

## Exit Criteria

```toon
criteria[N]{criterion,target,blocking}:
  coverage,>=85%,yes
  critical_tests,100% pass,yes
  high_tests,>=95% pass,yes
  medium_tests,>=90% pass,no
  known_bugs,0 critical; <=2 high,yes
```

---

**Status:** Ready for Test Implementation
**Total Tests:** [N]
**Est. Duration:** [N] days
