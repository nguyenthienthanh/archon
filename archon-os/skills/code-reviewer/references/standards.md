# Code Review Standards — Sources

Each rule in `../SKILL.md` traces to a source below. Verified 2026-09-24: 3 independent
checks per claim, or read directly from the primary source.

| Rule in SKILL.md | Source | Key text |
|---|---|---|
| Approval bar: improves code health, not perfect | [Google — Standard of Code Review](https://google.github.io/eng-practices/review/reviewer/standard.html) | "favor approving a CL once it is in a state where it definitely improves the overall code health … even if the CL isn't perfect" · "Technical facts and data overrule opinions and personal preferences" |
| Aspects; read every line; over-engineering; comments | [Google — What to look for](https://google.github.io/eng-practices/review/reviewer/looking-for.html) | Design, Functionality, Complexity, Tests, Naming, Comments, Style, Consistency, Documentation, Every Line, Context, Good Things. Over-engineering = "more generic than it needs to be, or added functionality that isn't presently needed". Comments "explain why … not … what" |
| Explain the reasoning in each finding | [Google — Writing review comments](https://google.github.io/eng-practices/review/reviewer/comments.html) | Comments should help the author understand why the change is requested |
| Comments: why, not what | [Google C++ Style Guide — Comments](https://google.github.io/styleguide/cppguide.html) | Don't state the obvious; explain why or make the code self-describing |
| >400 changed lines → review in chunks | [SmartBear/Cisco case study](https://static1.smartbear.co/support/media/resources/cc/book/code-review-cisco-case-study.pdf) | Performance drops past 300-400 LOC; ≤200 LOC/hour for effective inspection |
| blocking / non-blocking / nit | [Conventional Comments](https://conventionalcomments.org/) | Blocking "should prevent the subject under review from being accepted"; nitpicks "should be non-blocking by nature" |
| OWASP Top 10:2025 list | [OWASP Top 10:2025](https://top10.owasp.org/2025) | A01–A10 as listed in SKILL.md; Security Misconfiguration rose #5 → #2 |
| CWE Top 25 | [CWE Top 25 (2025)](https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html) | CWE-79 XSS still #1 |
| Secure code review checklist | [OWASP Secure Code Review Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html) | e.g. session tokens ≥128 bits entropy |
| Treat AI-generated code as untrusted | [Veracode — AI code security](https://www.veracode.com/blog/ai-generated-code-security-risks/), [arXiv 2508.21634](https://arxiv.org/pdf/2508.21634) | 45% of AI-generated code had security flaws; AI models produced more vulnerable samples than humans |
| Breaking change → MAJOR | [Semantic Versioning 2.0.0](https://semver.org/) | MAJOR increments on any backward-incompatible public API change |
| Observable behavior is API | [Hyrum's Law](https://www.hyrumslaw.com/) | With enough users, every observable behavior is depended on |
| Source / wire / semantic compatibility | [Google AIP-180](https://google.aip.dev/180) | Existing clients must not break on a minor/patch release |
| Consumer contract tests | [Pact — consumer tests](https://docs.pact.io/consumer) | Test how the consumer builds requests and handles responses |
| Speculative generality | [DevIQ — Speculative Generality](https://deviq.com/code-smells/speculative-generality/) | Abstractions for hypothetical needs; remedy is YAGNI |
| Nesting raises complexity | [SonarSource — Cognitive Complexity](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) | +1 per break in linear flow, more when nested; a whole switch counts once |
| Verify + refute every finding | [arXiv 2505.20206](https://arxiv.org/pdf/2505.20206), [arXiv 2604.19049](https://arxiv.org/pdf/2604.19049) | LLMs judged change correctness right only 68.5% (GPT-4o) / 63.9% (Gemini 2.0 Flash); an adversarial filter killed ~79-83% of candidate findings |
