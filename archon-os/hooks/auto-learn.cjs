#!/usr/bin/env node
/**
 * Aura Frog - Auto-Learn Hook
 *
 * Fires: UserPromptSubmit
 * Purpose: Automatically detect corrections/feedback in user messages and record them
 *
 * Features:
 * - Deduplication: Skips similar feedback within 24h
 * - Pattern detection: Auto-creates patterns after 3+ similar corrections
 * - Task-specific filtering: Skips feedback too specific to current task
 * - Local cache: Stores feedback locally + Supabase
 * - Combines with project context
 *
 * Exit Codes:
 *   0 - Success (non-blocking)
 *
 * @version 2.1.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { recordFeedback, recordPattern, isLearningEnabled } = require('./lib/af-learning.cjs');

// Cache file paths

const { findProjectRoot } = require('./lib/hook-runtime.cjs');
const CACHE_DIR = path.join(findProjectRoot(), '.claude', 'cache');
const FEEDBACK_CACHE_FILE = path.join(CACHE_DIR, 'auto-learn-cache.json');
const PATTERNS_FILE = path.join(CACHE_DIR, 'learned-patterns.md');

// Deduplication window (24 hours)
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

// Pattern threshold (corrections needed to auto-create pattern)
const PATTERN_THRESHOLD = 3;

// Caps. Both of these were unbounded: one new entry per distinct
// `category:rule` pair, forever, in a file that is fully read + fully rewritten
// on every learnable prompt.
//
// Eviction keeps the HIGHEST occurrence counts because occurrence count IS the
// signal this feature exists to surface — a rule seen 40 times is a real user
// preference, a rule seen once is noise. Ties break toward the newer entry.
const MAX_PATTERN_BLOCKS = 50;   // rules kept in learned-patterns.md
const MAX_PATTERN_COUNTS = 200;  // keys kept in cache.patterns

// Correction detection patterns
const CORRECTION_PATTERNS = [
  /^no[,.\s!]/i,
  /^nope/i,
  /^wrong/i,
  /^incorrect/i,
  /^that's not (right|correct|what)/i,
  /^that was wrong/i,
  /^actually[,\s]/i,
  /should (be|have|use|not)/i,
  /shouldn't (be|have|use|do)/i,
  /instead of/i,
  /not like that/i,
  /don't (do|add|use|put|include|create|make|write)/i,
  /do not (do|add|use|put|include|create|make|write)/i,
  /never (add|use|do|include|create|make|write)/i,
  /stop (adding|using|doing|including|creating|making|writing)/i,
  /^(change|fix|update|modify|correct|adjust|remove|delete|undo) (that|this|it)/i,
  /^(change|fix|update|modify|correct) the/i,
  /^that should/i,
  /^it should/i,
  /^please (don't|do not|stop|change|fix|remove)/i,
  /^i (prefer|want|need|like)/i,
  /^always (use|add|include)/i,
  /^(too|very) (verbose|long|short|complex|simple)/i,
  /^(why did you|why are you)/i,
  /^that's (too|unnecessary|overkill|wrong)/i,
  /^(remove|delete|get rid of) (the|all|those|these) (comments?|jsdoc|docstrings?|annotations?)/i
];

const APPROVAL_PATTERNS = [
  /^(good|great|perfect|excellent|nice|awesome|well done)/i,
  /^that's (good|great|perfect|right|correct|what i wanted)/i,
  /^(yes|yep|yeah)[,.\s!]/i,
  /^exactly/i,
  /^looks good/i,
  /^thank(s| you)/i
];

const CORRECTION_KEYWORDS = [
  'wrong', 'incorrect', 'mistake', 'error', 'fix', 'change', 'update',
  'don\'t', 'dont', 'shouldn\'t', 'shouldnt', 'never', 'stop',
  'remove', 'delete', 'undo', 'revert', 'actually', 'instead',
  'too much', 'too many', 'unnecessary', 'overkill', 'verbose',
  'not like', 'not what', 'prefer', 'want you to', 'need you to'
];

// Patterns that indicate GENERAL/REUSABLE feedback (good for learning)
const GENERAL_FEEDBACK_INDICATORS = [
  /\balways\b/i,
  /\bnever\b/i,
  /\bprefer\b/i,
  /\bstyle\b/i,
  /\bpattern\b/i,
  /\bconvention\b/i,
  /\bin general\b/i,
  /\bby default\b/i,
  /\btoo (verbose|complex|simple|long|short)\b/i,
  /\bkeep it\b/i,
  /\bdon't add\b.*\b(comments?|jsdoc|docstrings?|emojis?)\b/i,
  /\buse (const|let|var|arrow|async)\b/i,
  /\bavoid\b/i,
];

// Patterns that indicate TASK-SPECIFIC feedback (skip for learning)
const TASK_SPECIFIC_INDICATORS = [
  // Specific file paths
  /\b(src|lib|components?|pages?|utils?|hooks?|services?)\/\w+/i,
  /\.\w{2,4}\b/,  // File extensions like .tsx, .js, .css

  // Specific values/colors/numbers
  /\b(change|set|make|use)\b.{0,20}\b(to|=)\s*(["']?\w+["']?|\d+|#[0-9a-f]+)/i,
  /\b(red|blue|green|yellow|black|white|gray|#[0-9a-f]{3,6})\b/i,
  /\b\d{2,}\b/,  // Specific numbers (2+ digits)

  // Specific identifiers (camelCase, snake_case, PascalCase)
  /\b[a-z]+[A-Z][a-zA-Z]*\b/,  // camelCase
  /\b[a-z]+_[a-z]+\b/,  // snake_case
  /\b[A-Z][a-z]+[A-Z][a-zA-Z]*\b/,  // PascalCase (but not all caps)

  // Specific UI references
  /\b(this|that|the)\s+(button|modal|dialog|form|input|field|page|component|element)\b/i,

  // Specific function/method calls
  /\b(call|invoke|run|execute)\s+\w+\(/i,

  // Line numbers or positions
  /\b(line|row|column)\s*\d+/i,
  /\bat\s+(the\s+)?(top|bottom|left|right|start|end)\b/i,

  // Very specific instructions
  /\b(rename|move|copy)\s+\w+\s+to\s+\w+/i,
];

// Minimum length for general feedback (very short = likely task-specific)
const MIN_GENERAL_FEEDBACK_LENGTH = 15;
// Maximum length for learnable feedback (very long = likely task-specific instructions)
const MAX_LEARNABLE_LENGTH = 200;

/**
 * Ensure cache directory exists
 */
