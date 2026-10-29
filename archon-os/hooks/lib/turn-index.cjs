/**
 * Turn index — a rebuildable pointer list over the session transcript.
 *
 * Claude Code already writes the full transcript to
 * `~/.claude/projects/<slug>/<session-id>.jsonl`. Compaction shrinks the context
 * window; it never touches that file. So the memory is intact on disk and the
 * only thing missing is something that reads it back.
 *
 * This module is that reader. It turns the transcript into one line per user
 * turn — `#NN │ hh:mm │ headline │ files │ cmds │ branch │ uuid` — small enough
 * to inject whole at session start, and carrying each turn's `uuid` so the agent
 * can go read that exact turn in the transcript when it needs the detail.
 *
 * Two invariants keep this from becoming the problem it solves:
 *
 *   1. The index is a DERIVED CACHE, never a source of truth. Every write
 *      regenerates it from the transcript, so deleting it is harmless and
 *      nothing can exist only here. `writeTurnIndex` replaces the file
 *      wholesale for exactly this reason — an append would let stale rows
 *      outlive the turns they describe.
 *   2. It POINTS at decisions, it does not restate them. Decisions and gate
 *      verdicts live in `.claude/plans/history.jsonl` and the plan tree. A
 *      decision summarised in two places is a decision that can disagree with
 *      itself.
 *
 * No vector retrieval either: the corpus is ~73 rows, which is a list you read,
 * not a corpus you search. Approximate nearest-neighbour search over 73 rows
 * would be absurd at any price, so the size argument settles it on its own —
 * before the separate problem that first-party vectors are not available.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

/** SessionStart hook output is dropped past this many characters. */
const TURN_INDEX_MAX_CHARS = 10000;

const HEADLINE_MAX = 90;
const FILES_PER_TURN = 3;
const CMDS_PER_TURN = 3;
const UUID_SHORT = 8;
/** Newest turns that survive a tiering pass no matter what. */
const KEEP_NEWEST_MIN = 10;

const HEADER = [
  '🧭 Turn index — one line per turn of this session, oldest first.',
  '   Read a turn in full: grep its uuid in the session transcript JSONL.',
  '   Decisions live in .claude/plans/history.jsonl, not here.',
].join('\n');

/**
 * Pure: the directory name Claude Code derives from a working directory.
 * `/Users/x/Projects/demo` → `-Users-x-Projects-demo`.
 */
function projectSlug(cwd) {
  return String(cwd || '').replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Newest `*.jsonl` transcript for a working directory, or null.
 *
 * This is the fix for the handoff that recorded `recent_prompts: []` and
 * `session_id: null`: a hook invoked without stdin (a manual save, a CLI
 * invocation) gets no `transcript_path`, and the old code simply gave up.
 */
function discoverTranscript({ cwd = process.cwd(), home = os.homedir() } = {}) {
  const dir = path.join(home, '.claude', 'projects', projectSlug(cwd));
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return null; }
  let best = null;
  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue;
    const file = path.join(dir, name);
    let mtime;
    try { mtime = fs.statSync(file).mtimeMs; } catch { continue; }
    if (!best || mtime > best.mtime) best = { file, mtime };
  }
  return best ? best.file : null;
}

/** Pure: one line, whitespace collapsed, clipped — safe for a one-line record. */
function oneLine(text, max = HEADLINE_MAX) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Pure: the user's actual words in a transcript record, or '' when the record
 * is not a real prompt (tool result, injected meta, bare slash command).
 */
function promptText(entry) {
  if (!entry || entry.type !== 'user' || entry.isMeta) return '';
  let content = entry.message && entry.message.content;
  if (Array.isArray(content)) {
    content = content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n');
  }
  if (typeof content !== 'string') return '';
  content = content.trim();
  if (!content.startsWith('<')) return content;
  // Slash commands arrive tag-wrapped; keep the ones carrying arguments —
  // `/run <task>` is often the most important request in the session.
  const cmd = content.match(/<command-name>([^<]*)<\/command-name>/);
  const args = content.match(/<command-args>([\s\S]*?)<\/command-args>/);
  return cmd && args && args[1].trim() ? `${cmd[1].trim()} ${args[1].trim()}` : '';
}

/** Pure: file paths and command heads a tool_use block touched. */
function toolSignals(block, out) {
  if (!block || block.type !== 'tool_use' || !block.input) return;
  const i = block.input;
  for (const key of ['file_path', 'path', 'notebook_path']) {
    if (typeof i[key] === 'string' && i[key]) out.files.add(i[key]);
  }
  if (Array.isArray(i.edits)) {
    for (const e of i.edits) if (e && typeof e.file_path === 'string') out.files.add(e.file_path);
  }
  if (typeof i.command === 'string' && i.command.trim()) {
    const head = i.command.trim().split(/\s+/)[0];
    if (head) out.cmds.add(path.basename(head));
  }
}

/**
 * The turn index for a transcript: one record per real user prompt, carrying
 * the files and commands of the work that followed it.
 *
 * `limit` keeps the newest N turns; omit it for the whole session.
 */
