#!/usr/bin/env node
/**
 * security-critical-warn.cjs - Tiered security warnings for sensitive files
 *
 * PreToolUse hook on Write|Edit.
 * Provides graduated warnings based on file sensitivity level.
 *
 * Exit codes:
 * - 0: Continue (with optional stderr warning)
 */

const fs = require('fs');
const { readStdinSafely } = require('./lib/safe-stdin.cjs');
const path = require('path');

// Tiered file sensitivity patterns
const TIERS = {
  CRITICAL: {
    icon: '🔴',
    label: 'CRITICAL',
    patterns: [
      /\.env(\.|$)/,
      /credentials\.(json|yaml|yml|toml)/i,
      /\.aws\/config/,
      /\.ssh\//,
      /secrets?\.(json|yaml|yml|toml)/i,
      /service[_-]?account.*\.json/i,
      /\.pem$/,
      /\.key$/,
    ],
    message: 'This file likely contains secrets. Verify it is NOT committed to git.',
  },
  HIGH: {
    icon: '🟠',
    label: 'HIGH',
    patterns: [
      /\/auth\//i,
      /\/authentication\//i,
      /\/authorization\//i,
      /\/payment/i,
      /\/billing/i,
      /\/crypto/i,
      /\/security\//i,
      /\/middleware\/auth/i,
      /\/session/i,
      /password/i,
      /oauth/i,
      /jwt/i,
      /token.*handler/i,
    ],
    message: 'Security-critical code. Consider human review before merging.',
  },
  MEDIUM: {
    icon: '🟡',
    label: 'MEDIUM',
    patterns: [
      /config\.(js|ts|json|yaml|yml)/i,
      /settings\.(py|rb|php)/i,
      /database\.(js|ts|py|php)/i,
      /\.config\.(js|ts|mjs|cjs)/i,
      /cors/i,
      /helmet/i,
      /csrf/i,
      /rate[_-]?limit/i,
    ],
    message: 'Config file with potential security implications.',
  },
};

// Pure: classify a file path into the first matching sensitivity tier, or null.
// Tiers are checked in declaration order (CRITICAL → HIGH → MEDIUM), and the
// path is normalised (backslashes → slashes, lower-cased) so Windows-style and
// mixed-case paths match the same patterns.
function classifyTier(filePath) {
  if (!filePath) return null;
  const normalized = String(filePath).replace(/\\/g, '/').toLowerCase();
  for (const [tier, config] of Object.entries(TIERS)) {
    if (config.patterns.some((p) => p.test(normalized))) return tier;
  }
  return null;
}

function main() {
  try {
    const input = readStdinSafely();
    if (!input) return;

    const data = JSON.parse(input);
    const filePath = (data.tool_input || {}).file_path || '';
    if (!filePath) return;

    const tier = classifyTier(filePath);
    if (tier) {
      const config = TIERS[tier];
      console.error(`${config.icon} [${config.label}] ${config.message}`);
      console.error(`   File: ${path.basename(filePath)}`);
    }
  } catch {
    /* fail open */
  }
}

// Run as a hook; stay importable for tests. FEAT-007 / issue #5.
if (require.main === module) {
  main();
} else {
  module.exports = { TIERS, classifyTier };
}