function ensureCacheDir() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  } catch { /* fs mkdir - non-blocking, will retry next time */ }
}

/**
 * Load feedback cache
 */
function loadCache() {
  try {
    if (fs.existsSync(FEEDBACK_CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(FEEDBACK_CACHE_FILE, 'utf-8'));
      // Clean old entries
      const cutoff = Date.now() - DEDUP_WINDOW_MS;
      data.entries = (data.entries || []).filter(e => e.timestamp > cutoff);
      data.patterns = data.patterns || {};
      return data;
    }
  } catch { /* malformed data - skip silently, fresh state on next run */ }
  return { entries: [], patterns: {} };
}

/**
 * Save feedback cache
 */
function saveCache(cache) {
  try {
    ensureCacheDir();
    // Keep only last 100 entries
    cache.entries = (cache.entries || []).slice(-100);
    // `patterns` was uncapped even though `entries` next to it was capped.
    cache.patterns = trimPatternCounts(cache.patterns);
    fs.writeFileSync(FEEDBACK_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch { /* fs/cache write - non-blocking, will retry next time */ }
}

/**
 * Cap the `{category:rule → count}` map, keeping the highest counts.
 * Dropping a low-count key at worst restarts its climb toward
 * PATTERN_THRESHOLD; dropping a high-count key would erase a confirmed rule.
 */
function trimPatternCounts(patterns, max = MAX_PATTERN_COUNTS) {
  const src = patterns && typeof patterns === 'object' ? patterns : {};
  const keys = Object.keys(src);
  if (keys.length <= max) return src;
  const kept = keys.sort((a, b) => (src[b] || 0) - (src[a] || 0)).slice(0, max);
  const out = {};
  for (const k of kept) out[k] = src[k];
  return out;
}

/**
 * Generate hash for deduplication
 */
function generateHash(content) {
  // Normalize: lowercase, remove extra spaces, take first 200 chars
  const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 200);
  return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 12);
}

