---
last_aligned_with: v3.7.3
status: current
audience: active-user
---

# 🔒 Security and Trust - Archon OS Plugin

**Protecting yourself when installing Claude Code plugins**

---

## ⚠️ Security Model

Claude Code plugins use a **decentralized, trust-based model** similar to:
- NPM packages (anyone can publish)
- GitHub repositories (anyone can fork)
- Browser extensions (verify publisher)

**Key Point:** You are trusting the **GitHub repository owner** when you add a marketplace.

---

## 🎯 Official Archon OS Plugin

**Trusted Source:**
```bash
/plugin marketplace add nguyenthienthanh/archon
```

**Verify authenticity:**
- ✅ GitHub owner: **nguyenthienthanh** (Nguyen Thien Thanh)
- ✅ Official repo: https://github.com/nguyenthienthanh/archon
- ✅ Email: nguyenthienthanh.kiyoshi@gmail.com

---

## ⚠️ Malicious Forks Warning

**Anyone can fork Archon OS and create a malicious version!**

### How Attackers Work

1. **Fork the repository:**
   ```
   Original: nguyenthienthanh/archon ✅ SAFE
   Fork:     attacker/ccpm-malware ⚠️ DANGEROUS
   ```

2. **Add malicious code:**
   - Steal credentials from `.envrc`
   - Exfiltrate API tokens
   - Modify your code
   - Send data to external servers

3. **Trick users into installing:**
   ```bash
   # Attacker tells you to run:
   /plugin marketplace add attacker/ccpm-malware  # ⚠️ FAKE!
   /plugin install ccpm@evil-ccpm
   ```

### How to Protect Yourself

**Before adding ANY marketplace:**

1. **Verify the GitHub URL**
   ```bash
   # ✅ CORRECT - Official repository
   /plugin marketplace add nguyenthienthanh/archon

   # ⚠️ WRONG - Unknown fork
   /plugin marketplace add random-user/ccpm-something
   ```

2. **Check repository authenticity:**
   - GitHub stars (more = more trusted)
   - Commit history (regular updates from known author)
   - Contributors (who has write access?)
   - Issues/PRs (active community?)

3. **Review the code:**
   - Check plugin root directory for suspicious scripts
   - Look at `scripts/` for bash commands
   - Verify no external network calls (except documented APIs)
   - Check `.envrc` handling - should never send credentials anywhere

4. **Verify author identity:**
   - GitHub profile: https://github.com/nguyenthienthanh
   - Email matches repository: nguyenthienthanh.kiyoshi@gmail.com
   - Consistent commit history

---

## 🔍 What Archon OS Has Access To

When you install Archon OS, it can access:

### ✅ Safe - Normal Plugin Permissions
- Read/write files in your project
- Execute bash scripts (in `scripts/`)
- Read environment variables from `.envrc`
- Make API calls to configured services (JIRA, Figma, Slack, Confluence)

### ⚠️ Sensitive Data Archon OS Handles
- **JIRA API tokens** - stored in `.envrc`
- **Figma access tokens** - stored in `.envrc`
- **Slack bot tokens** - stored in `.envrc`
- **Confluence credentials** - stored in `.envrc`

### 🛡️ How Official Archon OS Protects You
- **No external calls** - Only to APIs you explicitly configure
- **Local storage only** - Credentials stay in `.envrc` (git-ignored)
- **Open source** - All code is reviewable
- **No telemetry** - We don't collect any data
- **No auto-updates to external servers** - Updates only from GitHub

---

## 🚨 Red Flags - Malicious Plugins

**DO NOT INSTALL if you see:**

1. **Unknown repository owner**
   ```bash
   /plugin marketplace add sketchy-user/ccpm-hacked  # ⚠️ DANGER
   ```

2. **Suspicious bash scripts**
   - Scripts that upload files to unknown servers
   - Scripts that echo credentials to external endpoints
   - Base64-encoded commands (hiding behavior)

3. **Unexpected network calls**
   - Code that sends data to non-configured endpoints
   - Telemetry to unknown domains
   - Credential exfiltration

