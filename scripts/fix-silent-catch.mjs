#!/usr/bin/env node
/**
 * fix-silent-catch.mjs  (one-off, not run in CI)
 *
 * Converts every bare `catch {` with an empty / comment-only body into
 * `catch (err) { console.warn('[vimo] best-effort operation failed:', err); }`,
 * preserving the existing indentation and any explanatory comment.
 *
 * This is the mechanical half of the "no silent catches" rule. The guard that
 * keeps it from regressing is scripts/check-silent-catch.mjs (run in CI).
 *
 * Run from repo root:
 *     node scripts/fix-silent-catch.mjs
 *
 * Safe because:
 *   - only matches the parameterless `catch {` form,
 *   - only rewrites blocks whose body is empty or comment-only,
 *   - introduces a fresh block-scoped `err` binding (no collisions),
 *   - leaves the surrounding code untouched.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const SRC_DIRS = ['packages/backend/src', 'packages/frontend/src', 'packages/shared/src'].map((p) =>
  path.join(repoRoot, p),
);

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

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function isSilent(bodyText) {
  const stripped = stripComments(bodyText).trim();
  if (stripped === '') return true;
  if (/^void\s+\w+\s*;?$/.test(stripped)) return true;
  return false;
}

function lineIndent(text, index) {
  let i = index;
  while (i > 0 && text[i - 1] !== '\n') i--;
  const line = text.slice(i, index);
  return line.match(/^\s*/)[0];
}

let changed = 0;
const files = SRC_DIRS.flatMap((d) => walk(d));

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /catch\s*\{/g;
  let out = '';
  let cursor = 0;
  let m;
  let fileChanged = false;

  while ((m = re.exec(text)) !== null) {
    const openBrace = m.index + m[0].length - 1; // index of '{'
    const closeBrace = matchBrace(text, openBrace);
    if (closeBrace === -1) continue;
    const body = text.slice(openBrace + 1, closeBrace);
    if (!isSilent(body)) continue;

    // Preserve an existing explanatory comment (without the braces).
    const comment = body.trim();
    const indent = lineIndent(text, m.index);
    const inner = [];
    if (comment) inner.push(`${indent}  ${comment}`);
    inner.push(`${indent}  console.warn('[vimo] best-effort operation failed:', err);`);

    const replacement = `catch (err) {\n${inner.join('\n')}\n${indent}}`;
    out += text.slice(cursor, m.index) + replacement;
    cursor = closeBrace + 1;
    changed++;
    fileChanged = true;
  }

  if (fileChanged) {
    out += text.slice(cursor);
    fs.writeFileSync(file, out);
  }
}

console.log(`Converted ${changed} silent catch block(s) to logged warnings.`);