/**
 * Check if feedback is duplicate
 */
function isDuplicate(cache, hash) {
  return cache.entries.some(e => e.hash === hash);
}

/**
 * Check for similar patterns and return count
 */
function getSimilarPatternCount(cache, category, rule) {
  const key = `${category}:${rule}`;
  return cache.patterns[key] || 0;
}

/**
 * Increment pattern count
 */
function incrementPatternCount(cache, category, rule) {
  const key = `${category}:${rule}`;
  cache.patterns[key] = (cache.patterns[key] || 0) + 1;
  return cache.patterns[key];
}

/**
 * Cap the number of `<!-- PATTERN:... -->` blocks in learned-patterns.md.
 *
 * Survivors are the highest-**Occurrences** blocks (ties → the later/newer one),
 * rendered back in their original file order so the file stays diff-stable. The
 * header above the first marker is always preserved.
 */
function capPatternBlocks(content, max = MAX_PATTERN_BLOCKS) {
  const text = String(content || '');
  const markerRe = /<!-- PATTERN:[\s\S]*?-->/g;
  const starts = [];
  let m;
  while ((m = markerRe.exec(text)) !== null) starts.push(m.index);
  if (starts.length <= max) return text;

  const header = text.slice(0, starts[0]);
  const blocks = starts.map((start, i) => {
    const body = text.slice(start, i + 1 < starts.length ? starts[i + 1] : text.length);
    const occ = body.match(/\*\*Occurrences:\*\*\s*(\d+)/);
    return { index: i, body, occurrences: occ ? parseInt(occ[1], 10) : 0 };
  });

  const keep = new Set(
    blocks
      .slice()
      .sort((a, b) => (b.occurrences - a.occurrences) || (b.index - a.index))
      .slice(0, max)
      .map(b => b.index)
  );

  return header + blocks.filter(b => keep.has(b.index)).map(b => b.body).join('');
}

/**
 * Update local patterns file
 */
function updateLocalPatternsFile(category, rule, reason, count) {
  try {
    ensureCacheDir();

    let content = '';
    if (fs.existsSync(PATTERNS_FILE)) {
      content = fs.readFileSync(PATTERNS_FILE, 'utf-8');
    } else {
      content = `# Learned Patterns\n\nAuto-generated from user corrections. Updated: ${new Date().toISOString()}\n\n---\n\n`;
    }

    // Check if pattern already exists
    const patternMarker = `<!-- PATTERN:${category}:${rule} -->`;
    if (content.includes(patternMarker)) {
      // Update existing pattern
      const regex = new RegExp(`${patternMarker}[\\s\\S]*?(?=<!-- PATTERN:|$)`, 'g');
      content = content.replace(regex, `${patternMarker}\n## ${category}: ${rule}\n\n**Occurrences:** ${count}\n**Latest:** ${reason.substring(0, 100)}...\n\n---\n\n`);
    } else {
      // Add new pattern
      content += `${patternMarker}\n## ${category}: ${rule}\n\n**Occurrences:** ${count}\n**Latest:** ${reason.substring(0, 100)}...\n\n---\n\n`;
    }

    // Update timestamp
    content = content.replace(/Updated: .+/, `Updated: ${new Date().toISOString()}`);

    // Bound the file. Without this it grows one ~200-char block per distinct
    // category:rule pair forever — and the whole file is read, regexed and
    // rewritten on every learnable prompt.
    content = capPatternBlocks(content, MAX_PATTERN_BLOCKS);

    fs.writeFileSync(PATTERNS_FILE, content);
  } catch { /* fs/cache write - non-blocking, patterns regenerate from corrections */ }
}

