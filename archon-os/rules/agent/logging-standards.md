> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Logging Standards

**Category:** Code Quality
**Priority:** High
**Applies To:** All code, especially backend services

---

## Core Principle

**Use structured JSON logging with correlation IDs, appropriate levels, and sanitized sensitive data.**

---

## Log Levels

```toon
log_levels[5]{level,when_to_use,example}:
  ERROR,Failures requiring attention,Database connection failed
  WARN,Potential issues / recoverable,Rate limit approaching
  INFO,Important business events,User registered / order placed
  DEBUG,Development troubleshooting,Function input/output
  TRACE,Detailed execution flow,Loop iterations
```

---

## Required Fields

```typescript
{
  timestamp: '2025-01-15T10:30:00.000Z',  // ISO 8601
  level: 'error',
  message: 'Payment processing failed',    // Human-readable
  service: 'payment-service',
  requestId: 'req_abc123',                 // Correlation ID
  // + context-specific fields
}
```

---

## What to Log / Never Log

```toon
always_log[5]{event,fields}:
  Request start/end,method / path / duration / status
  Authentication,userId / success/failure / method
  Business events,eventType / entityId / outcome
  Errors,message / stack / context
  External calls,service / endpoint / duration / status
```

```toon
never_log[6]{data_type,reason}:
  Passwords,Security
  API tokens/keys,Security
  Credit card numbers,PCI compliance
  Full SSN/ID numbers,Privacy
  Session tokens,Security
  PII in production,GDPR/Privacy
```

---

## Sanitization

```typescript
function sanitize(data: Record<string, unknown>) {
  const sensitive = ['password', 'token', 'apiKey', 'ssn', 'creditCard']
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) =>
      sensitive.some(s => k.toLowerCase().includes(s))
        ? [k, '[REDACTED]']
        : [k, v]
    )
  )
}
```

---

## Environment Config

```toon
env_logging[3]{environment,level,format,output}:
  Development,DEBUG,Pretty,Console
  Staging,DEBUG,JSON,Console + File
  Production,INFO,JSON,Aggregator (DataDog etc.)
```

---

## Anti-Patterns

- `console.log` in production
- Logging sensitive data (passwords, tokens)
- Unstructured string interpolation: `` `Error: ${error} for user ${userId}` ``
- Missing context: `logger.error('Something failed')`
- Swallowing errors: `catch (e) { /* nothing */ }`

---
