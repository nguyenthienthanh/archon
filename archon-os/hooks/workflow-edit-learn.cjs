#!/usr/bin/env node
/**
 * Aura Frog - Workflow Edit Learn Hook
 *
 * Fires: SessionStart (see hooks.json — scans for user edits since last session)
 * Purpose: Detect when users have directly edited workflow MD files and extract learnings
 *
 * Monitors:
 * - .claude/cache/workflow-state.json
 * - .claude/logs/runs/*.md (and legacy .claude/logs/workflows/)
 * - Any workflow deliverable files
 *
 * When user edits are detected, extracts:
 * - What was changed
 * - Patterns in the changes
 * - Preferences indicated by the edits
 *
 * Exit Codes:
 *   0 - Success (non-blocking)
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { recordFeedback, recordPattern, isLearningEnabled } = require('./lib/af-learning.cjs');

// Cache paths

const { findProjectRoot } = require('./lib/hook-runtime.cjs');
const CACHE_DIR = path.join(findProjectRoot(), '.claude', 'cache');
const WORKFLOW_HASHES_FILE = path.join(CACHE_DIR, 'workflow-file-hashes.json');

// Workflow-related paths to monitor
const WORKFLOW_PATHS = [
  '.claude/cache/workflow-state.json',
  '.claude/logs/runs',
  '.claude/logs/workflows', // legacy — kept for backwards compat
  'docs/workflow',
  'workflow'
];

// File patterns to monitor
const WORKFLOW_FILE_PATTERNS = [
  /workflow.*\.md$/i,
  /phase-?\d+.*\.md$/i,
  /deliverable.*\.md$/i,
  /plan\.md$/i,
  /spec\.md$/i,
  /requirements\.md$/i
];

/**
 * Ensure cache directory exists
 */
function ensureCacheDir() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  } catch { /* ignore */ }
}

/**
 * Load file hashes cache
 */
function loadHashes() {
  try {
    if (fs.existsSync(WORKFLOW_HASHES_FILE)) {
      return JSON.parse(fs.readFileSync(WORKFLOW_HASHES_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

/**
 * Save file hashes cache
 */
function saveHashes(hashes) {
  try {
    ensureCacheDir();
    fs.writeFileSync(WORKFLOW_HASHES_FILE, JSON.stringify(hashes, null, 2));
  } catch { /* ignore */ }
}

/**
 * Calculate file hash
 */
function hashFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return crypto.createHash('md5').update(content).digest('hex');
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Check if file is a workflow file
 */
function isWorkflowFile(filePath) {
  const relativePath = filePath.replace(process.cwd() + '/', '');

  // Check path patterns
  for (const wp of WORKFLOW_PATHS) {
    if (relativePath.startsWith(wp)) return true;
  }

  // Check file name patterns
  const fileName = path.basename(filePath);
  for (const pattern of WORKFLOW_FILE_PATTERNS) {
    if (pattern.test(fileName)) return true;
  }

  return false;
}

/**
 * Get last modified by (heuristic - file stat vs our last recorded edit)
 */
function getLastModifiedInfo(filePath, hashes) {
  try {
    const stats = fs.statSync(filePath);
    const currentHash = hashFile(filePath);
    const savedData = hashes[filePath];

    if (!savedData) {
      // First time seeing this file
      return { isNew: true, modified: false };
    }

    if (savedData.hash !== currentHash) {
      // File changed
      const timeSinceLastRecord = Date.now() - (savedData.timestamp || 0);

      // If modified more than 10 seconds after our last record,
      // and mtime is after our timestamp, likely user edit
      if (timeSinceLastRecord > 10000) {
        return {
          isNew: false,
          modified: true,
          likelyUserEdit: true,
          oldHash: savedData.hash,
          newHash: currentHash,
          timeSinceLastRecord
        };
      }

      return { isNew: false, modified: true, likelyUserEdit: false };
    }

    return { isNew: false, modified: false };
  } catch {
    return { isNew: false, modified: false, error: true };
  }
}

/**
 * Extract changes between old and new content
 */
function extractChanges(oldContent, newContent) {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const additions = [];
  const removals = [];
  const modifications = [];

  // Simple diff: compare lines
  const oldSet = new Set(oldLines.map(l => l.trim()));
  const newSet = new Set(newLines.map(l => l.trim()));

  newLines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !oldSet.has(trimmed)) {
      additions.push(trimmed);
    }
  });

  oldLines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !newSet.has(trimmed)) {
      removals.push(trimmed);
    }
  });

  return { additions, removals };
}

/**
 * Analyze changes and extract patterns
 */