/**
 * Check if feedback is general/reusable (vs task-specific)
 * Returns: { isLearnable: boolean, reason: string }
 */
function isLearnableFeedback(userInput) {
  const input = userInput.trim();

  // Too short - likely just "no" or "wrong" without context
  if (input.length < MIN_GENERAL_FEEDBACK_LENGTH) {
    return { isLearnable: false, reason: 'too_short' };
  }

  // Too long - likely detailed task-specific instructions
  if (input.length > MAX_LEARNABLE_LENGTH) {
    return { isLearnable: false, reason: 'too_long' };
  }

  // Check for general feedback indicators (positive signal)
  let hasGeneralIndicator = false;
  for (const pattern of GENERAL_FEEDBACK_INDICATORS) {
    if (pattern.test(input)) {
      hasGeneralIndicator = true;
      break;
    }
  }

  // Check for task-specific indicators (negative signal)
  let taskSpecificCount = 0;
  const taskSpecificMatches = [];
  for (const pattern of TASK_SPECIFIC_INDICATORS) {
    if (pattern.test(input)) {
      taskSpecificCount++;
      taskSpecificMatches.push(pattern.toString().substring(0, 30));
      if (taskSpecificCount >= 2) {
        return {
          isLearnable: false,
          reason: 'task_specific',
          matches: taskSpecificMatches
        };
      }
    }
  }

  // If has general indicator and no/few task-specific, it's learnable
  if (hasGeneralIndicator) {
    return { isLearnable: true, reason: 'general_indicator' };
  }

  // If has one task-specific indicator without general, skip
  if (taskSpecificCount === 1 && !hasGeneralIndicator) {
    return {
      isLearnable: false,
      reason: 'likely_task_specific',
      matches: taskSpecificMatches
    };
  }

  // Default: learnable if no task-specific indicators
  return { isLearnable: true, reason: 'no_specific_indicators' };
}

/**
 * Analyze user input for correction patterns
 */
function analyzeInput(userInput) {
  if (!userInput || userInput.length < 3) {
    return { type: null, confidence: 0 };
  }

  const input = userInput.trim();
  const inputLower = input.toLowerCase();

  for (const pattern of CORRECTION_PATTERNS) {
    if (pattern.test(input)) {
      return { type: 'correction', confidence: 0.9, matchedPattern: pattern.toString() };
    }
  }

  for (const pattern of APPROVAL_PATTERNS) {
    if (pattern.test(input)) {
      return { type: 'approval', confidence: 0.8, matchedPattern: pattern.toString() };
    }
  }

  const keywordMatches = CORRECTION_KEYWORDS.filter(kw => inputLower.includes(kw));
  if (keywordMatches.length >= 2) {
    return { type: 'correction', confidence: 0.7, matchedKeywords: keywordMatches };
  } else if (keywordMatches.length === 1) {
    return { type: 'correction', confidence: 0.5, matchedKeywords: keywordMatches };
  }

  return { type: null, confidence: 0 };
}

/**
 * Categorize the feedback and extract the specific rule
 */
