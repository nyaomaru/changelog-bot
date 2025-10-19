export const UNRELEASED_ANCHOR = '## [Unreleased]';
export const PR_TITLE_PREFIX = 'docs(changelog): v';
export const PR_BRANCH_PREFIX = 'chore/changelog-v';
export const DEFAULT_PR_LABELS = ['changelog', 'release'] as const;
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
  build: 'Build',
  ci: 'Build',
  test: 'Test',
  chore: 'Chore',
  reverted: 'Reverted',
  'breaking changes': 'Breaking Changes',
};

export const SECTION_ORDER = [
  'Breaking Changes',
  'Added',
  'Fixed',
  'Changed',
  'Docs',
  'Build',
  'Test',
  'Chore',
  'Reverted',
] as const;
