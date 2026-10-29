---
last_aligned_with: v3.7.3
status: needs_review
audience: active-user
---

# Confluence Operations Guide

**Complete guide for Confluence integration with Archon OS Team Agents**

---

## 🎯 Overview

Confluence MCP enables:
- Read existing documentation
- Create technical specs
- Update implementation guides
- Generate API documentation
- Store workflow artifacts

---

## 📦 Setup (15 minutes)

### Step 1: Get Confluence API Token
```bash
1. Go to: https://id.atlassian.com/manage-profile/security/api-tokens
2. Create token (same as JIRA token works for Confluence)
3. Copy token
```

### Step 2: Configure Environment
```bash
# Add to .envrc
export CONFLUENCE_URL="https://your-company.atlassian.net/wiki"
export CONFLUENCE_API_TOKEN="your-api-token"
export CONFLUENCE_USER_EMAIL="your-email@company.com"
export CONFLUENCE_SPACE_KEY="SPACE"

direnv allow .
```

### Step 3: Install Confluence MCP
```bash
npx -y @automaze/mcp-confluence --version
```

### Step 4: Configure Claude Desktop
```json
{
  "mcpServers": {
    "confluence": {
      "command": "npx",
      "args": ["-y", "@automaze/mcp-confluence"],
      "env": {
        "CONFLUENCE_URL": "${CONFLUENCE_URL}",
        "CONFLUENCE_API_TOKEN": "${CONFLUENCE_API_TOKEN}",
        "CONFLUENCE_USER_EMAIL": "${CONFLUENCE_USER_EMAIL}"
      }
    }
  }
}
```

---

## 🚀 Usage

### Phase 1: Read Existing Docs
```
User: "Check Confluence for existing authentication docs"

Agent:
1. Searches Confluence (confluence_page_search)
2. Reads relevant pages
3. Incorporates into requirements
```

### Phase 5: Generate Documentation (Finalize)
```
Agent generates:
- Technical Specification
- Implementation Summary
- Deployment Guide
- API Documentation

Format: Confluence Storage Format (ready to paste)
```

### Create Page (with approval)
```
Agent: "Create Confluence page 'Feature Implementation'"

⚠️ CONFIRMATION REQUIRED

Page: Feature Implementation
Space: TEAM
Content preview:
[First 500 chars...]

Type "confirm" to create page
```

---

## 🔧 Available Operations

### Read Operations (No approval)
- `confluence_page_get(id)` - Get page content
- `confluence_page_search(cql)` - Search pages
- `confluence_space_list()` - List spaces
- `confluence_page_children(id)` - Get child pages

### Write Operations (Approval required)
- `confluence_page_create(space, title, content)` - Create page
- `confluence_page_update(id, version, content)` - Update page
- `confluence_page_delete(id)` - Delete page

---

## 📄 Document Templates

### Technical Specification
```markdown
# Technical Specification: {Feature Name}

## Overview
[Auto-generated from Phase 2]

## Architecture
[Diagrams from Phase 2]

## API Contracts
[From Phase 2]

## Database Schema
[From Phase 2]

## Security Considerations
[From Phase 2]
```

### Implementation Summary
```markdown
# Implementation Summary: {Feature Name}

## Completed Tasks
[From all phases]

## Files Changed
[List of modified files]

## Test Coverage
[Coverage report]

## Deployment Notes
[From Phase 5]

## Next Steps
[Follow-up tasks]
```

---

## 🎨 Confluence Storage Format

Agent automatically converts markdown to Confluence format:

```markdown
# Heading 1 → <h1>Heading 1</h1>
## Heading 2 → <h2>Heading 2</h2>
**bold** → <strong>bold</strong>
`code` → <code>code</code>

```typescript
code block
```
→ <ac:structured-macro ac:name="code">
    <ac:parameter ac:name="language">typescript</ac:parameter>
    <ac:plain-text-body><![CDATA[code block]]></ac:plain-text-body>
  </ac:structured-macro>
```

---

## 📊 Workflow Integration

### Phase 1: Requirements
```
1. Search Confluence for existing docs
2. Read related pages
3. Extract requirements
4. Reference in requirements.md
```

### Phase 2-4: Development
```
1. Generate local markdown files
2. Store in .claude/logs/documents/ folder
3. Track in git (optional)
```

### Phase 5: Finalize (Documentation)
```
1. Compile all phase outputs
2. Format for Confluence
3. Preview to user
4. Create/update pages (with approval)
5. Link from JIRA ticket
```

---

## 🔒 Security

```yaml
Permissions:
  Read: ✅ Always allowed
  Write: ⚠️ Requires confirmation
  Delete: ❌ Blocked (too dangerous)

Safety:
  - Preview before creation
  - Version tracking
  - Can rollback changes
  - Audit logging
```

---

## 💡 Best Practices

### Page Organization
```
Space Root
├── Project Overview
├── Architecture/
│   ├── System Design
│   └── Component Diagrams
├── Features/
│   ├── Feature A
│   │   ├── Tech Spec
│   │   └── Implementation
│   └── Feature B
└── API Documentation/
    └── REST API
```

### Naming Convention
```
Title Format:
- "[Project] Feature Name - Tech Spec"
- "[Project] Feature Name - Implementation Summary"
- "[Project] API Documentation"

Example:
- "My Mobile App - Social Sharing - Tech Spec"
- "My Mobile App - Authentication - Implementation"
```

### Content Guidelines
```markdown
Always include:
1. Table of Contents (auto-generated)
2. Last Updated date
3. Author/Contributors
4. Related JIRA tickets
5. Related pages (links)
6. Code examples (syntax highlighted)
7. Diagrams (embedded or linked)
```

---

## 🆘 Troubleshooting

### "Confluence MCP not found"
```bash
# Install MCP server
npx -y @automaze/mcp-confluence --version

# Restart Claude Desktop
```

### "Permission denied"
```
Ensure Confluence token has:
- Read pages (confluence-content-read)
- Create pages (confluence-content-write)
- Update pages (confluence-content-write)
```

### "Space not found"
```bash
# List available spaces
curl -u your-email:$CONFLUENCE_API_TOKEN \
  $CONFLUENCE_URL/rest/api/space
```

### "Page already exists"
```
Options:
1. Update existing page (provide page ID)
2. Use different title
3. Create as child page
```

---

## 📚 Resources

- [Confluence Storage Format](https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html)
- [Confluence REST API](https://developer.atlassian.com/cloud/confluence/rest/v1/intro/)
- [MCP Confluence](https://github.com/automazeio/mcp-confluence)

---

**Setup Time:** 15 minutes  
**Status:** Production ready  
**Benefits:** Automated documentation generation & synchronization

