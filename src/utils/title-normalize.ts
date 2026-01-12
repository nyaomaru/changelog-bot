import { CONVENTIONAL_PREFIX_RE } from '@/constants/conventional.js';

/**
 * Remove Conventional Commit type/scope prefixes from a title.
 * @param input Title that may start with `type(scope):`.
 * @returns Title without the conventional prefix.
 */
export function stripConventionalPrefix(input: string): string {
  return input.replace(CONVENTIONAL_PREFIX_RE, '').trim();
}

/**
 * Normalize a title for fuzzy matching by stripping conventional prefix,
 * lowercasing, collapsing non-alphanumerics to a single space, and trimming.
 * @param input Raw title text.
 * @returns Normalized title suitable for fuzzy matching.
 */
export function normalizeTitle(input: string): string {
  return stripConventionalPrefix(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
