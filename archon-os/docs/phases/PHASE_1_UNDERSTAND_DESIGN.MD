# Phase 1: Requirements Analysis - Detailed Guidelines

**Phase:** 1/5 - Requirements Analysis
**Duration:** 30-60 minutes
**Agents:** pm-operations-orchestrator, project-detector, jira-operations
**Deliverables:** Requirements document, user stories, acceptance criteria

---

## 🎯 Phase Objectives

1. **Understand** the business requirement completely
2. **Extract** all user stories and acceptance criteria
3. **Identify** stakeholders and their needs
4. **Define** success metrics
5. **Document** everything clearly for next phases

---

## 📋 Step-by-Step Process

### Step 1: Requirement Gathering (10 min)

#### 1.1 Fetch JIRA Ticket
```markdown
Action: Read JIRA ticket details

What to extract:
- Ticket ID (e.g., PROJ-1234)
- Summary/Title
- Description
- Issue Type (Story, Bug, Task, Epic)
- Priority (Critical, High, Medium, Low)
- Labels/Tags
- Components
- Affected Versions
- Assignee & Reporter
- Comments & Attachments
```

**Tool:** JIRA MCP or manual input from user

**Output:**
```markdown
## JIRA Ticket Summary

**ID:** PROJ-1234
**Title:** Social Media Sharing Feature
**Type:** Story
**Priority:** High
**Status:** To Do

**Description:**
As an agent, I want to share success stories on social media
so that I can increase brand awareness and attract leads.

**Labels:** mobile, social-media, phase-2
**Components:** Sharing Module
```

---

#### 1.2 Read Related Documentation
```markdown
Action: Check if Confluence/PRD exists

Look for:
- Product Requirements Document (PRD)
- Technical Design Document (TDD)
- User Research
- Wireframes/Mockups
- API Specifications
- Previous Related Tickets
```

**Tool:** Confluence MCP or user-provided links

---

#### 1.3 Clarify Ambiguities
```markdown
Questions to ask user:

Business Questions:
- What problem does this solve?
- Who are the target users?
- What is the expected impact?
- Are there any business constraints?

Technical Questions:
- Which platforms? (iOS/Android/Web)
- Which regions? (PH/MY/ID/IB/HK/Global)
- Device types? (Phone/Tablet/Both)
- Integration requirements?
- Performance requirements?

Design Questions:
- Are designs ready? (Figma link?)
- Design system to follow?
- Accessibility requirements?
- Responsive requirements?
```

**Tool:** Ask user directly, wait for response

**Example:**
```
⚠️ CLARIFICATION NEEDED

I need more information about:

1. Which social media platforms?
   - Facebook Feed?
   - Facebook Stories?
   - Instagram Feed?
   - Instagram Stories?
   - LinkedIn?
   - All of the above?

2. What content can be shared?
   - Success stories only?
   - Case updates?
   - Product info?
   - Custom text/images?

3. Device scope?
   - Phone only?
   - Tablet only?
   - Both?

Please provide answers to proceed.
```

---

### Step 2: User Story Breakdown (15 min)

#### 2.1 Extract User Stories
```markdown
Format:
As a [role], I want to [action], so that [benefit].

Example:
As an agent,
I want to share my success story on Facebook,
So that my friends can see my achievement and become interested.
```

**Template:**
```markdown
## User Stories

### US-1: Share to Facebook Feed
**As a** insurance agent  
**I want to** share my success story on Facebook Feed  
**So that** I can showcase my achievements to my network

**Acceptance Criteria:**
- [ ] User can select "Share to Facebook" option
- [ ] User can preview post before sharing
- [ ] User can customize message (max 500 chars)
- [ ] System auto-includes success story image
- [ ] Post includes tracking link back to app
- [ ] User sees success confirmation after post

**Priority:** Must Have  
**Effort:** 5 points

---

### US-2: Share to Instagram Stories
**As a** insurance agent  
**I want to** share to Instagram Stories  
**So that** I can reach younger audience

**Acceptance Criteria:**
- [ ] User can select "Share to Instagram Stories"
- [ ] System generates story-sized image (1080x1920)
- [ ] User can add stickers/text overlay
- [ ] User can preview story before sharing
- [ ] Deep link to app included in story

**Priority:** Should Have  
**Effort:** 8 points
```

---

#### 2.2 Define Acceptance Criteria

