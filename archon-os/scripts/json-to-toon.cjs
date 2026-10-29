#!/usr/bin/env node
/**
 * Aura Frog — JSON → TOON deterministic converter
 *
 * Project required attributes from a JSON payload, then encode as TOON
 * (Token-Optimized Object Notation). Runs locally as a script — no AI
 * involvement, no context cost beyond the final TOON output.
 *
 * Why: forwarding raw JSON to the model burns tokens on irrelevant fields.
 * A deterministic projector + encoder is faster, cheaper, and idempotent.
 *
 * Usage:
 *   # Stdin → stdout
 *   cat ticket.json | node scripts/json-to-toon.cjs --schema jira
 *
 *   # File → stdout
 *   node scripts/json-to-toon.cjs --schema jira --in path/to/ticket.json
 *
 *   # Custom dotpaths (no schema)
 *   cat data.json | node scripts/json-to-toon.cjs \
 *     --fields key,fields.summary,fields.status.name,fields.assignee.displayName
 *
 *   # Programmatic (require from another hook)
 *   const { project, encode } = require('./scripts/json-to-toon.cjs');
 *
 * Schemas (built-in):
 *   jira       — JIRA REST issue payload (key, status, priority, assignee, summary, issuetype, created, updated, comments[])
 *   mcp        — MCP response (title, version, snippet)
 *   tests      — test runner output (total, passed, failed, failures[])
 *   pr         — gh pr view JSON (number, title, state, author, labels)
 *   pkg        — package.json projection (name, version, deps[], devDeps[])
 *   generic    — pretty-print top-level keys with primitive values only
 *
 * Output format (TOON):
 *   Single object   →  ticket{key,status,assignee,summary}:
 *                        IGNT-1269,In Progress,Ethan,"Auth flow needs JWT refresh"
 *
 *   Array           →  comments[3]{author,date,body}:
 *                        Alice,2026-04-12,"Looks good"
 *                        Bob,2026-04-13,"Approved"
 *                        Carol,2026-04-14,"Re-tested"
 *
 * Exit codes:
 *   0 — success
 *   1 — bad input (malformed JSON, missing schema, no input)
 *
 * @version 1.0.0 (v3.7.0)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMAS = {
  jira: {
    object: 'ticket',
    fields: [
      ['key',        'key'],
      ['status',     'fields.status.name'],
      ['priority',   'fields.priority.name'],
      ['issuetype',  'fields.issuetype.name'],
      ['assignee',   'fields.assignee.displayName'],
      ['reporter',   'fields.reporter.displayName'],
      ['created',    'fields.created', v => (v || '').split('T')[0]],
      ['updated',    'fields.updated', v => (v || '').split('T')[0]],
      ['summary',    'fields.summary'],
    ],
    arrays: [
      {
        name: 'comments',
        path: 'fields.comment.comments',
        cols: [
          ['author', 'author.displayName'],
          ['date',   'created', v => (v || '').split('T')[0]],
          ['body',   ['body.content', adfToText]],
        ],
      },
      {
        name: 'subtasks',
        path: 'fields.subtasks',
        cols: [
          ['key',     'key'],
          ['status',  'fields.status.name'],
          ['summary', 'fields.summary'],
        ],
      },
    ],
  },
  mcp: {
    object: 'mcp_response',
    fields: [
      ['title',   'title'],
      ['library', 'library'],
      ['version', 'version'],
      ['snippet', 'content', v => truncate(String(v || ''), 800)],
    ],
  },
  tests: {
    object: 'tests',
    fields: [
      ['total',       'numTotalTests'],
      ['passed',      'numPassedTests'],
      ['failed',      'numFailedTests'],
      ['duration_ms', 'duration'],
    ],
    arrays: [
      {
        name: 'failures',
        path: 'failures',
        cols: [
          ['name',    'name'],
          ['file',    'file'],
          ['line',    'line'],
          ['message', 'message', v => truncate(String(v || ''), 200)],
        ],
      },
    ],
  },
  pr: {
    object: 'pr',
    fields: [
      ['number', 'number'],
      ['title',  'title'],
      ['state',  'state'],
      ['author', 'author.login'],
      ['labels', 'labels', v => Array.isArray(v) ? v.map(l => l.name || l).join(';') : ''],
    ],
  },
  pkg: {
    object: 'package',
    fields: [
      ['name',    'name'],
      ['version', 'version'],
      ['deps',    'dependencies',     v => v ? Object.keys(v).join(';') : ''],
      ['devDeps', 'devDependencies',  v => v ? Object.keys(v).join(';') : ''],
    ],
  },
};

// ---------- helpers ----------

function getPath(obj, dotpath) {
  if (!obj || !dotpath) return undefined;
  const parts = String(dotpath).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function truncate(s, n) {
  if (typeof s !== 'string') return s;
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function escapeCsvCell(v) {
  if (v == null) return '';
  let s = typeof v === 'string' ? v : String(v);
  // Replace newlines with single space
  s = s.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Quote if contains comma, semicolon, or quote
  if (/[",;]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// JIRA description / comment bodies use Atlassian Document Format (ADF) — a
// nested tree. Walk the tree depth-first collecting `.text` nodes.
function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToText).filter(Boolean).join(' ');
  if (typeof node === 'object') {
    const parts = [];
    if (typeof node.text === 'string') parts.push(node.text);
    if (Array.isArray(node.content)) parts.push(adfToText(node.content));
    return parts.filter(Boolean).join(' ');
  }
  return '';
}

function applyTransform(value, transform) {
  if (!transform) return value;
  if (typeof transform === 'function') return transform(value);
  if (Array.isArray(transform) && transform.length === 2 && typeof transform[1] === 'function') {
    return transform[1](value);
  }
  return value;
}

// ---------- core API ----------

function project(json, schemaOrFields) {
  const result = { primary: {}, arrays: [] };

  // Custom fields mode
  if (Array.isArray(schemaOrFields)) {
    for (const dotpath of schemaOrFields) {
      const last = dotpath.split('.').slice(-1)[0];
      result.primary[last] = getPath(json, dotpath);
    }
    return result;
  }

  // Built-in schema mode
  const schema = schemaOrFields;
  if (!schema) return result;

  for (const [name, dotpath, transform] of (schema.fields || [])) {
    const valueRaw = getPath(json, dotpath);
    const valueOut = transform ? applyTransform(valueRaw, transform) : valueRaw;
    result.primary[name] = valueOut;
  }

  for (const arr of (schema.arrays || [])) {
    const items = getPath(json, arr.path);
    if (!Array.isArray(items) || items.length === 0) continue;
    const rows = [];
    for (const item of items) {
      const row = {};
      for (const col of arr.cols) {
        const [name, sub, transform] = col;
        let raw;
        if (Array.isArray(sub) && sub.length === 2 && typeof sub[1] === 'function') {
          raw = sub[1](getPath(item, sub[0]));
        } else {
          raw = getPath(item, sub);
        }
        row[name] = transform ? applyTransform(raw, transform) : raw;
      }
      rows.push(row);
    }
    result.arrays.push({ name: arr.name, rows });
  }

  return result;
}

function encode(projected, opts = {}) {
  const objectName = opts.objectName || 'data';
  const lines = [];

  // Primary object
  const keys = Object.keys(projected.primary);
  if (keys.length > 0) {
    lines.push(`${objectName}{${keys.join(',')}}:`);
    lines.push('  ' + keys.map(k => escapeCsvCell(projected.primary[k])).join(','));
  }

  // Arrays
  for (const arr of projected.arrays) {
    if (lines.length > 0) lines.push('');
    const cols = arr.rows.length > 0 ? Object.keys(arr.rows[0]) : [];
    lines.push(`${arr.name}[${arr.rows.length}]{${cols.join(',')}}:`);
    for (const row of arr.rows) {
      lines.push('  ' + cols.map(c => escapeCsvCell(row[c])).join(','));
    }
  }

  return lines.join('\n');
}

function convert(json, opts = {}) {
  const schemaName = opts.schema;
  const fields = opts.fields;

  if (fields && fields.length > 0) {
    const projected = project(json, fields);
    return encode(projected, { objectName: opts.objectName || 'data' });
  }

  if (schemaName && SCHEMAS[schemaName]) {
    const schema = SCHEMAS[schemaName];
    const projected = project(json, schema);
    return encode(projected, { objectName: opts.objectName || schema.object });
  }

  if (schemaName === 'generic' || (!schemaName && !fields)) {
    // Generic: top-level keys with primitive values only
    const primitives = {};
    for (const [k, v] of Object.entries(json || {})) {
      if (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        primitives[k] = v;
      }
    }
    return encode({ primary: primitives, arrays: [] }, { objectName: opts.objectName || 'data' });
  }

  throw new Error(`Unknown schema: ${schemaName}. Available: ${Object.keys(SCHEMAS).join(', ')}, generic`);
}

// ---------- CLI ----------

function parseArgs(argv) {
  const args = { schema: null, fields: null, in: null, objectName: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--schema' && argv[i+1]) { args.schema = argv[++i]; }
    else if (a === '--fields' && argv[i+1]) { args.fields = argv[++i].split(',').map(s => s.trim()).filter(Boolean); }
    else if (a === '--in' && argv[i+1]) { args.in = argv[++i]; }
    else if (a === '--name' && argv[i+1]) { args.objectName = argv[++i]; }
    else if (a === '-h' || a === '--help') { return { help: true }; }
  }
  return args;
}

function printHelp() {
  console.error(`Usage:
  node scripts/json-to-toon.cjs --schema <jira|mcp|tests|pr|pkg|generic> [--in file.json]
  node scripts/json-to-toon.cjs --fields key,fields.summary,fields.status.name [--in file.json]
  cat file.json | node scripts/json-to-toon.cjs --schema jira

Schemas: ${Object.keys(SCHEMAS).join(', ')}, generic
Reads from --in if given, else stdin. Writes TOON to stdout.`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) { printHelp(); process.exit(0); }
  if (!args.schema && !args.fields) { printHelp(); process.exit(1); }

  let raw;
  if (args.in) {
    try { raw = fs.readFileSync(args.in, 'utf8'); }
    catch (e) { process.stderr.write(`json-to-toon: cannot read ${args.in}: ${e.code || e.message}\n`); process.exit(1); }
  } else {
    try { raw = fs.readFileSync(0, 'utf8'); }
    catch (e) { process.stderr.write(`json-to-toon: cannot read stdin: ${e.code || e.message}\n`); process.exit(1); }
  }

  let data;
  try { data = JSON.parse(raw); }
  catch (e) { process.stderr.write(`json-to-toon: invalid JSON: ${e.message.split('\n')[0]}\n`); process.exit(1); }

  let out;
  try {
    out = convert(data, { schema: args.schema, fields: args.fields, objectName: args.objectName });
  } catch (e) {
    process.stderr.write(`json-to-toon: ${e.message}\n`);
    process.exit(1);
  }

  process.stdout.write(out + '\n');
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { project, encode, convert, SCHEMAS, getPath, adfToText };
