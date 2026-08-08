#!/usr/bin/env node
/**
 * check-silent-catch.mjs
 *
 * Fails (exit 1) if any source file under the src trees of the backend,
 * frontend, and shared packages contains a `catch` block that swallows the
 * error without a trace — i.e. a catch body that is empty or contains only
 * comments. A silent catch hides failures in CI and in production logs, which
 * is exactly how several real bugs in this repo went unnoticed.
 *
 * This is the guard that keeps the "no silent catches" rule from regressing.
 * It runs in CI alongside typecheck/tests (see .github/workflows/ci.yml) and
 * can also be run locally:
 *
 *     node scripts/check-silent-catch.mjs
 *
 * The check is deliberately conservative: a catch that contains any statement
 * (a log call, a `throw`, a `return`, even a single `void err;`) is accepted.
 * Only bodies that contribute nothing are flagged. If a catch genuinely must
 * ignore an error, make that explicit with a comment AND a log, e.g.:
 *
 *     } catch (err) {
 *       // best-effort: a stale token here is fine, we re-auth on next call
 *       log.warn('refresh failed', { err: err.message });
 *     }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const SRC_DIRS = ['packages/backend/src', 'packages/frontend/src', 'packages/shared/src'].map((p) =>
  path.join(repoRoot, p),
);

/** Collect every .ts/.tsx file under a directory (skipping node_modules/dist). */
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Find the index of the matching close brace for an opening brace at `open`.
 * Naive C-style brace matcher — sufficient for source text that is already
 * syntactically valid (these files typecheck).
 */
function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Strip out line and block comments so we can tell if a body is "empty". */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

/** True when the catch body does nothing observable. */
function isSilent(bodyText) {
  const stripped = stripComments(bodyText).trim();
  if (stripped === '') return true;
  // A body that is only `void err;` / `void e;` is still silent (deliberately
  // suppressing `no-unused-vars` without recording the error).
  if (/^void\s+\w+\s*;?$/.test(stripped)) return true;
  return false;
}

function findSilentCatches(file) {
  const text = fs.readFileSync(file, 'utf8');
  const findings = [];
  const re = /catch\s*\([^)]*\)\s*\{|catch\s*\{/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const bodyStart = m.index + m[0].length; // right after the opening brace
    const close = matchBrace(text, bodyStart - 1); // opening brace index
    if (close === -1) continue;
    const body = text.slice(bodyStart, close);
    if (isSilent(body)) {
      const line = text.slice(0, m.index).split('\n').length;
      findings.push({ file, line, snippet: text.slice(m.index, bodyStart).replace(/\s+/g, ' ').trim() });
    }
  }
  return findings;
}

const files = SRC_DIRS.flatMap((d) => walk(d));
const all = [];
for (const f of files) all.push(...findSilentCatches(f));

if (all.length > 0) {
  console.error('\n❌ Found silent catch blocks (error swallowed, no trace left):\n');
  for (const f of all) {
    const rel = path.relative(repoRoot, f.file);
    console.error(`  ${rel}:${f.line}   ${f.snippet}`);
  }
  console.error(`\n${all.length} silent catch block(s). Log the error (or rethrow) so failures are visible.`);
  process.exit(1);
}

console.log('✓ No silent catch blocks found.');
process.exit(0);