function analyzeChanges(changes, filePath) {
  const patterns = [];
  const fileName = path.basename(filePath);

  // Check additions for patterns
  changes.additions.forEach(line => {
    // User added more details
    if (line.startsWith('#') || line.startsWith('##')) {
      patterns.push({
        type: 'structure',
        category: 'documentation',
        description: 'User prefers more structured headers',
        evidence: line.substring(0, 100)
      });
    }

    // User added bullet points
    if (line.startsWith('-') || line.startsWith('*')) {
      patterns.push({
        type: 'format',
        category: 'documentation',
        description: 'User prefers bullet point format',
        evidence: line.substring(0, 100)
      });
    }

    // User added code blocks
    if (line.startsWith('```')) {
      patterns.push({
        type: 'format',
        category: 'documentation',
        description: 'User prefers code examples in documentation',
        evidence: 'Added code block'
      });
    }
  });

  // Check removals for patterns
  changes.removals.forEach(line => {
    // User removed verbose content
    if (line.length > 100) {
      patterns.push({
        type: 'preference',
        category: 'verbosity',
        description: 'User prefers concise content (removed verbose text)',
        evidence: line.substring(0, 50) + '...'
      });
    }

    // User removed certain phrases
    const verbosePatterns = [
      /please note/i,
      /it's important to/i,
      /make sure to/i,
      /don't forget to/i
    ];

    for (const pattern of verbosePatterns) {
      if (pattern.test(line)) {
        patterns.push({
          type: 'preference',
          category: 'tone',
          description: 'User prefers direct language (removed filler phrases)',
          evidence: line.substring(0, 50)
        });
        break;
      }
    }
  });

  // Analyze net changes
  if (changes.removals.length > changes.additions.length * 2) {
    patterns.push({
      type: 'preference',
      category: 'brevity',
      description: 'User significantly reduced content - prefers brevity',
      evidence: `Removed ${changes.removals.length} lines, added ${changes.additions.length}`
    });
  }

  return patterns;
}

/**
 * Record user edit as feedback
 */
async function recordUserEdit(filePath, changes, patterns) {
  // Record as correction feedback
  await recordFeedback({
    type: 'correction',
    projectName: process.env.PROJECT_NAME || process.env.AF_PROJECT_NAME,
    reason: `User directly edited workflow file: ${path.basename(filePath)}`,
    metadata: {
      source: 'workflow_edit_detection',
      file: filePath,
      additionsCount: changes.additions.length,
      removalsCount: changes.removals.length,
      patternsDetected: patterns.length,
      category: 'workflow_edit',
      rule: 'user_preference'
    }
  });

  // Record detected patterns
  for (const pattern of patterns) {
    await recordPattern({
      type: pattern.type,
      category: pattern.category,
      description: pattern.description,
      evidence: [pattern.evidence]
    });
  }

  if (patterns.length > 0) {
    console.log(`🧠 Workflow Edit: Detected ${patterns.length} pattern(s) from user edits to ${path.basename(filePath)}`);
  }
}

/**
 * Update hash after we've recorded an edit
 */
function updateFileHash(filePath, hashes) {
  const newHash = hashFile(filePath);
  if (newHash) {
    hashes[filePath] = {
      hash: newHash,
      timestamp: Date.now()
    };
    saveHashes(hashes);
  }
}

/**
 * Scan for workflow files and check for user edits
 */
async function scanWorkflowFiles() {
  const hashes = loadHashes();

  for (const basePath of WORKFLOW_PATHS) {
    const fullPath = path.join(process.cwd(), basePath);

    try {
      if (!fs.existsSync(fullPath)) continue;

      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Scan directory
        const files = fs.readdirSync(fullPath);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const filePath = path.join(fullPath, file);
            await checkFile(filePath, hashes);
          }
        }
      } else if (stat.isFile()) {
        await checkFile(fullPath, hashes);
      }
    } catch { /* ignore */ }
  }
}

/**
 * Return the HEAD-committed contents of a repo-relative path, or '' if the
 * path is untracked / git fails. Uses execFileSync with an argv array (no
 * shell) so a filename containing shell metacharacters cannot inject a
 * command — the path is a single, literal argument to `git show`.
 */
function gitShowHead(relPath, cwd = process.cwd()) {
  const { TIMEOUT_DEFAULT_MS, MAX_BUFFER_LARGE, warnExecLimit } = require('./lib/af-exec.cjs');
  try {
    const { execFileSync } = require('child_process');
    // Buffers a whole committed file — a checked-in bundle or lockfile can be
    // tens of MB, well past Node's 1MB default.
    return execFileSync('git', ['show', `HEAD:${relPath}`], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: TIMEOUT_DEFAULT_MS,
      killSignal: 'SIGKILL',
      maxBuffer: MAX_BUFFER_LARGE,
    });
  } catch (e) {
    warnExecLimit(`git show HEAD:${relPath}`, e);
    return '';
  }
}

/**
 * Check a single file for user edits
 */
async function checkFile(filePath, hashes) {
  const info = getLastModifiedInfo(filePath, hashes);

  if (info.modified && info.likelyUserEdit) {
    try {
      // Get content for analysis
      const newContent = fs.readFileSync(filePath, 'utf-8');

      // Try to get old content from git (previous committed version).
      const oldContent = gitShowHead(filePath.replace(process.cwd() + '/', ''), process.cwd());

      if (oldContent && oldContent !== newContent) {
        const changes = extractChanges(oldContent, newContent);

        if (changes.additions.length > 0 || changes.removals.length > 0) {
          const patterns = analyzeChanges(changes, filePath);
          await recordUserEdit(filePath, changes, patterns);
        }
      }

      // Update hash
      updateFileHash(filePath, hashes);

    } catch { /* ignore */ }
  } else if (info.isNew || info.modified) {
    // Just update hash for new/modified files we handle
    updateFileHash(filePath, hashes);
  }
}

/**
 * Main hook execution
 */
async function main() {
  if (!isLearningEnabled()) {
    process.exit(0);
  }

  try {
    // Scan workflow files for user edits
    await scanWorkflowFiles();

    process.exit(0);
  } catch (error) {
    // Non-blocking
    process.exit(0);
  }
}

module.exports = { isWorkflowFile, extractChanges, analyzeChanges, gitShowHead };

if (require.main === module) {
  main();
}
