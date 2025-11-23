/**
 * Conventional Commit helpers and shared patterns.
 * WHY: Centralize prefixes and regex to keep stripping/classification consistent.
 */
import { flexPrefixRe } from '@/utils/conventional.js';
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
// Matches conventional prefixes with optional scope and optional breaking '!'.
// Examples:
//  - feat: msg
//  - feat!: msg
//  - feat(scope): msg
//  - feat(scope)!: msg
export const CONVENTIONAL_PREFIX_RE = new RegExp(
  `^(${COMMIT_TYPES.join('|')})(?:!:|(?:\\([^)]*\\))?!?:)\\s*`,
  'i'
);

// Inline PR number forms
export const INLINE_PR_NUMBER_RE = /#(\d+)/g; // extract numbers
export const INLINE_PR_PRESENT_RE = /\(#\d+\)|\[#\d+\]/; // test presence only

// Refactor-like conventional types (mapped to Changed by default)
export const REFACTOR_LIKE_RE = /^(refactor|perf|style)(\(|:)/i;

// Flex conventional prefix regex helper imported from utils

export const FEAT_PREFIX_FLEX_RE = flexPrefixRe('feat');
export const FIX_PREFIX_FLEX_RE = flexPrefixRe('fix');
export const REFACTOR_PERF_STYLE_PREFIX_FLEX_RE = flexPrefixRe([
  'refactor',
  'perf',
  'style',
]);
export const DOCS_PREFIX_FLEX_RE = flexPrefixRe('docs');
export const TEST_PREFIX_FLEX_RE = flexPrefixRe('test');
export const REVERT_PREFIX_FLEX_RE = flexPrefixRe('revert');
export const CHORE_PREFIX_FLEX_RE = flexPrefixRe('chore');
