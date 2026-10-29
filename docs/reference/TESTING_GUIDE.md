---
last_aligned_with: v3.7.3
status: current
audience: contributor
---

# Aura Frog Workflow Testing Guide

**Last Updated:** 2026-05-14 (v3.7 syntax refresh)
**Purpose:** How to test the command-based Aura Frog workflow system

---

## IMPORTANT: How Commands Work

**Commands are plain text in Claude Code chat:**

```
You: /run status
```

Or use bundled slash commands:
```
/run "task" → Auto-detect intent and start
approve / reject / modify → Context-aware actions during run
```

Claude AI reads the command text and executes the workflow.

---

## 🎯 TEST 1: Quick Command Test (2 minutes)

### Test if Claude recognizes commands:

```
You: /run status
```

**Expected Response:**
```
No active workflow found.

Initialize a workflow first:
/run <task-description>
```

---

## 🎯 TEST 2: Simple Workflow Test (5 minutes)

### Start a Simple Task:

```
You: /run Analyze the useSocialMediaPost hook and suggest improvements
```

**Expected: Claude Should:**
1. ✅ Detect command
2. ✅ Read `commands/workflow/start.md`
3. ✅ Execute Phase 1 (Understand + Design)
4. ✅ Analyze the hook file
5. ✅ Generate analysis document
6. ✅ Show approval gate like this:

```
═══════════════════════════════════════════════════════════
🎯 PHASE 1 COMPLETE: Requirements Analysis
═══════════════════════════════════════════════════════════

📊 Summary:
Analyzed useSocialMediaPost hook (505 lines)

📦 Deliverables:
   📄 PHASE_1_REQUIREMENTS_ANALYSIS.md

✅ Success Criteria:
   ✅ Hook analyzed
   ✅ Issues identified
   ✅ Improvements suggested

⏭️  Next Phase: Phase 2 - Test RED

───────────────────────────────────────────────────────────
⚠️  ACTION REQUIRED

Type "approve" → Proceed to Phase 2
Type "reject" → Restart Phase 1
Type "modify <feedback>" → Adjust analysis

Your response:
═══════════════════════════════════════════════════════════
```

### Then Test Approval:

```
You: approve
```

**Expected:**
```
✅ Phase 1 approved
⏭️  Proceeding to Phase 2: Test RED...

[Phase 2 execution starts...]
```

---

## 🎯 TEST 3: Full Refactoring Workflow (30 minutes)

### Real Refactoring Task:

```
You: /run Refactor SocialMarketingCompositePost.phone.tsx - split into smaller, maintainable components
```

**This will test:**
- ✅ Understand + Design (Phase 1)
- ✅ Test RED (Phase 2)
- ✅ Build GREEN (Phase 3)
- ✅ Refactor + Review (Phase 4)
- ✅ Finalize (Phase 5)

### Expected Flow:

```
Phase 1: Analyzes component, creates tech spec + design
→ You: approve  ← [APPROVAL GATE]

Phase 2: Plans tests, writes failing tests (RED) → [Auto-continues]

Phase 3: Implements components (GREEN)
→ You: approve  ← [APPROVAL GATE]

Phase 4: Refactors code + code review + QA validation → [Auto-continues]
Phase 5: Generates documentation + sends notifications → [Auto-complete]

🎉 WORKFLOW COMPLETE!
```

**Note:** Only 2 approval gates (Phase 1 & 3). Other phases auto-continue after showing deliverables.

---

## 🎯 TEST 4: Test Rejection (2 minutes)

```
You: /run Add error handling to a function

[Phase 1 completes, shows approval gate]

You: reject Need more specific error scenarios - add timeout and network errors

[Phase 1 restarts with feedback, updates analysis]

You: approve

[Continues to Phase 2...]
```

---

## 🎯 TEST 5: Test Modification (2 minutes)

```
You: /run Create a utility function

[Phase 1 completes]

You: modify Add TypeScript type definitions and JSDoc comments

[Phase 1 updates with modifications]

You: approve

[Continues to Phase 2...]
```