**SMART Format:**
- **S**pecific - Clear and unambiguous
- **M**easurable - Can be tested
- **A**chievable - Technically feasible
- **R**elevant - Adds value
- **T**estable - Can write tests for it

**Example:**
```markdown
✅ GOOD Acceptance Criteria:
- User can select up to 3 images from gallery
- Post character limit is 500 characters
- Sharing completes within 5 seconds on 4G
- Error message shown if network fails
- Success confirmation modal appears after post

❌ BAD Acceptance Criteria:
- Sharing should be fast
- User can customize post
- App should handle errors gracefully
```

---

#### 2.3 Identify Edge Cases
```markdown
Questions to consider:

User Input:
- What if user enters no text?
- What if text exceeds limit?
- What if user selects no image?
- What if image is too large?

Network:
- What if user has no internet?
- What if API is down?
- What if API returns error?
- What if request times out?

Permissions:
- What if user denies camera permission?
- What if user denies gallery permission?
- What if user is not logged in to Facebook?

State:
- What if user closes app during share?
- What if user goes to background?
- What if another share is in progress?
```

**Output:**
```markdown
## Edge Cases

### EC-1: No Internet Connection
**Scenario:** User tries to share without internet
**Expected:** Show error "No internet connection. Please try again."
**Action:** Queue for retry when connection restored

### EC-2: Facebook Not Logged In
**Scenario:** User not logged in to Facebook
**Expected:** Prompt to login via Facebook SDK
**Action:** After login, continue share flow

### EC-3: Image Too Large (>10MB)
**Scenario:** User selects image larger than 10MB
**Expected:** Show warning, auto-compress to 5MB
**Action:** Compress and continue
```

---

### Step 3: Technical Feasibility (10 min)

#### 3.1 Check Technical Constraints
```markdown
Platform Limitations:
- [ ] iOS/Android SDK versions supported?
- [ ] Facebook SDK version compatibility?
- [ ] Instagram API availability?
- [ ] Deep linking support?
- [ ] Image size limits?

Region Specific:
- [ ] Facebook available in all regions?
- [ ] Instagram available in all regions?
- [ ] Any regional restrictions?
- [ ] Language support needed?

Performance:
- [ ] Image processing time acceptable?
- [ ] API response time within SLA?
- [ ] Offline support needed?
```

---

#### 3.2 Identify Dependencies
```markdown
External Dependencies:
- Facebook SDK v16+
- Instagram Graph API
- AWS S3 (image hosting)
- Analytics SDK

Internal Dependencies:
- Authentication module
- Image picker component
- Network client
- Analytics tracker

Third-party Services:
- Facebook API Token
- Instagram Business Account
- Image CDN
```

---

#### 3.3 Risk Assessment
```markdown
## Risks & Mitigations

### Risk 1: Facebook API Rate Limits
**Risk Level:** HIGH
**Impact:** Users can't share if limit reached
**Mitigation:**
- Implement exponential backoff
- Show user-friendly error message
- Track rate limit headers

### Risk 2: Instagram Stories Deprecation
**Risk Level:** MEDIUM
**Impact:** Feature may break in future
**Mitigation:**
- Monitor Instagram API changelog
- Have fallback to Instagram Feed
- Plan for API migration

### Risk 3: Large Image Processing
**Risk Level:** LOW
**Impact:** Slow processing on old devices
**Mitigation:**
- Compress images client-side
- Show loading indicator
- Set 30s timeout
```

---

### Step 4: Documentation (15 min)

#### 4.1 Create Requirements Document

