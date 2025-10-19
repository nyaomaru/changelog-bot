import { CATEGORY_NORMALIZE_MAP } from '@/constants/changelog.js';
import {
  RELEASE_HEADER_CAPTURE_RE,
  H3_SUBHEADER_CAPTURE_RE,
} from '@/constants/markdown.js';

/**
 * Ensure release headers use `v`-prefixed versions (e.g., `## [v1.2.3]`).
 * @param line Header line to normalize.
 * @returns Possibly rewritten header line.
 */
function normalizeReleaseHeader(line: string): string {
  const match = line.match(RELEASE_HEADER_CAPTURE_RE);
  if (match && !match[1].startsWith('v')) {
    return `## [v${match[1]}]${match[2]}`;
  }
  return line;
}

/**
 * Normalize H3 subheaders using the category map (case-insensitive match).
 * @param line Header line to normalize.
 * @returns Normalized header preserving original when unmapped.
 */
function normalizeCategoryHeader(line: string): string {
  const subHeaderMatch = line.match(H3_SUBHEADER_CAPTURE_RE);
  if (!subHeaderMatch) return line;
  const rawKey = subHeaderMatch[1];
  const normalizedKey =
    CATEGORY_NORMALIZE_MAP[rawKey.trim().toLowerCase()] ?? rawKey;
  return `### ${normalizedKey}`;
}

/**
 * Normalize section headers in a changelog snippet.
 * - Ensures release header uses the `v`-prefixed version (e.g., `## [v1.2.3]`).
 * - Normalizes category names using `CATEGORY_NORMALIZE_MAP`.
 * WHY: Normalization keeps links predictable and category keys consistent across providers and inputs.
 * @param md Raw markdown string for a release section.
 * @returns Normalized markdown string.
 */
export function normalizeSectionCategories(md: string): string {
  if (!md) return md;
  const lines = md.split('\n');
  const normalized = lines.map((line, index) =>
    index === 0 ? normalizeReleaseHeader(line) : normalizeCategoryHeader(line)
  );
  return normalized.join('\n').replace(/\n{3,}/g, '\n\n');
}
