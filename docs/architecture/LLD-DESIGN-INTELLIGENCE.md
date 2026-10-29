---
last_aligned_with: v3.8.0-alpha.10
status: reference
audience: contributor
---

# LLD — Design Intelligence Upgrade (Vision Loop + Design System + Stitch MCP)

**Status:** Draft for review — no code written
**Date:** 2026-07-16
**Scope:** Aura Frog plugin (skills / agents / hooks / MCP config)
**Goal:** Agents thông minh hơn về design — có vision (screenshot critique loop), design-system làm source of truth, và tích hợp Google Stitch MCP thay cho quy trình copy-paste thủ công.

---

## 1. Research findings (verified, cited)

### 1.1 Anthropic — official guidance

| # | Finding | Source |
|---|---------|--------|
| A1 | "AI slop" UI là hệ quả của distributional convergence khi sampling — safe design choices thống trị training data. Skills là cơ chế corrective. | [claude.com/blog/improving-frontend-design-through-skills](https://claude.com/blog/improving-frontend-design-through-skills) |
| A2 | Anthropic ship official open-source **frontend-design** skill trong repo `anthropics/claude-code` (`plugins/frontend-design/skills/frontend-design/SKILL.md`) — taste layer chống templated defaults. | [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md) |
| A3 | Skill đó **liệt kê và cấm đích danh** các cluster AI-default (warm-cream #F4F1EA + serif + terracotta; near-black + acid-green; hairline-rule broadsheet) — kỹ thuật negative examples. | như trên |
| A4 | Skill đó bắt buộc **two-pass process**: (1) compact design plan — 4–6 named hex, ≥2 type roles, ASCII wireframe, 1 "signature element"; (2) **self-critique plan against brief** trước khi viết code. | như trên |
| A5 | Skill đó chỉ đạo **vision self-critique qua screenshot trong lúc build** khi môi trường hỗ trợ — official endorsement của screenshot feedback loop. | như trên |
| A6 | Agent SDK core architecture: **gather context → take action → verify work → repeat**; với UI work, "visual feedback (screenshots or renders) can be helpful". | [anthropic.com/engineering/building-agents-with-the-claude-agent-sdk](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) |
| A7 | Anthropic xếp **rules-based feedback (lint, defined output rules) là tín hiệu verify mạnh nhất**; LLM-as-judge "generally not a very robust method". → gate deterministic trước, vision critique sau. | như trên |
| A8 | Đường chính thức cho browser vision loop: **Playwright MCP** (`npx @playwright/mcp@latest`) — đã có sẵn trong Aura Frog `.mcp.json`. | [code.claude.com/docs/en/agent-sdk/overview](https://code.claude.com/docs/en/agent-sdk/overview) |
| A9 | Canonical vision-loop prompt pattern (computer-use docs): "After each step, take a screenshot and carefully evaluate if you have achieved the right outcome… Only when you confirm a step was executed correctly should you move on." Tool `computer_20251124` có action `zoom` xem vùng màn hình full-resolution. | [platform.claude.com — computer-use-tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) |
| A10 | **web-artifacts-builder** skill: scaffold multi-file React + Tailwind + shadcn/ui rồi bundle bằng Parcel thành 1 HTML — pattern cho "build thật, không inline blob". | claude.com blog (A1) |

### 1.2 Community — design-focused agent setups

| # | Finding | Source |
|---|---------|--------|
| C1 | **superdesign-skill**: design direction + extract design system từ codebase + iterate UI drafts trên infinite canvas; cài qua `npx skills add superdesigndev/superdesign-skill` (Claude Code, Cursor, Codex, 70+ harnesses). | [github.com/superdesigndev/superdesign-skill](https://github.com/superdesigndev/superdesign-skill) |
| C2 | Kỹ thuật design-system của nó: persist tokens/system vào **repo-local `.superdesign/design-system.md`** và "design into the project's existing design system" thay vì áp theme preset. → pattern "design-system as durable file" đáng copy. | như trên |

### 1.3 Google Stitch — state mid-2026 (verified trực tiếp)

| # | Finding | Confidence |
|---|---------|------------|
| S1 | **Stitch MCP server chính thức tồn tại** — remote (cloud-hosted). Gemini CLI có extension riêng ([gemini-cli-extensions/stitch](https://github.com/gemini-cli-extensions/stitch)); Claude Code/Cursor/Antigravity/VSCode setup qua docs. Endpoint theo nguồn research: `https://stitch.googleapis.com/mcp`, add bằng `claude mcp add stitch --transport http …`. | Cao (existence verified); endpoint URL cần confirm lúc setup vì docs là SPA không fetch được |
| S2 | **Auth 2 đường**: (a) Stitch API key tạo trong Settings (đơn giản, backed by Google Cloud Managed Projects); (b) ADC/OAuth qua Google Cloud project riêng + IAM (`gcloud beta services mcp enable stitch.googleapis.com`) — token hết hạn ~1h. → **chọn API key**. | Cao (verified qua README gemini-cli-extensions/stitch) |
| S3 | Tools exposed: list projects, get project/screens, download assets (image/HTML), **generate screens from text**, enhance prompts. Nguồn research bổ sung tên tool: `generate_screen_from_text` (modelId GEMINI_3_FLASH / GEMINI_3_1_PRO), `edit_screens`, `generate_variants`, và **design-system tools**: `create_design_system`, `update_design_system`, `list_design_systems`, `apply_design_system`. | Capabilities: cao. Tên tool chính xác: trung bình — confirm khi connect |
| S4 | **google-labs-code/stitch-skills** (verified): 3 collections, 15 skills — `stitch-design` (code-to-design, generate-design, manage-design-system, extract-design-md, extract-static-html, upload-to-stitch), `stitch-build` (react-components, react-native, remotion, shadcn-ui, react-vite-dashboard), `stitch-utilities` (design-md, enhance-prompt, stitch-loop, **taste-design**). Cài vào Claude Code: `npx plugins add google-labs-code/stitch-skills --scope project --target claude-code`. **Yêu cầu Stitch MCP đã configured.** | Cao (fetch trực tiếp repo) |
| S5 | Giới hạn Stitch: output **static-only** (không hover/animation/state), pixel-perfect không đảm bảo, quota free ~350 generations/tháng, MCP dùng chung quota. Output structured: HTML+CSS nhúng, design tokens, `design.md`. | Trung bình (chưa qua 3-vote verify — quota/expiry check lại lúc setup) |

### 1.4 Kết luận chiến lược: Stitch vs Claude built-in design

- **Stitch** = ideation + hi-fi mock + **design-system seed** (design.md, tokens, screens) — nhanh, rẻ (free quota), nhưng static và không pixel-perfect.
- **Claude tự build** (frontend agent + taste layer + vision loop) = implementation fidelity, interactivity, motion, a11y.
- → Không phải "hoặc/hoặc": pipeline đúng là **Stitch sinh design context → Claude implement → vision loop verify chống lại design context đó**. Khi không có Stitch (không auth, hết quota), pipeline degrade gracefully về Claude-only với two-pass design plan (A4).

---

## 2. Gap analysis (hiện trạng plugin)

| Gap | Hiện trạng | Fix trong LLD |
|-----|-----------|----------------|
| G1. Không có vision loop | Playwright MCP có `browser_take_screenshot` nhưng không skill/agent nào dùng để critique | WS-1 |
| G2. stitch-design thủ công | Skill hardcode "Stitch has no API", user tự paste vào web | WS-4 |
| G3. Figma tool mismatch | Agent prompt gọi `get_variable_defs`/`get_code_connect_map` nhưng `.mcp.json` cài `figma-developer-mcp` chỉ có `get_figma_data`/`download_figma_images` | WS-6 |
| G4. Enforcement chỉ là prose | `theme-consistency.md`/`design-system-usage.md` không có hook deterministic | WS-5 |
| G5. Không persist design system | design-tokens generate xong là mất, không enforce qua session | WS-3 |
| G6. Taste layer lỗi thời so với Anthropic official | frontend-aesthetics thiếu two-pass plan, negative-example bans cụ thể, signature element, screenshot self-critique | WS-2 |

---

## 3. Target architecture

```
                        ┌─────────────────────────────┐
                        │  .claude/design/             │
                        │  design-system.md  (SoT)     │◄── WS-3 persist
                        │  tokens.css / @theme         │
                        └──────┬──────────────┬────────┘
                    read       │              │ seed/sync
              ┌────────────────┘              └───────────────┐
              ▼                                               ▼
   ┌─────────────────────┐    design context      ┌─────────────────────┐
   │ frontend agent       │◄──────────────────────│ Stitch MCP (WS-4)    │
   │ + frontend-aesthetics│   (design.md, tokens,  │ generate/edit screens│
   │   v2 (WS-2 two-pass) │    screen HTML/png)    │ design-system tools  │
   └──────────┬───────────┘                        └─────────────────────┘
              │ build
              ▼
   ┌─────────────────────┐   screenshot(s)   ┌──────────────────────────┐
   │ rendered UI (dev     │──────────────────►│ design-vision-loop (WS-1)│
   │ server / artifact)   │   multi-viewport  │ 1. deterministic gates   │
   └──────────▲───────────┘                   │ 2. vision critique       │
              │  fix & re-render              │ 3. verdict: pass/iterate │
              └───────────────────────────────┴──────────────────────────┘
                              max N iterations (default 3)

   Hooks (WS-5): design-conformance gate on Edit/Write of UI files (deterministic, grep-based)
```

**Nguyên tắc thiết kế (từ A6, A7):** verify hai tầng — tầng 1 deterministic (rules-based, tín hiệu mạnh nhất), tầng 2 vision critique (LLM, chỉ chạy khi tầng 1 pass). Loop có budget cứng để không lặp vô hạn.

---

## 4. Workstreams (LLD chi tiết)

### WS-1 — Skill `design-vision-loop` (mới) — ưu tiên cao nhất

**File:** `archon-os/skills/design-vision-loop/SKILL.md` (+ `references/critique-rubric.md`, `references/viewport-matrix.md`)

**Trigger:** sau khi frontend agent build/sửa UI component/page; hoặc user yêu cầu "check UI", "làm đẹp hơn"; auto-invoke ở Phase 4 review cho UI tasks.

**Contract:**
- Input: URL/route đang chạy (hoặc file HTML artifact), đường dẫn `design-system.md` nếu có, brief gốc.
- Loop (max 3 iterations, configurable):
  1. **Render + capture:** Playwright MCP `browser_navigate` → `browser_resize` theo viewport matrix (375, 768, 1440) → `browser_take_screenshot` mỗi viewport. Dark mode: emulate `prefers-color-scheme` chụp thêm 1 bộ.
  2. **Tầng 1 — deterministic gates (A7):** chạy script WS-5 (hex/px hardcode, mixed libraries, contrast check nếu tool có), console errors qua `browser_console_messages`. Fail → fix trước, không tốn vision call.
  3. **Tầng 2 — vision critique:** đọc screenshot, chấm theo rubric: token conformance (đúng palette/type scale trong design-system.md), hierarchy (1 primary action/screen — UX rule 12-year-old friendly), spacing rhythm, overflow/clipping/responsive breakage, dark-mode parity, so khớp Stitch screen PNG nếu có (layout-level, không pixel-diff).
  4. Verdict `PASS` hoặc danh sách defects cụ thể (element, viewport, expected vs actual) → fix → lặp.
- Output: verdict + screenshot paths + defect log ghi vào `.claude/workflow/` cho Phase 4 evidence.
- Canonical prompt pattern nhúng từ A9 ("take a screenshot and carefully evaluate… only when you confirm…").

**Wiring:** thêm vào `agents/frontend.md` (bắt buộc cho UI task), link từ `rules/agent/frontend-excellence.md` pre-ship checklist.

### WS-2 — Nâng cấp `frontend-aesthetics` → v2 (align với Anthropic frontend-design skill)

**File sửa:** `archon-os/skills/frontend-aesthetics/SKILL.md`

Thay đổi (giữ house style flat/clean/1-accent hiện có làm constraint layer riêng):
1. Thêm **two-pass process** (A4): Pass 1 = compact design plan (4–6 named hex, ≥2 type roles, layout ASCII wireframe, 1 signature element); Pass 2 = self-critique plan against brief ("nếu phần nào đọc như generic default cho mọi page tương tự → revise, nói rõ đã đổi gì và vì sao") — trước khi viết code.
2. Mở rộng negative-example bans theo A3: thêm 3 cluster Anthropic nêu đích danh (cream+serif+terracotta, dark+acid-green, hairline broadsheet) bên cạnh ban Inter/Roboto hiện có.
3. Thêm chỉ thị **screenshot self-critique khi build** (A5) → trỏ sang skill WS-1.
4. Ghi kết quả Pass 1 (design plan) vào `design-system.md` nếu project chưa có (nối WS-3).

### WS-3 — Design-system persistence: `.claude/design/design-system.md`

**Format:** tương thích tư tưởng Stitch `design.md` + superdesign `.superdesign/design-system.md` (C2). Sections: brand (hue, named hex), type roles + scale, spacing scale, component library đã chọn, motion policy, signature element, do/don't.

**Producers:** `design-tokens` skill (sau khi generate → ghi file), `frontend-aesthetics` v2 Pass 1, Stitch `extract-design-md`/`design.md` import (WS-4), Figma variables sync (WS-6).
**Consumers:** frontend agent (bắt buộc đọc trước mọi UI task — thêm vào agent prompt), WS-1 rubric, WS-5 hook (parse named hex để whitelist).
**Skill sửa:** `design-tokens/SKILL.md` thêm bước persist + update; `design-expert/SKILL.md` thêm "check `.claude/design/design-system.md` first".

### WS-4 — Stitch MCP integration (thay thế quy trình thủ công)

1. **`.mcp.json`:** thêm entry `stitch` — remote MCP `https://stitch.googleapis.com/mcp` (transport http, header auth bằng Stitch API key từ env `STITCH_API_KEY`). *Confirm endpoint + header name chính xác theo stitch.withgoogle.com/docs/mcp/setup lúc implement (docs là SPA, chưa fetch tự động được).* Auth chọn **API key** (S2) — tránh OAuth token 1h.
2. **Viết lại `skills/stitch-design/SKILL.md`:** bỏ "Stitch has no API" + quy trình paste tay. Workflow mới:
   - Detect Stitch MCP available? Không → fallback quy trình prompt-template cũ (giữ `references/` hiện có).
   - Có → dùng tools: `generate_screen_from_text` (chọn model Flash cho draft, Pro cho final), `edit_screens`/`generate_variants` để iterate, `create_design_system`/`apply_design_system` để seed + đồng bộ design system (S3), download HTML/screenshot per screen.
   - Kết quả: ghi/merge `design.md` → `.claude/design/design-system.md` (WS-3), lưu screen PNG làm **reference target cho WS-1 vision loop**.
   - Quota discipline: log số generation dùng (quota free ~350/tháng, S5); draft bằng Flash.
3. **Đánh giá adopt `google-labs-code/stitch-skills`** (S4): không cài mặc định cho user (thêm 15 skills nặng context); thay vào đó mượn pattern từ `stitch-loop`, `taste-design`, `extract-design-md` vào skill của mình. Ghi hướng dẫn cài optional trong docs (`npx plugins add google-labs-code/stitch-skills --scope project --target claude-code`) cho ai muốn full workflow.
4. **Docs:** guide setup API key (Stitch Settings → Create key), lưu ý token expiry (nguồn chưa verify nói 90 ngày — S5).

### WS-5 — Hook `design-conformance` (deterministic gate)

**File:** `archon-os/hooks/` + script `scripts/design/check-conformance.sh` — theo pattern bash hook sẵn có của plugin.

- Trigger: PostToolUse trên Edit/Write file match `*.tsx|*.jsx|*.vue|*.css|*.scss` trong thư mục UI.
- Checks (grep-based, nhanh, fail-open khi thiếu dependency — bài học từ commit `9fd80cb`):
  - Hex color literal ngoài whitelist parse từ `design-system.md` → warn/fail.
  - `px` literal cho spacing khi project có spacing tokens → warn.
  - Import từ ≥2 component library (vd `@mui/*` + `antd`) → fail (enforce `design-system-usage.md`).
  - File có `animation`/`transition` mà thiếu `prefers-reduced-motion` guard trong cùng module → warn (enforce motion-design).
- Đây là tầng 1 của WS-1 loop, chạy được độc lập mọi lúc (A7: rules-based = tín hiệu mạnh nhất).

### WS-6 — Fix Figma MCP mismatch

Quyết định 1 trong 2 (khuyến nghị **b**):
- (a) Đổi `.mcp.json` sang official Figma Dev Mode MCP → đúng với prompt hiện tại (`get_variable_defs`, `get_code_connect_map`) nhưng yêu cầu Figma desktop/Dev Mode seat.
- (b) **Sửa prompt `agents/frontend.md` + `design-expert/SKILL.md`** dùng đúng tools đang cài (`get_figma_data`, `download_figma_images`), map variables từ `get_figma_data` response vào WS-3 file. Rẻ hơn, không đổi dependency.

### WS-7 — (Optional, sau) Design-reviewer subagent

Agent `design-reviewer` read-only + vision: chỉ chạy WS-1 rubric ở Phase 4 (builder ≠ reviewer discipline sẵn có của run-orchestrator). Defer đến khi WS-1 chạy ổn — tránh thêm agent khi skill là đủ.

---

## 5. Feature/story breakdown (đề xuất cho plan tree)

| ID | Story | Depends | Size |
|----|-------|---------|------|
| FEAT-012 | Design Intelligence Upgrade | — | Epic |
| STORY-A | WS-3 design-system.md schema + persistence (design-tokens, design-expert wiring) | — | S |
| STORY-B | WS-2 frontend-aesthetics v2 (two-pass + bans + screenshot directive) | A | S |
| STORY-C | WS-1 design-vision-loop skill + frontend agent wiring | A | M |
| STORY-D | WS-5 design-conformance hook + script + tests | A | M |
| STORY-E | WS-4 Stitch MCP entry + stitch-design rewrite + docs | A | M |
| STORY-F | WS-6 Figma prompt fix | — | XS |
| STORY-G | WS-7 design-reviewer agent (deferred) | C, D | S |

Thứ tự thi công: A → (B ∥ F) → C → D → E → G. A/B/F ship được ngay không cần Stitch auth.

## 6. Risks & open questions

1. **Stitch endpoint/tool names** — docs SPA không fetch tự động được; claims về `stitch.googleapis.com/mcp`, tên tool, quota 350/tháng, key expiry 90 ngày **chưa qua adversarial verify** (2 lần chạy đều hit session limit đúng nhóm này). Bước đầu STORY-E: connect thật và `list tools` để chốt.
2. **Quota** — vision loop + Stitch generation đều tốn (screenshot tokens, Stitch quota). Mitigate: loop budget 3, Flash cho draft, tầng deterministic chạy trước.
3. **Playwright cần app chạy được** — vision loop yêu cầu dev server; với component lẻ cần harness render (static HTML preview). Ghi rõ precondition trong skill.
4. **Hook false positives** (hex trong test fixture, third-party CSS) — cần exclude list; fail-open như preflight.

## 7. Sources

- https://claude.com/blog/improving-frontend-design-through-skills
- https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md
- https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk
- https://code.claude.com/docs/en/agent-sdk/overview
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
- https://github.com/superdesigndev/superdesign-skill
- https://github.com/google-labs-code/stitch-skills
- https://github.com/gemini-cli-extensions/stitch
- https://stitch.withgoogle.com/docs/mcp/setup (SPA — verify manually at setup)
