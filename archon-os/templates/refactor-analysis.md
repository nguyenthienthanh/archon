# Refactor Analysis: {TARGET_NAME}

**Date:** {DATE}
**Target:** `{TARGET_PATH}`
**Type:** {REFACTOR_TYPE}
**Workflow ID:** {WORKFLOW_ID}

---

## 1. Executive Summary

### Current State
- **File Size:** {LINES} lines
- **Complexity:** {COMPLEXITY} (High/Medium/Low)
- **Test Coverage:** {COVERAGE}%
- **Dependencies:** {DEP_COUNT} files depend on this

### Recommendation
{RECOMMENDATION_SUMMARY}

### Risk Level
| Aspect | Risk | Reason |
|--------|------|--------|
| Breaking Changes | {BREAKING_RISK} | {BREAKING_REASON} |
| Test Coverage | {TEST_RISK} | {TEST_REASON} |
| Dependencies | {DEP_RISK} | {DEP_REASON} |
| **Overall** | **{OVERALL_RISK}** | |

---

## 2. Code Quality Assessment

### Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Lines of Code | {LOC} | <{TARGET_LOC} | {LOC_STATUS} |
| Cyclomatic Complexity | {COMPLEXITY_SCORE} | <10 | {COMPLEXITY_STATUS} |
| Cognitive Complexity | {COGNITIVE_SCORE} | <15 | {COGNITIVE_STATUS} |
| Test Coverage | {COVERAGE}% | >{TARGET_COVERAGE}% | {COVERAGE_STATUS} |
| Type Coverage | {TYPE_COVERAGE}% | 100% | {TYPE_STATUS} |

### Code Smells Detected

| # | Smell | Location | Severity | Impact |
|---|-------|----------|----------|--------|
| 1 | {SMELL_1} | Line {LINE_1} | {SEVERITY_1} | {IMPACT_1} |
| 2 | {SMELL_2} | Line {LINE_2} | {SEVERITY_2} | {IMPACT_2} |
| 3 | {SMELL_3} | Line {LINE_3} | {SEVERITY_3} | {IMPACT_3} |

---

## 3. Current Structure Analysis

### File Structure
```
{CURRENT_STRUCTURE}
```

### Component/Function Breakdown

| Component/Function | Lines | Responsibility | Issues |
|--------------------|-------|----------------|--------|
| {COMPONENT_1} | {LINES_1} | {RESPONSIBILITY_1} | {ISSUES_1} |
| {COMPONENT_2} | {LINES_2} | {RESPONSIBILITY_2} | {ISSUES_2} |
| {COMPONENT_3} | {LINES_3} | {RESPONSIBILITY_3} | {ISSUES_3} |

### Dependency Map

**Imports (this file uses):**
```
{IMPORTS_LIST}
```

**Exports (used by others):**
```
{EXPORTS_LIST}
```

**Dependent Files:**
```
{DEPENDENT_FILES}
```

---

## 4. Issues Identified

### Priority: Critical
{CRITICAL_ISSUES}

### Priority: High
{HIGH_ISSUES}

### Priority: Medium
{MEDIUM_ISSUES}

### Priority: Low
{LOW_ISSUES}

---

## 5. Refactoring Recommendations

### Recommended Approach: {APPROACH_NAME}

**Strategy:** {STRATEGY_DESCRIPTION}

### Recommended Changes

| # | Change | Type | Effort | Impact |
|---|--------|------|--------|--------|
| 1 | {CHANGE_1} | {TYPE_1} | {EFFORT_1} | {IMPACT_1} |
| 2 | {CHANGE_2} | {TYPE_2} | {EFFORT_2} | {IMPACT_2} |
| 3 | {CHANGE_3} | {TYPE_3} | {EFFORT_3} | {IMPACT_3} |

### Alternative Approaches

| Approach | Pros | Cons | Recommended |
|----------|------|------|-------------|
| {ALT_1} | {PROS_1} | {CONS_1} | {REC_1} |
| {ALT_2} | {PROS_2} | {CONS_2} | {REC_2} |

---

## 6. Impact Analysis

### Breaking Changes
{BREAKING_CHANGES_ANALYSIS}

### Migration Requirements
{MIGRATION_REQUIREMENTS}

### Affected Areas

| Area | Impact | Action Required |
|------|--------|-----------------|
| {AREA_1} | {IMPACT_1} | {ACTION_1} |
| {AREA_2} | {IMPACT_2} | {ACTION_2} |

---

## 7. Effort Estimation

| Phase | Effort | Description |
|-------|--------|-------------|
| Analysis | {ANALYSIS_EFFORT} | (This document) |
| Planning | {PLANNING_EFFORT} | Create detailed plan |
| Test Preparation | {TEST_EFFORT} | Write/update tests |
| Implementation | {IMPL_EFFORT} | Refactor code |
| Review & QA | {REVIEW_EFFORT} | Verify changes |
| Documentation | {DOC_EFFORT} | Update docs |
| **Total** | **{TOTAL_EFFORT}** | |

---

## 8. Success Criteria

- [ ] All existing tests pass
- [ ] Test coverage maintained/improved ({COVERAGE}% -> {TARGET_COVERAGE}%)
- [ ] No functionality changes (behavior preserved)
- [ ] Code complexity reduced ({COMPLEXITY_SCORE} -> <10)
- [ ] File size reduced ({LOC} -> <{TARGET_LOC} lines)
- [ ] All code smells addressed
- [ ] Type coverage at 100%
- [ ] Documentation updated

---

## 9. Next Steps

1. **Review this analysis** - Approve or request changes
2. **Generate implementation plan** - Run `refactor:plan {TARGET_PATH}`
3. **Start TDD workflow** - Run `refactor {TARGET_PATH}` to begin

**Output location:** `.claude/logs/refactors/`

---

**Generated:** {TIMESTAMP}
**Agent:** {AGENT_NAME}
**Document:** `{OUTPUT_PATH}`
