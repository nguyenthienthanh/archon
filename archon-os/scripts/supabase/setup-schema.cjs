#!/usr/bin/env node
/**
 * Aura Frog - Supabase Schema Setup
 *
 * Automatically creates the learning system database schema via Supabase API.
 *
 * Usage:
 *   node scripts/supabase/setup-schema.cjs
 *
 * Environment variables required:
 *   SUPABASE_URL - Your Supabase project URL
 *   SUPABASE_SECRET_KEY - Your secret (service role) key
 *
 * @version 1.0.0
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

/**
 * Execute SQL via Supabase REST API using a temporary function
 */
async function executeSql(supabaseUrl, secretKey, sql) {
  const url = new URL(`${supabaseUrl}/rest/v1/rpc/exec_sql`);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': secretKey,
        'Authorization': `Bearer ${secretKey}`,
        'Prefer': 'return=representation'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, data: body });
        } else {
          resolve({ success: false, error: body, status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ query: sql }));
    req.end();
  });
}

/**
 * Create the exec_sql function first (needed to run arbitrary SQL)
 */
async function createExecSqlFunction(supabaseUrl, secretKey) {
  const createFunctionSql = `
    CREATE OR REPLACE FUNCTION exec_sql(query text)
    RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE query;
      RETURN json_build_object('success', true);
    EXCEPTION WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'error', SQLERRM);
    END;
    $$;
  `;

  // Use direct SQL execution via pg_catalog approach
  const url = new URL(`${supabaseUrl}/rest/v1/`);

  return new Promise((resolve, reject) => {
    // First, try to call exec_sql - if it doesn't exist, we need to create it differently
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': secretKey,
        'Authorization': `Bearer ${secretKey}`
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 404) {
          // Function doesn't exist - need manual creation first
          resolve({ exists: false });
        } else {
          resolve({ exists: true });
        }
      });
    });

    req.on('error', () => resolve({ exists: false }));
    req.write(JSON.stringify({ query: 'SELECT 1' }));
    req.end();
  });
}

/**
 * Split SQL into individual statements
 */
function splitSqlStatements(sql) {
  // Remove comments and split by semicolons
  const statements = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let inDollarQuote = false;
  let dollarTag = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1] || '';

    // Handle dollar quoting (PostgreSQL)
    if (char === '$' && !inString) {
      const match = sql.slice(i).match(/^\$([a-zA-Z_]*)\$/);
      if (match) {
        if (inDollarQuote && dollarTag === match[0]) {
          inDollarQuote = false;
          dollarTag = '';
        } else if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = match[0];
        }
        current += match[0];
        i += match[0].length - 1;
        continue;
      }
    }

    // Handle regular strings
    if ((char === "'" || char === '"') && !inDollarQuote) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar && nextChar !== stringChar) {
        inString = false;
      }
    }

    // Handle statement terminator
    if (char === ';' && !inString && !inDollarQuote) {
      const stmt = current.trim();
      if (stmt && !stmt.startsWith('--')) {
        statements.push(stmt);
      }
      current = '';
      continue;
    }

    current += char;
  }

  // Add final statement if exists
  const finalStmt = current.trim();
  if (finalStmt && !finalStmt.startsWith('--')) {
    statements.push(finalStmt);
  }

  return statements;
}

/**
 * Execute SQL statements one by one via individual API calls
 */
async function executeStatementsDirectly(supabaseUrl, secretKey, statements) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];

    // Skip empty statements or comments
    if (!stmt || stmt.startsWith('--')) continue;

    // Skip GRANT statements (handled by Supabase automatically)
    if (stmt.toUpperCase().startsWith('GRANT')) {
      log(`  [${i + 1}/${statements.length}] Skipping GRANT (handled by Supabase)`, 'dim');
      results.success++;
      continue;
    }

    process.stdout.write(`  [${i + 1}/${statements.length}] Executing... `);

    const result = await executeSql(supabaseUrl, secretKey, stmt);

    if (result.success) {
      log('✓', 'green');
      results.success++;
    } else {
      log('✗', 'red');
      results.failed++;
      results.errors.push({
        statement: stmt.substring(0, 100) + '...',
        error: result.error
      });
    }
  }

  return results;
}

/**
 * Main setup function
 */
async function main() {
  log('\n🐸 Aura Frog - Supabase Schema Setup\n', 'cyan');

  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    log('❌ Missing environment variables:', 'red');
    if (!supabaseUrl) log('   SUPABASE_URL is not set', 'red');
    if (!secretKey) log('   SUPABASE_SECRET_KEY is not set', 'red');
    log('\nSet these in your .envrc file and run: source .envrc', 'yellow');
    process.exit(1);
  }

  log(`📡 Supabase URL: ${supabaseUrl}`, 'dim');

  // Check if exec_sql function exists
  log('\n1. Checking exec_sql function...', 'cyan');
  const funcCheck = await createExecSqlFunction(supabaseUrl, secretKey);

  if (!funcCheck.exists) {
    log('\n⚠️  The exec_sql function does not exist.', 'yellow');
    log('\nTo enable automatic schema setup, run this SQL in Supabase Dashboard first:\n', 'yellow');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
    console.log(`
CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE query;
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
`);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
    log('\nThen run this script again.\n', 'yellow');

    // Alternative: offer to output the full schema
    log('Alternatively, run the full schema manually:', 'cyan');
    log('  File: scripts/supabase/schema.sql\n', 'dim');
    process.exit(1);
  }

  log('  ✓ exec_sql function exists', 'green');

  // Read schema file
  log('\n2. Reading schema file...', 'cyan');
  const schemaPath = path.join(__dirname, 'schema.sql');

  if (!fs.existsSync(schemaPath)) {
    log(`❌ Schema file not found: ${schemaPath}`, 'red');
    process.exit(1);
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  log(`  ✓ Read ${schemaSql.length} bytes`, 'green');

  // Split into statements
  log('\n3. Parsing SQL statements...', 'cyan');
  const statements = splitSqlStatements(schemaSql);
  log(`  ✓ Found ${statements.length} statements`, 'green');

  // Execute statements
  log('\n4. Executing statements...', 'cyan');
  const results = await executeStatementsDirectly(supabaseUrl, secretKey, statements);

  // Summary
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
  log('\n📊 Summary:', 'cyan');
  log(`  ✓ Successful: ${results.success}`, 'green');

  if (results.failed > 0) {
    log(`  ✗ Failed: ${results.failed}`, 'red');
    log('\nErrors:', 'red');
    results.errors.forEach((err, i) => {
      log(`\n  ${i + 1}. ${err.statement}`, 'yellow');
      log(`     ${err.error}`, 'red');
    });
  }

  if (results.failed === 0) {
    log('\n✅ Schema setup complete!', 'green');
    log('\nNext steps:', 'cyan');
    log('  1. Run /learn:status to verify connection', 'dim');
    log('  2. Run /learn:analyze to check for patterns', 'dim');
  } else {
    log('\n⚠️  Some statements failed. Check errors above.', 'yellow');
    log('You may need to run the schema manually via Supabase Dashboard.', 'yellow');
  }

  log('');
}

main().catch(err => {
  log(`\n❌ Setup failed: ${err.message}`, 'red');
  process.exit(1);
});