function buildTurnIndex(transcriptPath, { limit = 0 } = {}) {
  let text;
  try { text = fs.readFileSync(transcriptPath, 'utf-8'); } catch { return []; }
  const turns = [];
  let cur = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type === 'user') {
      const prompt = promptText(entry);
      if (!prompt) continue;
      cur = {
        n: turns.length + 1,
        ts: entry.timestamp || '',
        headline: oneLine(prompt),
        branch: entry.gitBranch || '',
        uuid: entry.uuid || '',
        files: new Set(),
        cmds: new Set(),
      };
      turns.push(cur);
      continue;
    }
    if (!cur || entry.type !== 'assistant') continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) toolSignals(block, cur);
  }
  const finished = turns.map((t) => ({
    n: t.n,
    ts: t.ts,
    headline: t.headline,
    files: [...t.files].slice(0, FILES_PER_TURN),
    cmds: [...t.cmds].slice(0, CMDS_PER_TURN),
    branch: t.branch,
    uuid: t.uuid,
  }));
  return limit > 0 ? finished.slice(-limit) : finished;
}

/** Pure: hh:mm from an ISO timestamp, '--:--' when unparseable. */
function hhmm(ts) {
  const m = /T(\d{2}:\d{2})/.exec(String(ts || ''));
  return m ? m[1] : '--:--';
}

/**
 * Pure: one rendered index line. Starts with '#' — and nothing else in the
 * rendered block may, so a reader can pick turn lines out by that prefix.
 */
function renderLine(t) {
  return [
    `#${t.n}`,
    hhmm(t.ts),
    oneLine(t.headline),
    (t.files || []).map((f) => path.basename(f)).join(' ') || '—',
    (t.cmds || []).join(' ') || '—',
    t.branch || '—',
    String(t.uuid || '').slice(0, UUID_SHORT),
  ].join(' │ ');
}

/**
 * The injectable index, under `maxChars`.
 *
 * On overflow it drops OLD turns and says so, naming the range it compressed
 * and the files those turns touched, so the agent knows there is more and knows
 * where to go for it. Silent truncation is the one behaviour this must not
 * have: an index that quietly ends at #40 reads exactly like a session that
 * only ever had 40 turns.
 */
function formatTurnIndex(turns, { maxChars = TURN_INDEX_MAX_CHARS } = {}) {
  const list = Array.isArray(turns) ? turns : [];
  if (!list.length) return `${HEADER}\n(no turns recorded yet)`;

  const lines = list.map(renderLine);
  const whole = `${HEADER}\n${lines.join('\n')}`;
  if (whole.length <= maxChars) return whole;

  // Tier: keep as many newest turns as fit beside an explicit loss notice.
  let keep = Math.max(KEEP_NEWEST_MIN, 1);
  let out = null;
  for (let k = lines.length; k >= KEEP_NEWEST_MIN; k -= 1) {
    const dropped = list.slice(0, list.length - k);
    const notice = compressionNotice(dropped);
    const candidate = `${HEADER}\n${notice}\n${lines.slice(-k).join('\n')}`;
    if (candidate.length <= maxChars) { out = candidate; keep = k; break; }
  }
  if (out) return out;
  // Even the floor does not fit: keep the newest turns that do, still announced.
  const notice = compressionNotice(list.slice(0, list.length - 1));
  let body = `${HEADER}\n${notice}`;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const next = `${body}\n${lines[i]}`;
    if (next.length > maxChars) break;
    body = next;
  }
  void keep;
  return body;
}

/** Pure: the loss notice. Never starts with '#' — turn lines own that prefix. */
function compressionNotice(dropped) {
  if (!dropped.length) return '… (nothing compressed)';
  const first = dropped[0].n;
  const last = dropped[dropped.length - 1].n;
  const files = [];
  for (const t of dropped) {
    for (const f of t.files || []) {
      const base = path.basename(f);
      if (!files.includes(base)) files.push(base);
      if (files.length >= 8) break;
    }
    if (files.length >= 8) break;
  }
  return `… ${dropped.length} earlier turns compressed (#${first}–#${last}); `
    + `they touched: ${files.join(' ') || '—'}. `
    + 'Grep this index or read those turns in the transcript by uuid.';
}

/** Pure: a TSV record. Tabs and newlines cannot survive in a field. */
function toRow(t) {
  const clean = (v) => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ');
  return [
    t.n, clean(t.ts), clean(t.headline),
    (t.files || []).map(clean).join(','),
    (t.cmds || []).map(clean).join(','),
    clean(t.branch), clean(t.uuid),
  ].join('\t');
}

/**
 * Write the index. A full replace, not an append: the index is derived, so a
 * rebuild must be able to shrink it. Atomic, so a crashed write cannot leave a
 * half file behind. Carries no generation timestamp — a rebuild from the same
 * transcript is byte-identical, which is how the rebuildable-cache test proves
 * nothing lives only here.
 */
function writeTurnIndex(file, turns) {
  const body = ['# n\tts\theadline\tfiles\tcmds\tbranch\tuuid']
    .concat((turns || []).map(toRow))
    .join('\n');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, `${body}\n`);
    fs.renameSync(tmp, file);
  } catch { /* the index is a cache; failing to write one is never fatal */ }
}

/** Read the index back. Returns [] for a missing or unreadable file. */
function readTurnIndex(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf-8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [n, ts, headline, files, cmds, branch, uuid] = line.split('\t');
    out.push({
      n: Number(n) || 0,
      ts: ts || '',
      headline: headline || '',
      files: (files || '').split(',').filter(Boolean),
      cmds: (cmds || '').split(',').filter(Boolean),
      branch: branch || '',
      uuid: uuid || '',
    });
  }
  return out;
}

module.exports = {
  TURN_INDEX_MAX_CHARS,
  projectSlug,
  discoverTranscript,
  promptText,
  buildTurnIndex,
  formatTurnIndex,
  renderLine,
  writeTurnIndex,
  readTurnIndex,
};
