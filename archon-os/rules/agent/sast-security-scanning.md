> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# SAST Security Scanning Rule

**Category:** Security
**Priority:** Critical
**Applies To:** All code changes

---

## Core Principle

**All code changes must be scanned for security vulnerabilities before merge. Critical findings block deployment.**

---

## When Required

```toon
required_triggers[6]{scenario,scan_type,phase}:
  New feature implementation,Full scan,Phase 4
  Bug fix touching auth/security,Targeted scan,Phase 4
  API endpoint changes,API security scan,Phase 4
  Database query changes,SQL injection scan,Phase 3
  User input handling,XSS/injection scan,Phase 3
  Dependency updates,Dependency audit,Phase 5
```

---

## OWASP Top 10 Checks

```toon
owasp_checks[10]{id,vulnerability,detection}:
  A01,Broken Access Control,Auth bypass patterns
  A02,Cryptographic Failures,Weak crypto/hardcoded secrets
  A03,Injection,SQL/NoSQL/Command/LDAP injection
  A04,Insecure Design,Missing security controls
  A05,Security Misconfiguration,Default configs/verbose errors
  A06,Vulnerable Components,Outdated dependencies with CVEs
  A07,Auth Failures,Weak passwords/session issues
  A08,Data Integrity Failures,Unsigned data/insecure deserialization
  A09,Logging Failures,Missing audit logs/log injection
  A10,SSRF,Server-side request forgery patterns
```

---

## Critical Patterns (Block Merge)

```toon
critical_patterns[4]{vulnerability,bad_pattern,fix}:
  SQL Injection,"`SELECT * FROM users WHERE id = ${userId}`",Parameterized queries
  Command Injection,"exec(`rm -rf ${userInput}`)",Validate + path.basename
  Hardcoded Secrets,"const apiKey = 'sk-123...'",process.env.API_KEY
  XSS,"element.innerHTML = userInput",textContent or DOMPurify.sanitize
```

High warnings: weak crypto (md5/sha1 → use sha256+), missing input validation (validate with schema before processing).

---

## Tools by Language

```toon
scan_tools[4]{language,tools}:
  JS/TS,"eslint-plugin-security, semgrep --config=p/javascript, npm audit"
  Python,"bandit -r, safety check, semgrep --config=p/python"
  Go,"gosec ./..., semgrep --config=p/golang"
  PHP,"phpstan --level=max, psalm --taint-analysis"
```

---

## Severity Handling

```toon
severity[4]{level,action,timeline}:
  Critical,Block merge — security team sign-off,Immediate
  High,Fix or document risk acceptance — tech lead sign-off,Before release
  Medium,Track and plan fix,Within sprint
  Low,Best-effort,Backlog
```

---

## Secrets Detection

```toon
secret_patterns[5]{type,pattern,action}:
  AWS Keys,AKIA[0-9A-Z]{16},Block + alert
  GitHub Tokens,ghp_[a-zA-Z0-9]{36},Block + alert
  Private Keys,-----BEGIN.*PRIVATE KEY-----,Block + alert
  Database URLs,postgres://.*:.*@,Block + alert
  Generic Secrets,password.*=.*['\"][^'\"]+,Warn
```

Pre-commit hook: `gitleaks detect --source . --verbose`

---

## CI/CD Integration

```yaml
# GitHub Actions
security-scan:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: returntocorp/semgrep-action@v1
      with:
        config: "p/security-audit p/owasp-top-ten"
    - run: npm audit --audit-level=high
```

---

## Related Rules

- `safety-rules.md` — External system safety
- `error-handling-standard.md` — Secure error handling
- `logging-standards.md` — Secure logging

---
