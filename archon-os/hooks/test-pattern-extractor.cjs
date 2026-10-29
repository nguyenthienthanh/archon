#!/usr/bin/env node
/**
 * test-pattern-extractor.cjs - Extract test conventions from recent test files
 *
 * SessionStart hook (async). Scans 3 most recent test files to detect:
 * - Test framework (jest, vitest, pytest, phpunit, go test)
 * - Import patterns (testing-library, enzyme, supertest, etc.)
 * - Mock patterns (vi.mock, jest.mock, unittest.mock, etc.)
 * - Assertion style (expect, assert, should)
 * - File naming convention (.test., .spec., _test.)
 *
 * Writes to: .claude/cache/test-patterns.json
 *
 * Exit codes:
 * - 0: Always (non-blocking, async)
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');


const { findProjectRoot, atomicWrite } = require('./lib/hook-runtime.cjs');
const CACHE_DIR = path.join(findProjectRoot(), '.claude', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'test-patterns.json');
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Check if cache is still valid
 */
function isCacheValid() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return false;
    const stat = fs.statSync(CACHE_FILE);
    return (Date.now() - stat.mtimeMs) < CACHE_TTL;
  } catch { return false; }
}

/**
 * Find 3 most recently modified test files
 */
function findRecentTestFiles() {
  try {
    // Use git ls-files + grep for speed
    const files = execSync(
      'git ls-files --cached --others --exclude-standard 2>/dev/null | grep -E "\\.(test|spec)\\.[jt]sx?$|_test\\.(go|py)$|Test\\.php$" | head -20',
      { encoding: 'utf-8', timeout: 5000 }
    ).trim().split('\n').filter(Boolean);

    if (files.length === 0) return [];

    // Sort by mtime, take 3 most recent
    const withMtime = files.map(f => {
      try {
        return { file: f, mtime: fs.statSync(f).mtimeMs };
      } catch { return null; }
    }).filter(Boolean);

    withMtime.sort((a, b) => b.mtime - a.mtime);
    return withMtime.slice(0, 3).map(f => f.file);
  } catch {
    return [];
  }
}

/**
 * Extract patterns from a test file
 */
function extractPatterns(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();
    const patterns = { file: filePath };

    // Detect framework
    if (content.includes('vitest') || content.includes('vi.mock') || content.includes("from 'vitest'")) {
      patterns.framework = 'vitest';
    } else if (content.includes('jest') || content.includes('jest.mock')) {
      patterns.framework = 'jest';
    } else if (content.includes('pytest') || content.includes('unittest')) {
      patterns.framework = 'pytest';
    } else if (content.includes('PHPUnit') || content.includes('TestCase')) {
      patterns.framework = 'phpunit';
    } else if (ext === '.go' && content.includes('testing.T')) {
      patterns.framework = 'go_test';
    }

    // Detect imports/libraries
    const imports = [];
    if (content.includes('@testing-library')) imports.push('@testing-library');
    if (content.includes('supertest')) imports.push('supertest');
    if (content.includes('enzyme')) imports.push('enzyme');
    if (content.includes('msw')) imports.push('msw');
    if (content.includes('nock')) imports.push('nock');
    if (content.includes('sinon')) imports.push('sinon');
    if (content.includes('faker')) imports.push('faker');
    if (content.includes('factory')) imports.push('factory');
    patterns.imports = imports;

    // Detect mock patterns
    const mocks = [];
    if (content.includes('vi.mock')) mocks.push('vi.mock');
    if (content.includes('vi.spyOn')) mocks.push('vi.spyOn');
    if (content.includes('jest.mock')) mocks.push('jest.mock');
    if (content.includes('jest.spyOn')) mocks.push('jest.spyOn');
    if (content.includes('unittest.mock') || content.includes('@patch')) mocks.push('unittest.mock');
    if (content.includes('Mockery')) mocks.push('Mockery');
    patterns.mocks = mocks;

    // Detect assertion style
    if (content.includes('expect(')) patterns.assertions = 'expect';
    else if (content.includes('assert.')) patterns.assertions = 'assert';
    else if (content.includes('.should')) patterns.assertions = 'should';

    // Detect naming convention
    const basename = path.basename(filePath);
    if (basename.includes('.test.')) patterns.naming = '.test.';
    else if (basename.includes('.spec.')) patterns.naming = '.spec.';
    else if (basename.includes('_test.')) patterns.naming = '_test.';
    else if (basename.includes('Test.')) patterns.naming = 'Test.';

    // Detect describe/it vs test style
    if (content.includes('describe(') && content.includes('it(')) {
      patterns.style = 'describe-it';
    } else if (content.includes('test(')) {
      patterns.style = 'test';
    }

    return patterns;
  } catch {
    return null;
  }
}

/**
 * Main execution
 */
function main() {
  // Skip if cache is fresh
  if (isCacheValid()) {
    process.exit(0);
  }

  const testFiles = findRecentTestFiles();
  if (testFiles.length === 0) {
    process.exit(0);
  }

  const patterns = testFiles.map(extractPatterns).filter(Boolean);
  if (patterns.length === 0) {
    process.exit(0);
  }

  // Aggregate: pick most common framework, merge imports/mocks
  const frameworks = patterns.map(p => p.framework).filter(Boolean);
  const allImports = [...new Set(patterns.flatMap(p => p.imports || []))];
  const allMocks = [...new Set(patterns.flatMap(p => p.mocks || []))];
  const assertions = patterns.map(p => p.assertions).filter(Boolean);
  const namings = patterns.map(p => p.naming).filter(Boolean);
  const styles = patterns.map(p => p.style).filter(Boolean);

  const result = {
    framework: frameworks[0] || null,
    imports: allImports,
    mocks: allMocks,
    assertions: assertions[0] || null,
    naming: namings[0] || null,
    style: styles[0] || null,
    sampleFiles: testFiles,
    extractedAt: new Date().toISOString()
  };

  // Write cache
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    // Atomic (tmp + rename) so a crash/concurrent write can't leave a partial,
    // invalid-JSON test-patterns.json that the next read discards.
    atomicWrite(CACHE_FILE, JSON.stringify(result, null, 2));
  } catch { /* non-blocking */ }

  process.exit(0);
}

module.exports = { findRecentTestFiles, extractPatterns };

if (require.main === module) {
  main();
}
