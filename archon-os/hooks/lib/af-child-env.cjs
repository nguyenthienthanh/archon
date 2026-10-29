'use strict';

/**
 * Aura Frog — child-process environment minimiser
 *
 * Some hooks run code that isn't ours: lint-autofix executes the working repo's
 * own node_modules/.bin or vendor/bin binary on every Write and Edit. Those
 * children inherited the full parent environment, which by then holds whatever
 * .envrc exported — SUPABASE_SECRET_KEY, JIRA_API_TOKEN, cloud credentials. A
 * linter has no use for any of it, so handing it over is pure downside: one
 * postinstall-flavoured supply-chain package in a cloned repo reads process.env
 * and walks off with the lot.
 *
 * filterChildEnv() strips the credential-shaped keys and keeps everything a
 * tool actually needs to run: PATH, HOME, locale, the NODE_ family, and the
 * plugin's own AF_ and CLAUDE_ wiring.
 *
 * Escape hatch: AF_CHILD_ENV_UNFILTERED=true passes the environment through
 * untouched, for a toolchain that genuinely needs a credential-named variable.
 *
 * @version 1.0.0
 */

// Credential-shaped name fragments. Deliberately broad — a false positive costs
// a linter one env var it wasn't using; a false negative leaks a live secret.
const SECRET_FRAGMENT = /(SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|APIKEY|API_KEY|PRIVATE_KEY|KEY)/i;

// `PAT` only as a whole underscore-delimited word: as a bare substring it also
// matches PATH, which is the one variable a child most needs.
const PAT_WORD = /(^|_)PATS?(_|$)/i;

// Names that look credential-shaped by the rules above but must survive.
const ALWAYS_KEEP = new Set([
  'PATH',
  'MANPATH',
  'INFOPATH',
  'NODE_PATH',
  'PYTHONPATH',
  'GOPATH',
  'CLASSPATH',
  'LD_LIBRARY_PATH',
  'DYLD_LIBRARY_PATH',
  'PKG_CONFIG_PATH',
  'XDG_DATA_DIRS',
  'XDG_CONFIG_DIRS',
]);

// Pure: does this env var name look like it carries a credential?
function isSecretName(name) {
  if (!name) return false;
  if (ALWAYS_KEEP.has(name)) return false;
  // A *_PATH variable is a search path, not a key, even when some other rule
  // would flag it — covers project-specific names not in ALWAYS_KEEP.
  if (/(^|_)PATH$/i.test(name)) return false;
  return SECRET_FRAGMENT.test(name) || PAT_WORD.test(name);
}

/**
 * Build the environment for a child process: everything in `source` except the
 * credential-shaped names, plus `extra` (which is set by us and always kept —
 * that is how a caller passes a value the child genuinely needs).
 */
function filterChildEnv(source = process.env, extra = {}) {
  if (source.AF_CHILD_ENV_UNFILTERED === 'true') return { ...source, ...extra };
  const out = {};
  for (const [k, v] of Object.entries(source)) {
    if (v === undefined) continue;
    if (isSecretName(k)) continue;
    out[k] = v;
  }
  return { ...out, ...extra };
}

// Pure: the names filterChildEnv would drop from `source`. Diagnostics/tests.
function droppedKeys(source = process.env) {
  return Object.keys(source).filter(isSecretName).sort();
}

module.exports = { SECRET_FRAGMENT, PAT_WORD, ALWAYS_KEEP, isSecretName, filterChildEnv, droppedKeys };
