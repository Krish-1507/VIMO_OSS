#!/usr/bin/env node
// CI check: fail the build if any user-facing string contains developer jargon.
//
// VIMO is built for non-technical marketers. This script walks the user-facing
// source directories and reports any occurrence (case-insensitive) of a banned
// word inside user-visible content: JSX text and string literals that look like
// prose (they contain a space). Code-only strings — API URLs, enum values such as
// `connectionType: 'oauth'`, popup window names, and strings passed to string
// methods like `.includes('client id')` — are intentionally ignored so the check
// only flags text a user could actually see.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Directories that contain user-facing UI code.
const SCAN_DIRS = [
  'packages/frontend/src/pages',
  'packages/frontend/src/components',
  'packages/frontend/src/components/onboarding',
  'packages/frontend/src/social-accounts',
  'packages/frontend/src/connector-packs/packs',
  'packages/frontend/src/connector-packs/components',
  'packages/frontend/src/connector-packs/pages',
];

// Load the banned list from the shared module when available, otherwise fall back
// to the canonical list so the check works even in a minimal checkout.
const BANNED_WORDS = loadBannedWords();

function loadBannedWords() {
  const fallback = ['oauth', 'client id', 'client secret', 'redirect uri'];
  const tsPath = join(ROOT, 'packages/frontend/src/lib/bannedWords.ts');
  try {
    const src = readFileSync(tsPath, 'utf8');
    const found = [];
    const re = /['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const term = m[1].trim().toLowerCase();
      if (term && !found.includes(term)) found.push(term);
    }
    if (found.length > 0) return found;
  } catch {
    // ignore and use fallback
  }
  return fallback;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A string literal that is really an API path / URL is not user-facing.
function looksLikeUrl(s) {
  return (
    s.includes('://') ||
    s.startsWith('http') ||
    /\/api\//.test(s) ||
    /^\s*\//.test(s)
  );
}

// Methods whose string arguments are code logic, not displayed text.
const METHOD_CALL_RE =
  /\.(includes|match|test|indexOf|startsWith|endsWith|search|replace|toLowerCase|toUpperCase|trim|split)\s*\($/;

function wholeWordRe(term) {
  return new RegExp(`(^|[^a-z])${escapeRegExp(term)}([^a-z]|$)`, 'i');
}

function walk(dir, out) {
  const abs = join(ROOT, dir);
  let entries;
  try {
    entries = readdirSync(abs);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(abs, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(join(dir, name), out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
}

function checkFile(file) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // 1) String literals (single, double, template).
    const strRe = /(['"`])((?:\\.|(?!\1).)*)\1/g;
    let m;
    while ((m = strRe.exec(line)) !== null) {
      const lit = m[2];
      if (!lit.includes(' ')) continue; // prose only
      if (looksLikeUrl(lit)) continue;
      const before = line.slice(0, m.index).replace(/\s+$/, '');
      if (METHOD_CALL_RE.test(before)) continue;
      for (const term of BANNED_WORDS) {
        if (wholeWordRe(term).test(lit)) {
          violations.push(
            `${file}:${lineNo}: "${term}"  ->  ${lit.trim().slice(0, 100)}`
          );
          break;
        }
      }
    }

    // 2) JSX text nodes (content between tags, excluding expressions/comments).
    const jsxRe = />([^<>{}]*)</g;
    let j;
    while ((j = jsxRe.exec(line)) !== null) {
      const txt = j[1];
      for (const term of BANNED_WORDS) {
        if (wholeWordRe(term).test(txt)) {
          violations.push(
            `${file}:${lineNo}: "${term}"  ->  ${txt.trim().slice(0, 100)}`
          );
          break;
        }
      }
    }
  }

  return violations;
}

function main() {
  const files = [];
  for (const dir of SCAN_DIRS) walk(dir, files);

  const all = [];
  for (const f of files) all.push(...checkFile(f));

  if (all.length > 0) {
    console.error('Banned words found in user-facing strings:');
    for (const v of all) console.error('  ' + v);
    console.error(`\n${all.length} violation(s) across ${files.length} scanned files.`);
    process.exit(1);
  }

  console.log(`OK: no banned words in ${files.length} user-facing files.`);
  process.exit(0);
}

main();