function categorizeCorrection(userInput) {
  const inputLower = userInput.toLowerCase();

  // Comments/documentation related
  if (/\b(comments?|jsdocs?|docstrings?|annotations?|documentation)\b/i.test(inputLower)) {
    if (/\b(don't|dont|no|remove|stop|avoid|unnecessary|too many)\b/i.test(inputLower)) {
      return { category: 'code_style', rule: 'no_excessive_comments' };
    }
    if (/\b(add|include|need|want|missing)\b/i.test(inputLower)) {
      return { category: 'code_style', rule: 'add_comments' };
    }
    return { category: 'code_style', rule: 'comments' };
  }

  // Emojis
  if (/\b(emoji|emojis)\b/i.test(inputLower)) {
    if (/\b(don't|dont|no|remove|stop|avoid)\b/i.test(inputLower)) {
      return { category: 'code_style', rule: 'no_emojis' };
    }
    return { category: 'code_style', rule: 'emojis' };
  }

  // Verbosity
  if (/\b(verbose|wordy|long|lengthy|too much)\b/i.test(inputLower)) {
    return { category: 'code_style', rule: 'be_concise' };
  }
  if (/\b(brief|short|concise|simple|minimal)\b/i.test(inputLower)) {
    return { category: 'code_style', rule: 'keep_it_simple' };
  }

  // TypeScript/types
  if (/\b(types?|typescript|any\b|interfaces?|generics?)\b/i.test(inputLower)) {
    if (/\b(strict|explicit|proper|specific)\b/i.test(inputLower)) {
      return { category: 'code_style', rule: 'strict_types' };
    }
    if (/\b(avoid|no|don't)\b.*\bany\b/i.test(inputLower)) {
      return { category: 'code_style', rule: 'no_any_type' };
    }
    return { category: 'code_style', rule: 'type_safety' };
  }

  // Functions/syntax
  if (/\b(arrow|arrow function)\b/i.test(inputLower)) {
    return { category: 'code_style', rule: 'prefer_arrow_functions' };
  }
  if (/\b(const|let|var)\b/i.test(inputLower)) {
    if (/\bconst\b/i.test(inputLower)) {
      return { category: 'code_style', rule: 'prefer_const' };
    }
    return { category: 'code_style', rule: 'variable_declaration' };
  }
  if (/\b(async|await|promises?)\b/i.test(inputLower)) {
    return { category: 'code_style', rule: 'async_await' };
  }

  // Testing
  if (/\b(tests?|specs?|coverage|jest|vitest|mocha)\b/i.test(inputLower)) {
    if (/\b(describe|it|expect|assert)\b/i.test(inputLower)) {
      return { category: 'testing', rule: 'test_structure' };
    }
    return { category: 'testing', rule: 'test_quality' };
  }

  // Imports/modules
  if (/\b(imports?|exports?|modules?|require)\b/i.test(inputLower)) {
    if (/\borganiz/i.test(inputLower)) {
      return { category: 'code_style', rule: 'organize_imports' };
    }
    return { category: 'code_style', rule: 'imports' };
  }

  // Naming
  if (/\b(naming|names?|variables?|rename)\b/i.test(inputLower)) {
    if (/\b(camel|pascal|snake|kebab)\b/i.test(inputLower)) {
      return { category: 'code_style', rule: 'naming_convention' };
    }
    return { category: 'code_style', rule: 'naming' };
  }

  // Complexity
  if (/\b(complex|simple|refactor|clean|readable)\b/i.test(inputLower)) {
    return { category: 'code_quality', rule: 'simplicity' };
  }

  // Error handling
  if (/\b(error|exception|catch|throw|try)\b/i.test(inputLower)) {
    return { category: 'error_handling', rule: 'error_handling' };
  }

  // Security
  if (/\b(security|auth|password|token|secret|credential)\b/i.test(inputLower)) {
    return { category: 'security', rule: 'security_practice' };
  }

  // Formatting
  if (/\b(format|indent|spacing|whitespace|prettier|eslint)\b/i.test(inputLower)) {
    return { category: 'formatting', rule: 'code_formatting' };
  }

  // React/hooks specific
  if (/\b(hook|useState|useEffect|useMemo|useCallback)\b/i.test(inputLower)) {
    return { category: 'react', rule: 'hooks_usage' };
  }
  if (/\b(component|prop|props|state)\b/i.test(inputLower)) {
    return { category: 'react', rule: 'component_design' };
  }

  return { category: 'general', rule: 'preference' };
}

/**
 * Main hook execution
 */
async function main() {
  // Check if learning is enabled (local or Supabase)
  if (!isLearningEnabled()) {
    process.exit(0);
  }

  try {
    let userInput = '';
    try {
      const stdin = require('fs').readFileSync(0, 'utf-8').trim();
      const data = JSON.parse(stdin);
      userInput = data.prompt || '';
    } catch { /* no stdin */ }
    if (!userInput) {
      userInput = process.env.CLAUDE_USER_PROMPT || '';
    }

    if (!userInput || userInput.length < 5) {
      process.exit(0);
    }

    // Skip commands
    if (userInput.startsWith('/')) {
      process.exit(0);
    }

    // First, check if this is a correction/feedback
    const analysis = analyzeInput(userInput);

    if (!analysis.type || analysis.confidence < 0.5) {
      process.exit(0);
    }

    // Second, check if feedback is learnable (general vs task-specific)
    const learnableCheck = isLearnableFeedback(userInput);

    if (!learnableCheck.isLearnable) {
      // Skip task-specific feedback silently
      // console.log(`🧠 Learning: Skipped (${learnableCheck.reason})`);
      process.exit(0);
    }

    const { category, rule } = categorizeCorrection(userInput);
    const reason = userInput.trim().substring(0, 500);
    const hash = generateHash(userInput);

    // Load cache
    const cache = loadCache();

    // Check for duplicate
    if (isDuplicate(cache, hash)) {
      // Skip duplicate
      process.exit(0);
    }

    // Increment pattern count
    const patternCount = incrementPatternCount(cache, category, rule);

    // Add to cache
    cache.entries.push({
      hash,
      type: analysis.type,
      category,
      rule,
      learnableReason: learnableCheck.reason,
      timestamp: Date.now()
    });

    // Save cache
    saveCache(cache);

    // Record feedback (to local storage or Supabase)
    const feedbackData = {
      type: analysis.type,
      projectName: process.env.PROJECT_NAME || process.env.AF_PROJECT_NAME,
      reason,
      rating: analysis.type === 'approval' ? 5 : 3,
      metadata: {
        source: 'auto_detect',
        confidence: analysis.confidence,
        category,
        rule,
        hash,
        patternCount,
        learnableReason: learnableCheck.reason,
        matchedPattern: analysis.matchedPattern,
        matchedKeywords: analysis.matchedKeywords,
        agent: process.env.AF_CURRENT_AGENT || 'unknown'
      }
    };

    await recordFeedback(feedbackData);

    // Update local patterns file
    updateLocalPatternsFile(category, rule, reason, patternCount);

    // Auto-create learned pattern if threshold reached
    if (patternCount === PATTERN_THRESHOLD && analysis.type === 'correction') {
      await recordPattern({
        type: 'preference',
        category,
        description: `User prefers: ${rule} (auto-detected from ${patternCount} corrections)`,
        rule,
        evidence: [reason.substring(0, 200)]
      });
      console.log(`🧠 Learning: Pattern created! "${category}:${rule}" (${patternCount} occurrences)`);
    } else if (analysis.type === 'correction' && analysis.confidence >= 0.7) {
      console.log(`🧠 Learning: Captured [${category}:${rule}] (${patternCount}/${PATTERN_THRESHOLD})`);
    }

    process.exit(0);
  } catch (error) {
    // Silent fail - non-blocking
    process.exit(0);
  }
}

module.exports = {
  analyzeInput,
  categorizeCorrection,
  isLearnableFeedback,
  generateHash,
  loadCache,
  trimPatternCounts,
  capPatternBlocks,
  MAX_PATTERN_BLOCKS,
  MAX_PATTERN_COUNTS,
};

if (require.main === module) {
  main();
}
