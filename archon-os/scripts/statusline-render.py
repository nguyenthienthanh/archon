#!/usr/bin/env python3
"""Aura Frog plugin — canonical cost/usage statusline renderer.

Reads Claude Code's statusline JSON on stdin and prints a 3-line status:
  L1  identity  : model · shortened cwd · git branch (+dirty)
  L2  budgets   : 5h limit (bar+%+reset) · 7d limit · context %
  L3  money     : session $ · billing-cycle $ (+projection)  [API-equiv value]

No blocking work: session $ comes straight from stdin, cycle $ is read from a
cache file refreshed in the background by statusline-usage-refresh.sh.
Only stdlib. Colors are ANSI; every field degrades gracefully when absent.
"""
import json
import os
import sys
import time
import subprocess
from datetime import date

HOME = os.path.expanduser("~")
CYCLE_CACHE = os.path.join(HOME, ".claude", "cache", "usage-cycle.json")
BILLING_DAY = int(os.environ.get("AF_BILLING_DAY", "1"))
CTX_WINDOW = int(os.environ.get("AF_CTX_WINDOW", "200000"))
PLAN_LABEL = os.environ.get("AF_PLAN_LABEL", "Claude")

# --- ANSI helpers -----------------------------------------------------------
NO_COLOR = os.environ.get("NO_COLOR") or os.environ.get("AF_STATUSLINE_NOCOLOR")
def c(code, s):
    if NO_COLOR:
        return s
    return f"\033[{code}m{s}\033[0m"
# "DIM" is the muted/secondary color. 90 = bright-black: a readable grey on both
# light and dark backgrounds. (The old 2;37 dim-attribute rendered near-invisible.)
DIM = "90"; GREEN = "32"; YELLOW = "33"; RED = "31"; CYAN = "36"; BOLD = "1"; BLUE = "34"; MAGENTA = "35"
def dim(s):  return c(DIM, s)
def sep():   return dim("  ·  ")

def pct_color(p):
    if p is None:      return DIM
    if p >= 90:        return RED
    if p >= 70:        return YELLOW
    return GREEN

def read_json_stdin():
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}

def g(d, *path, default=None):
    cur = d
    for k in path:
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return cur if cur is not None else default

# --- cwd shortening ---------------------------------------------------------
def short_cwd(path):
    if not path:
        return "?"
    if path.startswith(HOME):
        path = "~" + path[len(HOME):]
    parts = path.split("/")
    if len(parts) <= 4:
        return path
    # keep first (~ or root) + last two, ellipsize the middle
    return "/".join([parts[0], "…", parts[-2], parts[-1]])

# --- git --------------------------------------------------------------------
def git_segment(cwd):
    if not cwd or not os.path.isdir(cwd):
        return ""
    try:
        br = subprocess.run(["git", "-C", cwd, "symbolic-ref", "--short", "-q", "HEAD"],
                            capture_output=True, text=True, timeout=0.4)
        branch = br.stdout.strip()
        if not branch:
            hd = subprocess.run(["git", "-C", cwd, "rev-parse", "--short", "HEAD"],
                                capture_output=True, text=True, timeout=0.4)
            branch = hd.stdout.strip()
            if not branch:
                return ""
        st = subprocess.run(["git", "-C", cwd, "status", "--porcelain"],
                            capture_output=True, text=True, timeout=0.5)
        dirty = "*" if st.stdout.strip() else ""
    except Exception:
        return ""
    col = YELLOW if dirty else GREEN
    return dim("⎇ ") + c(col, branch + dirty)

# --- reset time formatting --------------------------------------------------
def fmt_reset(epoch):
    # Absolute reset clock time (not a countdown), e.g. "8:00PM" today or
    # "Tue 8PM" when it's days out. Preference: show WHEN it resets.
    if not epoch:
        return ""
    try:
        epoch = int(epoch)
    except Exception:
        return ""
    from datetime import datetime
    delta = epoch - int(time.time())
    if delta <= 0:
        return "now"
    dt = datetime.fromtimestamp(epoch)
    mer = "AM" if dt.hour < 12 else "PM"
    h12 = ((dt.hour - 1) % 12) + 1
    if delta < 18 * 3600:          # within the day → clock only
        return f"{h12}:{dt.minute:02d}{mer}"
    return dt.strftime("%a ") + f"{h12}{mer}"   # days out → "Tue 8PM"

