export const UNRELEASED_ANCHOR = '## [Unreleased]';
export const PR_TITLE_PREFIX = 'docs(changelog): ';
export const PR_BRANCH_PREFIX = 'chore/changelog-v';
export const DEFAULT_PR_LABELS = ['changelog', 'release'] as const;
// Changelog section names as semantic constants to avoid typos and magic strings.
export const SECTION_BREAKING_CHANGES = 'Breaking Changes' as const;
export const SECTION_ADDED = 'Added' as const;
export const SECTION_FIXED = 'Fixed' as const;
export const SECTION_CHANGED = 'Changed' as const;
export const SECTION_DOCS = 'Docs' as const;
export const SECTION_TEST = 'Test' as const;
export const SECTION_CHORE = 'Chore' as const;
export const SECTION_REVERTED = 'Reverted' as const;
export const CATEGORY_NORMALIZE_MAP: Record<string, string> = {
  add: 'Added',
  added: 'Added',
  init: 'Chore',
  refactor: 'Changed',
  change: 'Changed',
  changed: 'Changed',
  fix: 'Fixed',
  fixed: 'Fixed',
  docs: 'Docs',
  build: 'Chore',
  ci: 'Chore',
  test: 'Test',
  chore: 'Chore',
  reverted: 'Reverted',
  'breaking changes': 'Breaking Changes',
};

export const SECTION_ORDER = [
  SECTION_BREAKING_CHANGES,
  SECTION_ADDED,
  SECTION_FIXED,
  SECTION_CHANGED,
  SECTION_DOCS,
  SECTION_TEST,
  SECTION_CHORE,
  SECTION_REVERTED,
] as const;