---

## 🎯 TEST 6: Test Status Command (1 minute)

### After starting a workflow:

```
You: /run status
```

**Expected Response:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKFLOW STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Workflow Information:
   ID: PROJ-1234
   Status: In Progress
   Created: 2025-11-24 11:23:23

📍 Current Phase: Phase 2 - Test RED

📊 Phase Progress:

  ✅ Phase 1: Understand + Design (approved)
→ 🔄 Phase 2: Test RED (in_progress)
  ⏸️ Phase 3-5: Pending

Progress: 1/5 phases (20%)

⏭️  Next Action:
   Wait for Phase 2 completion, then auto-continue to Phase 3
```

---

## 🎯 VALIDATION CHECKLIST

After each test, verify:

### Command Recognition ✅
- [ ] Claude detects `workflow:` commands
- [ ] Claude reads command files from `commands/workflow/`
- [ ] Claude follows command execution steps

### Approval Gates ✅
- [ ] Formatted approval prompts shown
- [ ] Phase summary displayed
- [ ] Deliverables listed
- [ ] Success criteria shown
- [ ] Next phase previewed

### Phase Execution ✅
- [ ] Pre-phase hook executes (setup)
- [ ] Phase work completed
- [ ] Post-phase hook executes (validation)
- [ ] Pre-approval hook shows prompt
- [ ] Deliverables generated

### State Management ✅
- [ ] `workflow-state.json` created
- [ ] Phase status updated
- [ ] Context saved
- [ ] Deliverables tracked

### Commands Work ✅
- [ ] `/run` - Initializes and executes Phase 1
- [ ] `approve` - Approves and continues
- [ ] `reject` - Restarts with feedback
- [ ] `modify` - Makes changes
- [ ] `/run status` - Shows progress

---

## 🐛 TROUBLESHOOTING

### If Claude doesn't recognize commands:

**Problem:** Claude responds normally, doesn't execute command

**Solution:**
```
Try being explicit:

"Please execute the workflow command: /run <task>

Follow these steps:
1. Read commands/workflow/start.md
2. Execute Phase 1 as defined
3. Show approval gate
4. Wait for my response"
```

### If approval gate doesn't show:

**Problem:** Phase completes but no approval prompt

**Solution:**
```
"Please show the approval gate as defined in:
archon-os/rules/core/approval-gates.md

Format should include:
- Phase summary
- Deliverables
- Success criteria
- Action required"
```

### If state not saved:

**Problem:** `/run status` says no workflow

**Solution:**
```
Workflow state is conceptual in this version.
Continue with the workflow, Claude will track context.
```

---

## 🎯 QUICK TEST SCRIPT

**Copy and paste this:**

```
/run Analyze useSocialMediaPost hook and suggest 3 improvements

[Wait for approval gate]

approve

[Wait for Phase 2]

/run status

[Check if status shows correctly]

approve

[Continue through phases...]
```

---

## 📊 SUCCESS CRITERIA

Your Aura Frog is working if:

✅ Commands are recognized  
✅ Phases execute in order  
✅ Approval gates appear after each phase  
✅ You can approve/reject/modify  
✅ Status command shows progress  
✅ Deliverables are generated  
✅ Multi-phase workflow completes  

---

## 🎉 NEXT STEPS AFTER TESTING

If tests pass:
1. ✅ Aura Frog is operational!
2. Use for real refactoring tasks
3. Iterate and improve based on usage

If tests fail:
1. Note what doesn't work
2. Adjust CLAUDE.md or commands
3. Retest until working

---

## 💡 RECOMMENDED FIRST TEST

**Start Simple:**

```
/run Analyze the useSocialMediaPost hook
```

This will:
- Test basic command detection
- Execute Phase 1 only (quickest test)
- Show if approval gates work
- Validate command system

**Then expand to full workflow once working!**

---

**Ready to test?** 🚀

Try: `/run Analyze useSocialMediaPost hook and suggest improvements`