4. **Hidden functionality**
   - Obfuscated JavaScript/TypeScript
   - Minified code without source maps
   - Executable binaries

5. **Requests for unusual permissions**
   - Access to files outside project directory
   - System-level commands
   - Keylogging or screen capture

---

## ✅ Best Practices

### For Users

1. **Only add trusted marketplaces:**
   ```bash
   # ✅ Official Archon OS
   /plugin marketplace add nguyenthienthanh/archon
   ```

2. **Review code before installation:**
   - Browse GitHub repository
   - Check `scripts/` for bash scripts
   - Look for suspicious network calls

3. **Keep credentials secure:**
   - Never commit `.envrc` to git (it's git-ignored by default)
   - Use environment-specific tokens (not production tokens for testing)
   - Rotate tokens periodically

4. **Update carefully:**
   ```bash
   # Check changelog before updating
   git log  # Review changes
   /plugin update archon-os@archon
   ```

5. **Report suspicious activity:**
   - Create issue: https://github.com/nguyenthienthanh/archon/issues
   - Email: nguyenthienthanh.kiyoshi@gmail.com

### For Plugin Developers (Like Me)

1. **Transparent code:**
   - All code is open source
   - No minification or obfuscation
   - Clear comments explaining behavior

2. **Minimize permissions:**
   - Only request access to what's needed
   - No system-level commands
   - No network calls except documented APIs

3. **Security disclosures:**
   - Document what data is accessed
   - Explain how credentials are stored
   - Clarify what external services are contacted

4. **Responsible updates:**
   - Semantic versioning
   - Changelog for every release
   - Breaking changes clearly marked

---

## 🔐 How to Verify Official Archon OS

**Official installation command:**
```bash
/plugin marketplace add nguyenthienthanh/archon
/plugin install archon-os@archon
```

**Verification checklist:**

- [ ] GitHub URL is exactly: `nguyenthienthanh/archon`
- [ ] Repository owner is: **nguyenthienthanh**
- [ ] Plugin name is: **aura-frog**
- [ ] Marketplace name is: **archon**
- [ ] Author email is: nguyenthienthanh.kiyoshi@gmail.com
- [ ] Repository has this README.md with security notice

**If anything doesn't match, DO NOT INSTALL!**

---

## 📞 Security Contact

**Found a security vulnerability?**

**Please report privately:**
- Email: nguyenthienthanh.kiyoshi@gmail.com
- Subject: "Archon OS Security Issue"

**Do NOT disclose publicly until patched!**

We'll:
1. Acknowledge within 48 hours
2. Fix the issue
3. Release a patch
4. Credit you (if desired)

---

## 🆚 Archon OS vs Malicious Forks

| Feature | Official Archon OS | Malicious Fork |
|---------|---------------|----------------|
| **GitHub Owner** | nguyenthienthanh ✅ | random-user ⚠️ |
| **Repository** | aura-frog ✅ | ccpm-hacked ⚠️ |
| **Network Calls** | Only configured APIs ✅ | Unknown servers ⚠️ |
| **Credential Storage** | Local `.envrc` only ✅ | Uploads to attacker ⚠️ |
| **Code Review** | Transparent, documented ✅ | Obfuscated ⚠️ |
| **Updates** | From official repo ✅ | From fork ⚠️ |
| **Telemetry** | None ✅ | Exfiltrates data ⚠️ |

---

## 🎯 Summary

**Installation is trust-based:**
- You choose which GitHub repository to trust
- Anyone can fork and create malicious versions
- Verify the repository owner before installing
- Review code before adding marketplace

**Official Archon OS:**
- Repository: `nguyenthienthanh/archon`
- Owner: Nguyen Thien Thanh (nguyenthienthanh)
- Email: nguyenthienthanh.kiyoshi@gmail.com

**Stay safe:**
- Always verify the GitHub URL
- Review code changes before updating
- Never share `.envrc` credentials
- Report suspicious plugins

---

**🔒 Trust, but verify!**

Official installation:
```bash
/plugin marketplace add nguyenthienthanh/archon
/plugin install archon-os@archon
```
