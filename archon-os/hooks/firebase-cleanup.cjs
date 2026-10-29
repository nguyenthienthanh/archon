#!/usr/bin/env node
/**
 * Aura Frog - Firebase Debug Log Cleanup Hook
 *
 * Fires: SessionStart
 * Purpose: Prevent firebase-debug.log creation when Firebase is not configured
 *
 * Firebase MCP creates firebase-debug.log automatically even when:
 * - User hasn't logged into Firebase
 * - No Firebase project is configured
 * - Firebase ENV variables are not set
 *
 * This hook:
 * 1. Checks if Firebase is properly configured
 * 2. If not, cleans up any firebase-debug.log created
 * 3. Prevents cluttering the project with unused debug logs
 *
 * Exit Codes:
 *   0 - Success (non-blocking)
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { TIMEOUT_SLOW_MS, MAX_BUFFER_DEFAULT, warnExecLimit } = require('./lib/af-exec.cjs');

// Firebase debug log path
const FIREBASE_DEBUG_LOG = path.join(process.cwd(), 'firebase-debug.log');

/**
 * Check if Firebase is configured
 */
function isFirebaseConfigured() {
  // Check for firebase.json in project
  const firebaseJson = path.join(process.cwd(), 'firebase.json');
  if (fs.existsSync(firebaseJson)) {
    return true;
  }

  // Check if user is logged into Firebase
  try {
    // `firebase login:list` reaches the network to validate the token. On a
    // SessionStart hook that must not be allowed to hang the session, hence the
    // slow-tier timeout + SIGKILL.
    const result = execSync('firebase login:list 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: TIMEOUT_SLOW_MS,
      killSignal: 'SIGKILL',
      maxBuffer: MAX_BUFFER_DEFAULT
    });
    if (result && result.includes('@')) {
      return true;
    }
  } catch (e) {
    // Not logged in or firebase not installed
    warnExecLimit('firebase login:list', e);
  }

  // Check environment variables
  if (process.env.FIREBASE_TOKEN || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return true;
  }

  return false;
}

/**
 * Clean up firebase-debug.log if it exists
 */
function cleanupDebugLog() {
  try {
    if (fs.existsSync(FIREBASE_DEBUG_LOG)) {
      // Check if it's a recent file (created in last 5 minutes)
      const stats = fs.statSync(FIREBASE_DEBUG_LOG);
      const fileAge = Date.now() - stats.mtime.getTime();

      // Only clean up recent files to avoid removing intentional debug logs
      if (fileAge < 5 * 60 * 1000) {
        fs.unlinkSync(FIREBASE_DEBUG_LOG);
        console.log('🧹 Cleaned up unused firebase-debug.log (Firebase not configured)');
      }
    }
  } catch (error) {
    // Ignore errors - non-critical operation
  }
}

/**
 * Add firebase-debug.log to .gitignore if not already there
 */
function ensureGitignore() {
  try {
    const gitignorePath = path.join(process.cwd(), '.gitignore');

    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      if (!content.includes('firebase-debug.log')) {
        // Don't auto-modify .gitignore, just warn
        console.log('💡 Tip: Add firebase-debug.log to .gitignore');
      }
    }
  } catch { /* optional feature unavailable - .gitignore check is non-blocking */ }
}

/**
 * Main hook execution
 */
function main() {
  try {
    // If Firebase is not configured, clean up any debug logs
    if (!isFirebaseConfigured()) {
      cleanupDebugLog();
    }

    // Suggest gitignore update
    ensureGitignore();

    process.exit(0);
  } catch (error) {
    // Non-blocking
    process.exit(0);
  }
}

module.exports = { isFirebaseConfigured, cleanupDebugLog };

if (require.main === module) {
  main();
}
