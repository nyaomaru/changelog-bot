#!/usr/bin/env node
// Guard against publishing unresolved TypeScript path aliases (e.g., "@/lib").
// Scans built JS files under dist/ and exits non‑zero when an alias import remains.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

// Tunables (keep magic numbers out of the logic)
const DIST_DIR = join(process.cwd(), 'dist');
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const SNIPPET_CONTEXT_LEADING = 80; // chars before the match
const SNIPPET_CONTEXT_TRAILING = 120; // chars after the match

/**
 * Patterns that indicate unresolved alias usage in compiled output.
 * WHY: Node cannot resolve TS path aliases at runtime; they must be rewritten to relative paths.
 */
const ALIAS_PATTERNS = [
  { name: 'esm-import', regex: /\bfrom\s+['"]@\// }, // import x from '@/...'
  { name: 'cjs-require', regex: /\brequire\(\s*['"]@\// }, // require('@/...')
  { name: 'dynamic-import', regex: /\bimport\(\s*['"]@\// }, // import('@/...')
];

/** Represents a single alias detection in a file. */
function makeIssue(filePath, index, patternName, content) {
  const start = Math.max(0, index - SNIPPET_CONTEXT_LEADING);
  const end = Math.min(content.length, index + SNIPPET_CONTEXT_TRAILING);
  const snippet = content.slice(start, end).replace(/\n/g, '\n  ');
  return { filePath, patternName, index, snippet: `...${snippet}...` };
}

/** True when a file extension is in the scan allowlist. */
function isScannableFile(filePath) {
  return SCAN_EXTENSIONS.has(extname(filePath));
}

/** Recursively walk a directory and yield file paths. */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** Find the first unresolved alias match within the given content. */
function findFirstAliasMatch(content) {
  for (const { name, regex } of ALIAS_PATTERNS) {
    const match = content.match(regex);
    if (match && match.index != null) return { name, index: match.index };
  }
  return null;
}

function main() {
  /** @type {Array<{filePath:string, patternName:string, index:number, snippet:string}>} */
  const issues = [];
  try {
    for (const filePath of walk(DIST_DIR)) {
      if (!isScannableFile(filePath)) continue;
      const content = readFileSync(filePath, 'utf8');
      const found = findFirstAliasMatch(content);
      if (!found) continue;
      issues.push(makeIssue(filePath, found.index, found.name, content));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`check-dist-alias: failed to scan dist: ${msg}`);
    process.exit(1);
  }

  if (issues.length === 0) return;

  // Report all issues together (shallower control flow, clear output)
  console.error('Unresolved path alias(es) detected in dist/:');
  for (const issue of issues) {
    console.error(`- ${issue.filePath} [${issue.patternName}] @${issue.index}`);
    console.error(`  ${issue.snippet}`);
  }
  console.error(
    '\nError: Found unresolved alias imports (e.g., "@/"). Run `pnpm build` to rewrite paths with tsc-alias.',
  );
  process.exit(1);
}

main();