# --- limits -----------------------------------------------------------------
def bar(p, width=5):
    if p is None:
        return dim("░" * width)
    filled = min(width, int(round(p / 100.0 * width)))
    return c(pct_color(p), "█" * filled) + dim("░" * (width - filled))

def limit_seg(label, node):
    if not isinstance(node, dict):
        return None
    p = node.get("used_percentage")
    if p is None:
        return None
    reset = fmt_reset(node.get("resets_at"))
    pcol = pct_color(p)
    txt = f"{dim(label)} {bar(p)} " + c(pcol, f"{p:.0f}%")
    if reset:
        txt += dim(f"·{reset}")
    return txt

def limit_seg_compact(label, node):
    if not isinstance(node, dict):
        return None
    p = node.get("used_percentage")
    if p is None:
        return None
    reset = fmt_reset(node.get("resets_at"))
    txt = f"{dim(label)} " + c(pct_color(p), f"{p:.0f}%")
    if reset:
        txt += dim(f"·{reset}")
    return txt

# --- context % ---------------------------------------------------------------
# NGUỒN SỰ THẬT: khối `context_window` mà Claude Code đưa vào stdin (>= v2.1.x).
# Nó đã tính sẵn used_percentage theo ĐÚNG cửa sổ của model, và — điểm mấu chốt —
# nó PHẢN ÁNH ĐÚNG SAU KHI COMPACT.
#
# Cách cũ (suy ra từ transcript) sai hai đường:
#   1. Mẫu số đoán mò: 200k cho tới khi vượt 200k rồi mới nhảy sang 1M ⇒ trên Opus
#      1M, 161k hiện 81% (161/200) thay vì 16% (161/1000), và khi vượt 200k thì %
#      rơi vực 100% → 20%.
#   2. Compact không reset: transcript của phiên bị compact KHÔNG ghi dấu
#      isCompactSummary và khối `usage` cứ leo tiếp (đo được: 376k và tăng đều
#      trong khi context thật đã về ~100k) ⇒ % đứng nguyên ở giá trị trước compact.
# Chỉ lùi về suy-đoán-từ-transcript khi Claude Code cũ không gửi context_window.


def context_from_stdin(cw):
    """(pct, tokens) lấy thẳng từ stdin. None nếu payload không có/không hợp lệ."""
    if not isinstance(cw, dict):
        return None
    toks = cw.get("total_input_tokens")
    if not isinstance(toks, (int, float)) or toks <= 0:
        return None
    win = cw.get("context_window_size")
    ovr = os.environ.get("AF_CTX_WINDOW")
    if ovr:
        try:
            win = int(ovr)
        except Exception:
            pass
    if isinstance(win, (int, float)) and win > 0:
        return (min(100.0, toks / win * 100.0), int(toks))
    # Không có size thì dùng % Claude Code đã tính (đừng tự bịa mẫu số).
    pct = cw.get("used_percentage")
    if isinstance(pct, (int, float)):
        return (float(pct), int(toks))
    return None


# --- fallback: suy ra từ transcript (Claude Code cũ) -------------------------
def ctx_window_for(toks, exceeds_200k):
    # Auto-pick the real window: Claude 5-era models run a 1M context and don't
    # compact at 200k, so a fixed 200k denominator pins big sessions at 100%.
    # Honor an explicit override; otherwise 1M once we're clearly past 200k.
    if os.environ.get("AF_CTX_WINDOW"):
        try:
            return int(os.environ["AF_CTX_WINDOW"])
        except Exception:
            pass
    return 1_000_000 if (exceeds_200k or toks > 200_000) else 200_000

