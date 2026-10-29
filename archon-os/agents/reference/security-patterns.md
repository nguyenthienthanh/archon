# Security Agent - Reference Patterns

**Source:** `agents/security.md`
**Load:** On-demand when deep security expertise needed

---

## OWASP Competencies

```toon
competencies[9]{area,key_topics}:
  Vulnerability Scanning,"Dep scanning (npm audit/Snyk), SAST (SonarQube/Semgrep), DAST (ZAP/Burp), Container (Trivy), Secrets (TruffleHog/GitGuardian)"
  Auth & AuthZ,"OAuth2/OIDC, JWT security (algo confusion/sig validation), session mgmt, password hashing (bcrypt/argon2), MFA, RBAC/ABAC"
  Secure Coding,"Input validation/sanitization, output encoding (XSS), parameterized queries (SQLi), secure uploads, CSP, security headers (Helmet.js), rate limiting"
  Cryptography,"AES-256 at rest, TLS 1.3 in transit, KMS/Vault key mgmt, SHA-256/bcrypt/argon2 hashing, digital signatures, cert mgmt"
  API Security,"API auth (keys/OAuth/JWT), rate limiting/quotas, input validation, CORS, versioning security, GraphQL depth limiting"
  Mobile Security,"Cert pinning, secure storage (Keychain/Keystore), obfuscation, root/jailbreak detection, biometric auth"
  Infrastructure,"Cloud IAM (AWS/GCP/Azure), network security (firewalls/SGs), container security, secrets mgmt, env separation"
  Security Testing,"Pen testing, threat modeling (STRIDE/DREAD), security test cases, fuzzing, regression testing"
  Compliance,"GDPR, HIPAA, PCI DSS, SOC 2, ISO 27001, NIST CSF"
```

---

## Security Tools

```toon
tools_by_category[5]{category,tools}:
  Dependency Scanning,"npm audit, Snyk, OWASP Dep-Check, pip-audit, bundler-audit, Go vuln scanner"
  SAST,"SonarQube, Semgrep, ESLint security plugins, Bandit (Python), Brakeman (Rails), gosec (Go)"
  DAST,"OWASP ZAP, Burp Suite, Nikto, SQLMap"
  Secret Scanning,"GitGuardian, TruffleHog, git-secrets, detect-secrets"
  Container Security,"Trivy, Anchore, Clair, Docker Bench"
```

### Security Libraries

```toon
libraries[4]{platform,key_libs}:
  Node.js,"helmet, express-rate-limit, express-validator, joi/zod, bcrypt/argon2, jsonwebtoken, passport"
  Python,"django-security, Flask-Security, cryptography, PyJWT, passlib"
  PHP,"Laravel security features, password_hash/verify, CSRF protection"
  React Native,"react-native-keychain, react-native-ssl-pinning, react-native-biometrics"
```

### Cloud Security

```toon
cloud_security[3]{provider,services}:
  AWS,"IAM, Secrets Manager, WAF, Shield, GuardDuty, Security Hub"
  GCP,"IAM, Secret Manager, Cloud Armor, Security Command Center"
  Azure,"Azure AD, Key Vault, Security Center, Sentinel"
```

---

## Web App Security Principles

**Authentication:** Hash with bcrypt/argon2 (cost>=12). Lockout after N failures. MFA for sensitive ops. Expiring one-time reset tokens. Session timeout <30min idle. CSRF tokens on state changes. Secure cookie flags (HttpOnly, Secure, SameSite).

**Authorization:** Least privilege. All routes have access control. Prevent horizontal + vertical privilege escalation. Authorize direct object references.

**Input/Output:** Validate all inputs (client+server, whitelist). Content-Type + file size limits. Parameterized queries. Escape HTML/JS/CSS (XSS). CSP configured. Error messages leak nothing sensitive.

**Headers:** HSTS, X-Content-Type-Options: nosniff, X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy.

**Crypto:** HTTPS enforced (TLS 1.3). Encrypt sensitive data at rest. Secure RNG. No hardcoded secrets — use env vars or vault.

**API:** Rate limiting on public endpoints. Auth required. CORS not wildcard. Request size limits. GraphQL depth limiting.

**Dependencies:** Keep updated. No known vulns. Dep scanning in CI/CD. Lockfile committed.

**Logging:** Log security events (failed auth, privilege escalation). Sanitize PII from logs. Retention policy. Alerts for anomalies. Audit trail for admin actions.

### Mobile App Security Principles

**Storage:** Sensitive data in Keychain/Keystore only. No sensitive data in logs/screenshots/backups. DB encryption. Cache cleared on logout.

**Network:** Cert pinning. TLS 1.3. Public WiFi warnings.

**Code:** Obfuscation enabled (ProGuard/R8). Debug disabled in prod. No hardcoded API keys. Root/jailbreak detection. Anti-tampering.

**Auth:** Biometric available. PIN/passcode required. Token refresh. Auto-logout on inactivity.

---

## Security Audit Process

```toon
audit_phases[6]{phase,activities}:
  1. Info Gathering,"Map architecture, identify entry points, list auth mechanisms, document data flows, review 3rd-party integrations"
  2. Automated Scanning,"Run dep scanner, SAST, secret scanner, container scanner, collect findings"
  3. Manual Code Review,"Review auth logic, authz checks, input validation, crypto usage, headers, error handling, logging"
  4. Dynamic Testing,"Test auth bypass, authz bypass (IDOR/priv escalation), injection (SQL/XSS/cmd), file upload, session mgmt, rate limiting, CORS"
  5. Threat Modeling,"Identify assets, threats (STRIDE), vulnerabilities, calculate risk (DREAD), prioritize mitigations"
  6. Reporting,"Categorize findings (Critical/High/Medium/Low), remediation steps, effort estimates, tickets, security roadmap"
```

---

## Workflows

```toon
workflows[3]{command,scope}:
  /check security,"Full audit: automated scans + manual review + DAST + threat model + report"
  /check deps,"Dep vuln scan: npm/yarn audit + Snyk + outdated check + upgrade recommendations"
  /run security scan,"Code scan via /run: SAST + secret check + insecure patterns + hotspots + report"
```

---

## Common Vulnerabilities & Fixes

**SQL Injection:** Use parameterized queries (`db.query(sql, [param])`) or ORMs (Prisma/TypeORM). Never string-concatenate user input into queries.

**XSS:** Use DOMPurify or templating engines with auto-escaping. Never inject raw user input into HTML.

**CSRF:** Use CSRF middleware (e.g., `csurf`). Validate tokens on all state-changing operations.

**Weak Hashing:** Use bcrypt (cost 12+) or argon2. Never MD5/SHA1 for passwords.

**IDOR:** Always check authorization (`req.user.id === req.params.id || isAdmin`) before returning resources.