**Template:**
```markdown
# Requirements Document: Social Media Sharing

**Version:** 1.0  
**Date:** 2025-11-23  
**Author:** PM Operations Orchestrator  
**Stakeholders:** Product, Engineering, Design, QA

---

## 1. Executive Summary

Brief overview of feature (2-3 paragraphs)

---

## 2. Business Goals

- Increase brand awareness by 30%
- Generate 100+ leads per month
- Improve agent engagement by 25%

---

## 3. User Stories

[From Step 2.1]

---

## 4. Functional Requirements

### 4.1 Share to Facebook
- System shall allow user to share to Facebook Feed
- System shall support text (0-500 chars)
- System shall support image attachment (max 10MB)
- System shall show preview before posting

### 4.2 Share to Instagram
[...]

---

## 5. Non-Functional Requirements

### 5.1 Performance
- Share operation completes within 5s (4G network)
- Image compression within 2s
- UI remains responsive during share

### 5.2 Security
- User tokens stored securely in Keychain
- No PII in shared content without consent
- HTTPS only for all API calls

### 5.3 Accessibility
- All buttons have accessibility labels
- Support VoiceOver/TalkBack
- Minimum touch target 44x44pt

### 5.4 Compatibility
- iOS 13+
- Android 8+
- React Native 0.76+

---

## 6. Success Metrics

### Primary Metrics
- 70% of users successfully share within first week
- <2% error rate
- >4.5 star rating for feature

### Secondary Metrics
- Average 3 shares per user per month
- 50% share to Facebook, 30% Instagram, 20% LinkedIn

---

## 7. Out of Scope

- Twitter/X integration (future phase)
- Video sharing (future phase)
- Scheduled posting (future phase)

---

## 8. Dependencies

[From Step 3.2]

---

## 9. Risks

[From Step 3.3]

---

## 10. Timeline Estimate

- Phase 1 (Understand + Design): 3 days
- Phase 2 (Test RED): 1 day
- Phase 3 (Build GREEN): 5 days
- Phase 4-5 (Refactor + Review / Finalize): 2 days

**Total:** 11 days (~2.5 weeks)
```

---

#### 4.2 Create Traceability Matrix
```markdown
| Requirement ID | User Story | Acceptance Criteria | Test Case | Priority |
|----------------|------------|---------------------|-----------|----------|
| REQ-1 | US-1 | AC-1.1, AC-1.2 | TC-1, TC-2 | Must Have |
| REQ-2 | US-1 | AC-1.3 | TC-3 | Must Have |
| REQ-3 | US-2 | AC-2.1, AC-2.2 | TC-4, TC-5 | Should Have |
```

---

### Step 5: Approval Gate (10 min)

#### 5.1 Present Summary to User
```markdown
📋 PHASE 1 COMPLETE: Requirements Analysis

## Summary

**Feature:** Social Media Sharing
**User Stories:** 5 stories (3 Must Have, 2 Should Have)
**Effort Estimate:** 34 story points (~11 days)
**Risks:** 1 High, 2 Medium, 3 Low

## Key Findings

✅ Feasible with current tech stack
✅ Facebook/Instagram SDKs available
⚠️ Need Facebook API token (dependency)
⚠️ Rate limiting concerns (mitigation planned)

## Next Steps

Phase 2: Test RED
- System design
- Architecture diagram
- API contracts
- Database schema

## Deliverables Generated

- [x] Requirements Document (REQ-001.md)
- [x] User Stories (5 stories)
- [x] Acceptance Criteria (23 criteria)
- [x] Edge Cases (8 cases)
- [x] Risk Assessment
- [x] Traceability Matrix

---

👉 **Ready to proceed to Phase 2?**

Type:
- "approve" to continue
- "reject" + feedback to revise
- "clarify" + questions for more discussion
```

---

#### 5.2 Handle User Response

**If APPROVED:**
```markdown
✅ Phase 1 Approved!

Moving to Phase 2: Test RED
Expected duration: 2 days
Next agent: mobile-react-native (or detected agent)

[Auto-start Phase 2]
```

**If REJECTED:**
```markdown
⚠️ Phase 1 Rejected

User feedback:
"{user feedback}"

Revising requirements based on feedback...

[Loop back to relevant step]
```

**If CLARIFY:**
```markdown
❓ Clarification Needed

User questions:
"{user questions}"

Providing answers:
[Agent answers]

Does this address your concerns?
```

---

## ✅ Phase 1 Checklist

Before requesting approval:

### Requirements Gathering ✅
- [ ] JIRA ticket fetched and understood
- [ ] Related documentation reviewed
- [ ] All ambiguities clarified with user
- [ ] Business goals clear

