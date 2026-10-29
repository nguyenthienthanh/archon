/**
 * statusline-render.py — context % phải lấy từ khối `context_window` của stdin.
 *
 * GỐC RỄ (Ethan báo 2026-08-25, Opus 1M): statusline hiện `81%` ở 161k và `82%`
 * ở 164k, rồi SAU KHI COMPACT tụt về 100k mà % vẫn đứng ở giá trị cũ.
 *
 * Hai lỗi riêng biệt, cùng một nguyên nhân — script tự suy ra context từ
 * transcript thay vì đọc thứ Claude Code đã đưa sẵn:
 *
 *   1. Mẫu số đoán mò: 200k cho tới khi vượt 200k mới nhảy sang 1M. Trên Opus 1M,
 *      161k/200k = 81% thay vì 161k/1M = 16% — phóng đại 5 lần. Và khi vượt 200k
 *      thì % rơi vực 100% → 20%.
 *   2. Compact không reset: transcript của phiên bị compact KHÔNG ghi
 *      isCompactSummary, khối `usage` cứ leo tiếp (đo được 376k và tăng đều trong
 *      khi context thật đã về ~100k) ⇒ % đứng nguyên ở giá trị trước compact.
 *
 * Claude Code >= v2.1.x đưa sẵn context_window{context_window_size,
 * total_input_tokens, used_percentage} — đã đúng cửa sổ model VÀ đúng sau compact.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RENDER = path.join(process.cwd(), 'archon-os', 'scripts', 'statusline-render.py');

function render(payload, env = {}) {
  const res = spawnSync('python3', [RENDER], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', AF_STATUSLINE_USAGE_DISABLED: '1', ...env },
  });
  return { out: res.stdout || '', status: res.status };
}

// Dòng 2 là dòng budgets (5h · 7d · ctx).
const ctxOf = (out) => {
  const m = /ctx (\d+)%·(\S+)/.exec(out.split('\n')[1] || '');
  return m ? { pct: Number(m[1]), toks: m[2] } : null;
};

const base = (cw) => ({
  model: { display_name: 'Opus 5' },
  workspace: { current_dir: os.tmpdir() },
  cost: { total_cost_usd: 1, total_duration_ms: 1000 },
  exceeds_200k_tokens: false,
  ...(cw ? { context_window: cw } : {}),
});

describe('statusline context % — nguồn sự thật là stdin.context_window', () => {
  test('Opus 1M ở 161k phải là 16%, KHÔNG phải 81% (bug mẫu số 200k)', () => {
    const { out } = render(base({ context_window_size: 1_000_000, total_input_tokens: 161_000, used_percentage: 16 }));
    expect(ctxOf(out)).toEqual({ pct: 16, toks: '161k' });
  });

  test('sau compact: context_window tụt thì % PHẢI tụt theo', () => {
    const before = ctxOf(render(base({ context_window_size: 1_000_000, total_input_tokens: 376_000, used_percentage: 38 })).out);
    const after = ctxOf(render(base({ context_window_size: 1_000_000, total_input_tokens: 100_000, used_percentage: 10 })).out);
    expect(before.pct).toBe(38);
    expect(after.pct).toBe(10);
    expect(after.pct).toBeLessThan(before.pct);
  });

  test('transcript cũ KHÔNG được lấn át stdin — dù transcript còn số trước compact', () => {
    // Transcript vẫn mang usage 376k (đúng như phiên bị compact ngoài đời), nhưng
    // stdin nói context thật là 100k. stdin phải thắng.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-'));
    const tx = path.join(tmp, 't.jsonl');
    fs.writeFileSync(tx, JSON.stringify({
      type: 'assistant',
      message: { usage: { input_tokens: 0, cache_read_input_tokens: 376_000, cache_creation_input_tokens: 0 } },
    }) + '\n');
    const payload = { ...base({ context_window_size: 1_000_000, total_input_tokens: 100_000, used_percentage: 10 }), transcript_path: tx };
    expect(ctxOf(render(payload).out)).toEqual({ pct: 10, toks: '100k' });
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('AF_CTX_WINDOW vẫn ghi đè được cửa sổ', () => {
    const { out } = render(base({ context_window_size: 1_000_000, total_input_tokens: 161_000, used_percentage: 16 }), { AF_CTX_WINDOW: '200000' });
    expect(ctxOf(out).pct).toBe(80);
  });

  test('Claude Code cũ (không có context_window) vẫn lùi về suy từ transcript', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-'));
    const tx = path.join(tmp, 't.jsonl');
    fs.writeFileSync(tx, JSON.stringify({
      type: 'assistant',
      message: { usage: { input_tokens: 0, cache_read_input_tokens: 100_000, cache_creation_input_tokens: 0 } },
    }) + '\n');
    const payload = { ...base(null), transcript_path: tx };
    expect(ctxOf(render(payload).out)).toEqual({ pct: 50, toks: '100k' }); // 100k/200k
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('payload rác không được làm vỡ render (luôn exit 0)', () => {
    for (const p of [{}, { context_window: { total_input_tokens: 'x', context_window_size: 0 } }, { context_window: null }]) {
      const r = render(p);
      expect(r.status).toBe(0);
    }
  });
});
