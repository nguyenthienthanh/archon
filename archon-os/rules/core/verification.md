> **AI-consumed reference.** Optimized for Claude to read during execution.
> Human-readable explanation: see [docs/architecture/HIERARCHICAL_PLANNING.md](../../../docs/architecture/HIERARCHICAL_PLANNING.md)
> or [docs/getting-started/](../../../docs/getting-started/) depending on topic.

# Verification Rule

**Priority:** CRITICAL

Run verification commands and confirm output before claiming success.

---

## Iron Law

**NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE**

1. Run the command
2. Read the output
3. THEN claim the result

---

## Wrong vs Right

### ❌ Wrong

```
"I've fixed the bug. It should work now."
"Tests should be passing."
"That should resolve the issue."
```

### ✅ Right

```
"Tests pass:

  PASS src/auth/login.test.ts
  ✓ validates email (5ms)
  ✓ rejects invalid password (3ms)

  Tests: 2 passed, 2 total"
```

---

## Verification Commands

```toon
verify_commands[6]{stack,command}:
  JavaScript,npm test / yarn test
  TypeScript,npx tsc --noEmit
  Python,pytest
  Go,go test ./...
  PHP,php artisan test
  Build,npm run build
```

---

## When to Verify

- After applying fix
- Before claiming "done"
- After refactoring
- Before commit
- After merge

---

## Red Flags

Stop and verify if about to say:

- "Should work now"
- "Seems fixed"
- "I think that's it"
- "Probably passing"

All require: **Run → Read → Report**

---

