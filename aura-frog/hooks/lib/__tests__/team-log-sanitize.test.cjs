/**
 * FEAT-007 / STORY-0029 — per-agent log filename sanitization.
 * team-log-writer.cjs / team-bridge.cjs built `${agent}.jsonl` from an
 * unsanitized agent name, so a name containing '/' or '..' escaped the log dir.
 */

const path = require('path');
const { sanitizeAgentName } = require('../../../../aura-frog/hooks/lib/team-log-writer.cjs');

describe('sanitizeAgentName', () => {
  it('passes a normal agent name through unchanged', () => {
    expect(sanitizeAgentName('frontend')).toBe('frontend');
    expect(sanitizeAgentName('archon-os:architect'.replace(/[^A-Za-z0-9._-]/g, '_'))).toBeTruthy();
  });

  it('neutralizes path separators and traversal', () => {
    expect(sanitizeAgentName('../../etc/passwd')).not.toMatch(/[/\\]/);
    expect(sanitizeAgentName('../../etc/passwd')).not.toMatch(/^\.\./);
  });

  it('keeps the resulting filename inside the log dir', () => {
    const logDir = '/var/log/aura';
    const resolved = path.resolve(logDir, `${sanitizeAgentName('../../../../etc/x')}.jsonl`);
    expect(resolved.startsWith(logDir + path.sep)).toBe(true);
  });

  it('falls back to "agent" for empty/dotty names', () => {
    expect(sanitizeAgentName('')).toBe('agent');
    expect(sanitizeAgentName('...')).toBe('agent');
  });
});