### User Stories ✅
- [ ] All user stories extracted
- [ ] SMART acceptance criteria defined
- [ ] Edge cases identified
- [ ] Priority assigned (Must/Should/Could/Won't)

### Technical Assessment ✅
- [ ] Technical feasibility confirmed
- [ ] Dependencies identified
- [ ] Risks assessed and mitigated
- [ ] Timeline estimated

### Documentation ✅
- [ ] Requirements document created
- [ ] Traceability matrix complete
- [ ] Success metrics defined
- [ ] All deliverables ready

### Approval ✅
- [ ] Summary presented to user
- [ ] User questions answered
- [ ] Approval obtained
- [ ] Ready for Phase 2

---

## 📊 Quality Gates

### Must Pass
- ✅ All acceptance criteria are testable
- ✅ No ambiguous requirements
- ✅ All dependencies identified
- ✅ Risks documented with mitigations
- ✅ User approved requirements

### Should Pass
- ✅ Success metrics defined
- ✅ Timeline estimated
- ✅ Edge cases documented
- ✅ Traceability matrix complete

---

## 👥 Cross-Review Process

**IMPORTANT:** Before presenting to user, requirements must be reviewed by other agents.

### Review Workflow

```markdown
Step 5: PM Orchestrator completes requirements document
   ↓
Step 6: Dev Agent Technical Review (10-15 min)
   ↓
Step 7: QA Agent Testability Review (10-15 min)
   ↓
Step 8: UI Designer Review (if UI involved) (10 min)
   ↓
Step 9: PM Orchestrator consolidates feedback
   ↓
Step 10: Present to User for approval
```

### Dev Technical Review

**Dev Agent reviews for:**
- ✅ Technical feasibility
- ✅ Clarity of requirements
- ✅ Integration points
- ✅ Performance requirements
- ✅ Scope & complexity
- ⚠️ Technical risks or concerns

**Output:** Technical review checklist (see `rules/cross-review-workflow.md`)

### QA Testability Review

**QA Agent reviews for:**
- ✅ Testable acceptance criteria
- ✅ Measurable success metrics
- ✅ Edge cases documented
- ✅ Test data requirements
- ✅ Automation feasibility
- ⚠️ Testing concerns

**Output:** Testability review checklist

### UI Design Review (if applicable)

**UI Designer reviews for:**
- ✅ Design requirements clarity
- ✅ UI/UX considerations
- ✅ Responsive requirements
- ✅ Accessibility needs
- ⚠️ Design concerns

**Output:** Design review checklist

### Consolidated Feedback Format

```markdown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 1: Requirements Analysis - Review Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Review Summary

**Total Reviewers:** 3
**Status:** ✅ 2 Approved, ⚠️ 1 With Concerns

---

### 1. Dev Review (mobile-react-native)
**Status:** ✅ Approved  
**Key Points:**
- Requirements are technically achievable
- Integration with existing APIs is clear
- Performance targets are realistic

**Concerns:** None

---

### 2. QA Review (qa-automation)
**Status:** ✅ Approved  
**Key Points:**
- Acceptance criteria are testable
- Edge cases are well-documented
- Can achieve 80%+ coverage

**Concerns:** None

---

### 3. UI Design Review (ui-expert)
**Status:** ⚠️ Approved with notes  
**Key Points:**
- Design requirements are clear
- Figma mockups available

**Concerns:**
- Need tablet layout clarification
- Dark mode specs not mentioned

---

## Consolidated Feedback

**Must Address Before Proceeding:**
- [ ] Clarify tablet layout requirements
- [ ] Add dark mode specifications

**Nice to Have (Future Consideration):**
- Offline mode support
- Analytics tracking

---

## Updated Requirements

[PM Orchestrator updates requirements doc with feedback]

✋ **APPROVAL REQUIRED**: Phase 1 Complete with Reviews

**Deliverables:**
- ✅ PHASE_1_REQUIREMENTS_ANALYSIS.md (updated)
- ✅ Dev Technical Review
- ✅ QA Testability Review
- ✅ UI Design Review

**Next Phase:** Test RED (Phase 2)

**Options:**
- "approve" → Proceed to Phase 2
- "reject: [reason]" → Revise requirements
- "modify: [changes]" → Make specific adjustments
```

---

## 🚫 Common Mistakes to Avoid

### ❌ Don't:
- Skip clarification questions
- Accept vague acceptance criteria
- Ignore edge cases
- Miss dependencies
- Proceed without approval
- Make technical decisions (that's Phase 2!)
- **Skip cross-review process**
- **Ignore reviewer feedback**

### ✅ Do:
- Ask clarifying questions upfront
- Document everything
- Think about edge cases
- Identify risks early
- Get explicit approval
- Focus on WHAT, not HOW (HOW is Phase 2)
- **Get reviews from Dev, QA, and UI agents**
- **Address all reviewer concerns**

---

## 📚 Templates & Examples

All templates available in:
- `templates/requirements-doc.md`
- `templates/user-story.md`
- `templates/acceptance-criteria.md`
- `rules/cross-review-workflow.md` - **Cross-review checklists**

---

**Phase 1 Complete! Ready for Phase 2: Test RED** 🚀

