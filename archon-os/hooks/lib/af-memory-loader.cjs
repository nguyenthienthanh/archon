#!/usr/bin/env node
/**
 * Aura Frog - Memory Loader Library
 *
 * Loads learned patterns from Supabase at session start.
 * Caches results locally for Claude to read during session.
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { guardEndpoint } = require('./af-net-guard.cjs');

/**
 * Get Supabase configuration from environment
 */
function getSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SECRET_KEY,
    enabled: process.env.AF_LEARNING_ENABLED === 'true'
  };
}

/**
 * Make HTTPS request to Supabase
 */
function supabaseRequest(endpoint, config) {
  return new Promise((resolve, reject) => {
    if (!config.url || !config.key) {
      resolve({ data: null, error: 'Missing Supabase credentials' });
      return;
    }

    // config.key goes out as apikey + Bearer, so the endpoint must clear the
    // outbound guard first: https only, allowlisted host only. Previously an
    // http:// SUPABASE_URL was accepted here and silently sent to :443 anyway,
    // which made a misconfiguration look like a network failure.
    const url = guardEndpoint(`${config.url}/rest/v1/${endpoint}`, 'supabase', 'af-memory-loader');
    if (!url) {
      resolve({ data: null, error: 'Supabase endpoint rejected by the outbound guard' });
      return;
    }

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      timeout: 5000 // 5 second timeout
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ data: parsed, error: null });
          } else {
            resolve({ data: null, error: parsed.message || `HTTP ${res.statusCode}` });
          }
        } catch (e) {
          resolve({ data: null, error: 'Invalid JSON response' });
        }
      });
    });

    req.on('error', (e) => resolve({ data: null, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ data: null, error: 'Request timeout' });
    });
    req.end();
  });
}

/**
 * Load learned patterns from Supabase
 */
async function loadLearnedPatterns(config) {
  // Query af_learned_patterns table for active, high-confidence patterns
  const endpoint = 'af_learned_patterns?status=eq.active&confidence=gte.70&order=confidence.desc&limit=20';
  return supabaseRequest(endpoint, config);
}

/**
 * Load recent insights from analysis
 */
async function loadRecentInsights(config) {
  // Query af_knowledge_base for recent insights (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const endpoint = `af_knowledge_base?created_at=gte.${sevenDaysAgo}&order=created_at.desc&limit=10`;
  return supabaseRequest(endpoint, config);
}

/**
 * Load agent success rates
 */
async function loadAgentStats(config) {
  // Query the view for agent success rates
  const endpoint = 'v_agent_success_rates?limit=15';
  return supabaseRequest(endpoint, config);
}

/**
 * Load common correction patterns
 */
async function loadCorrectionPatterns(config) {
  // Query for recent corrections to learn from
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endpoint = `af_feedback?type=eq.correction&created_at=gte.${thirtyDaysAgo}&order=created_at.desc&limit=10`;
  return supabaseRequest(endpoint, config);
}

/**
 * Format memory for context injection
 */
function formatMemoryContext(patterns, insights, agentStats, corrections) {
  const lines = [];

  lines.push('# Loaded Memory Context');
  lines.push('');

  // Learned patterns
  if (patterns?.length > 0) {
    lines.push('## Learned Patterns');
    patterns.forEach(p => {
      lines.push(`- **${p.pattern_type}**: ${p.description} (${p.confidence}% confidence)`);
      if (p.recommendation) {
        lines.push(`  → ${p.recommendation}`);
      }
    });
    lines.push('');
  }

  // Agent performance
  if (agentStats?.length > 0) {
    lines.push('## Agent Performance');
    agentStats.slice(0, 5).forEach(a => {
      const rate = a.success_rate ? `${Math.round(a.success_rate * 100)}%` : 'N/A';
      lines.push(`- ${a.agent_name}: ${rate} success (${a.total_tasks || 0} tasks)`);
    });
    lines.push('');
  }

  // Recent corrections (learn from mistakes)
  if (corrections?.length > 0) {
    lines.push('## Recent Corrections (Avoid These)');
    corrections.slice(0, 5).forEach(c => {
      if (c.context) {
        lines.push(`- ${c.context}`);
      }
    });
    lines.push('');
  }

  // Recent insights
  if (insights?.length > 0) {
    lines.push('## Recent Insights');
    insights.slice(0, 5).forEach(i => {
      lines.push(`- ${i.insight || i.content}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get memory cache path
 */
function getMemoryCachePath() {

const { findProjectRoot } = require('./hook-runtime.cjs');
  const cacheDir = path.join(findProjectRoot(), '.claude', 'cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return path.join(cacheDir, 'memory-context.md');
}

/**
 * Check if cache is fresh (less than 1 hour old)
 */
function isCacheFresh(cachePath) {
  try {
    const stats = fs.statSync(cachePath);
    const ageMs = Date.now() - stats.mtimeMs;
    const oneHour = 60 * 60 * 1000;
    return ageMs < oneHour;
  } catch {
    return false;
  }
}

/**
 * Main memory loading function
 * Returns: { loaded: boolean, count: number, error: string|null }
 */
async function loadMemory(options = {}) {
  const config = getSupabaseConfig();
  const result = { loaded: false, count: 0, error: null, cached: false };

  // Check if learning is enabled
  if (!config.enabled) {
    result.error = 'Learning disabled';
    return result;
  }

  // Check credentials
  if (!config.url || !config.key) {
    result.error = 'Missing Supabase config';
    return result;
  }

  const cachePath = getMemoryCachePath();

  // Use cache if fresh and not forcing refresh
  if (!options.force && isCacheFresh(cachePath)) {
    try {
      const cached = fs.readFileSync(cachePath, 'utf-8');
      const lineCount = cached.split('\n').filter(l => l.startsWith('- ')).length;
      result.loaded = true;
      result.count = lineCount;
      result.cached = true;
      return result;
    } catch {
      // Cache read failed, continue to fetch
    }
  }

  try {
    // Fetch all data in parallel
    const [patternsRes, insightsRes, agentRes, correctionsRes] = await Promise.all([
      loadLearnedPatterns(config),
      loadRecentInsights(config),
      loadAgentStats(config),
      loadCorrectionPatterns(config)
    ]);

    const patterns = patternsRes.data || [];
    const insights = insightsRes.data || [];
    const agentStats = agentRes.data || [];
    const corrections = correctionsRes.data || [];

    // Count total items
    const totalCount = patterns.length + insights.length + agentStats.length + corrections.length;

    if (totalCount === 0) {
      result.error = 'No memory data yet';
      return result;
    }

    // Format and cache
    const memoryContent = formatMemoryContext(patterns, insights, agentStats, corrections);
    fs.writeFileSync(cachePath, memoryContent, 'utf-8');

    result.loaded = true;
    result.count = totalCount;
    return result;

  } catch (error) {
    result.error = error.message;
    return result;
  }
}

/**
 * Get cached memory content (for Claude to read)
 */
function getMemoryContent() {
  const cachePath = getMemoryCachePath();
  try {
    return fs.readFileSync(cachePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Clear memory cache
 */
function clearMemoryCache() {
  const cachePath = getMemoryCachePath();
  try {
    fs.unlinkSync(cachePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  loadMemory,
  getMemoryContent,
  clearMemoryCache,
  getMemoryCachePath,
  getSupabaseConfig
};
