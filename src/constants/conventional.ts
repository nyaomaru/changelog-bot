/**
 * Conventional Commit helpers and shared patterns.
 * WHY: Centralize prefixes and regex to keep stripping/classification consistent.
 */
export const COMMIT_TYPES = [
  'feat',
  'fix',
  'refactor',
  'perf',
  'style',
  'docs',
  'build',
  'ci',
  'test',
  'chore',
  'revert',
] as const;

// Matches: type!: scope: , type(scope): , type:
export const CONVENTIONAL_PREFIX_RE = new RegExp(
  `^(${COMMIT_TYPES.join('|')})!?(?:\\([^)]*\\))?:\\s*`,
  'i'
);

// Inline PR number forms
export const INLINE_PR_NUMBER_RE = /#(\d+)/g; // extract numbers
export const INLINE_PR_PRESENT_RE = /\(#\d+\)|\[#\d+\]/; // test presence only