def context_pct(transcript_path, exceeds_200k):
    """Returns (pct, tokens) or None. pct is vs the auto-detected window."""
    if not transcript_path or not os.path.isfile(transcript_path):
        return None
    try:
        # read the tail; the last message carrying a usage block gives the
        # tokens sent on the most recent turn ≈ current context occupancy.
        with open(transcript_path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            back = min(size, 262144)
            f.seek(size - back)
            tail = f.read().decode("utf-8", "replace").splitlines()
        for line in reversed(tail):
            line = line.strip()
            if not line or '"usage"' not in line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            u = g(obj, "message", "usage") or obj.get("usage")
            if not isinstance(u, dict):
                continue
            toks = (u.get("input_tokens", 0) or 0) \
                + (u.get("cache_read_input_tokens", 0) or 0) \
                + (u.get("cache_creation_input_tokens", 0) or 0)
            if toks <= 0:
                continue
            win = ctx_window_for(toks, exceeds_200k)
            return (min(100.0, toks / win * 100.0), toks)
    except Exception:
        return None
    return None

# --- billing cycle math -----------------------------------------------------
def add_month(y, m):
    return (y + 1, 1) if m == 12 else (y, m + 1)

def cycle_bounds(today, billing_day):
    y, m = today.year, today.month
    if today.day >= billing_day:
        start = date(y, m, min(billing_day, 28))
        ny, nm = add_month(y, m)
    else:
        py, pm = (y - 1, 12) if m == 1 else (y, m - 1)
        start = date(py, pm, min(billing_day, 28))
        ny, nm = y, m
    end = date(ny, nm, min(billing_day, 28))
    days_total = (end - start).days
    days_elapsed = (today - start).days + 1
    return start, days_total, days_elapsed

def money_line(session_cost, duration_ms):
    today = date.today()
    start, days_total, days_elapsed = cycle_bounds(today, BILLING_DAY)
    parts = []
    sc = session_cost if isinstance(session_cost, (int, float)) else 0.0
    parts.append(dim("session ") + c(BOLD, f"≈${sc:,.2f}"))

    # session burn rate ($/hr): cost over wall-clock session duration.
    try:
        hours = (float(duration_ms) / 3_600_000.0) if duration_ms else 0.0
    except Exception:
        hours = 0.0
    if hours > 0.02 and sc > 0:  # ignore the first ~minute (unstable rate)
        burn = sc / hours
        parts.append(c(MAGENTA, "🔥 ") + c(BOLD, f"≈${burn:,.2f}") + dim("/hr"))

    cyc = None
    cache_age = None
    try:
        if os.path.isfile(CYCLE_CACHE):
            with open(CYCLE_CACHE) as f:
                cc = json.load(f)
            if cc.get("cycle_start") == start.strftime("%Y%m%d"):
                cyc = cc.get("cycle_cost")
                cache_age = int(time.time()) - int(cc.get("computed_at", 0))
    except Exception:
        cyc = None

    sup = str(BILLING_DAY)
    trans = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")
    day_sup = sup.translate(trans)
    if isinstance(cyc, (int, float)):
        proj = cyc / max(1, days_elapsed) * days_total
        seg = dim(f"cycle{day_sup} ") + c(CYAN, f"≈${cyc:,.0f}") \
            + dim(f" →proj ") + c(CYAN, f"≈${proj:,.0f}")
        if cache_age is not None and cache_age > 3600:
            seg += dim(" ⟳")
        parts.append(seg)
    else:
        parts.append(dim(f"cycle{day_sup} …"))

    parts.append(dim(f"≈API-equiv·{PLAN_LABEL}"))
    return sep().join(parts)

# --- main -------------------------------------------------------------------
def main():
    d = read_json_stdin()
    model = g(d, "model", "display_name", default=g(d, "model", "id", default="Claude"))
    cwd = g(d, "workspace", "current_dir", default=g(d, "cwd", default=os.getcwd()))
    transcript = g(d, "transcript_path")
    exceeds = g(d, "exceeds_200k_tokens", default=False)
    rl = g(d, "rate_limits", default={})
    session_cost = g(d, "cost", "total_cost_usd", default=0.0)
    duration_ms = g(d, "cost", "total_duration_ms", default=0)

    # L1 — identity
    l1 = " ".join(x for x in [
        c(GREEN, "🐸 " + str(model)),
        sep().strip() and dim("·"),
        c(CYAN, short_cwd(cwd)),
        git_segment(cwd),
    ] if x)

    # L2 — budgets
    segs = []
    s5 = limit_seg("5h", rl.get("five_hour"))
    s7 = limit_seg_compact("7d", rl.get("seven_day"))
    if s5: segs.append(s5)
    if s7: segs.append(s7)
    ctx = context_from_stdin(g(d, "context_window", default=None))
    if ctx is None:
        ctx = context_pct(transcript, exceeds)
    if ctx is not None:
        cpct, ctoks = ctx
        ktxt = f"{ctoks/1000:.0f}k" if ctoks >= 1000 else str(ctoks)
        segs.append(dim("ctx ") + c(pct_color(cpct), f"{cpct:.0f}%") + dim(f"·{ktxt}"))
    l2 = sep().join(segs) if segs else dim("budgets: waiting for first response…")

    # L3 — money
    l3 = money_line(session_cost, duration_ms)

    sys.stdout.write(l1 + "\n" + l2 + "\n" + l3 + "\n")

if __name__ == "__main__":
    main()
